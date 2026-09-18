// apps/web/src/dive3d-layout.test.ts — pure dive math. Run:
// npx tsx --test apps/web/src/dive3d-layout.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldUse3D, layoutLap, splitDepth, facedWorld, heartFrac, tunnelLength,
  LAP_LEN, WORLD_GAP, layoutShards, stepShard, SHARD_COUNT, SHARD_COLORS,
  smoothApproach, portalHit, steerTarget, lapShift, shardLapRot, ringLapRot,
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
  it('shard spiral: dense, bounded, deterministic, wraps past camera', () => {
    const a = layoutShards(SHARD_COUNT, 7);
    assert.equal(a.length, SHARD_COUNT);
    assert.deepEqual(a, layoutShards(SHARD_COUNT, 7));
    assert.notDeepEqual(a, layoutShards(SHARD_COUNT, 8));
    const span = tunnelLength();
    for (const s of a) {
      assert.ok(s.radius >= 14 && s.radius <= 30, `r=${s.radius}`);
      assert.ok(s.z <= 0 && s.z >= -span, `z=${s.z}`);
      assert.ok(s.color >= 0 && s.color < SHARD_COLORS.length);
      assert.ok(s.flow > 0 && s.spin > 0);
    }
    const s = { angle: 0, radius: 20, z: 0, spin: 0.2, flow: 20, color: 0, size: 1 };
    stepShard(s, 1, 100, span);
    assert.equal(s.z, 20); // flow toward camera, no wrap yet
    assert.ok(Math.abs(s.angle - 0.2) < 1e-9);
    s.z = 150; // past camera + margin → wraps a full span down-lap
    stepShard(s, 0, 100, span);
    assert.equal(s.z, 150 - span);
  });
  it('steering: smooth approach converges, portal hit is a disc test', () => {    let c = 0;
    for (let i = 0; i < 120; i++) c = smoothApproach(c, 24, 1 / 60, 3);
    assert.ok(Math.abs(c - 24) < 1, `c=${c}`);
    assert.equal(smoothApproach(5, 5, 1 / 60, 3), 5);
    assert.equal(portalHit(0, 0, 0, 0, 9), true);
    assert.equal(portalHit(9.1, 0, 0, 0, 9), false);
    assert.equal(portalHit(6, 6, 0, 0, 9), true); // 8.49 < 9
    const t = steerTarget(1, -1);
    assert.deepEqual(t, { x: 24, y: 14 });
    const mid = steerTarget(0, 0);
    assert.deepEqual(mid, { x: 0, y: 2 });
  });
  it('DDV-1: lap 0 is the identity — today’s look, untouched', () => {
    assert.deepEqual(lapShift(0), { hue: 0, light: 0 });
    assert.equal(shardLapRot(0), 0);
    assert.equal(ringLapRot(0, 4), 0);
  });
  it('DDV-1: deeper laps shift — subtle, bounded, deterministic', () => {
    for (let lap = 1; lap <= 12; lap++) {
      const s = lapShift(lap);
      assert.deepEqual(lapShift(lap), s);
      assert.ok(Math.abs(s.hue) <= 0.07 && Math.abs(s.light) <= 0.035, `lap ${lap} garish`);
      assert.ok(shardLapRot(lap) !== 0, `lap ${lap} shards repeat lap 0`);
    }
    const hues = new Set(Array.from({ length: 12 }, (_, i) => lapShift(i + 1).hue.toFixed(4)));
    assert.ok(hues.size >= 6, 'laps must vary, not alternate');
  });
  it('DDV-1: rotations are pure index math — chapters keep their order', () => {
    assert.equal(shardLapRot(1, SHARD_COLORS.length), 3);
    assert.equal(ringLapRot(1, 4), 2);
    assert.equal(shardLapRot(0, 0), 0); // degenerate guard
    assert.equal(ringLapRot(5, 0), 0);
  });
});
