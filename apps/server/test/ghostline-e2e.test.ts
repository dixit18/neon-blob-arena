// apps/server/test/ghostline-e2e.test.ts — GH-5: Ghostline plays end-to-end
// over real sockets. Blocks release if red.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createApp } from '../src/app.js';
import { createCourse, runReplay } from '../../../games/ghostline/sim.js';

const app = createApp({ region: 'test' });
let wsBase = '';
let pump: NodeJS.Timeout[] = [];

before(async () => {
  await new Promise<void>((res) => app.server.listen(0, '127.0.0.1', () => res()));
  const addr = app.server.address();
  assert.ok(addr && typeof addr === 'object');
  wsBase = `ws://127.0.0.1:${(addr as { port: number }).port}`;
  pump = [
    setInterval(() => app.stepAll(), 50),
    setInterval(() => app.snapAll(), 66),
  ];
});
after(() => { for (const p of pump) clearInterval(p); app.shutdown(); });

interface Snap {
  t: string; phase: string;
  seed: number;
  walls: { x: number; y: number; w: number; h: number }[];
  shotsLeft: number;
  puck: { x: number; y: number };
  atRest: boolean;
  leaders: { n: string; shots: number; finished: boolean; you: boolean; bot: boolean }[];
  pucks: { n: string; x: number; y: number; you: boolean; bot: boolean; finished: boolean }[];
  feed: string[];
}

function join(name: string, room = 'GHOST1', extra = '', token?: string): Promise<{ ws: WebSocket; hello: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const q = token ? `&token=${encodeURIComponent(token)}` : '';
    const ws = new WebSocket(`${wsBase}?game=ghostline&room=${room}&name=${name}${extra}${q}`);
    const to = setTimeout(() => { try { ws.close(); } catch { /* t */ } reject(new Error('hello timeout')); }, 8000);
    ws.on('message', (d) => {
      try {
        const m = JSON.parse(d.toString()) as { type?: string; payload?: Record<string, unknown> };
        if (m.type === 'event' && (m.payload as { t?: string })?.t === 'hello') {
          clearTimeout(to);
          resolve({ ws, hello: m.payload as Record<string, unknown> });
        }
      } catch { /* partial */ }
    });
    ws.on('error', () => {});
  });
}

function watch(ws: WebSocket, ms: number, want?: (s: Snap) => boolean): Promise<Snap[]> {
  return new Promise((resolve) => {
    const got: Snap[] = [];
    const to = setTimeout(() => { ws.off('message', h); resolve(got); }, ms);
    const h = (d: Buffer) => {
      try {
        const m = JSON.parse(d.toString()) as { type?: string; payload?: Snap };
        if (m.type === 'snapshot' && (m.payload as Snap)?.t === 'line') {
          got.push(m.payload as Snap);
          if (want && want(m.payload as Snap)) { clearTimeout(to); ws.off('message', h); resolve(got); }
        }
      } catch { /* partial */ }
    };
    ws.on('message', h);
  });
}

