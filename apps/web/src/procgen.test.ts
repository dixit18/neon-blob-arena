// apps/web/src/procgen.test.ts — LZ-2 core acceptance: determinism (the saga
// oath: same seed → same bytes), bounded ranges, known expansions.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  hashSeed, hash2, makeNoise2D, fbm, warpedBands, voronoi, lsystem, SIMPLEX_GLSL,
} from './procgen.js';

describe('procgen', () => {
  it('hashSeed is stable and spreads', () => {
    assert.equal(hashSeed('RIFT-AB12'), hashSeed('RIFT-AB12'));
    assert.notEqual(hashSeed('RIFT-AB12'), hashSeed('RIFT-AB13'));
    assert.notEqual(hashSeed('ash dunes'), hashSeed('reef lanes'));
  });

  it('hash2 stays in [0,1) and varies by cell', () => {
    const seen = new Set<number>();
    for (let x = 0; x < 8; x++) {
      for (let y = 0; y < 8; y++) {
        const v = hash2(x, y, 7);
        assert.ok(v >= 0 && v < 1);
        seen.add(Math.floor(v * 64));
      }
    }
    assert.ok(seen.size > 32, 'cells must vary');
  });

  it('noise is deterministic and bounded', () => {
    const a = makeNoise2D(1234);
    const b = makeNoise2D(1234);
    assert.equal(a(3.7, 9.1), b(3.7, 9.1));
    assert.notEqual(makeNoise2D(1234)(0.5, 0.5), makeNoise2D(999)(0.5, 0.5));
    let lo = 0;
    let hi = 0;
    for (let i = 0; i < 2000; i++) {
      const v = a(i * 0.37, i * 0.73);
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    assert.ok(lo >= -1.05 && hi <= 1.05, `noise out of band [${lo}, ${hi}]`);
    assert.ok(hi - lo > 1.2, 'noise must actually vary');
  });

  it('fbm + warped bands stay bounded and deterministic', () => {
    const n = makeNoise2D(77);
    assert.equal(fbm(n, 1.2, 3.4), fbm(n, 1.2, 3.4));
    for (let i = 0; i < 500; i++) {
      const v = fbm(n, i * 0.11, i * 0.29, 4);
      assert.ok(v >= -1.05 && v <= 1.05);
      const w = warpedBands(n, i * 0.13, i * 0.31);
      assert.ok(w >= -1.05 && w <= 1.05);
    }
  });

  it('voronoi edges are thin lines between cells', () => {
    const v = voronoi(4.2, 7.8, 5);
    assert.ok(v.f1 >= 0 && v.f2 >= v.f1);
    assert.ok(v.edge >= 0);
    // sweep finds both interiors (edge large) and borders (edge ~0)
    let minEdge = 9;
    let maxEdge = 0;
    for (let i = 0; i < 400; i++) {
      const e = voronoi(i * 0.21, i * 0.13, 5).edge;
      minEdge = Math.min(minEdge, e);
      maxEdge = Math.max(maxEdge, e);
    }
    assert.ok(minEdge < 0.05, 'borders exist');
    assert.ok(maxEdge > 0.3, 'interiors exist');
  });

  it('lsystem expands known rules, guards runaways', () => {
    const s = lsystem('F', { F: 'F[+F]F' }, 2);
    assert.equal(s, 'F[+F]F[+F[+F]F]F[+F]F');
    const big = lsystem('F', { F: 'FFFFFFFFFF' }, 9);
    assert.ok(big.length <= 4096, 'runaway capped');
  });

  it('GLSL simplex ships with the snoise entry point', () => {
    assert.ok(SIMPLEX_GLSL.includes('float snoise_(vec2 v)'));
    assert.ok(SIMPLEX_GLSL.length < 2048, 'shader snippet stays small');
  });
});
