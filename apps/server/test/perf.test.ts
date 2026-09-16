// apps/server/test/perf.test.ts — /perf ingest: valid beacons aggregate,
// garbage is rejected, GET serves per-game averages + browser/mode splits.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

const app = createApp({ region: 'test' });
let base = '';

before(async () => {
  await new Promise<void>((res) => app.server.listen(0, '127.0.0.1', () => res()));
  const addr = app.server.address();
  assert.ok(addr && typeof addr === 'object');
  base = `http://127.0.0.1:${(addr as { port: number }).port}`;
});
after(() => { app.shutdown(); });

async function post(sample: unknown): Promise<{ status: number; body: string }> {
  const r = await fetch(`${base}/perf`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sample),
  });
  return { status: r.status, body: await r.text() };
}

describe('/perf', () => {
  it('accepts samples and GET aggregates per game', async () => {
    assert.equal((await post({ game: 'nitro-rift', fps: 60, p95: 8.1, mode: '2d', caps: { fam: 'edge' } })).status, 201);
    assert.equal((await post({ game: 'nitro-rift', fps: 58, p95: 9.3, mode: '3d-threepipe', caps: { fam: 'chrome' } })).status, 201);
    assert.equal((await post({ game: 'blaze-squad', fps: 45, p95: 22.5, mode: '2d', caps: { fam: 'firefox' } })).status, 201);
    const r = await fetch(`${base}/perf`);
    assert.equal(r.status, 200);
    const agg = await r.json() as Record<string, { samples: number; avgFps: number; avgP95: number; modes: Record<string, number>; browsers: Record<string, number> }>;
    assert.equal(agg['nitro-rift']!.samples, 2);
    assert.equal(agg['nitro-rift']!.avgFps, 59);
    assert.equal(agg['nitro-rift']!.modes['2d'], 1);
    assert.equal(agg['nitro-rift']!.modes['3d-threepipe'], 1);
    assert.equal(agg['nitro-rift']!.browsers['edge'], 1);
    assert.equal(agg['blaze-squad']!.samples, 1);
    assert.equal(agg['blaze-squad']!.avgFps, 45);
    assert.equal(agg['blaze-squad']!.browsers['firefox'], 1);
  });

  it('rejects garbage without storing', async () => {
    for (const bad of [
      {},
      { game: 'nitro-rift' },
      { game: 'nitro-rift', fps: 'fast', p95: 8 },
      { game: 'nitro-rift', fps: NaN, p95: 8 },
      { game: '../../etc', fps: 60, p95: 8 },
      { game: 'x'.repeat(40), fps: 60, p95: 8 },
    ]) {
      assert.equal((await post(bad)).status, 400);
    }
    const agg = await (await fetch(`${base}/perf`)).json() as Record<string, { samples: number }>;
    assert.equal(agg['nitro-rift']!.samples, 2); // unchanged
  });
});
