// games/ghostline/test/sim.test.ts — GH-1 acceptance: flick physics,
// validation, course determinism, goal/exhaustion, ranking, leaving,
// snapshots, replay roundtrip, 100-seed bit-identical reproduce.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  LineSim, createCourse, simulate, runReplay, MAX_SHOTS, MIN_START,
  LOBBY_COUNTDOWN_MS, FINAL_MS, START, GOAL, REST_EPS, FIELD_W,
  type Course,
} from '../sim.js';
import { assertArtifact } from '../../../packages/share/src/index.js';

const OPEN: Course = { seed: 0, walls: [] };

function solo(seed = 7): LineSim {
  const s = new LineSim(Math.random, seed);
  s.join('a', 'Asha', false);
  s.step(LOBBY_COUNTDOWN_MS);
  return s;
}

/** A (seed, power) whose straight flick holes out in one. Self-found. */
function aceSeed(): { seed: number; power: number } {
  for (let seed = 1; seed <= 600; seed++) {
    for (const power of [0.55, 0.62, 0.7, 0.8, 0.9, 1.0]) {
      const r = simulate(createCourse(seed), [{ angle: 0, power }]);
      if (r.finished && r.shots === 1) return { seed, power };
    }
  }
  throw new Error('no ace seed in 1..600');
}

function stepRest(s: LineSim, id = 'a'): void {
  for (let i = 0; i < 400 && Math.hypot(
    s.players.get(id)!.vx, s.players.get(id)!.vy,
  ) >= REST_EPS; i++) s.step(50);
}