describe('ghostline e2e', () => {
  it('1: hello carries token + room, line snapshots stream', async () => {
    const { ws, hello } = await join('Boss', 'GHOST1');
    assert.ok(hello.token);
    assert.equal(hello.room, 'GHOST1');
    const ss = await watch(ws, 10000, (s) => s.phase === 'run');
    assert.ok(ss.length > 0);
    ws.close();
  });

  it('2: solo human gets an instant labelled ghost table + a course', async () => {
    const { ws } = await join('Solo', 'GHOST2');
    const ss = await watch(ws, 15000, (s) => s.phase === 'run' && s.leaders.length === 8);
    const live = ss.find((s) => s.phase === 'run' && s.leaders.length === 8);
    assert.ok(live, 'table fills to 8');
    assert.ok(live!.walls.length > 0, 'course has walls');
    assert.equal(live!.pucks.length, 8, 'all dots ride the snapshot');
    const ghosts = live!.leaders.filter((l) => !l.you);
    assert.equal(ghosts.length, 7);
    assert.ok(ghosts.every((x) => x.n.includes('🤖')));
    ws.close();
  });

  it('3: flick vector crosses the protocol gate and spends a shot', async () => {
    const { ws } = await join('Flicker', 'GHOST3');
    let seq = 0;
    let fired = false;
    let spent = false;
    const to = Date.now() + 30000;
    const h = (d: Buffer) => {
      try {
        const m = JSON.parse(d.toString()) as { type?: string; payload?: Snap };
        if (m.type !== 'snapshot' || (m.payload as Snap)?.t !== 'line') return;
        const s = m.payload as Snap;
        // The GH-4 client shape exactly: dx/dy vector, isInput-gated.
        if (s.phase === 'run' && s.atRest && s.shotsLeft > 0 && !fired) {
          ws.send(JSON.stringify({ v: 1, type: 'input', room: 'GHOST3', seq: ++seq, payload: { dx: 0.7, dy: 0 } }));
          fired = true;
        }
        if (fired && s.shotsLeft < 8) spent = true;
      } catch { /* partial */ }
    };
    ws.on('message', h);
    while (!spent && Date.now() < to) await new Promise((r) => setTimeout(r, 200));
    ws.off('message', h);
    assert.ok(fired && spent, 'vector flick spent a live shot');
    ws.close();
  });

  it('4: bad input + reconnect survive — seat kept, run continues', async () => {
    const { ws, hello } = await join('Clumsy', 'GHOST4');
    ws.send(JSON.stringify({ v: 1, type: 'input', room: 'GHOST4', seq: 1, payload: { dx: 'east' } }));
    ws.send(JSON.stringify({ v: 1, type: 'input', room: 'GHOST4', seq: 2, payload: { angle: 0, power: 1 } }));
    ws.send(JSON.stringify({ v: 1, type: 'answer', room: 'GHOST4', seq: 3, payload: { i: 99 } }));
    const ss = await watch(ws, 10000, (s) => s.phase === 'run');
    assert.ok(ss.length > 0, 'run survives garbage');
    const token = hello.token as string;
    ws.close();
    const { ws: w2 } = await join('Clumsy', 'GHOST4', '', token);
    const after = await watch(w2, 10000, (s) => s.phase === 'run');
    assert.ok(after.length > 0, 'reclaim rejoins the live run');
    w2.close();
  });

  it('5: snapshots stay p95 ≤2KB on the wire at a full table', async () => {
    const { ws } = await join('Meter', 'GHOST5');
    const raw: number[] = [];
    await new Promise<void>((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('meter timeout')), 20000);
      const h = (d: Buffer) => {
        try {
          const m = JSON.parse(d.toString()) as { type?: string; payload?: { t?: string } };
          if (m.type === 'snapshot' && m.payload?.t === 'line') {
            raw.push(Buffer.byteLength(d.toString()));
            if (raw.length >= 30) { clearTimeout(to); ws.off('message', h); resolve(); }
          }
        } catch { /* partial */ }
      };
      ws.on('message', h);
    });
    raw.sort((a, b) => a - b);
    const p95 = raw[Math.floor(raw.length * 0.95)]!;
    assert.ok(p95 <= 2048, `line p95 ${p95}B > 2KB`);
    ws.close();
  });

  it('6: challenge link seed names the exact course', async () => {
    const { ws } = await join('Dare', 'GHOST6', '&seed=4242');
    const ss = await watch(ws, 15000, (s) => s.phase === 'run');
    const live = ss.find((s) => s.phase === 'run');
    assert.ok(live, 'seeded run starts');
    assert.equal(live!.seed, 4242);
    assert.deepEqual(live!.walls, createCourse(4242).walls);
    // The link contract, proven over the wire seed: replay re-runs.
    assert.ok(runReplay({ seed: 4242, flicks: [{ angle: 0, power: 0.6 }] }) !== null);
    ws.close();
  });
});
