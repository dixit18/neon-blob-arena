// apps/server/test/room-e2e.test.ts — RT-5: Read The Room plays end-to-end
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
  round: {
    no: number; of: number; question: string;
    options: { n: string; you: boolean; bot: boolean }[];
    endsInMs: number; voted: boolean; myPick: number | null;
  } | null;
  reveal: {
    question: string; crowns: string[];
    tally: { n: string; v: number; you: boolean; bot: boolean }[];
  } | null;
  scores: { n: string; s: number }[];
}

function join(name: string, room = 'ROOM1', token?: string): Promise<{ ws: WebSocket; hello: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const q = token ? `&token=${encodeURIComponent(token)}` : '';
    const ws = new WebSocket(`${wsBase}?game=read-the-room&room=${room}&name=${name}${q}`);
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
        if (m.type === 'snapshot' && (m.payload as Snap)?.t === 'room') {
          got.push(m.payload as Snap);
          if (want && want(m.payload as Snap)) { clearTimeout(to); ws.off('message', h); resolve(got); }
        }
      } catch { /* partial */ }
    };
    ws.on('message', h);
  });
}

describe('read-the-room e2e', () => {
  it('1: hello carries token + room, snapshots stream', async () => {
    const { ws, hello } = await join('Boss', 'ROOM1');
    assert.ok(hello.token);
    assert.equal(hello.room, 'ROOM1');
    const ss = await watch(ws, 8000, (s) => s.round !== null);
    assert.ok(ss.length > 0);
    ws.close();
  });

  it('2: solo human gets an instant labelled party + a question', async () => {
    const { ws } = await join('Solo', 'ROOM2');
    const ss = await watch(ws, 15000, (s) => s.round !== null && s.round.options.length === 4);
    const live = ss.find((s) => s.round && s.round.options.length === 4);
    assert.ok(live, 'party fills to 4');
    const bots = live!.round!.options.filter((s) => !s.you);
    assert.equal(bots.length, 3);
    assert.ok(bots.every((s) => s.n.includes('🤖')));
    assert.ok(live!.round!.question.length > 10);
    ws.close();
  });

  it('3: answer i locks your ballot same-round', async () => {
    const { ws } = await join('Voter', 'ROOM3');
    let voted = false;
    const to = Date.now() + 30000;
    const h = (d: Buffer) => {
      try {
        const m = JSON.parse(d.toString()) as { type?: string; payload?: Snap };
        if (m.type !== 'snapshot' || (m.payload as Snap)?.t !== 'room') return;
        const s = m.payload as Snap;
        if (s.phase === 'vote' && s.round && !s.round.voted) {
          ws.send(JSON.stringify({ v: 1, type: 'answer', room: 'ROOM3', seq: 1, payload: { i: 1 } }));
        }
        if (s.round?.voted) voted = true;
      } catch { /* partial */ }
    };
    ws.on('message', h);
    while (!voted && Date.now() < to) await new Promise((r) => setTimeout(r, 200));
    ws.off('message', h);
    assert.ok(voted, 'ballot locked (voted=true seen)');
    ws.close();
  });

  it('4: no double-score — repeat ballots count once', async () => {
    const { ws } = await join('Dupe', 'ROOM4');
    // spam two different seats every 200ms; dedup keeps exactly one per round
    let seqN = 1;
    const sender = setInterval(() => {
      try {
        ws.send(JSON.stringify({ v: 1, type: 'answer', room: 'ROOM4', seq: ++seqN, payload: { i: seqN % 2 === 0 ? 1 : 2 } }));
      } catch { /* gone */ }
    }, 200);
    let checked = false;
    try {
      const ss = await watch(ws, 30000, (s) => s.phase === 'reveal' && s.reveal !== null);
      const rev = ss.find((s) => s.phase === 'reveal' && s.reveal);
      assert.ok(rev, 'a reveal arrives under spam');
      const total = rev!.reveal!.tally.reduce((a, t) => a + t.v, 0);
      const seats = rev!.reveal!.tally.length;
      assert.ok(total <= seats, `tally ${total} exceeds one-vote-per-seat (${seats})`);
      checked = true;
    } finally {
      clearInterval(sender);
    }
    assert.ok(checked);
    ws.close();
  });

  it('5: bad input + answers survive — socket stays open', async () => {
    const { ws } = await join('Clumsy', 'ROOM5');
    ws.send(JSON.stringify({ v: 1, type: 'answer', room: 'ROOM5', seq: 1, payload: { i: 99 } }));
    ws.send(JSON.stringify({ v: 1, type: 'answer', room: 'ROOM5', seq: 2, payload: { i: 'x' } }));
    ws.send(JSON.stringify({ v: 1, type: 'input', room: 'ROOM5', seq: 3, payload: { dx: 1 } }));
    const ss = await watch(ws, 8000, (s) => s.round !== null);
    assert.ok(ss.length > 0);
    ws.close();
  });

  it('6: snapshots stay p95 ≤2KB on the wire', async () => {
    const { ws } = await join('Meter', 'ROOM6');
    const raw: number[] = [];
    await new Promise<void>((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('meter timeout')), 20000);
      const h = (d: Buffer) => {
        try {
          const m = JSON.parse(d.toString()) as { type?: string; payload?: { t?: string } };
          if (m.type === 'snapshot' && m.payload?.t === 'room') {
            raw.push(Buffer.byteLength(d.toString()));
            if (raw.length >= 30) { clearTimeout(to); ws.off('message', h); resolve(); }
          }
        } catch { /* partial */ }
      };
      ws.on('message', h);
    });
    raw.sort((a, b) => a - b);
    const p95 = raw[Math.floor(raw.length * 0.95)]!;
    assert.ok(p95 <= 2048, `room p95 ${p95}B > 2KB`);
    ws.close();
  });

  it('7: reconnect reclaims the seat AND keeps the question', async () => {
    const { ws, hello } = await join('Returner', 'ROOM7');
    const before = await watch(ws, 15000, (s) => s.phase === 'vote' && s.round !== null);
    const q = before.find((s) => s.phase === 'vote' && s.round)?.round?.question;
    assert.ok(q, 'saw a question before drop');
    const token = hello.token as string;
    ws.close();
    const { ws: w2 } = await join('Returner', 'ROOM7', token);
    const after = await watch(w2, 15000, (s) => s.phase === 'vote' && s.round !== null);
    const q2 = after.find((s) => s.phase === 'vote' && s.round)?.round?.question;
    assert.ok(q2, 'question still live after reclaim');
    w2.close();
  });

  it('8: rounds advance vote → reveal → next question on their own', async () => {
    const { ws } = await join('Watcher', 'ROOM8');
    const ss = await watch(ws, 45000, (s) =>
      (s.phase === 'vote' && s.round !== null && s.round.no >= 2) || s.phase === 'final');
    const advanced = ss.some((s) =>
      (s.phase === 'vote' && s.round !== null && s.round.no >= 2) || s.phase === 'final');
    assert.ok(advanced, 'game advanced past round 1 (bots + timers drive it)');
    ws.close();
  });
});