describe('ghostline sim', () => {
  it('empty room idles in lobby; solo seat starts the run', () => {
    const s = new LineSim(Math.random, 7);
    s.step(LOBBY_COUNTDOWN_MS * 3);
    assert.equal(s.phase, 'lobby');
    assert.equal(MIN_START, 1);
    s.join('a', 'Asha', false);
    s.step(LOBBY_COUNTDOWN_MS);
    assert.equal(s.phase, 'run');
  });

  it('every seat shares one seeded course', () => {
    const s = solo();
    s.join('b', 'Bheem', false);
    assert.ok(s.course.walls.length > 0);
    assert.equal(s.snapshot('a').seed, s.snapshot('b').seed);
    assert.deepEqual(s.snapshot('a').walls, s.snapshot('b').walls);
  });

  it('a legal flick launches the puck and spends a shot', () => {
    const s = solo();
    assert.equal(s.flick('a', 0, 1), true);
    const p = s.players.get('a')!;
    assert.ok(Math.hypot(p.vx, p.vy) > 100);
    assert.equal(p.shots, 1);
    assert.equal(s.snapshot('a').shotsLeft, MAX_SHOTS - 1);
  });

  it('mid-roll flicks die — one launch at a time', () => {
    const s = solo();
    assert.equal(s.flick('a', 0, 1), true);
    assert.equal(s.flick('a', 0, 1), false);
    assert.equal(s.players.get('a')!.shots, 1);
  });

  it('bad angle/power dies without spending a shot', () => {
    const s = solo();
    for (const [a, pw] of [[NaN, 0.5], [0, 0], [0, -1], [0, 1.5], [0, NaN]] as const) {
      assert.equal(s.flick('a', a, pw), false);
    }
    assert.equal(s.players.get('a')!.shots, 0);
    assert.equal(s.flick('zzz', 0, 0.5), false); // strangers can't flick
  });

  it('friction sleeps the puck so the next flick is legal', () => {
    const s = solo();
    s.flick('a', 0, 0.2);
    stepRest(s);
    assert.equal(s.snapshot('a').atRest, true);
    assert.equal(s.flick('a', 0, 0.2), true);
  });

  it('walls bounce — vx reverses off a vertical bar', () => {
    const wall: Course = { seed: 0, walls: [{ x: 200, y: 0, w: 12, h: 320 }] };
    const r = simulate(wall, [{ angle: 0, power: 1 }]);
    assert.ok(r.x < 200, `puck stays left of the wall, got x=${r.x}`);
    assert.equal(r.finished, false); // the wall ate the ace
  });

  it('goal capture finishes the run on an open course', () => {
    const r = simulate(OPEN, [{ angle: 0, power: 0.62 }]);
    assert.equal(r.finished, true);
    assert.equal(r.shots, 1);
    assert.ok(Math.hypot(r.x - GOAL.x, r.y - GOAL.y) < GOAL.r);
  });

  it('8 spent shots without a hole means exhausted, and no ninth flick', () => {
    const s = solo();
    for (let i = 0; i < MAX_SHOTS; i++) {
      assert.equal(s.flick('a', Math.PI, 0.1), true); // backwards dribbles
      stepRest(s);
    }
    const p = s.players.get('a')!;
    assert.equal(p.shots, MAX_SHOTS);
    assert.equal(p.finished, false);
    assert.equal(p.exhausted, true);
    assert.equal(s.flick('a', 0, 0.5), false);
  });

  it('run ends when every line is done; fewest shots takes the ghost', () => {
    const ace = aceSeed();
    const s = new LineSim(Math.random, ace.seed);
    s.join('a', 'Asha', false);
    s.join('b', 'Bheem', false);
    s.step(LOBBY_COUNTDOWN_MS);
    assert.equal(s.phase, 'run');
    s.flick('a', 0, ace.power); // aces the seeded course
    for (let i = 0; i < MAX_SHOTS; i++) {
      s.flick('b', Math.PI, 0.1);
      stepRest(s, 'b');
      stepRest(s, 'a');
    }
    for (let i = 0; i < 200 && (s.phase as string) !== 'final'; i++) s.step(50);
    assert.equal(s.phase, 'final');
    const lead = s.snapshot('a').leaders;
    assert.equal(lead[0]!.n, 'Asha');
    assert.equal(lead[0]!.finished, true);
    assert.ok(s.feed.join(' ').includes('Asha'));
  });

  it('leavers are dropped; empty room resets to lobby', () => {
    const s = solo();
    s.join('b', 'Bheem', false);
    s.leave('b');
    assert.equal(s.playerCount(), 1);
    s.leave('a');
    assert.equal(s.phase, 'lobby');
    assert.equal(s.playerCount(), 0);
  });

  it('late joiners get the live seed with a fresh puck', () => {
    const s = solo();
    s.flick('a', 0, 0.5);
    s.join('b', 'Bheem', false);
    assert.equal(s.snapshot('b').seed, s.snapshot('a').seed);
    assert.equal(s.players.get('b')!.shots, 0);
  });

  it('100 fixed seeds reproduce bit-identically (the ghost contract)', () => {
    const flicks = [
      { angle: 0.3, power: 0.9 },
      { angle: -1.2, power: 0.4 },
      { angle: 2.6, power: 0.7 },
    ];
    for (let seed = 1; seed <= 100; seed++) {
      const a = runReplay({ seed, flicks });
      const b = runReplay({ seed, flicks });
      assert.deepEqual(a, b, `seed ${seed} diverges`);
    }
  });

  it('replayOf roundtrips the live run exactly', () => {
    const s = solo(21);
    const flicks = [{ angle: 0.5, power: 0.8 }, { angle: -0.4, power: 0.6 }];
    for (const f of flicks) { s.flick('a', f.angle, f.power); stepRest(s); }
    const rep = s.replayOf('a')!;
    const again = runReplay(rep)!;
    const p = s.players.get('a')!;
    assert.equal(again.shots, p.shots);
    assert.equal(again.finished, p.finished);
    assert.ok(Math.abs(again.x - p.x) < 1e-6 && Math.abs(again.y - p.y) < 1e-6);
    assert.equal(runReplay({ seed: 1.5, flicks }), null); // garbage seed dies
  });

  it('snapshots stay ≤2KB even at a full table of 8', () => {
    const s = new LineSim(Math.random, 7);
    for (let i = 0; i < 8; i++) s.join(`p${i}`, `P${i}`, i > 0);
    s.step(LOBBY_COUNTDOWN_MS);
    let worst = 0;
    for (let i = 0; i < 8; i++) {
      worst = Math.max(worst, JSON.stringify(s.snapshot(`p${i}`)).length);
    }
    assert.ok(worst <= 2048, `snapshot p-worst ${worst}B > 2KB`);
  });

  it('best pins the fewest finishing shots and survives a worse run', () => {
    const ace = aceSeed();
    const s = new LineSim(Math.random, ace.seed);
    s.join('a', 'Asha', false);
    s.step(LOBBY_COUNTDOWN_MS);
    s.flick('a', 0, ace.power);
    stepRest(s);
    assert.equal(s.players.get('a')!.best, 1);
    s.step(FINAL_MS); // roll into run 2
    assert.equal(s.phase, 'run');
    s.flick('a', Math.PI, 0.1);
    stepRest(s);
    assert.equal(s.snapshot('a').you.best, 1);
  });

  it('feed never grows past 3 lines', () => {
    const s = solo();
    for (let i = 0; i < 10; i++) {
      s.flick('a', 0, 0.1);
      stepRest(s);
      if (s.phase !== 'run') break;
    }
    assert.ok(s.feed.length <= 3);
  });

  it('GhostChallenge validates via share asserts', () => {
    const ace = aceSeed();
    const s = solo(ace.seed);
    s.flick('a', 0, ace.power);
    stepRest(s);
    for (let i = 0; i < 200 && (s.phase as string) !== 'final'; i++) s.step(50);
    const g = s.ghost('ABCD', 'https://x.test');
    assert.deepEqual(assertArtifact(g), []);
    assert.equal(g.kind, 'GhostChallenge');
    assert.ok(g.url.includes('seed='));
  });

  it('puck never leaves the field, wherever it is flicked', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const r = simulate(createCourse(seed), [
        { angle: seed, power: 1 },
        { angle: -seed * 2.3, power: 1 },
      ]);
      assert.ok(r.x >= 0 && r.x <= FIELD_W && r.y >= 0 && r.y <= 320);
    }
    assert.equal(START.x, 40);
  });
});
