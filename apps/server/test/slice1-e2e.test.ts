// apps/server/test/slice1-e2e.test.ts — wire-up proof for the two slice-1
// games: hello carries token, snapshots stream with the right shape, bots
// backfill a solo room, bad input never kills the socket.
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
  // Pump the loop like index.ts does in prod (20Hz step, 15Hz snaps).
  pump = [
    setInterval(() => app.stepAll(), 50),
    setInterval(() => app.snapAll(), 66),
  ];
});
after(() => { for (const p of pump) clearInterval(p); app.shutdown(); });

function join(game: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${wsBase}?game=${game}&room=SLC1&name=Boss`);
    const to = setTimeout(() => { try { ws.close(); } catch { /* t */ } reject(new Error(`hello timeout ${game}`)); }, 8000);
    ws.on('message', (d) => {
      try {
        const m = JSON.parse(d.toString()) as { type?: string; payload?: { t?: string; token?: string } };
        if (m.type === 'event' && m.payload?.t === 'hello' && m.payload.token) {
          clearTimeout(to);
          resolve(ws);
        }
      } catch { /* partial */ }
    });
    ws.on('error', () => {});
  });
}

function snaps(ws: WebSocket, want: string, n = 3): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const got: Record<string, unknown>[] = [];
    const to = setTimeout(() => reject(new Error(`snap timeout ${want}`)), 10000);
    ws.on('message', (d) => {
      try {
        const m = JSON.parse(d.toString()) as { type?: string; payload?: Record<string, unknown> };
        if (m.type === 'snapshot' && (m.payload as { t?: string })?.t === want) {
          got.push(m.payload as Record<string, unknown>);
          if (got.length >= n) { clearTimeout(to); resolve(got); }
        }
      } catch { /* partial */ }
    });
  });
}

describe('slice-1 e2e', () => {
  it('blaze-squad plays: bots, zone, snapshots ≤1.5KB', async () => {
    const ws = await join('blaze-squad');
    ws.send(JSON.stringify({ v: 1, type: 'input', room: 'SLC1', seq: 1, payload: { dx: 1, dy: 0, fire: true, aim: 0 } }));
    ws.send(JSON.stringify({ v: 1, type: 'input', room: 'SLC1', seq: 2, payload: { dx: NaN } })); // survives
    const ss = await snaps(ws, 'blaze');
    assert.ok(ss.length >= 3);
    const s = ss[ss.length - 1]! as unknown as {
      players: unknown[]; zone: { r: number }; you: { hp: number };
    };
    assert.ok(s.players.length >= 4); // solo + instant backfill
    assert.ok(s.zone.r > 0 && s.you.hp > 0);
    for (const p of ss) assert.ok(Buffer.byteLength(JSON.stringify(p)) <= 1536);
    ws.close();
  });
  it('nitro-rift plays: grid, pads, snapshots ≤1.5KB', async () => {
    const ws = await join('nitro-rift');
    ws.send(JSON.stringify({ v: 1, type: 'input', room: 'SLC1', seq: 1, payload: { dx: 1, dy: 0, fire: true } }));
    const ss = await snaps(ws, 'nitro', 6);
    // pads spawn with the heat — find a race-phase snap, not a lobby one
    const raced = ss.find((p) => (p as { phase?: string }).phase === 'race')
      ?? (await snaps(ws, 'nitro', 30)).find((p) => (p as { phase?: string }).phase === 'race');
    assert.ok(raced, 'heat starts within seconds');
    const s = raced as unknown as {
      racers: unknown[]; pads: unknown[]; you: { prog: number };
    };
    assert.ok(s.racers.length >= 4);
    assert.equal(s.pads.length, 6);
    for (const p of ss) assert.ok(Buffer.byteLength(JSON.stringify(p)) <= 1536);
    ws.close();
  });
});
