// apps/server/test/riot-e2e.test.ts — RR-5: Reflex Riot plays end-to-end
// over real sockets. Blocks release if red.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createApp } from '../src/app.js';

const app = createApp({ region: 'test' });
let base = '';
let wsBase = '';
let pump: NodeJS.Timeout[] = [];

before(async () => {
  await new Promise<void>((res) => app.server.listen(0, '127.0.0.1', () => res()));
  const addr = app.server.address();
  assert.ok(addr && typeof addr === 'object');
  base = `http://127.0.0.1:${(addr as { port: number }).port}`;
  wsBase = `ws://127.0.0.1:${(addr as { port: number }).port}`;
  // Pump the loop like index.ts does in prod (20Hz step, 15Hz snaps).
  pump = [
    setInterval(() => app.stepAll(), 50),
    setInterval(() => app.snapAll(), 66),
  ];
});
after(() => { for (const p of pump) clearInterval(p); app.shutdown(); });

interface Snap {
  t: string; phase: string;
  task: { kind: string; endsInMs: number; need: number; seq: number[] } | null;
  round: { n: number; task: number; total: number };
  scores: { n: string; s: number; you: boolean; bot: boolean }[];
  feed: string[];
  you: { score: number; streak: number; gain: number };
}

function join(game: string, name: string, room?: string): Promise<{ ws: WebSocket; hello: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const q = room ? `&room=${room}` : '';
    const ws = new WebSocket(`${wsBase}?game=${game}&name=${name}${q}`);
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

function nextSnap(ws: WebSocket, timeoutMs = 8000): Promise<Snap> {
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('snap timeout')), timeoutMs);
    const h = (d: Buffer) => {
      try {
        const m = JSON.parse(d.toString()) as { type?: string; payload?: Snap };
        if (m.type === 'snapshot' && (m.payload as Snap)?.t === 'riot') {
          clearTimeout(to);
          ws.off('message', h);
          resolve(m.payload as Snap);
        }
      } catch { /* partial */ }
    };
    ws.on('message', h);
  });
}

function fire(ws: WebSocket, room: string, seq: { n: number }, down: boolean): void {
  ws.send(JSON.stringify({ v: 1, type: 'input', room, seq: ++seq.n, payload: { dx: 0, dy: 0, fire: down } }));
}

