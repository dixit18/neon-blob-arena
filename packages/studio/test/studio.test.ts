import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EMPLOYEES, CHANNELS, StudioFeed, seedFeed } from '../src/index.js';

describe('studio', () => {
  it('rosters every ORG employee plus channels, no duplicates', () => {
    assert.ok(EMPLOYEES.length >= 10);
    assert.equal(new Set(EMPLOYEES.map((e) => e.id)).size, EMPLOYEES.length);
    for (const e of EMPLOYEES) {
      assert.ok(e.name.length > 2);
      assert.ok(e.role.length > 2);
      assert.ok(CHANNELS.some((c) => c.id === e.channel), e.id);
    }
  });
  it('seed never leaves an empty screen', () => {
    const f = new StudioFeed();
    seedFeed(f, 1000);
    assert.ok(f.count() >= 3);
    const again = f.count();
    seedFeed(f, 1001); // idempotent: never doubles the seed
    assert.equal(f.count(), again);
  });
  it('posts + filters per employee thread and channel', () => {
    const f = new StudioFeed();
    f.post('zara', 'build', 'thought', 'blaze sim first, then driver', 10);
    f.post('kabir', 'redteam', 'reply', 'prove the zone reads in 1s', 11);
    f.post('boss', 'build', 'reply', 'ship it with bounds', 12);
    assert.equal(f.list({ by: 'zara' }).length, 1);
    assert.equal(f.list({ channel: 'redteam' }).length, 1);
    assert.equal(f.list({}).length, 3);
    assert.ok(f.lastSeenBy('zara') === 10);
  });
  it('rejects unknown authors, channels, empties — and caps text + length', () => {
    const f = new StudioFeed();
    assert.throws(() => f.post('mallory', 'build', 'thought', 'hi'));
    assert.throws(() => f.post('zara', 'void' as never, 'thought', 'hi'));
    assert.throws(() => f.post('zara', 'build', 'thought', '   '));
    const long = f.post('leo', 'build', 'receipt', 'x'.repeat(900));
    assert.ok(long.text.length <= 500);
    for (let i = 0; i < 250; i++) f.post('kai', 'build', 'receipt', `ship ${i}`, i);
    assert.ok(f.count() <= 200);
    assert.equal(f.list({ limit: 500 }).length, 200);
  });
});
