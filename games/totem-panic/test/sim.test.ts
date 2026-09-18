// games/totem-panic/test/sim.test.ts — TP-1 acceptance: drop order,
// placements, slip + topple, raise + hold, turns, timeouts, spectating,
// ghost reclaim, replay determinism, 500 seeded cases, budgets.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TotemSim, BASE, WIN_LEVELS, HOLD_MS, TURN_MS, MIN_START,
  LOBBY_COUNTDOWN_MS, FINAL_MS, dropOrder, centerOfMass, reSim,
  type Placement,
} from '../sim.js';
import { assertArtifact } from '../../../packages/share/src/index.js';

function duo(seed = 7): TotemSim {
  const s = new TotemSim(Math.random, seed);
  s.join('a', 'Asha', false);
  s.join('b', 'Bheem', false);
  s.step(LOBBY_COUNTDOWN_MS);
  return s;
}

function belowX(s: TotemSim): number {
  return s.tower.length === 0 ? BASE.x : s.tower[s.tower.length - 1]!.x;
}

function turnOf(s: TotemSim): string {
  const name = s.snapshot(s.order[0]!).turn!.name;
  return s.order.find((id) => s.players.get(id)!.name === name)!;
}

/** Raise straight up the middle, however tall the tower already is. */
function raise(s: TotemSim): void {
  while (s.tower.length < WIN_LEVELS) {
    assert.equal(s.phase, 'build');
    s.place(turnOf(s), belowX(s));
  }
}

/** A seed whose max-legal offsets topple the tower (self-found). */
function toppleScript(): { seed: number; xs: number[] } {
  for (let seed = 1; seed <= 60; seed++) {
    const widths = dropOrder(seed, WIN_LEVELS);
    const xs: number[] = [];
    let bx = BASE.x;
    let ok = true;
    const tower: { w: number; x: number }[] = [];
    for (let i = 0; i < WIN_LEVELS; i++) {
      const w = widths[i]!;
      const below = tower.length === 0 ? { w: BASE.w, x: BASE.x } : tower[tower.length - 1]!;
      const edge = below.x + (below.w + w) / 2 - 10;
      const x = Math.min(90, edge);
      if (Math.abs(x - below.x) > (below.w + w) / 2 - 10 + 1e-9) { ok = false; break; }
      tower.push({ w, x });
      bx = x;
      xs.push(x);
      let m = 0;
      let ws = 0;
      for (const b of tower) { m += b.w * b.x; ws += b.w; }
      if (Math.abs(m / ws) > 60) return { seed, xs };
    }
    if (ok && bx !== BASE.x) continue;
  }
  throw new Error('no toppling seed in 1..60');
}

