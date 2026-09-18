// apps/server — Node 24 + ws authoritative rooms (D12/Foundation).
// Shape: WebSocket bytes → Effect Schema → protocol guards → plain
// GameCommand → driver.accept(). Sims stay plain allocation-conscious TS:
// Effect never enters step(). One ManagedRuntime is NOT needed yet —
// Schema.decodeUnknownEither is sync and pure; runtime boot stays plain.
import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { Schema } from 'effect';
import { RoomRegistry, type RoomRec } from '../../../packages/room/src/index.js';
import { GAMES, getGame } from '../../../packages/catalog/src/index.js';
import { filterName, genGuestId } from '../../../packages/identity/src/index.js';
import { isEnvelope, isInput, isAnswer, isStrokeBatch, isEmote, type Envelope } from '../../../packages/protocol/src/index.js';
import { BufferedWriter } from '../../../packages/analytics/src/index.js';
import { CHANNELS, EMPLOYEES, StudioFeed, seedFeed } from '../../../packages/studio/src/index.js';
import { createRiotDriver } from '../../../games/reflex-riot/driver.js';
import { createDoodleDriver } from '../../../games/doodle-duel/driver.js';
import { createBlazeDriver } from '../../../games/blaze-squad/driver.js';
import { createNitroDriver } from '../../../games/nitro-rift/driver.js';
import { createLudoDriver } from '../../../games/ludo-clash/driver.js';
import { createRoomDriver } from '../../../games/read-the-room/driver.js';
import { createLineDriver } from '../../../games/ghostline/driver.js';

const EnvelopeSchema = Schema.Struct({
  v: Schema.Literal(1),
  type: Schema.String,
  room: Schema.String,
  seq: Schema.Number,
  serverTime: Schema.optional(Schema.Number),
  payload: Schema.Object,
});
const decodeEnvelope = Schema.decodeUnknownEither(EnvelopeSchema);

const MAX_HUMANS = 15;
const RATE_PER_SEC = 120; // burst cap; sustained tuning comes from p99 traffic

export interface Conn { ws: WebSocket; playerId: string; token: string; msgTimes: number[]; lastSeq: number }

