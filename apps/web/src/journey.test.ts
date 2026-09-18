// apps/web/src/journey.test.ts — DDV-2 acceptance: seals earn, persist
// shape, clamp garbage, never regress (max chapter wins).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CHAPTERS, recordVisit, sealsOf, sealedCount, loadSeals } from './journey.js';

describe('journey seals', () => {
  it('six seals, none earned at first', () => {
    assert.equal(CHAPTERS, 6);
    assert.deepEqual(sealsOf({}, 0), [false, false, false, false, false, false]);
    assert.equal(sealedCount({}, 0), 0);
  });

  it('facing a chapter seals everything up to it', () => {
    const s = recordVisit({}, 0, 2);
    assert.deepEqual(sealsOf(s, 0), [true, true, true, false, false, false]);
    assert.equal(sealedCount(s, 0), 3);
  });

  it('seals never regress and never leak across sagas', () => {
    let s = recordVisit({}, 0, 4);
    s = recordVisit(s, 0, 1);
    assert.equal(sealedCount(s, 0), 5);
    assert.equal(sealedCount(s, 1), 0);
    s = recordVisit(s, 1, 5);
    assert.equal(sealedCount(s, 1), 6);
    assert.equal(sealedCount(s, 0), 5);
  });

  it('garbage chapters and sagas die quietly', () => {
    const before = recordVisit({}, 0, 3);
    for (const bad of [-1, 6, 99, 1.5, NaN]) {
      assert.deepEqual(recordVisit(before, 0, bad), before);
    }
    assert.deepEqual(recordVisit(before, -1, 2), before);
  });

  it('storage parses honestly — garbage in, empty row out', () => {
    assert.deepEqual(loadSeals(null), {});
    assert.deepEqual(loadSeals('{{{nope'), {});
    assert.deepEqual(loadSeals('[1,2]'), {});
    assert.deepEqual(loadSeals('{"saga0":5,"saga1":99,"x":2,"saga2":-1}'), { saga0: 5 });
  });
});
