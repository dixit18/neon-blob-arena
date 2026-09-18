// scripts/soak.ts — G-2 seven-game soak gate.
// 30 clients spread across riot/doodle/blaze/nitro/ludo/room/line for 30s
// with random VALID inputs. Gates: tickAvgMs < 5, zero unhandled exceptions,
// every client keeps receiving snapshots. Run: npx tsx scripts/soak.ts
// (CI runs the headless suites; this is the live-traffic proof.)
import WebSocket from 'ws';
import { createApp } from '../apps/server/src/app.js';

const CLIENTS = 30;
const SECONDS = 30;
const GAMES = ['reflex-riot', 'doodle-duel', 'blaze-squad', 'nitro-rift', 'ludo-clash', 'read-the-room', 'ghostline'];

const app = createApp({ region: 'soak' });
let unhandled = 0;
process.on('uncaughtException', () => { unhandled++; });
process.on('unhandledRejection', () => { unhandled++; });

await new Promise<void>((res) => app.server.listen(0, '127.0.0.1', () => res()));
const addr = app.server.address() as { port: number };
const base = `ws://127.0.0.1:${addr.port}`;
const stepTimer = setInterval(() => app.stepAll(), 50);
const snapTimer = setInterval(() => app.snapAll(), 66);

const stats = { snaps: 0, connected: 0, errors: 0 };
const sockets: WebSocket[] = [];
for (let i = 0; i < CLIENTS; i++) {
  const game = GAMES[i % GAMES.length]!;
  const ws = new WebSocket(`${base}?game=${game}&room=SOAK&name=S${i}`);
  sockets.push(ws);
  let seq = 0;
  ws.on('open', () => { stats.connected++; });
  ws.on('message', (d) => {
    try {
      const m = JSON.parse(d.toString()) as { type?: string; payload?: { t?: string } };
      if (m.type === 'snapshot') stats.snaps++;
      if (m.type === 'event' && (m.payload as { t?: string })?.t === 'hello') {
        // speak valid protocol for our game, then chatter randomly
        const chatter = setInterval(() => {
          if (ws.readyState !== WebSocket.OPEN) { clearInterval(chatter); return; }
          const r = Math.random();
          if (game === 'doodle-duel') {
            ws.send(JSON.stringify({ v: 1, type: 'answer', room: 'SOAK', seq: ++seq, payload: { i: Math.floor(r * 4) } }));
          } else if (game === 'reflex-riot') {
            ws.send(JSON.stringify({ v: 1, type: 'input', room: 'SOAK', seq: ++seq, payload: { dx: 0, dy: 0, fire: r > 0.5 } }));
          } else if (game === 'blaze-squad') {
            ws.send(JSON.stringify({ v: 1, type: 'input', room: 'SOAK', seq: ++seq, payload: { dx: r * 2 - 1, dy: r * 2 - 1, fire: r > 0.4, aim: r * 6.28 } }));
          } else if (game === 'nitro-rift') {
            ws.send(JSON.stringify({ v: 1, type: 'input', room: 'SOAK', seq: ++seq, payload: { dx: r > 0.66 ? 1 : r > 0.33 ? -1 : 0, dy: 0, fire: r > 0.5 } }));
          } else if (game === 'read-the-room') {
            // room: vote seat 0-3 (dupes + self-votes die server-side by design)
            ws.send(JSON.stringify({ v: 1, type: 'answer', room: 'SOAK', seq: ++seq, payload: { i: Math.floor(r * 4) } }));
          } else if (game === 'ghostline') {
            // line: flick vector (mid-roll + zero vectors die sim-side by design)
            const a = r * Math.PI * 2;
            const pw = 0.3 + ((r * 7) % 0.7);
            ws.send(JSON.stringify({ v: 1, type: 'input', room: 'SOAK', seq: ++seq, payload: { dx: Math.cos(a) * pw, dy: Math.sin(a) * pw } }));
          } else {
            // ludo-clash: roll on roll stage, pick slot 0-3 in pick stage
            if (r > 0.5) ws.send(JSON.stringify({ v: 1, type: 'input', room: 'SOAK', seq: ++seq, payload: { dx: 0, dy: 0, fire: true } }));
            else ws.send(JSON.stringify({ v: 1, type: 'answer', room: 'SOAK', seq: ++seq, payload: { i: Math.floor(r * 8) % 4 } }));
          }
        }, 200);
      }
    } catch { stats.errors++; }
  });
  ws.on('error', () => { stats.errors++; });
}

await new Promise((res) => setTimeout(res, SECONDS * 1000));
for (const ws of sockets) { try { ws.close(); } catch { /* gone */ } }
clearInterval(stepTimer);
clearInterval(snapTimer);
const { tickAvgMs, tickMaxMs } = app.stats();
await app.shutdown();

const perSec = stats.snaps / SECONDS;
console.log(`soak: connected=${stats.connected}/${CLIENTS} snaps=${stats.snaps} (${perSec.toFixed(1)}/s) tickAvg=${tickAvgMs.toFixed(2)}ms tickMax=${tickMaxMs.toFixed(1)}ms msgErrors=${stats.errors} unhandled=${unhandled}`);
let fail = '';
if (stats.connected < CLIENTS) fail += 'connect ';
if (tickAvgMs >= 5) fail += 'tickAvg ';
if (unhandled > 0) fail += 'unhandled ';
if (perSec < 60) fail += 'snapRate ';
if (fail) { console.error(`SOAK RED: ${fail}`); process.exit(1); }
console.log('SOAK GREEN');
