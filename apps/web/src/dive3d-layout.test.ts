// apps/web/src/dive3d-layout.test.ts — pure dive math. Run:
// npx tsx --test apps/web/src/dive3d-layout.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldUse3D, layoutLap, splitDepth, facedWorld, heartFrac, tunnelLength,
  LAP_LEN, WORLD_GAP,
} from './dive3d-layout.js';
import { WORLDS } from './descent.js';

describe('dive3d layout', () => {
  it('3D only when it can stun: webgl, motion ok, not a 2GB phone', () => {
    assert.equal(shouldUse3D({ webgl: true, ramGB: 8, reducedMotion: false }), true);
    assert.equal(shouldUse3D({ webgl: false, ramGB: 8, reducedMotion: false }), false);
    assert.equal(shouldUse3D({ webgl: true, ramGB: 8, reducedMotion: true }), false);
    assert.equal(shouldUse3D({ webgl: true, ramGB: 2, reducedMotion: false }), false);
    assert.equal(shouldUse3D({ webgl: true, ramGB: null, reducedMotion: false }), true); // unknown RAM: trust, fallback catches
  });
  it('laps lay six hearts along -Z with alternating sway', () => {
    const lap = layoutLap(WORLDS, 0);
    assert.equal(lap.length, 6);
    lap.forEach((p, i) => {
      assert.equal(p.index, i);
      assert.equal(p.z, -i * WORLD_GAP);
      assert.ok(Math.abs(p.x) >= 10 && Math.abs(p.x) <= 18);
      if (i > 0) assert.ok(Math.sign(p.x) !== Math.sign(lap[i - 1]!.x));
    });
  });
  it('layout is deterministic per lap, distinct across laps', () => {
    assert.deepEqual(layoutLap(WORLDS, 3), layoutLap(WORLDS, 3));
    assert.notDeepEqual(layoutLap(WORLDS, 0), layoutLap(WORLDS, 1));
  });
  it('depth splits into lap + local, endless', () => {
    assert.deepEqual(splitDepth(0), { lap: 0, local: 0 });
    assert.deepEqual(splitDepth(7.5), { lap: 1, local: 1.5 });
    assert.deepEqual(splitDepth(12), { lap: 2, local: 0 });
  });
  it('faced world tracks the camera heart', () => {
    assert.equal(facedWorld(0), 0);
    assert.equal(facedWorld(2.7), 2);
    assert.equal(facedWorld(5.99), 5);
    assert.equal(facedWorld(6), 0); // wraps
  });
  it('heart frac is 0..1 toward the next heart', () => {
    assert.equal(heartFrac(2), 0);
    assert.ok(heartFrac(2.5) === 0.5);
    assert.ok(heartFrac(0) >= 0 && heartFrac(0) < 1);
  });
  it('tunnel covers a full lap', () => {
    assert.equal(tunnelLength(), LAP_LEN * WORLD_GAP);
  });
});