describe('totem-panic sim', () => {
  it('lobby waits below MIN_START', () => {
    const s = new TotemSim(Math.random, 7);
    s.join('a', 'Asha', false);
    s.step(LOBBY_COUNTDOWN_MS * 3);
    assert.equal(s.phase, 'lobby');
    assert.equal(MIN_START, 2);
  });

  it('two seats start the build on one shared drop order', () => {
    const s = duo();
    assert.equal(s.phase, 'build');
    const qa = s.snapshot('a').queue;
    const qb = s.snapshot('b').queue;
    assert.equal(qa.length, 3);
    assert.deepEqual(qa, qb);
    assert.deepEqual(qa, dropOrder(s.seed, 3));
  });

  it('ten centered blocks raise the totem through the hold', () => {
    const s = duo();
    raise(s);
    assert.equal(s.phase, 'hold');
    assert.equal(s.snapshot('a').levelsLeft, 0);
    s.step(HOLD_MS);
    assert.equal(s.phase, 'final');
    assert.equal(s.outcome?.result, 'raised');
    assert.ok(s.feed.join(' ').includes('RAISED'));
  });

  it('wild offsets slip off — collapse ends the run', () => {
    const s = duo();
    assert.equal(s.place(turnOf(s), 90), true);
    // 90 from center vs (120+w)/2-10: slips unless the first block is huge.
    if (s.phase === 'build') {
      // First block held (wide draw): force the slip on level two.
      s.place(turnOf(s), -90);
    }
    for (let i = 0; s.phase === 'build' && i < 4; i++) {
      s.place(turnOf(s), s.snapshot('a').turn!.you ? 90 : -90);
    }
    assert.equal(s.phase, 'final');
    assert.ok(s.outcome?.result === 'slipped' || s.outcome?.result === 'toppled');
  });

  it('lean past the base topples (scripted max-edge run)', () => {
    const { seed, xs } = toppleScript();
    const s = new TotemSim(Math.random, seed);
    s.join('a', 'Asha', false);
    s.join('b', 'Bheem', false);
    s.step(LOBBY_COUNTDOWN_MS);
    for (const x of xs) {
      if (s.phase !== 'build') break;
      s.place(turnOf(s), x);
    }
    assert.equal(s.phase, 'final');
    assert.equal(s.outcome?.result, 'toppled');
  });

  it('turns rotate and strangers + NaN die', () => {
    const s = duo();
    const first = turnOf(s);
    assert.equal(s.place(first === 'a' ? 'b' : 'a', 0), false); // not your turn
    assert.equal(s.place('zzz', 0), false);
    assert.equal(s.place(first, NaN), false);
    assert.equal(s.place(first, 0), true);
    assert.notEqual(turnOf(s), first);
  });

  it('dawdlers auto-place — the table never stalls', () => {
    const s = duo();
    s.step(TURN_MS + 100);
    assert.equal(s.tower.length, 1);
    assert.equal(s.phase, 'build');
  });

  it('late joiners spectate until the next raise', () => {
    const s = duo();
    s.place(turnOf(s), 0);
    s.join('c', 'Chiku', false);
    assert.equal(s.players.get('c')!.spectating, true);
    assert.equal(s.snapshot('c').spectating, true);
    assert.equal(s.place('c', 0), false); // spectators hold no blocks
    raise(s);
    s.step(HOLD_MS);
    assert.equal(s.phase, 'final');
    s.step(FINAL_MS);
    assert.equal(s.phase, 'build');
    assert.equal(s.players.get('c')!.spectating, false);
  });

  it('leavers ghost and reclaim the same seat', () => {
    const s = duo();
    s.place('a', 0);
    s.leave('a');
    assert.equal(s.playerCount(), 1); // ghost holds no seat count
    assert.ok(s.players.has('a'), 'ghost kept');
    s.join('a', 'Asha', false);
    assert.equal(s.players.get('a')!.placed, 1); // record intact
    assert.equal(s.playerCount(), 2);
  });

  it('empty room resets clean', () => {
    const s = duo();
    s.place(turnOf(s), 0);
    s.leave('a');
    s.leave('b');
    assert.equal(s.phase, 'lobby');
    assert.equal(s.playerCount(), 0);
    assert.equal(s.tower.length, 0);
  });

  it('Sprint DoD: 500 seeded cases raise identically live and replayed', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const s = new TotemSim(Math.random, seed);
      s.join('a', 'Asha', false);
      s.join('b', 'Bheem', false);
      s.step(LOBBY_COUNTDOWN_MS);
      for (let i = 0; i < WIN_LEVELS; i++) s.place(turnOf(s), belowX(s));
      assert.equal(s.phase, 'hold', `seed ${seed} should hold`);
      const live = s.tower.map((b) => ({ w: b.w, x: b.x, by: b.by }));
      const again = reSim(s.seed, s.placements.map((p) => ({ ...p })));
      assert.equal(again.outcome?.result, 'raised', `seed ${seed} replays raised`);
      assert.deepEqual(again.tower, live, `seed ${seed} diverges`);
    }
  });

  it('replay roundtrips a collapse exactly', () => {
    const s = duo(99);
    const seq: Placement[] = [];
    for (let i = 0; s.phase === 'build' && i < 6; i++) {
      const x = i % 2 === 0 ? 90 : -90;
      s.place(turnOf(s), x);
      seq.push(s.placements[s.placements.length - 1]!);
    }
    assert.equal(s.phase, 'final');
    const again = reSim(s.seed, seq);
    assert.deepEqual(again.outcome, s.outcome);
    assert.equal(again.tower.length, s.tower.length);
  });

  it('snapshots stay ≤1.5KB at a full table of 10 on a tall tower', () => {
    const s = new TotemSim(Math.random, 7);
    for (let i = 0; i < 10; i++) s.join(`p${i}`, `P${i}`, i > 1);
    s.step(LOBBY_COUNTDOWN_MS);
    raise(s);
    let worst = 0;
    for (let i = 0; i < 10; i++) {
      worst = Math.max(worst, JSON.stringify(s.snapshot(`p${i}`)).length);
    }
    assert.ok(worst <= 1536, `snapshot worst ${worst}B > 1.5KB`);
  });

  it('best pins the raised height', () => {
    const s = duo();
    raise(s);
    s.step(HOLD_MS);
    assert.equal(s.players.get('a')!.best, WIN_LEVELS);
    assert.equal(s.snapshot('a').you.best, WIN_LEVELS);
  });

  it('lean meter tracks the weight', () => {
    const s = duo();
    assert.equal(s.snapshot('a').lean, 0);
    s.place(turnOf(s), 50);
    assert.ok(Math.abs(s.snapshot('a').lean) > 0);
    assert.ok(Math.abs(centerOfMass(s.tower)) < 60);
  });

  it('ReplayMoment validates via share asserts', () => {
    const s = duo();
    raise(s);
    s.step(HOLD_MS);
    const r = s.replay('ABCD', 'https://x.test');
    assert.deepEqual(assertArtifact(r), []);
    assert.equal(r.kind, 'ReplayMoment');
    assert.ok(r.url.includes('totem-panic'));
    assert.equal((r.data as { outcome: { result: string } }).outcome.result, 'raised');
    assert.equal((r.data as { placements: unknown[] }).placements.length, WIN_LEVELS);
  });

  it('mid-run replay is honest — placements so far, no crown', () => {
    const s = duo();
    s.place(turnOf(s), 0);
    const r = s.replay('ABCD', 'https://x.test');
    assert.deepEqual(assertArtifact(r), []);
    assert.ok(r.title.includes('live'));
    assert.equal((r.data as { outcome: unknown }).outcome, null);
  });
});
