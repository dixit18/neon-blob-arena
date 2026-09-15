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
import { VariantRoom } from './arcade.js';
import { TUNE, parseGame, type GameId } from './types.js';
import { validateInput } from './validate.js';
import { initDb, topScores, dbReady } from './db.js';

const PORT = Number(process.env.PORT || 8080);
const ORIGIN = (process.env.ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
const REGION = process.env.REGION || 'local';

// Marketplace: rooms namespaced per game (`polar:ABCD` vs `mochi:ABCD` map keys;
// room codes users share stay plain). Tick/snap loops treat them uniformly.
type AnyRoom = Room | PolarRoom | BuffetRoom | VariantRoom;
const rooms = new Map<string, AnyRoom>();
let joinsTotal = 0; // PMF stat: connection count since boot (see /stats)
const joinsByGame: Record<string, number> = {}; // portal social proof per arena
type PerfAgg = { n: number; fps: number; p95: number; rtt: number; q: number; lt: number };
const perf: Record<string, PerfAgg> = {}; // D3 lag evidence, per game (see /perf)
function code() { return Math.random().toString(36).slice(2, 6).toUpperCase(); }

function makeRoom(game: GameId, id: string): AnyRoom {
  if (game === 'polar') return new PolarRoom(id);
  if (game === 'buffet') return new BuffetRoom(id);
  if (game === 'rush' || game === 'hill' || game === 'tag') return new VariantRoom(game, id);
  return new Room(id);
}

function getOrCreateRoom(game: GameId, id?: string): AnyRoom {
  const mapKey = id ? game + ':' + id : undefined;
  if (mapKey && rooms.has(mapKey)) return rooms.get(mapKey)!;
  if (id && /^[A-Z0-9]{4,8}$/.test(id)) {
    const r = makeRoom(game, id);
    rooms.set(mapKey!, r); return r;
  }
  // matchmake: least-loaded room OF THE SAME GAME, else new
  let best: AnyRoom | null = null;
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
    res.end(JSON.stringify({ rooms: rooms.size, ticks, joins: joinsTotal, games: joinsByGame, rounds, taunts }));
    return;
  }
  // Lag telemetry (D3 evidence): clients POST {game,fps,p95,rtt,q,lt} every 15s
  // while playing. No ids, no PII, 1KB cap. Powers Riya's gates with real data.
  if (url.pathname === '/perf') {
    if (req.method === 'GET') { res.end(JSON.stringify(perf)); return; }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (c) => { body += c; if (body.length > 1024) req.destroy(); });
      req.on('end', () => {
        try {
          const p = JSON.parse(body) as Record<string, unknown>;
          const g = typeof p.game === 'string' ? p.game.slice(0, 12) : 'unknown';
          const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : 0;
          const a = perf[g] ?? (perf[g] = { n: 0, fps: 0, p95: 0, rtt: 0, q: 0, lt: 0 });
          a.n++;
          const k = 1 / Math.min(a.n, 50); // running average, recent-weighted
          a.fps += (num(p.fps) - a.fps) * k;
          a.p95 += (num(p.p95) - a.p95) * k;
          a.rtt += (num(p.rtt) - a.rtt) * k;
          a.q += (num(p.q) - a.q) * k;
          a.lt += num(p.lt);
        } catch { /* malformed: drop */ }
        res.end(JSON.stringify({ ok: true }));
      });
      return;
    }
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
  joinsByGame[game] = (joinsByGame[game] ?? 0) + 1;
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
      if (robj && robj.t === 'ping') { // RTT meter: answered inline, never touches sim
        try { ws.send(JSON.stringify({ t: 'pong', s: (robj as { s?: unknown }).s ?? null })); } catch { /* gone */ }
        return;
      }
      const clean = validateInput(raw);
      if (!clean) return; // Effect Schema gate: wrong shape, NaN/Infinity, non-input
      if (typeof clean.seq === 'number' && clean.seq <= conn.lastSeq) return; // drop stale/replay
      if (typeof clean.seq === 'number') conn.lastSeq = clean.seq;
      if (room instanceof PolarRoom) {
        room.handleInput(id, clean.dx, clean.dy);
        if (clean.flip) room.tryFlip(id);
      } else {
        room.handleInput(id, clean.dx, clean.dy, clean.dash);
        if (room instanceof Room && clean.fire) room.tryFire(id);
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

// Availability first: rooms are isolated and both loops already try/catch per
// room, so a stray throw must never take down every game at once. Log loudly
// (Render surfaces stderr; tickAvgMs/max expose wedges via /health) and stay up.
// Render restarts the service if health checks fail, which covers true wedges.
process.on('uncaughtException', (e) => console.error('[fatal] uncaughtException (staying up):', e));
process.on('unhandledRejection', (e) => console.error('[fatal] unhandledRejection (staying up):', e));

try {
  await initDb(process.env.DATABASE_URL);
} catch (e) {
  console.error('[db] init failed, running on memory leaderboard:', e);
}
// Bind 0.0.0.0 explicitly: Node's default dual-stack bind is IPv6-first and
// Render's port scanner checks IPv4 — without this the deploy logs "listening"
// and then dies with "Port scan timeout, no open ports detected" (seen live).
server.listen(PORT, '0.0.0.0', () => console.log(`[server] blob-arena :${PORT} region=${REGION} tick=${TUNE.TICK_HZ}Hz snap=${TUNE.SNAP_HZ}Hz`));
