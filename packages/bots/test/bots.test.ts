import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { wantedBots, reactionDelayMs, aimErrorRad, tag } from '../src/index.js';

describe('bots', () => {
  it('backfill formula fills solo, drains crowds', () => {
    assert.equal(wantedBots(0), 7);
    assert.equal(wantedBots(1), 7);
    assert.equal(wantedBots(5), 5);
    assert.equal(wantedBots(10), 3);
    assert.equal(wantedBots(14), 0);
    assert.equal(wantedBots(30), 0);
  });
  it('reaction tiers are ordered human-plausible windows', () => {
    const fast = reactionDelayMs(0, () => 0.999);
    const slow = reactionDelayMs(2, () => 0);
    assert.ok(fast < slow, `${fast} < ${slow}`);
    assert.ok(reactionDelayMs(1, () => 0.5) > 300 && reactionDelayMs(1, () => 0.5) < 750);
  });
  it('aim error is bounded and roughly centered', () => {
    let sum = 0;
    for (let i = 0; i < 200; i++) {
      const e = aimErrorRad();
      assert.ok(Math.abs(e) <= 0.18, `${e}`);
      sum += e;
    }
    assert.ok(Math.abs(sum / 200) < 0.05);
  });
  it('labels bots exactly once', () => {
    assert.equal(tag('Blip'), 'Blip 🤖');
    assert.equal(tag('Blip 🤖'), 'Blip 🤖');
  });
});
