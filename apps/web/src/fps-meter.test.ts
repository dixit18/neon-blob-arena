// apps/web/src/fps-meter.test.ts — core math only (no DOM/rAF touched).
// Run: npx tsx --test apps/web/src/fps-meter.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFpsTracker } from './fps-meter.js';

describe('fps tracker', () => {
  it('60fps steady reads 60, p95 ≈16.7', () => {
    const t = createFpsTracker(90);
    for (let i = 0; i < 90; i++) t.push(16.7);
    const s = t.snapshot();
    assert.equal(s.fps, 60);
    assert.ok(Math.abs(s.p95 - 16.7) < 0.01, `p95=${s.p95}`);
    assert.equal(s.frames, 90);
  });

  it('p95 ignores the lucky frames, reports the slow tail', () => {
    const t = createFpsTracker(100);
    for (let i = 0; i < 95; i++) t.push(10);
    for (let i = 0; i < 5; i++) t.push(50);
    const s = t.snapshot();
    assert.equal(s.p95, 50);
    assert.ok(s.fps > 60 && s.fps < 100, `fps=${s.fps}`);
  });

  it('drops gaps (hidden-tab pauses) and garbage, empty reads 0', () => {
    const t = createFpsTracker(90);
    const empty = t.snapshot();
    assert.equal(empty.fps, 0);
    t.push(16.7);
    t.push(5000); // tab was hidden — not a frame
    t.push(NaN);
    t.push(-3);
    const s = t.snapshot();
    assert.equal(s.frames, 1);
    assert.equal(s.fps, 60);
  });

  it('30fps content reads 30 (lag is visible, not hidden)', () => {
    const t = createFpsTracker(90);
    for (let i = 0; i < 60; i++) t.push(33.3);
    assert.equal(t.snapshot().fps, 30);
  });
});
