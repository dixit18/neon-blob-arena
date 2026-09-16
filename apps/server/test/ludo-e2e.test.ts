// apps/server/test/ludo-e2e.test.ts — LD-5: Ludo Clash plays end-to-end
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
  board: {
    seats: { n: string; you: boolean; bot: boolean; tokens: number[] }[];
    turn: { name: string; you: boolean; endsInMs: number; dice: number; options: number[]; canRoll: boolean } | null;
  } | null;
}

function join(name: string, room = 'LUDO1'): Promise<{ ws: WebSocket; hello: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${wsBase}?game=ludo-clash&room=${room}&name=${name}`);
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

function snaps(ws: WebSocket, n = 3, timeoutMs = 10000): Promise<Snap[]> {
  return new Promise((resolve, reject) => {
    const got: Snap[] = [];
    const to = setTimeout(() => reject(new Error('snap timeout ludo')), timeoutMs);
    const h = (d: Buffer) => {
      try {
        const m = JSON.parse(d.toString()) as { type?: string; payload?: Snap };
        if (m.type === 'snapshot' && (m.payload as Snap)?.t === 'ludo') {
          got.push(m.payload as Snap);
          if (got.length >= n) { clearTimeout(to); ws.off('message', h); resolve(got); }
        }
      } catch { /* partial */ }
    };
    ws.on('message', h);
  });
}

describe('ludo e2e', () => {
  it('1: hello carries token + room, board streams', async () => {
    const { ws, hello } = await join('Boss');
    assert.ok(hello.token);
    assert.equal(hello.room, 'LUDO1');
    const ss = await snaps(ws, 3);
    assert.ok(ss.length === 3);
    ws.close();
  });

  it('2: labelled bots fill a solo table instantly', async () => {
    const { ws } = await join('Solo', 'LUDO2');
    // board renders at play start (~1s lobby); bots join instantly at hello
    const ss = await snaps(ws, 25, 15000);
    const live = ss.find((s) => s.board && s.board.seats.length === 4);
    assert.ok(live, 'table fills to 4');
    const bots = live!.board!.seats.filter((s) => !s.you);
    assert.equal(bots.length, 3);
    assert.ok(bots.every((s) => s.n.includes('🤖')));
    ws.close();
  });

  it('3: roll edge works — input fire rolls on your turn', async () => {
    const { ws } = await join('Roller', 'LUDO3');
    // wait for a FRESH roll window (endsInMs proves the 15s timeout cannot
    // land inside our observation — whatever moves, our fire moved it).
    const ss = await snaps(ws, 60, 25000);
    const fresh = ss.find((s) => s.board?.turn?.you && s.board.turn.canRoll && (s.board.turn.endsInMs ?? 0) > 8000);
    assert.ok(fresh, 'a fresh roll turn arrives');
    // repeat-send: exactly one fire lands in a roll stage; the rest are
    // harmlessly ignored (pick stage / bot turns). seq must climb.
    const room = 'LUDO3';
    let seqN = 1;
    const sender = setInterval(() => {
      try { ws.send(JSON.stringify({ v: 1, type: 'input', room, seq: ++seqN, payload: { dx: 0, dy: 0, fire: true } })); } catch { /* gone */ }
    }, 200);
    let rolled = false;
    try {
      const after = await snaps(ws, 40, 10000);
      rolled = after.some((s) =>
        (s.board?.turn?.dice ?? 0) > 0 ||
        s.board?.turn?.you === false ||
        (s.board?.turn?.options.length ?? 0) > 0);
    } finally {
      clearInterval(sender);
    }
    assert.ok(rolled, 'roll took effect (dice, options, or turn moved)');
    ws.close();
  });

  it('4: bad input + answers survive — socket stays open', async () => {
    const { ws } = await join('Clumsy', 'LUDO4');
    ws.send(JSON.stringify({ v: 1, type: 'input', room: 'LUDO4', seq: 1, payload: { dx: NaN } }));
    ws.send(JSON.stringify({ v: 1, type: 'answer', room: 'LUDO4', seq: 2, payload: { i: 99 } }));
    ws.send(JSON.stringify({ v: 1, type: 'answer', room: 'LUDO4', seq: 3, payload: { i: 'x' } }));
    const ss = await snaps(ws, 3);
    assert.ok(ss.length === 3);
    ws.close();
  });

  it('5: snapshots stay p95 ≤2KB on the wire', async () => {
    const { ws } = await join('Meter', 'LUDO5');
    const raw: number[] = [];
    await new Promise<void>((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('meter timeout')), 15000);
      const h = (d: Buffer) => {
        try {
          const m = JSON.parse(d.toString()) as { type?: string; payload?: { t?: string } };
          if (m.type === 'snapshot' && m.payload?.t === 'ludo') {
            raw.push(Buffer.byteLength(d.toString()));
            if (raw.length >= 30) { clearTimeout(to); ws.off('message', h); resolve(); }
          }
        } catch { /* partial */ }
      };
      ws.on('message', h);
    });
    raw.sort((a, b) => a - b);
    const p95 = raw[Math.floor(raw.length * 0.95)]!;
    assert.ok(p95 <= 2048, `ludo p95 ${p95}B > 2KB`);
    ws.close();
  });

  it('6: reconnect reclaims the ludo seat', async () => {
    const { ws, hello } = await join('Returner', 'LUDO6');
    await snaps(ws, 2);
    const token = hello.token as string;
    ws.close();
    await new Promise<void>((resolve, reject) => {
      const w2 = new WebSocket(`${wsBase}?game=ludo-clash&room=LUDO6&name=Returner&token=${encodeURIComponent(token)}`);
      const to = setTimeout(() => { try { w2.close(); } catch { /* t */ } reject(new Error('reclaim timeout')); }, 8000);
      w2.on('message', (d) => {
        try {
          const m = JSON.parse(d.toString()) as { type?: string; payload?: Record<string, unknown> };
          if (m.type === 'event' && (m.payload as { t?: string })?.t === 'hello') {
            clearTimeout(to);
            assert.equal((m.payload as { reclaimed?: boolean }).reclaimed, true);
            w2.close();
            resolve();
          }
        } catch { /* partial */ }
      });
      w2.on('error', () => {});
    });
  });
});
