// apps/server/test/report.test.ts — GB-5: the safety path posts, validates,
// and rate-limits. Blocks release if red.
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

const good = {
  game: 'ludo-clash', room: 'ABCD', reporter: 'Asha', reported: 'Rogue', reason: 'griefing',
};

async function post(body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const r = await fetch(`${base}/report`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, json: (await r.json()) as Record<string, unknown> };
}

describe('player report path', () => {
  it('valid reports land with 201', async () => {
    const r = await post(good);
    assert.equal(r.status, 201);
    assert.equal(r.json.ok, true);
  });

  it('bad shapes die with 400 — unknown game, room, reason, empties', async () => {
    for (const bad of [
      { ...good, game: 'portal-rush' },
      { ...good, game: 'x' },
      { ...good, room: 'nope!' },
      { ...good, room: 'ABC' },
      { ...good, reason: 'rude' },
      { ...good, reporter: '' },
      { ...good, reported: '' },
      { game: 'ludo-clash' },
      'just a string',
    ]) {
      const r = await post(bad);
      assert.equal(r.status, 400, `accepted garbage: ${JSON.stringify(bad)}`);
    }
  });

  it('spam throttles with 429, then the window is the only gate', async () => {
    // 10/min per IP; earlier tests in this file already spent a few.
    let throttled = false;
    for (let i = 0; i < 12; i++) {
      const r = await post({ ...good, reporter: `Pacer${i}` });
      if (r.status === 429) { throttled = true; break; }
      assert.equal(r.status, 201);
    }
    assert.ok(throttled, 'flood never throttled');
  });
});
