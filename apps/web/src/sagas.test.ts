// apps/web/src/sagas.test.ts — LZ-1 acceptance: saga shape, portal honesty,
// canvas-fit beats, valid colors, sane biome pointers.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SAGAS, chaptersOf, sagaAt, MAX_BEAT, buildChapterUrl } from './sagas.js';
import { MOTIF_KEYS } from './motifs.js';
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

  it('every chapter motif has a painter — the coverage oath', () => {
    const keys = new Set(MOTIF_KEYS);
    for (const s of SAGAS) {
      for (const c of s.chapters) {
        assert.ok(c.motif && keys.has(c.motif), `${s.id}/${c.name}: motif '${c.motif}' unpainted`);
      }
    }
  });

  it('each saga ends on a real cliffhanger (title + teaser)', () => {
    for (const s of SAGAS) {
      assert.ok(s.finale.title.length > 10, `${s.id} finale title`);
      assert.ok(s.finale.teaser.length > 40, `${s.id} finale teaser`);
      assert.ok(/season 2/i.test(s.finale.teaser), 'finale promises the return hook');
    }
    assert.notEqual(SAGAS[0]!.finale.title, SAGAS[1]!.finale.title);
  });

  it('chapter deep-links roundtrip saga + chapter, clamp garbage', () => {
    const u = buildChapterUrl('https://play.example/', 1, 5);
    assert.ok(u.includes('saga=1') && u.includes('ch=5'));
    const q = new URL(u).searchParams;
    assert.equal(sagaAt(Number(q.get('saga'))).id, SAGAS[1]!.id);
    assert.ok(buildChapterUrl('https://x/', 99, 99).includes('saga=0'));
    assert.ok(buildChapterUrl('https://x/', 0, -3).includes('ch=0'));
  });

  it('ART-3 anti-slop oaths: accents unique, skies breathe, accent stands apart', () => {
    const lum = (h: string): number => {
      const n = (a: number, b: number): number => parseInt(h.slice(a, b), 16) / 255;
      return 0.299 * n(1, 3) + 0.587 * n(3, 5) + 0.114 * n(5, 7);
    };
    const spread = (xs: number[]): number => Math.max(...xs) - Math.min(...xs);
    for (const s of SAGAS) {
      const accents = s.chapters.map((c) => c.accent.toLowerCase());
      assert.equal(new Set(accents).size, 6, `${s.id}: two chapters share an accent`);
      // The eye lives in sky0 and dives into sky1 — BOTH must breathe.
      assert.ok(spread(s.chapters.map((c) => lum(c.sky0))) >= 0.12, `${s.id}: sky0 flat`);
      assert.ok(spread(s.chapters.map((c) => lum(c.sky1))) >= 0.15, `${s.id}: sky1 flat`);
      for (const c of s.chapters) {
        // Silhouette logic: the accent reads against its own sky, always.
        const gap = Math.abs(lum(c.accent) - lum(c.sky1));
        assert.ok(gap >= 0.08, `${c.name}: accent drowns in its sky (gap ${gap.toFixed(3)})`);
        assert.ok(/^#[0-9a-f]{6}$/i.test(c.sky0) && /^#[0-9a-f]{6}$/i.test(c.sky1), `${c.name}: hex`);
      }
    }
  });
});
