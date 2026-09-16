// apps/server/test/studio.test.ts — hidden owner studio endpoints.
// Proves: roster serves, feed filters, Boss posts land, garbage 400s,
// players never see it (noindex, unlinked from /catalog).
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
after(() => app.shutdown());

describe('studio endpoints', () => {
  it('serves the roster + seed, always noindex', async () => {
    const r = await fetch(`${base}/studio/employees`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('x-robots-tag') ?? '', /noindex/);
    const j = (await r.json()) as { employees: { id: string }[]; channels: unknown[]; feed: unknown[] };
    assert.ok(j.employees.length >= 10);
    assert.ok(j.employees.some((e) => e.id === 'zara'));
    assert.ok(j.channels.length === 4);
    assert.ok(j.feed.length >= 3); // never an empty screen
  });
  it('Boss posts land and filter per channel', async () => {
    const post = await fetch(`${base}/studio/thought`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ by: 'boss', channel: 'build', kind: 'reply', text: 'slice 1, keep it small' }),
    });
    assert.equal(post.status, 201);
    const feed = (await (await fetch(`${base}/studio/feed?channel=build&limit=5`)).json()) as { text: string }[];
    assert.ok(feed.some((t) => t.text.includes('slice 1')));
    const red = (await (await fetch(`${base}/studio/feed?channel=redteam&limit=50`)).json()) as { text: string }[];
    assert.ok(!red.some((t) => t.text.includes('slice 1')));
  });
  it('rejects garbage thoughts with 400, never throws', async () => {
    for (const body of [
      { by: 'mallory', channel: 'build', text: 'hi' },
      { by: 'zara', channel: 'void', text: 'hi' },
      { by: 'zara', channel: 'build', text: '   ' },
    ]) {
      const r = await fetch(`${base}/studio/thought`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      assert.equal(r.status, 400);
    }
  });
  it('catalog lists both slice-1 games with unique verbs', async () => {
    const cat = (await (await fetch(`${base}/catalog`)).json()) as { id: string; verb: string }[];
    assert.ok(cat.some((g) => g.id === 'blaze-squad'));
    assert.ok(cat.some((g) => g.id === 'nitro-rift'));
    assert.equal(new Set(cat.map((g) => g.verb)).size, cat.length);
  });
  it('ST-2: STUDIO_KEY gates every studio route; loopback stays free without it', async () => {
    process.env.STUDIO_KEY = 'slice-two';
    try {
      for (const path of ['/studio/employees', '/studio/feed?channel=build']) {
        assert.equal((await fetch(`${base}${path}`)).status, 403);
      }
      const denied = await fetch(`${base}/studio/thought`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ by: 'boss', channel: 'build', text: 'nope' }),
      });
      assert.equal(denied.status, 403);
      const ok = await fetch(`${base}/studio/thought`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-studio-key': 'slice-two' },
        body: JSON.stringify({ by: 'boss', channel: 'build', kind: 'reply', text: 'key works' }),
      });
      assert.equal(ok.status, 201);
      assert.equal((await fetch(`${base}/studio/feed?channel=build&key=slice-two`)).status, 200);
      assert.equal((await fetch(`${base}/studio/employees?key=slice-two`)).status, 200);
    } finally {
      delete process.env.STUDIO_KEY;
    }
    assert.equal((await fetch(`${base}/studio/employees`)).status, 200); // loopback free again
  });
  it('ST-2: POST flood trips 429, never throws', async () => {
    const statuses = new Set<number>();
    for (let i = 0; i < 30; i++) {
      const r = await fetch(`${base}/studio/thought`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ by: 'kai', channel: 'build', kind: 'receipt', text: `flood ${i}` }),
      });
      statuses.add(r.status);
      await r.text();
    }
    assert.ok(statuses.has(429), '30/min cap trips');
  });
});