export function createApp(opts: { region?: string } = {}) {
  const region = opts.region ?? process.env.REGION ?? 'local';
  const registry = new RoomRegistry();
  registry.register('reflex-riot', () => createRiotDriver()); // RR-6: first playable, refusal dead
  registry.register('doodle-duel', () => createDoodleDriver()); // DD-6: second playable
  registry.register('blaze-squad', () => createBlazeDriver()); // squad survival, zone shrink
  registry.register('nitro-rift', () => createNitroDriver()); // lane racing, ghost pace
  registry.register('ludo-clash', () => createLudoDriver()); // LD-6: turn board, dice + picks
  registry.register('read-the-room', () => createRoomDriver()); // RT-6: party vote, crowns + fingerprint
  registry.register('ghostline', () => createLineDriver()); // GH-6: flick time-trial, refusal dead
  const events = new BufferedWriter(async () => {}); // dev sink; Neon writer plugs in here
  const studio = new StudioFeed();
  seedFeed(studio);
  const studioHits = new Map<string, number[]>();
  let joinsTotal = 0;
  let tickAvgMs = 0;
  let tickMaxMs = 0;
  let snapSeq = 0;
  const perfByGame = new Map<string, {
    n: number; fpsSum: number; p95Sum: number;
    modes: Map<string, number>; fams: Map<string, number>;
  }>();

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://x');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    if (url.pathname === '/health') {
      const players = registry.presence().reduce((a, r) => a + r.players, 0);
      res.end(JSON.stringify({ ok: true, region, rooms: registry.rooms.size, players, node: process.version, tickHz: 20, tickAvgMs: +tickAvgMs.toFixed(2), tickMaxMs: +tickMaxMs.toFixed(1) }));
      return;
    }
    if (url.pathname === '/rooms') {
      res.end(JSON.stringify(registry.presence()));
      return;
    }
    if (url.pathname === '/catalog') {
      res.end(JSON.stringify(GAMES));
      return;
    }
    // D3 evidence feed: lossy client perf beacons (fps/p95/mode/caps).
    // In-memory rolling aggregates only — no UA strings, no IPs, no PII.
    // POST validates + caps at 1KB; GET serves per-game averages for Riya's gates.
    if (url.pathname === '/perf' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => { body += String(c); if (body.length > 1024) req.destroy(); });
      req.on('end', () => {
        try {
          const p = JSON.parse(body || '{}') as {
            game?: unknown; fps?: unknown; p95?: unknown; mode?: unknown;
            caps?: { fam?: unknown };
          };
          const game = typeof p.game === 'string' && /^[a-z0-9-]{1,32}$/.test(p.game) ? p.game : null;
          const fps = typeof p.fps === 'number' && Number.isFinite(p.fps) && p.fps >= 0 && p.fps <= 1000 ? Math.round(p.fps) : null;
          const p95 = typeof p.p95 === 'number' && Number.isFinite(p.p95) && p.p95 >= 0 && p.p95 <= 10_000 ? p.p95 : null;
          const mode = typeof p.mode === 'string' && /^[a-z0-9-]{1,16}$/.test(p.mode) ? p.mode : 'unknown';
          const fam = typeof p.caps?.fam === 'string' && /^(edge|chrome|firefox|safari|other)$/.test(p.caps.fam) ? p.caps.fam : 'other';
          if (game === null || fps === null || p95 === null) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'bad sample' }));
            return;
          }
          let agg = perfByGame.get(game);
          if (!agg) {
            agg = { n: 0, fpsSum: 0, p95Sum: 0, modes: new Map<string, number>(), fams: new Map<string, number>() };
            perfByGame.set(game, agg);
          }
          agg.n++;
          agg.fpsSum += fps;
          agg.p95Sum += p95;
          agg.modes.set(mode, (agg.modes.get(mode) ?? 0) + 1);
          agg.fams.set(fam, (agg.fams.get(fam) ?? 0) + 1);
          events.push('perf_sample', { game, data: { fps, p95, mode, fam } });
          res.statusCode = 201;
          res.end(JSON.stringify({ ok: true }));
        } catch {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'bad sample' }));
        }
      });
      return;
    }
    if (url.pathname === '/perf' && req.method === 'GET') {
      const out: Record<string, { samples: number; avgFps: number; avgP95: number; modes: Record<string, number>; browsers: Record<string, number> }> = {};
      for (const [game, a] of perfByGame) {
        out[game] = {
          samples: a.n,
          avgFps: a.n ? Math.round((a.fpsSum / a.n) * 10) / 10 : 0,
          avgP95: a.n ? Math.round((a.p95Sum / a.n) * 10) / 10 : 0,
          modes: Object.fromEntries(a.modes),
          browsers: Object.fromEntries(a.fams),
        };
      }
      res.end(JSON.stringify(out));
      return;
    }
    // Hidden owner studio (OpenMausBot-style threads). NEVER linked from the
    // player shell, NEVER in /catalog. noindex always. ST-2 fail-closed gate:
    // with STUDIO_KEY set, every /studio/* call needs ?key= or x-studio-key
    // to match; without it, only loopback may enter (prod fails closed).
    const studioAllowed = (u: URL): boolean => {
      const need = process.env.STUDIO_KEY || '';
      const got = u.searchParams.get('key') || req.headers['x-studio-key'] || '';
      if (need) return got === need;
      const ip = req.socket.remoteAddress || '';
      return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
    };
    const studioDenied = (): boolean => {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      res.statusCode = 403;
      res.end(JSON.stringify({ error: 'studio locked' }));
      return true;
    };
    if (url.pathname === '/studio/employees' && req.method === 'GET') {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      if (!studioAllowed(url)) return studioDenied();
      const since = Number(url.searchParams.get('since') || 0);
      res.end(JSON.stringify({
        employees: EMPLOYEES.map((e) => ({ ...e, lastSeen: studio.lastSeenBy(e.id) })),
        channels: CHANNELS,
        feed: studio.list({ limit: 50 }).filter((t) => t.at >= since || t.id >= since),
        count: studio.count(),
      }));
      return;
    }
    if (url.pathname === '/studio/feed' && req.method === 'GET') {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      if (!studioAllowed(url)) return studioDenied();
      const ch = url.searchParams.get('channel') || undefined;
      const by = url.searchParams.get('by') || undefined;
      const limit = Math.min(Number(url.searchParams.get('limit') || 50), 200);
      const okCh = !ch || ['build', 'redteam', 'growth', 'studio'].includes(ch);
      if (!okCh) { res.statusCode = 400; res.end(JSON.stringify({ error: 'bad channel' })); return; }
      res.end(JSON.stringify(studio.list({ channel: ch as never, by, limit })));
      return;
    }
    if (url.pathname === '/studio/thought' && req.method === 'POST') {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      if (!studioAllowed(url)) return studioDenied();
      const ip = (req.socket.remoteAddress || '?') + '';
      const now = Date.now();
      const hits = (studioHits.get(ip) ?? []).filter((t) => now - t < 60_000);
      if (hits.length >= 30) { res.statusCode = 429; res.end(JSON.stringify({ error: 'slow down' })); return; }
      hits.push(now);
      studioHits.set(ip, hits);
      let body = '';
      req.on('data', (c) => { body += String(c); if (body.length > 2048) req.destroy(); });
      req.on('end', () => {
        try {
          const p = JSON.parse(body || '{}') as { by?: string; channel?: string; kind?: string; text?: string };
          const t = studio.post(
            String(p.by || 'boss'),
            (p.channel || 'studio') as never,
            ((p.kind || 'reply') as never),
            String(p.text || ''),
            Date.now(),
          );
          events.push('studio_thought', { data: { by: t.by, channel: t.channel } });
          res.statusCode = 201;
          res.end(JSON.stringify(t));
        } catch (e) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : 'bad thought' }));
        }
      });
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'not found' }));
  });

  const wss = new WebSocketServer({ server, maxPayload: 4096 });
  const allSockets = new Set<WebSocket>();

  function send(ws: WebSocket, msg: Envelope): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    try { ws.send(JSON.stringify(msg)); } catch { /* laggard: sim never waits */ }
  }

  wss.on('connection', (ws: WebSocket, req) => {
    allSockets.add(ws);
    ws.on('close', () => { allSockets.delete(ws); });
    const url = new URL(req.url || '/', 'http://x');
    const game = url.searchParams.get('game') || '';
    const manifest = getGame(game);
    if (!manifest || !registry.factories.has(game)) {
      try { ws.send(JSON.stringify({ t: 'error', code: 'not-implemented', game })); } catch { /* gone */ }
      ws.close(4404, 'game not implemented yet');
      return;
    }
    // Reconnect path: ?token= reclaims a held party slot, no new identity.
    const token = url.searchParams.get('token') || '';
    let room: RoomRec | null = null;
    let playerId = '';
    let isReclaim = false;
    if (token) {
      const held = registry.reclaim(token);
      if (held) {
        const found = [...registry.rooms.values()].find(r => r.id === held.roomId && r.game === game);
        if (found) {
          room = found;
          playerId = held.playerId;
          isReclaim = true;
        }
      }
    }
    const rawRoom = (url.searchParams.get('room') || '').toUpperCase();
    const roomCode = /^[A-Z0-9]{4,8}$/.test(rawRoom) ? rawRoom : undefined;
    try {
      room = room ?? registry.getOrCreate(game, roomCode);
    } catch {
      ws.close(4400, 'room full');
      return;
    }
    // GH-6: challenge links (`?game=ghostline&room=&seed=`) name the course.
    // A fresh room adopts the seed; a live room is never reseeded.
    if (game === 'ghostline' && room.humans.size === 0) {
      const seed = Number(url.searchParams.get('seed') || '');
      const setSeed = (room.driver as unknown as { setBaseSeed?: (s: number) => boolean }).setBaseSeed;
      if (Number.isInteger(seed) && typeof setSeed === 'function') {
        try { setSeed.call(room.driver, seed); } catch { /* random course stands */ }
      }
    }
    const roomRef = room;
    if (!isReclaim && roomRef.humans.size >= MAX_HUMANS) {
      ws.close(4400, 'room full');
      return;
    }
    if (!playerId) playerId = genGuestId();
    const pid = playerId;
    const name = filterName(url.searchParams.get('name') || '');
    registry.join(roomRef, { id: pid, name, isBot: false });
    const slot = registry.holdSlot(roomRef, pid) ?? '';
    const conn: Conn = { ws, playerId: pid, token: slot, msgTimes: [], lastSeq: 0 };
    connsOf(roomRef).set(pid, conn);
    joinsTotal++;
    events.push('room_join', { game, room: roomRef.id });
    send(ws, { v: 1, type: 'event', room: roomRef.id, seq: snapSeq++, serverTime: Date.now(), payload: { t: 'hello', you: pid, token: slot, room: roomRef.id, game, reclaimed: isReclaim } });

    ws.on('message', (buf) => {
      const now = Date.now();
      conn.msgTimes = conn.msgTimes.filter(t => now - t < 1000);
      if (conn.msgTimes.length >= RATE_PER_SEC) return;
      conn.msgTimes.push(now);
      let raw: unknown;
      try {
        raw = JSON.parse(buf.toString());
      } catch { return; }
      // Effect gate first (shape), protocol guards second (semantics).
      if (decodeEnvelope(raw)._tag === 'Left') return;
      if (!isEnvelope(raw)) return;
      if (raw.room !== roomRef.id) return;
      if (raw.seq <= conn.lastSeq) return; // drop stale/replay
      conn.lastSeq = raw.seq;
      const p = raw.payload;
      const known =
        (raw.type === 'input' && isInput(p)) ||
        (raw.type === 'answer' && isAnswer(p)) ||
        (raw.type === 'strokeBatch' && isStrokeBatch(p)) ||
        (raw.type === 'emote' && isEmote(p));
      if (!known && raw.type !== 'roomPresence' && raw.type !== 'reconnect') return;
      try {
        roomRef.driver.accept({ kind: raw.type, by: pid, data: p, at: now });
      } catch { /* a game bug must never kill the connection loop */ }
    });

    const onGone = () => {
      // Stale-close guard: a fast reclaim replaces connsOf(pid) with the new
      // socket — the old socket's close must not evict the fresh session.
      if (connsOf(roomRef).get(pid)?.ws !== ws) return;
      // hold BEFORE leave: holdSlot requires current membership, leave frees it.
      if (conn.token) registry.holdSlot(roomRef, pid, Date.now(), conn.token);
      registry.leave(roomRef, pid);
      connsOf(roomRef).delete(pid);
      events.push('room_leave', { game, room: roomRef.id });
    };
    ws.on('close', onGone);
    ws.on('error', () => { try { onGone(); } catch { /* gone */ } });
  });

  function stepAll(): void {
    const t0 = performance.now();
    for (const r of registry.rooms.values()) {
      try { r.driver.step(1 / 20); } catch (e) { console.error('[tick] room', r.id, e); }
    }
    const dt = performance.now() - t0;
    tickAvgMs = tickAvgMs * 0.95 + dt * 0.05;
    if (dt > tickMaxMs) tickMaxMs = dt;
  }

  function snapAll(): void {
    for (const r of registry.rooms.values()) {
      // conns live on drivers in this design? No — server tracks them:
      for (const [pid, c] of connsOf(r)) {
        if (c.ws.readyState !== WebSocket.OPEN) continue;
        if (c.ws.bufferedAmount > 512 * 1024) { try { c.ws.terminate(); } catch { /* dead */ } continue; }
        if (c.ws.bufferedAmount > 64 * 1024) continue;
        let snap: unknown;
        try { snap = r.driver.snapshot(pid); } catch { continue; }
        send(c.ws, { v: 1, type: 'snapshot', room: r.id, seq: snapSeq++, serverTime: Date.now(), payload: snap as Record<string, unknown> });
      }
    }
  }

  // Server-side conn index (drivers stay networking-blind by design).
  const roomConns = new Map<string, Map<string, Conn>>();
  function connsOf(r: RoomRec): Map<string, Conn> {
    const key = `${r.game}:${r.id}`;
    let m = roomConns.get(key);
    if (!m) { m = new Map(); roomConns.set(key, m); }
    return m;
  }

  return { server, registry, events, stepAll, snapAll, connsOf, studio,
    stats: () => ({ joinsTotal, tickAvgMs, tickMaxMs }),
    shutdown: () => new Promise<void>((res) => {
      for (const s of allSockets) { try { s.terminate(); } catch { /* dead */ } }
      wss.close(() => server.close(() => res()));
    }) };
}
