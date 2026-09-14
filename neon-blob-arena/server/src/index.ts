// Production entry: HTTP (health/rooms/leaderboard) + WS game server.
// Design: rooms are isolated sims -> scale horizontally (1 proc = N rooms).
// Never await DB inside tick. Origin check + rate limit on WS.
import 'dotenv/config';
import http from 'node:http';
import crypto from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { Room } from './game.js';
import { PolarRoom } from './polar.js';
import { BuffetRoom } from './buffet.js';
import { TUNE, parseGame, type GameId } from './types.js';
import { validateInput } from './validate.js';
import { initDb, topScores, dbReady } from './db.js';

const PORT = Number(process.env.PORT || 8080);
const ORIGIN = (process.env.ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
const REGION = process.env.REGION || 'local';

// Marketplace: rooms namespaced per game (`polar:ABCD` vs `mochi:ABCD` map keys;
// room codes users share stay plain). Tick/snap loops treat them uniformly.
const rooms = new Map<string, Room | PolarRoom | BuffetRoom>();
let joinsTotal = 0; // PMF stat: connection count since boot (see /stats)
function code() { return Math.random().toString(36).slice(2, 6).toUpperCase(); }

function makeRoom(game: GameId, id: string): Room | PolarRoom | BuffetRoom {
  if (game === 'polar') return new PolarRoom(id);
  if (game === 'buffet') return new BuffetRoom(id);
  return new Room(id);
}

function getOrCreateRoom(game: GameId, id?: string): Room | PolarRoom | BuffetRoom {
  const mapKey = id ? game + ':' + id : undefined;
  if (mapKey && rooms.has(mapKey)) return rooms.get(mapKey)!;
  if (id && /^[A-Z0-9]{4,8}$/.test(id)) {
    const r = makeRoom(game, id);
    rooms.set(mapKey!, r); return r;
  }
  // matchmake: least-loaded room OF THE SAME GAME, else new
  let best: Room | PolarRoom | BuffetRoom | null = null;
  let bestHumans = Infinity;
  for (const r of rooms.values()) {
    if (r.game !== game) continue;
    const humans = [...r.players.values()].filter(p => !p.isBot).length;
    if (humans < TUNE.MAX_HUMANS_PER_ROOM && humans < bestHumans) { best = r; bestHumans = humans; }
  }
  if (best) return best;
  const fresh = makeRoom(game, code());
  rooms.set(game + ':' + fresh.id, fresh); return fresh;
}

function cleanName(n: string) {
  return (n || 'Blob').replace(/[^\w \-👾🔥⚡💥]/gu, '').trim().slice(0, 14) || 'Blob';
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://x');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  if (url.pathname === '/health') {
    res.end(JSON.stringify({ ok: true, region: REGION, rooms: rooms.size, players: [...rooms.values()].reduce((a, r) => a + r.size, 0), db: dbReady(), tickHz: TUNE.TICK_HZ, tickAvgMs: +tickAvgMs.toFixed(2), tickMaxMs: +tickMaxMs.toFixed(1) }));
    return;
  }
  if (url.pathname === '/rooms') {
    res.end(JSON.stringify([...rooms.values()].map(r => ({ id: r.id, game: r.game, players: r.size, humans: [...r.players.values()].filter(p => !p.isBot).length }))));
    return;
  }
  if (url.pathname === '/leaderboard') {
    res.end(JSON.stringify(await topScores(10)));
    return;
  }
  if (url.pathname === '/stats') {
    const ticks = [...rooms.values()].map(r => r.tick);
    // PMF dashboard (Arjun): joins, rounds, taunts — requeue/invite loop proxies. No PII.
    const rounds = [...rooms.values()].reduce((a, r) => a + r.roundCount, 0);
    const taunts = [...rooms.values()].reduce((a, r) => a + r.tauntCount, 0);
    res.end(JSON.stringify({ rooms: rooms.size, ticks, joins: joinsTotal, rounds, taunts }));
    return;
  }
  res.statusCode = 404; res.end(JSON.stringify({ error: 'not found' }));
});

const wss = new WebSocketServer({ server, maxPayload: 2048 });

