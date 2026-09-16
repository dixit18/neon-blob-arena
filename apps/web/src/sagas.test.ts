// apps/web/src/sagas.test.ts — LZ-1 acceptance: saga shape, portal honesty,
// canvas-fit beats, valid colors, sane biome pointers.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SAGAS, chaptersOf, sagaAt, MAX_BEAT } from './sagas.js';
import { GAMES } from '../../../packages/catalog/src/index.js';

const HEX = /^#[0-9a-fA-F]{6}$/;
const GAMES_IDS = new Set(GAMES.map((g) => g.id));

describe('sagas', () => {
  it('two sagas, six chapters each', () => {
    assert.equal(SAGAS.length, 2);
    for (const s of SAGAS) assert.equal(s.chapters.length, 6);
  });

  it('every chapter portals to a real catalog game', () => {
    for (const s of SAGAS) {
      for (const c of s.chapters) {
        assert.ok(GAMES_IDS.has(c.game), `${s.id}/${c.name} portals nowhere`);
      }
    }
  });

  it('each saga touches all six live games exactly once', () => {
    const live = ['reflex-riot', 'doodle-duel', 'blaze-squad', 'nitro-rift', 'ludo-clash', 'read-the-room'];
    for (const s of SAGAS) {
      const got = [...s.chapters.map((c) => c.game)].sort();
      assert.deepEqual(got, [...live].sort());
    }
  });

  it('beats fit one canvas line, titles non-empty', () => {
    for (const s of SAGAS) {
      assert.ok(s.name.length > 0 && s.sub.length > 0);
      for (const c of s.chapters) {
        assert.ok(c.name.length > 0);
        assert.ok(c.sub.length > 0 && c.sub.length <= MAX_BEAT, `beat too long: ${c.sub}`);
        assert.ok(!c.sub.includes('\n'), 'beats stay one line');
      }
    }
  });

  it('colors are valid hex, biomes point at real builders', () => {
    for (const s of SAGAS) {
      for (const c of s.chapters) {
        assert.ok(HEX.test(c.sky0) && HEX.test(c.sky1) && HEX.test(c.accent));
        assert.ok(Number.isInteger(c.biome) && c.biome >= 0 && c.biome <= 5);
        assert.ok(c.motif.length > 0);
      }
    }
  });

  it('sagaAt clamps garbage — bad ?saga= never breaks landing', () => {
    assert.equal(sagaAt(-1).id, SAGAS[0]!.id);
    assert.equal(sagaAt(99).id, SAGAS[0]!.id);
    assert.equal(sagaAt(1).id, SAGAS[1]!.id);
    assert.equal(chaptersOf(7).length, 6);
  });

  it('saga ids are unique, chapter titles unique per saga', () => {
    assert.equal(new Set(SAGAS.map((s) => s.id)).size, 2);
    for (const s of SAGAS) {
      assert.equal(new Set(s.chapters.map((c) => c.name)).size, 6);
    }
  });
});
