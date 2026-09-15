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
  const events = new BufferedWriter(async () => {}); // dev sink; Neon writer plugs in here
  let joinsTotal = 0;
  let tickAvgMs = 0;
  let tickMaxMs = 0;
  let snapSeq = 0;

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

  return { server, registry, events, stepAll, snapAll, connsOf,
    stats: () => ({ joinsTotal, tickAvgMs, tickMaxMs }),
    shutdown: () => new Promise<void>((res) => {
      for (const s of allSockets) { try { s.terminate(); } catch { /* dead */ } }
      wss.close(() => server.close(() => res()));
    }) };
}