wss.on('connection', (ws: WebSocket, req) => {
  // origin guard (skip if no ORIGIN configured, e.g. local dev)
  const origin = req.headers.origin as string | undefined;
  if (ORIGIN.length > 0 && origin && !ORIGIN.includes(origin)) { ws.close(4403, 'bad origin'); return; }

  const url = new URL(req.url || '/', 'http://x');
  const game = parseGame(url.searchParams.get('game'));
  const room = getOrCreateRoom(game, (url.searchParams.get('room') || '').toUpperCase() || undefined);
  const humans = [...room.players.values()].filter(p => !p.isBot).length;
  if (humans >= TUNE.MAX_HUMANS_PER_ROOM + 5) { ws.close(4400, 'room full'); return; }

  const id = crypto.randomUUID();
  const name = cleanName(url.searchParams.get('name') || '');
  room.addPlayer(id, name);
  const conn = { ws, playerId: id, msgTimes: [] as number[], lastSeq: 0 };
  room.conns.set(id, conn);
  joinsTotal++;
  room.pushFeed(`✨ ${name} joined`);
  ws.send(JSON.stringify({ t: 'hello', you: id, room: room.id, game, world: TUNE.WORLD }));

  ws.on('message', (buf) => {
    const now = Date.now();
    // rate limit: sliding 1s window
    conn.msgTimes = conn.msgTimes.filter(t => now - t < 1000);
    if (conn.msgTimes.length >= TUNE.INPUT_RATE_LIMIT_PER_SEC) return;
    conn.msgTimes.push(now);
    try {
      const raw: unknown = JSON.parse(buf.toString());
      const robj = raw as { t?: unknown; i?: unknown };
      if (robj && robj.t === 'taunt') { room.addTaunt(id, robj.i); return; }
      const clean = validateInput(raw);
      if (!clean) return; // Effect Schema gate: wrong shape, NaN/Infinity, non-input
      if (typeof clean.seq === 'number' && clean.seq <= conn.lastSeq) return; // drop stale/replay
      if (typeof clean.seq === 'number') conn.lastSeq = clean.seq;
      if (room.game === 'polar') {
        room.handleInput(id, clean.dx, clean.dy);
        if (clean.flip) room.tryFlip(id);
      } else {
        room.handleInput(id, clean.dx, clean.dy, clean.dash);
        if (room.game === 'mochi' && clean.fire) room.tryFire(id);
      }
    } catch { /* ignore malformed */ }
  });
  ws.on('close', () => room.removePlayer(id));
  ws.on('error', () => { try { room.removePlayer(id); } catch {} });
});

// fixed loops: sim 20Hz, snapshots 15Hz (decoupled so slow broadcast never slows sim)
let tickAvgMs = 0, tickMaxMs = 0; // QA-visible sim cost (see /health)
setInterval(() => {
  const t0 = performance.now();
  for (const r of rooms.values()) {
    try { r.step(); } catch (e) { console.error('[tick] room', r.id, e); }
  }
  // GC empty rooms (keep 1 lobby warm)
  if (rooms.size > 1) for (const [id, r] of rooms) {
    const humans = [...r.players.values()].filter(p => !p.isBot).length;
    if (humans === 0 && r.conns.size === 0 && r.tick > 20 * 60) { rooms.delete(id); console.log(`[room ${id}] gc`); }
  }
  const dtMs = performance.now() - t0;
  tickAvgMs = tickAvgMs * 0.95 + dtMs * 0.05;
  if (dtMs > tickMaxMs) tickMaxMs = dtMs;
  if (dtMs > 25) console.warn(`[tick] slow ${dtMs.toFixed(1)}ms`);
}, 1000 / TUNE.TICK_HZ);

setInterval(() => {
  for (const r of rooms.values()) {
    for (const [pid, c] of r.conns) {
      if (c.ws.readyState !== WebSocket.OPEN) continue;
      const buffered = c.ws.bufferedAmount;
      if (buffered > 512 * 1024) { try { c.ws.terminate(); } catch { /* dead */ } r.removePlayer(pid); continue; }
      if (buffered > 64 * 1024) continue; // laggard: drop this frame, sim never waits
      try { c.ws.send(JSON.stringify(r.snapshot(pid))); } catch { /* skip frame */ }
    }
  }
}, 1000 / TUNE.SNAP_HZ);

await initDb(process.env.DATABASE_URL);
server.listen(PORT, () => console.log(`[server] blob-arena :${PORT} region=${REGION} tick=${TUNE.TICK_HZ}Hz snap=${TUNE.SNAP_HZ}Hz`));
