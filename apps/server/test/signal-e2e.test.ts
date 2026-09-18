// apps/server/test/signal-e2e.test.ts — SI-5: Signal Seven plays end-to-end
// over real sockets. Blocks release if red.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createApp } from '../src/app.js';
import { genMystery, daySeedUTC } from '../../../games/signal-seven/sim.js';

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
  day: string; seed: number;
  clues: string[];
  attempts: { guess: number[]; inCode: number; inPos: number; won: boolean }[];
  attemptsLeft: number;
  won: boolean;
  leaders: { n: string; guesses: number; won: boolean; you: boolean; bot: boolean }[];
  feed: string[];
}

function join(name: string, room = 'SIGNL1', token?: string): Promise<{ ws: WebSocket; hello: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const q = token ? `&token=${encodeURIComponent(token)}` : '';
    const ws = new WebSocket(`${wsBase}?game=signal-seven&room=${room}&name=${name}${q}`);
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
        if (m.type === 'snapshot' && (m.payload as Snap)?.t === 'signal') {
          got.push(m.payload as Snap);
          if (want && want(m.payload as Snap)) { clearTimeout(to); ws.off('message', h); resolve(got); }
        }
      } catch { /* partial */ }
    };
    ws.on('message', h);
  });
}

describe('signal-seven e2e', () => {
  it('1: hello carries token + room, signal snapshots stream', async () => {
    const { ws, hello } = await join('Boss', 'SIGNL1');
    assert.ok(hello.token);
    assert.equal(hello.room, 'SIGNL1');
    const ss = await watch(ws, 10000, (s) => s.phase === 'puzzle');
    assert.ok(ss.length > 0);
    ws.close();
  });

  it('2: solo human gets an instant labelled tablet table + 7 clues', async () => {
    const { ws } = await join('Solo', 'SIGNL2');
    const ss = await watch(ws, 15000, (s) => s.phase === 'puzzle' && s.leaders.length === 4);
    const live = ss.find((s) => s.phase === 'puzzle' && s.leaders.length === 4);
    assert.ok(live, 'table fills to 4');
    assert.equal(live!.clues.length, 7);
    const tablets = live!.leaders.filter((l) => !l.you);
    assert.equal(tablets.length, 3);
    assert.ok(tablets.every((x) => x.n.includes('🤖')));
    ws.close();
  });

  it('3: guess triple crosses the protocol gate and lands', async () => {
    const { ws } = await join('Reader', 'SIGNL3');
    let seq = 0;
    let landed = false;
    const to = Date.now() + 30000;
    const h = (d: Buffer) => {
      try {
        const m = JSON.parse(d.toString()) as { type?: string; payload?: Snap };
        if (m.type !== 'snapshot' || (m.payload as Snap)?.t !== 'signal') return;
        const s = m.payload as Snap;
        // The SI-4 client shape exactly: one rune per input axis.
        if (s.phase === 'puzzle' && s.attempts.length === 0 && s.attemptsLeft > 0) {
          ws.send(JSON.stringify({ v: 1, type: 'input', room: 'SIGNL3', seq: ++seq, payload: { dx: 0, dy: 1, aim: 2 } }));
        }
        if (s.attempts.length === 1) landed = true;
      } catch { /* partial */ }
    };
    ws.on('message', h);
    while (!landed && Date.now() < to) await new Promise((r) => setTimeout(r, 200));
    ws.off('message', h);
    assert.ok(landed, 'triple guess landed a live attempt');
    ws.close();
  });

  it('4: bad input + reconnect survive — tablet kept, puzzle continues', async () => {
    const { ws, hello } = await join('Clumsy', 'SIGNL4');
    ws.send(JSON.stringify({ v: 1, type: 'input', room: 'SIGNL4', seq: 1, payload: { dx: 'ember' } }));
    ws.send(JSON.stringify({ v: 1, type: 'input', room: 'SIGNL4', seq: 2, payload: { dx: 0, dy: 0, aim: 0 } }));
    ws.send(JSON.stringify({ v: 1, type: 'answer', room: 'SIGNL4', seq: 3, payload: { i: 9 } }));
    const ss = await watch(ws, 10000, (s) => s.phase === 'puzzle');
    assert.ok(ss.length > 0, 'puzzle survives garbage');
    const token = hello.token as string;
    ws.close();
    const { ws: w2 } = await join('Clumsy', 'SIGNL4', token);
    const after = await watch(w2, 10000, (s) => s.phase === 'puzzle');
    assert.ok(after.length > 0, 'reclaim rejoins the live puzzle');
    w2.close();
  });

  it('5: snapshots stay p95 ≤2KB on the wire at a full table', async () => {
    const { ws } = await join('Meter', 'SIGNL5');
    const raw: number[] = [];
    await new Promise<void>((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('meter timeout')), 20000);
      const h = (d: Buffer) => {
        try {
          const m = JSON.parse(d.toString()) as { type?: string; payload?: { t?: string } };
          if (m.type === 'snapshot' && m.payload?.t === 'signal') {
            raw.push(Buffer.byteLength(d.toString()));
            if (raw.length >= 30) { clearTimeout(to); ws.off('message', h); resolve(); }
          }
        } catch { /* partial */ }
      };
      ws.on('message', h);
    });
    raw.sort((a, b) => a - b);
    const p95 = raw[Math.floor(raw.length * 0.95)]!;
    assert.ok(p95 <= 2048, `signal p95 ${p95}B > 2KB`);
    ws.close();
  });

  it('6: one UTC day everywhere — and the code wins the crown', async () => {
    const { ws } = await join('Solver', 'SIGNL6');
    const ss = await watch(ws, 15000, (s) => s.phase === 'puzzle');
    const live = ss.find((s) => s.phase === 'puzzle');
    assert.ok(live, 'puzzle starts');
    const today = daySeedUTC();
    assert.equal(live!.day, today.day, 'room reads today');
    assert.equal(live!.seed, today.seed);
    // White-box solve: the seeded mystery IS this room's mystery.
    const code = genMystery(live!.seed, live!.day).code;
    let seq = 99;
    ws.send(JSON.stringify({
      v: 1, type: 'input', room: 'SIGNL6', seq: ++seq,
      payload: { dx: code[0], dy: code[1], aim: code[2] },
    }));
    const end = await watch(ws, 60000, (s) => s.phase === 'final');
    assert.ok(end.some((s) => s.phase === 'final'), 'solve crowns the room');
    const crowned = end.find((s) => s.phase === 'final')!;
    assert.ok(crowned.leaders[0]!.won, 'winner holds the crown');
    assert.ok(crowned.feed.join(' ').includes('🏆'));
    ws.close();
  });
});
