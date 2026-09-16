// Integration: real HTTP + WS against createApp with a stub driver.
// Proves the plugin seam: unimplemented games refuse, rooms flow, GC works.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createApp } from '../src/app.js';
import type { RoomDriver } from '../../../packages/room/src/index.js';

function stub(): RoomDriver {
  const players = new Map<string, { name: string; isBot: boolean }>();
  const cmds: string[] = [];
  return {
    game: 'reflex-riot',
    join: (p) => { players.set(p.id, p); },
    leave: (id) => { players.delete(id); },
    accept: (c) => { cmds.push(c.kind); },
    step: () => {},
    snapshot: (pid) => ({ you: pid, n: players.size, kinds: cmds }),
    createBot: (slot) => ({ name: `Bot-${slot}` }),
    playerCount: () => players.size,
    dispose: () => { players.clear(); },
  };
}

const app = createApp({ region: 'test' });
let base = '';
let wsBase = '';

before(async () => {
  app.registry.register('reflex-riot', stub);
  await new Promise<void>((res) => app.server.listen(0, '127.0.0.1', () => res()));
  const addr = app.server.address();
  assert.ok(addr && typeof addr === 'object');
  base = `http://127.0.0.1:${(addr as { port: number }).port}`;
  wsBase = `ws://127.0.0.1:${(addr as { port: number }).port}`;
});
after(() => app.shutdown());

function hello(game: string, extra = ''): Promise<{ ws: WebSocket; msg: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${wsBase}?game=${game}&name=T${extra}`);
    const to = setTimeout(() => { try { ws.close(); } catch { /* t */ } reject(new Error('hello timeout')); }, 5000);
    ws.on('message', (d) => {
      try {
        const m = JSON.parse(d.toString()) as { type?: string; payload?: Record<string, unknown> };
        if (m.type === 'event' && (m.payload as { t?: string })?.t === 'hello') {
          clearTimeout(to);
          resolve({ ws, msg: m.payload as Record<string, unknown> });
        }
      } catch { /* partial */ }
    });
    ws.on('error', () => {});
  });
}

describe('server integration', () => {
  it('serves health + catalog', async () => {
    const h = (await (await fetch(`${base}/health`)).json()) as { ok: boolean; node: string };
    assert.equal(h.ok, true);
    assert.ok(h.node.startsWith('v'));
    const cat = (await (await fetch(`${base}/catalog`)).json()) as { id: string }[];
    assert.equal(cat.length, 8);
  });
  it('refuses unimplemented games with a code', async () => {
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`${wsBase}?game=ghostline&name=X`);
      const to = setTimeout(() => reject(new Error('no refusal')), 5000);
      ws.on('message', (d) => {
        try {
          const m = JSON.parse(d.toString()) as { t?: string; code?: string };
          if (m.t === 'error' && m.code === 'not-implemented') { clearTimeout(to); try { ws.close(); } catch { /* t */ } resolve(); }
        } catch { /* partial */ }
      });
      ws.on('error', () => {});
    });
  });
  it('join → command → snapshot → leave flows', async () => {
    const { ws, msg } = await hello('reflex-riot');
    assert.ok(typeof msg.you === 'string' && typeof msg.token === 'string');
    const room = msg.room as string;
    ws.send(JSON.stringify({ v: 1, type: 'input', room, seq: 1, payload: { dx: 1, dy: 0 } }));
    ws.send(JSON.stringify({ v: 1, type: 'input', room, seq: 1, payload: { dx: 1, dy: 0 } })); // replay: dropped
    ws.send(JSON.stringify({ v: 1, type: 'input', room, seq: 2, payload: { dx: NaN, dy: 0 } })); // bad shape: dropped
    await new Promise((r) => setTimeout(r, 300)); // let the server accept before we snapshot
    app.stepAll();
    app.snapAll();
    const snap = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('snap timeout')), 5000);
      ws.on('message', (d) => {
        try {
          const m = JSON.parse(d.toString()) as { type?: string; payload?: Record<string, unknown> };
          if (m.type === 'snapshot') { clearTimeout(to); resolve(m.payload as Record<string, unknown>); }
        } catch { /* partial */ }
      });
    });
    assert.deepEqual(snap.kinds, ['input']); // exactly one accepted command
    await new Promise<void>((res) => { ws.close(); setTimeout(res, 200); });
    const rooms = (await (await fetch(`${base}/rooms`)).json()) as { humans: number }[];
    assert.equal(rooms[0]!.humans, 0);
  });
  it('reconnect reclaims the same player', async () => {
    const first = await hello('reflex-riot', '2');
    const token = first.msg.token as string;
    const you = first.msg.you as string;
    first.ws.close();
    await new Promise((r) => setTimeout(r, 200));
    const second = await new Promise<{ ws: WebSocket; msg: Record<string, unknown> }>((resolve, reject) => {
      const ws = new WebSocket(`${wsBase}?game=reflex-riot&token=${encodeURIComponent(token)}`);
      const to = setTimeout(() => reject(new Error('reclaim timeout')), 5000);
      ws.on('message', (d) => {
        try {
          const m = JSON.parse(d.toString()) as { type?: string; payload?: Record<string, unknown> };
          if (m.type === 'event' && (m.payload as { t?: string })?.t === 'hello') {
            clearTimeout(to);
            resolve({ ws, msg: m.payload as Record<string, unknown> });
          }
        } catch { /* partial */ }
      });
      ws.on('error', () => {});
    });
    assert.equal(second.msg.you, you);
    assert.equal(second.msg.reclaimed, true);
    second.ws.close();
  });
  it('backpressure and GC paths do not throw', async () => {
    assert.doesNotThrow(() => {
      app.stepAll();
      app.snapAll();
      app.registry.tick(Date.now() + 10 * 60_000);
    });
  });
});
