// Minimal load test: N fake clients sending inputs, measures snapshot rate.
// Run: npm run loadtest -- --clients=50 --secs=15  (needs server on :8080)
import WebSocket from 'ws';

const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const N = Number(args.clients || 20);
const SECS = Number(args.secs || 10);
const URL = process.env.SERVER_URL || 'ws://localhost:8080?name=bot';

let snaps = 0, connected = 0;
const conns: WebSocket[] = [];
for (let i = 0; i < N; i++) {
  const ws = new WebSocket(URL + i);
  conns.push(ws);
  ws.on('open', () => {
    connected++;
    const iv = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) { clearInterval(iv); return; }
      ws.send(JSON.stringify({ t: 'input', seq: Date.now() % 100000, dx: Math.random() * 2 - 1, dy: Math.random() * 2 - 1, dash: Math.random() < 0.02 }));
    }, 50);
  });
  ws.on('message', (d) => { try { if (JSON.parse(d.toString()).t === 'snap') snaps++; } catch {} });
}
setTimeout(() => {
  console.log(`loadtest: ${connected}/${N} connected, ${snaps} snapshots in ${SECS}s (${(snaps / SECS).toFixed(1)}/s total, ${(snaps / SECS / Math.max(1, connected)).toFixed(2)}/s/client)`);
  conns.forEach(c => c.close());
  process.exit(snaps > 0 && connected >= N * 0.9 ? 0 : 1);
}, SECS * 1000);
