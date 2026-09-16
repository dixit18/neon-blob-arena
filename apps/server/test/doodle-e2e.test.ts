// apps/server/test/doodle-e2e.test.ts — DD-5: Doodle Duel over real sockets.
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
  pump = [setInterval(() => app.stepAll(), 50), setInterval(() => app.snapAll(), 66)];
});
after(() => { for (const p of pump) clearInterval(p); app.shutdown(); });

interface Snap {
  t: string; phase: string;
  drawing: {
    n: number; total: number; drawer: string; drawerYou: boolean;
    endsInMs: number; prompt: string | null; options: string[];
    picked: number; strokes: { id: number; d: string; done: boolean }[]; gotIt: number;
  } | null;
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

function nextSnap(ws: WebSocket, timeoutMs = 10000): Promise<Snap> {
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('snap timeout')), timeoutMs);
    const h = (d: Buffer) => {
      try {
        const m = JSON.parse(d.toString()) as { type?: string; payload?: Snap };
        if (m.type === 'snapshot' && (m.payload as Snap)?.t === 'doodle') {
          clearTimeout(to);
          ws.off('message', h);
          resolve(m.payload as Snap);
        }
      } catch { /* partial */ }
    };
    ws.on('message', h);
  });
}

async function untilDraw(ws: WebSocket): Promise<Snap> {
  const t0 = Date.now();
  for (;;) {
    const s = await nextSnap(ws, 10000);
    if (s.phase === 'draw' && s.drawing) return s;
    if (Date.now() - t0 > 20000) throw new Error('no drawing in 20s');
  }
}

describe('doodle e2e', () => {
  it('1: hello + drawing streams; prompt hidden from guessers', async () => {
    const a = await join('doodle-duel', 'DrawA');
    const b = await join('doodle-duel', 'GuessB', a.hello.room as string);
    const sa = await untilDraw(a.ws);
    const sb = await untilDraw(b.ws);
    assert.ok((sa.drawing!.prompt?.length ?? 0) >= 2 || (sb.drawing!.prompt?.length ?? 0) >= 2);
    // exactly one side sees the prompt: the drawer
    const drawerSees = sa.drawing!.prompt !== null;
    const guesserSees = sb.drawing!.prompt !== null;
    assert.ok(drawerSees !== guesserSees, 'prompt leaks or missing');
    assert.equal(sb.drawing!.options.length, drawerSees ? 4 : 0);
    a.ws.close(); b.ws.close();
  });

  it('2: drawer strokes land in the guesser view', async () => {
    const a = await join('doodle-duel', 'DrawC');
    const b = await join('doodle-duel', 'GuessD', a.hello.room as string);
    const sa = await untilDraw(a.ws);
    const drawerWs = sa.drawing!.drawerYou ? a.ws : b.ws;
    const viewerWs = sa.drawing!.drawerYou ? b.ws : a.ws;
    const room = a.hello.room as string;
    const pts = Array.from({ length: 12 }, (_, k) => ({ x: k * 8, y: 50 }));
    drawerWs.send(JSON.stringify({ v: 1, type: 'strokeBatch', room, seq: 1, payload: { strokeId: 0, pts, done: true } }));
    let seen = false;
    for (let i = 0; i < 10 && !seen; i++) {
      const s = await nextSnap(viewerWs, 10000);
      seen = (s.drawing?.strokes.length ?? 0) > 0;
    }
    assert.ok(seen, 'stroke visible to guesser');
    a.ws.close(); b.ws.close();
  });

  it('3: correct guess pays live; bots watch with tags', async () => {
    const a = await join('doodle-duel', 'DrawE');
    const b = await join('doodle-duel', 'GuessF', a.hello.room as string);
    const sa = await untilDraw(a.ws);
    // drawer = whoever sees the prompt; the other one guesses
    const drawer = sa.drawing!.drawerYou ? a : b;
    const guesser = sa.drawing!.drawerYou ? b : a;
    const prompt = (await untilDraw(drawer.ws)).drawing!.prompt!;
    const gsnap = await untilDraw(guesser.ws);
    assert.ok(!gsnap.drawing!.drawerYou);
    const ix = gsnap.drawing!.options.indexOf(prompt);
    assert.ok(ix >= 0);
    guesser.ws.send(JSON.stringify({
      v: 1, type: 'answer', room: guesser.hello.room, seq: 5, payload: { i: ix },
    }));
    let gained = false;
    let bots = 0;
    for (let i = 0; i < 10 && !gained; i++) {
      const s = await nextSnap(guesser.ws, 10000);
      bots = Math.max(bots, s.scores.filter((l) => l.bot).length);
      if (s.you.gain > 0) gained = true;
    }
    assert.ok(gained, 'guesser gain>0 over socket');
    assert.ok(bots >= 1, 'bot audience present');
    a.ws.close(); b.ws.close();
  });

  it('4: drawer bail aborts to reveal, scores bank, feed tells', async () => {
    // Fresh room code: drawer rotation must start with the first joiner.
    const a = await join('doodle-duel', 'DrawG', 'DDBAIL');
    const b = await join('doodle-duel', 'GuessH', 'DDBAIL');
    await untilDraw(a.ws);
    a.ws.close(); // drawer bails
    let revealed = false;
    let told = false;
    for (let i = 0; i < 12 && !revealed; i++) {
      const s = await nextSnap(b.ws, 10000);
      if (s.phase !== 'draw') {
        revealed = true;
        told = s.feed.some((f) => f.includes('bailed'));
      }
    }
    assert.ok(revealed && told, 'abort → reveal with feed note');
    b.ws.close();
  });

  it('5: doodle snapshots stay ≤4KB on the wire', async () => {
    const { ws, hello } = await join('doodle-duel', 'Meter');
    const room = hello.room as string;
    const s0 = await untilDraw(ws);
    if (s0.drawing!.drawerYou) {
      for (let i = 0; i < 16; i++) {
        ws.send(JSON.stringify({
          v: 1, type: 'strokeBatch', room, seq: 10 + i,
          payload: { strokeId: i, pts: Array.from({ length: 32 }, (_, k) => ({ x: (k * 3) % 100, y: (k * 5) % 100 })), done: true },
        }));
      }
    }
    const sizes: number[] = [];
    for (let i = 0; i < 15; i++) sizes.push(Buffer.byteLength(JSON.stringify(await nextSnap(ws, 10000))));
    sizes.sort((x, y) => x - y);
    const p95 = sizes[Math.min(sizes.length - 1, Math.floor(sizes.length * 0.95))]!;
    assert.ok(p95 <= 4096, `p95=${p95}B`);
    ws.close();
  });

  it('6: catalog lists doodle-duel; riot still plays', async () => {
    const cat = (await (await fetch(`${base}/catalog`)).json()) as { id: string }[];
    assert.ok(cat.some((g) => g.id === 'doodle-duel'));
    assert.ok(cat.some((g) => g.id === 'reflex-riot'));
    const { ws } = await join('reflex-riot', 'Regress');
    const t0 = Date.now();
    let riot = false;
    while (Date.now() - t0 < 15000 && !riot) {
      const m: { type?: string; payload?: { t?: string } } = await new Promise((res, rej) => {
        const to = setTimeout(() => rej(new Error('msg timeout')), 8000);
        ws.once('message', (d) => {
          clearTimeout(to);
          try { res(JSON.parse(d.toString())); } catch { res({}); }
        });
      });
      if (m.type === 'snapshot' && m.payload?.t === 'riot') riot = true;
    }
    assert.ok(riot, 'riot unregressed');
    ws.close();
  });
});