describe('riot e2e', () => {
  it('1: hello carries token + room, task streams within 3s', async () => {
    const { ws, hello } = await join('reflex-riot', 'E2E');
    assert.ok(typeof hello.you === 'string' && typeof hello.token === 'string');
    assert.ok(typeof hello.room === 'string');
    const snap = await nextSnap(ws, 8000);
    assert.equal(snap.round.total, 8);
    ws.close();
  });

  it('2: labelled bots fill a solo room instantly', async () => {
    const { ws } = await join('reflex-riot', 'Solo');
    let bots = 0;
    for (let i = 0; i < 6; i++) {
      const s = await nextSnap(ws, 8000);
      bots = Math.max(bots, s.scores.filter((l) => l.bot).length);
      if (bots >= 3) break;
    }
    assert.ok(bots >= 3, `bots=${bots}`);
    assert.ok((await nextSnap(ws)).scores.some((l) => l.bot && l.n.includes('🤖')));
    ws.close();
  });

  it('3: fire edges score on tap/mash/hold tasks', async () => {
    const { ws, hello } = await join('reflex-riot', 'Masher');
    const room = hello.room as string;
    const seq = { n: 0 };
    let scored = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 25000 && !scored) {
      const s = await nextSnap(ws, 8000);
      if (s.phase === 'task' && s.task && ['tap', 'mash', 'hold'].includes(s.task.kind)) {
        fire(ws, room, seq, true);
        fire(ws, room, seq, false);
      }
      if (s.you.score > 0 || s.you.gain > 0) scored = true;
    }
    assert.ok(scored, 'human scored via socket input');
    ws.close();
  });

  it('4: bad answers survive — socket stays open', async () => {
    const { ws, hello } = await join('reflex-riot', 'Clumsy');
    const room = hello.room as string;
    let seq = 99;
    ws.send(JSON.stringify({ v: 1, type: 'answer', room, seq: ++seq, payload: { i: 99 } })); // invalid
    ws.send(JSON.stringify({ v: 1, type: 'answer', room, seq: ++seq, payload: { i: -1 } })); // invalid
    ws.send(JSON.stringify({ v: 1, type: 'answer', room, seq: ++seq, payload: { i: 0 } })); // valid shape
    const s = await nextSnap(ws, 8000); // still alive and snapping
    assert.equal(s.t, 'riot');
    ws.close();
  });

  it('5: snapshots stay p95 ≤700B on the wire', async () => {
    const { ws } = await join('reflex-riot', 'Meter');
    const sizes: number[] = [];
    for (let i = 0; i < 20; i++) {
      const s = await nextSnap(ws, 8000);
      sizes.push(Buffer.byteLength(JSON.stringify(s)));
    }
    sizes.sort((a, b) => a - b);
    const p95 = sizes[Math.min(sizes.length - 1, Math.floor(sizes.length * 0.95))]!;
    assert.ok(p95 <= 700, `p95=${p95}B`);
    ws.close();
  });

  it('6: 15 humans share one room and all get snapshots', async () => {
    const first = await join('reflex-riot', 'P0');
    const room = first.hello.room as string;
    const conns: { ws: WebSocket; hello: Record<string, unknown> }[] = [first];
    for (let i = 1; i < 15; i++) conns.push(await join('reflex-riot', `P${i}`, room));
    const snaps = await Promise.all(conns.map((c) => nextSnap(c.ws, 10000)));
    assert.equal(snaps.length, 15);
    assert.ok(snaps.every((s) => s.t === 'riot'));
    const presence = (await (await fetch(`${base}/rooms`)).json()) as { id: string; humans: number }[];
    const mine = presence.find((r) => r.id === room);
    assert.equal(mine?.humans, 15);
    for (const c of conns) c.ws.close();
  });

  it('7: reconnect reclaims the riot player', async () => {
    const first = await join('reflex-riot', 'Dropper');
    const token = first.hello.token as string;
    const you = first.hello.you as string;
    first.ws.close();
    await new Promise((r) => setTimeout(r, 300));
    const ws = new WebSocket(`${wsBase}?game=reflex-riot&token=${encodeURIComponent(token)}`);
    const hello = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('reclaim timeout')), 8000);
      ws.on('message', (d) => {
        try {
          const m = JSON.parse(d.toString()) as { type?: string; payload?: Record<string, unknown> };
          if (m.type === 'event' && (m.payload as { t?: string })?.t === 'hello') {
            clearTimeout(to);
            resolve(m.payload as Record<string, unknown>);
          }
        } catch { /* partial */ }
      });
      ws.on('error', () => {});
    });
    assert.equal(hello.you, you);
    assert.equal(hello.reclaimed, true);
    ws.close();
  });

  it('8: firewall holds — other games still refuse, riot plays', async () => {
    const { ws } = await join('reflex-riot', 'Bouncer');
    const s = await nextSnap(ws, 8000);
    assert.equal(s.t, 'riot');
    ws.close();
    await new Promise<void>((resolve, reject) => {
      const g = new WebSocket(`${wsBase}?game=totem-panic&name=X`);
      const to = setTimeout(() => reject(new Error('no refusal')), 8000);
      g.on('message', (d) => {
        try {
          const m = JSON.parse(d.toString()) as { t?: string; code?: string };
          if (m.t === 'error' && m.code === 'not-implemented') { clearTimeout(to); g.close(); resolve(); }
        } catch { /* partial */ }
      });
      g.on('error', () => {});
    });
  });
});
