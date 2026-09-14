// Minimal load test: N fake clients sending inputs, measures snapshot rate.
// Run: npm run loadtest -- --clients=50 --secs=15  (needs server on :8080)
// Soak: --fire=0.15 makes clients spam fire inputs; orb sightings prove the
// orb path (tryFire/stepOrbs/snapshot) holds under load.
import WebSocket from 'ws';

const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const N = Number(args.clients || 20);
const SECS = Number(args.secs || 10);
const FIRE = Number(args.fire ?? 0.15);
const URL = process.env.SERVER_URL || 'ws://localhost:8080?name=bot';

let snaps = 0, connected = 0, orbSnaps = 0;
const conns: WebSocket[] = [];
for (let i = 0; i < N; i++) {
  const ws = new WebSocket(URL + i);
  conns.push(ws);
  ws.on('open', () => {
    connected++;
    const iv = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) { clearInterval(iv); return; }
      ws.send(JSON.stringify({ t: 'input', seq: Date.now() % 100000, dx: Math.random() * 2 - 1, dy: Math.random() * 2 - 1, dash: Math.random() < 0.02, fire: Math.random() < FIRE }));
    }, 50);
  });
  ws.on('message', (d) => { try {
    const m = JSON.parse(d.toString());
    if (m.t === 'snap') { snaps++; if (Array.isArray(m.orbs) && m.orbs.length > 0) orbSnaps++; }
  } catch {} });
}
setTimeout(() => {
  console.log(`loadtest: ${connected}/${N} connected, ${snaps} snapshots in ${SECS}s (${(snaps / SECS).toFixed(1)}/s total, ${(snaps / SECS / Math.max(1, connected)).toFixed(2)}/s/client), orbSnaps=${orbSnaps} (fire=${FIRE})`);
  conns.forEach(c => c.close());
  process.exit(snaps > 0 && connected >= N * 0.9 ? 0 : 1);
}, SECS * 1000);
