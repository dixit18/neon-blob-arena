// apps/server/test/totem-e2e.test.ts — TP-5: Totem Panic plays end-to-end
// over real sockets. Blocks release if red.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createApp } from '../src/app.js';

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
  tower: { w: number; x: number }[];
  queue: number[];
  turn: { name: string; you: boolean; endsInMs: number } | null;
  spectating: boolean;
  lean: number;
  levelsLeft: number;
  outcome: { result: string } | null;
  leaders: { n: string; placed: number; you: boolean; bot: boolean }[];
  feed: string[];
}

function join(name: string, room = 'TOTEM1', token?: string): Promise<{ ws: WebSocket; hello: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const q = token ? `&token=${encodeURIComponent(token)}` : '';
    const ws = new WebSocket(`${wsBase}?game=totem-panic&room=${room}&name=${name}${q}`);
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
        if (m.type === 'snapshot' && (m.payload as Snap)?.t === 'totem') {
          got.push(m.payload as Snap);
          if (want && want(m.payload as Snap)) { clearTimeout(to); ws.off('message', h); resolve(got); }
        }
      } catch { /* partial */ }
    };
    ws.on('message', h);
  });
}

describe('totem-panic e2e', () => {
  it('1: hello carries token + room, totem snapshots stream', async () => {
    const { ws, hello } = await join('Boss', 'TOTEM1');
    assert.ok(hello.token);
    assert.equal(hello.room, 'TOTEM1');
    const ss = await watch(ws, 10000, (s) => s.phase === 'build');
    assert.ok(ss.length > 0);
    ws.close();
  });

  it('2: solo human gets an instant labelled crew + one drop order', async () => {
    const { ws } = await join('Solo', 'TOTEM2');
    const ss = await watch(ws, 15000, (s) => s.phase === 'build' && s.leaders.length === 4);
    const live = ss.find((s) => s.phase === 'build' && s.leaders.length === 4);
    assert.ok(live, 'crew fills to 4');
    assert.equal(live!.queue.length, 3);
    const crew = live!.leaders.filter((l) => !l.you);
    assert.equal(crew.length, 3);
    assert.ok(crew.every((x) => x.n.includes('🤖')));
    ws.close();
  });

  it('3: human drop crosses the protocol gate and lands', async () => {
    const { ws } = await join('Mason', 'TOTEM3');
    let seq = 0;
    let landed = false;
    const to = Date.now() + 30000;
    const h = (d: Buffer) => {
      try {
        const m = JSON.parse(d.toString()) as { type?: string; payload?: Snap };
        if (m.type !== 'snapshot' || (m.payload as Snap)?.t !== 'totem') return;
        const s = m.payload as Snap;
        // The TP-4 client shape exactly: drop offset on dx.
        if (s.phase === 'build' && s.turn?.you && s.tower.length === 0) {
          ws.send(JSON.stringify({ v: 1, type: 'input', room: 'TOTEM3', seq: ++seq, payload: { dx: 5, dy: 0 } }));
        }
        if (s.tower.length >= 1) landed = true;
      } catch { /* partial */ }
    };
    ws.on('message', h);
    while (!landed && Date.now() < to) await new Promise((r) => setTimeout(r, 200));
    ws.off('message', h);
    assert.ok(landed, 'drop landed a live block');
    ws.close();
  });

  it('4: bad input + reconnect survive — seat and record kept', async () => {
    const { ws, hello } = await join('Clumsy', 'TOTEM4');
    ws.send(JSON.stringify({ v: 1, type: 'input', room: 'TOTEM4', seq: 1, payload: { dx: 'left' } }));
    ws.send(JSON.stringify({ v: 1, type: 'input', room: 'TOTEM4', seq: 2, payload: { angle: 0 } }));
    ws.send(JSON.stringify({ v: 1, type: 'answer', room: 'TOTEM4', seq: 3, payload: { i: 9 } }));
    const ss = await watch(ws, 10000, (s) => s.phase === 'build');
    assert.ok(ss.length > 0, 'build survives garbage');
    const token = hello.token as string;
    ws.close();
    const { ws: w2 } = await join('Clumsy', 'TOTEM4', token);
    const after = await watch(w2, 10000, (s) => s.phase === 'build');
    assert.ok(after.length > 0, 'reclaim rejoins the live raise');
    w2.close();
  });

  it('5: snapshots stay p95 ≤1.5KB on the wire at a full table', async () => {
    const { ws } = await join('Meter', 'TOTEM5');
    const raw: number[] = [];
    await new Promise<void>((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('meter timeout')), 20000);
      const h = (d: Buffer) => {
        try {
          const m = JSON.parse(d.toString()) as { type?: string; payload?: { t?: string } };
          if (m.type === 'snapshot' && m.payload?.t === 'totem') {
            raw.push(Buffer.byteLength(d.toString()));
            if (raw.length >= 30) { clearTimeout(to); ws.off('message', h); resolve(); }
          }
        } catch { /* partial */ }
      };
      ws.on('message', h);
    });
    raw.sort((a, b) => a - b);
    const p95 = raw[Math.floor(raw.length * 0.95)]!;
    assert.ok(p95 <= 1536, `totem p95 ${p95}B > 1.5KB`);
    ws.close();
  });

  it('6: steady table raises the totem to a final', async () => {
    const { ws } = await join('Foreman', 'TOTEM6');
    let seq = 100;
    const h = (d: Buffer) => {
      try {
        const m = JSON.parse(d.toString()) as { type?: string; payload?: Snap };
        if (m.type !== 'snapshot' || (m.payload as Snap)?.t !== 'totem') return;
        const s = m.payload as Snap;
        // Foreman centers every one of their turns; bots center themselves.
        if (s.phase === 'build' && s.turn?.you && s.tower.length > 0) {
          const top = s.tower[s.tower.length - 1]!;
          ws.send(JSON.stringify({ v: 1, type: 'input', room: 'TOTEM6', seq: ++seq, payload: { dx: top.x, dy: 0 } }));
        }
      } catch { /* partial */ }
    };
    ws.on('message', h);
    const end = await watch(ws, 120000, (s) => s.phase === 'final');
    ws.off('message', h);
    assert.ok(end.some((s) => s.phase === 'final'), 'totem settles');
    const settled = end.find((s) => s.phase === 'final')!;
    assert.equal(settled.outcome?.result, 'raised');
    assert.ok(settled.feed.join(' ').includes('RAISED'));
    ws.close();
  });
});
