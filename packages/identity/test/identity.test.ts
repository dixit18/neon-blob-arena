import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { genGuestId, genName, filterName } from '../src/index.js';

describe('identity', () => {
  it('guest IDs are unique opaques', () => {
    const ids = new Set([genGuestId(), genGuestId(), genGuestId()]);
    assert.equal(ids.size, 3);
  });
  it('generated names are two safe words', () => {
    for (let i = 0; i < 50; i++) {
      const n = genName();
      assert.match(n, /^[A-Za-z]+ [A-Za-z]+$/);
    }
  });
  it('deterministic with injected rng', () => {
    assert.equal(genName(() => 0), 'Neon Otter');
  });
  it('filters custom names', () => {
    assert.equal(filterName('Rohan_99'), 'Rohan_99');
    assert.equal(filterName('  '), 'Blob');
    assert.equal(filterName(42 as unknown as string), 'Blob');
    assert.equal(filterName('a'.repeat(40)).length, 14);
    assert.equal(filterName('Admin Boss'), 'Blob');
    assert.equal(filterName('<script>alert'), 'scriptalert');
  });
});
