// games/ghostline/test/driver.test.ts — GH-2 acceptance: instant ghost
// table, human flick transport, tier skill gap, pacing, cleanup.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createLineDriver, planFlick } from '../driver.js';
import { createCourse, rollOut, START, MAX_SHOTS, LOBBY_COUNTDOWN_MS } from '../sim.js';
import { BOT_TAG } from '../../../packages/bots/src/index.js';

const seq = (...rs: number[]): (() => number) => {
  let i = 0;
  return () => rs[i++ % rs.length]!;
};

function table(rand?: () => number) {
  const d = createLineDriver(rand ?? seq(0.13, 0.71, 0.37, 0.91, 0.53, 0.29));
  d.join({ id: 'h', name: 'Asha', isBot: false });
  d.step(0.05);
  for (let i = 0; i < 60 && (d.snapshot('h') as { phase: string }).phase !== 'run'; i++) {
    d.step(0.05);
  }
  return d;
}

describe('ghostline driver', () => {
  it('solo human gets an instant labelled table of 8', () => {
    const d = table();
    assert.equal(d.playerCount(), 8);
    const snap = d.snapshot('h') as { leaders: { bot: boolean; n: string }[] };
    const bots = snap.leaders.filter((l) => l.bot);
    assert.equal(bots.length, 7);
    for (const b of bots) assert.ok(b.n.includes(BOT_TAG));
  });

  it('human flicks flow through `input` {angle, power}', () => {
    const d = table();
    d.accept({ kind: 'input', by: 'h', data: { angle: 0, power: 0.7 }, at: 0 });
    const snap = d.snapshot('h') as { shotsLeft: number };
    assert.equal(snap.shotsLeft, MAX_SHOTS - 1);
  });

  it('garbage input dies quietly — the run survives', () => {
    const d = table();
    for (const data of [
      null, 42, 'flick', { angle: 'north' }, { power: 1 }, {},
      { angle: NaN, power: 0.5 }, { angle: 0, power: 99 },
    ]) {
      d.accept({ kind: 'nope', by: 'h', data, at: 0 });
      d.accept({ kind: 'input', by: 'h', data, at: 0 });
    }
    const snap = d.snapshot('h') as { shotsLeft: number; phase: string };
    assert.equal(snap.shotsLeft, MAX_SHOTS);
    assert.equal(snap.phase, 'run');
  });

  it('sharp plan holes the open tee in one; casuals cap power', () => {
    const open = { seed: 0, walls: [] };
    const sharp = planFlick(open, START.x, START.y, 0, seq(0.1, 0.5, 0.9, 0.3));
    const r = rollOut(open, START, [sharp]);
    assert.equal(r.finished, true);
    const casual = planFlick(open, START.x, START.y, 1, seq(0.1, 0.5, 0.9, 0.3));
    assert.ok(casual.power <= 0.8, `casual power capped, got ${casual.power}`);
  });

  it('rigged flub returns the second-best line, not the hole', () => {
    const open = { seed: 0, walls: [] };
    // Matched streams: 6 casual jitters (0.5 = dead center) then the flub roll.
    const straight = planFlick(open, START.x, START.y, 1,
      seq(0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5));
    const flub = planFlick(open, START.x, START.y, 1,
      seq(0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.0));
    assert.deepEqual(rollOut(open, START, [straight]).finished, true);
    assert.notDeepEqual(flub, straight); // the flub flies a different line
  });

  it('bots never flick mid-roll — plans happen at rest only', () => {
    const d = table();
    d.accept({ kind: 'input', by: 'h', data: { angle: 0, power: 1 }, at: 0 });
    const before = (d.snapshot('h') as { leaders: { shots: number }[] })
      .leaders.reduce((n, l) => n + l.shots, 0);
    d.step(0.05); // puck still rolling for everyone who launched
    const after = (d.snapshot('h') as { leaders: { shots: number }[] })
      .leaders.reduce((n, l) => n + l.shots, 0);
    assert.ok(after - before <= 7, `at most one flick per bot per tick, +${after - before}`);
  });

  it('an idle human naps out instead of stalling the run', () => {
    const d = table();
    let snap = d.snapshot('h') as {
      phase: string; feed: string[];
      leaders: { n: string; shots: number; finished: boolean }[];
    };
    for (let i = 0; i < 5000 && snap.phase === 'run'; i++) {
      d.step(0.05);
      snap = d.snapshot('h') as {
        phase: string; feed: string[];
        leaders: { n: string; shots: number; finished: boolean }[];
      };
    }
    assert.equal(snap.phase, 'final'); // the room moved on
    const me = snap.leaders.find((l) => l.n === 'Asha')!;
    assert.equal(me.finished, false); // she never holed, never blocked
    assert.ok(snap.feed.join(' ').includes('👻'));
  });

  it('last human out clears the bots; seam identity holds', () => {
    const d = table();
    assert.equal(d.game, 'ghostline');
    assert.equal(d.createBot(0).name, `Wisp ${BOT_TAG}`);
    d.leave('h');
    assert.equal(d.playerCount(), 0);
    d.dispose();
  });
});
