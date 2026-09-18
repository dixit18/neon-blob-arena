// games/signal-seven/test/sim.test.ts — SI-1 acceptance: day seeds,
// mystery shape, clue truth, solver uniqueness (incl. all 365 days of
// 2026), pips, validation, winning/exhaustion, ranking, leaving,
// snapshots, bests, DailyGrid honesty.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SignalSim, RUNES, CODE_LEN, CLUE_COUNT, MAX_GUESSES, MIN_START,
  LOBBY_COUNTDOWN_MS, FINAL_MS, daySeedUTC, genMystery, countConsistent,
  feedback, validGuess, clueText, allCodes,
} from '../sim.js';
import { assertArtifact } from '../../../packages/share/src/index.js';

const DAY = { seed: 20260117, day: '2026-01-17' };

function solo(): SignalSim {
  const s = new SignalSim(Math.random, DAY);
  s.join('a', 'Asha', false);
  s.step(LOBBY_COUNTDOWN_MS);
  return s;
}

function solve(s: SignalSim, id = 'a'): void {
  const code = s.mystery!.code;
  s.guess(id, [...code]);
}

describe('signal-seven sim', () => {
  it('day seeds are UTC-stable and roll at midnight', () => {
    const a = daySeedUTC(new Date(Date.UTC(2026, 0, 1, 23, 59)));
    const b = daySeedUTC(new Date(Date.UTC(2026, 0, 2, 0, 1)));
    assert.equal(a.seed, 20260101);
    assert.equal(a.day, '2026-01-01');
    assert.equal(b.seed, 20260102);
    assert.notEqual(a.seed, b.seed);
  });

  it('mysteries are deterministic per seed', () => {
    const a = genMystery(20260117, '2026-01-17');
    const b = genMystery(20260117, '2026-01-17');
    assert.deepEqual(a, b);
    assert.equal(a.code.length, CODE_LEN);
    assert.equal(new Set(a.code).size, CODE_LEN);
    assert.equal(a.clues.length, CLUE_COUNT);
  });

  it('every clue is true of its code', () => {
    for (const seed of [1, 42, 20260117, 20261231, 999999]) {
      const m = genMystery(seed);
      assert.equal(countConsistent(m.clues).n, 1, `seed ${seed} ambiguous`);
      assert.deepEqual(countConsistent(m.clues).first, m.code);
    }
  });

  it('Sprint DoD: all 365 days of 2026 solve to exactly one code', () => {
    const start = Date.UTC(2026, 0, 1);
    for (let d = 0; d < 365; d++) {
      const { seed, day } = daySeedUTC(new Date(start + d * 86400_000));
      const m = genMystery(seed, day);
      const { n, first } = countConsistent(m.clues);
      assert.equal(n, 1, `${day} has ${n} solutions`);
      assert.deepEqual(first, m.code);
      assert.ok(m.clues.length <= CLUE_COUNT);
    }
  });

  it('pips count right: in-position vs in-code', () => {
    assert.deepEqual(feedback([0, 1, 2], [0, 1, 2]), { inCode: 3, inPos: 3 });
    assert.deepEqual(feedback([0, 1, 2], [2, 1, 0]), { inCode: 3, inPos: 1 });
    assert.deepEqual(feedback([0, 1, 2], [3, 4, 5]), { inCode: 0, inPos: 0 });
    assert.deepEqual(feedback([0, 1, 2], [0, 3, 4]), { inCode: 1, inPos: 1 });
  });

  it('bad guesses die without spending an attempt', () => {
    const s = solo();
    for (const g of [[0, 1], [0, 1, 2, 3], [0, 0, 1], [0, 1, 99], [0, 1, -1], 'EMBER', null, [0.5, 1, 2]]) {
      assert.equal(s.guess('a', g), false);
    }
    assert.equal(s.players.get('a')!.attempts.length, 0);
    assert.equal(s.guess('zzz', [0, 1, 2]), false);
  });

  it('solo seat opens the daily puzzle', () => {
    const s = solo();
    assert.equal(MIN_START, 1);
    assert.equal(s.phase, 'puzzle');
    const snap = s.snapshot('a');
    assert.equal(snap.day, DAY.day);
    assert.equal(snap.clues.length, CLUE_COUNT);
    assert.ok(snap.clues.every((c) => c.length > 8));
  });

  it('the code guess wins in one with full pips', () => {
    const s = solo();
    solve(s);
    const p = s.players.get('a')!;
    assert.equal(p.won, true);
    assert.equal(p.attempts.length, 1);
    assert.deepEqual(
      [p.attempts[0]!.inCode, p.attempts[0]!.inPos],
      [CODE_LEN, CODE_LEN],
    );
    assert.equal(s.guess('a', [0, 1, 2]), false); // done tablets lock
  });

  it('seven misses exhausts the tablet', () => {
    const s = solo();
    const code = new Set(s.mystery!.code);
    const wrong = [0, 1, 2, 3, 4, 5, 6].filter((r) => !code.has(r)).slice(0, 3);
    for (let i = 0; i < MAX_GUESSES; i++) assert.equal(s.guess('a', wrong), true);
    const p = s.players.get('a')!;
    assert.equal(p.won, false);
    assert.equal(p.done, true);
    assert.equal(s.guess('a', wrong), false);
  });

  it('run ends when every tablet is done; fewest guesses takes the day', () => {
    const s = new SignalSim(Math.random, DAY);
    s.join('a', 'Asha', false);
    s.join('b', 'Bheem', false);
    s.step(LOBBY_COUNTDOWN_MS);
    const code = [...s.mystery!.code];
    const wrong = [0, 1, 2, 3, 4, 5, 6].filter((r) => !code.includes(r)).slice(0, 3);
    s.guess('b', wrong);
    s.step(10);
    solve(s, 'a');
    for (let i = 0; i < 200 && s.phase !== 'final'; i++) {
      if (!s.players.get('b')!.done) s.guess('b', wrong);
      s.step(50);
    }
    assert.equal(s.phase, 'final');
    assert.equal(s.snapshot('a').leaders[0]!.n, 'Asha');
    assert.ok(s.feed.join(' ').includes('Asha'));
  });

  it('leavers are dropped; empty room resets to lobby', () => {
    const s = solo();
    s.join('b', 'Bheem', false);
    s.leave('b');
    assert.equal(s.playerCount(), 1);
    s.leave('a');
    assert.equal(s.phase, 'lobby');
    assert.equal(s.mystery, null);
  });

  it('snapshots stay ≤2KB at a full table of 8', () => {
    const s = new SignalSim(Math.random, DAY);
    for (let i = 0; i < 8; i++) s.join(`p${i}`, `P${i}`, i > 0);
    s.step(LOBBY_COUNTDOWN_MS);
    s.guess('p0', [0, 1, 2]);
    let worst = 0;
    for (let i = 0; i < 8; i++) {
      worst = Math.max(worst, JSON.stringify(s.snapshot(`p${i}`)).length);
    }
    assert.ok(worst <= 2048, `snapshot worst ${worst}B > 2KB`);
  });

  it('best pins the fewest winning guesses across puzzles', () => {
    const s = solo();
    const code = [...s.mystery!.code];
    const wrong = [0, 1, 2, 3, 4, 5, 6].filter((r) => !code.includes(r)).slice(0, 3);
    s.guess('a', wrong);
    s.guess('a', wrong);
    solve(s);
    assert.equal(s.players.get('a')!.best, 3);
    s.step(FINAL_MS);
    assert.equal(s.phase, 'puzzle');
    solve(s);
    assert.equal(s.snapshot('a').you.best, 1);
  });

  it('clue texts name real runes, positions read clean', () => {
    const m = genMystery(7);
    for (const c of m.clues.map(clueText)) {
      assert.ok(RUNES.some((r) => c.includes(r.name)), `clue names no rune: ${c}`);
    }
  });

  it('the code space is 7P3 = 210 — the solver stays instant', () => {
    assert.equal(allCodes().length, 210);
  });

  it('DailyGrid validates and never carries the code', () => {
    const s = solo();
    solve(s);
    for (let i = 0; i < 200 && s.phase !== 'final'; i++) s.step(50);
    const g = s.grid('ABCD', 'https://x.test');
    assert.deepEqual(assertArtifact(g), []);
    assert.equal(g.kind, 'DailyGrid');
    const body = JSON.stringify(g);
    assert.ok(!body.includes(s.mystery!.code.join(',')), 'code sequence leaks');
    assert.ok(!Object.keys(g.data).includes('seed'), 'seed regenerates the code — out');
    assert.ok(!Object.keys(g.data).includes('code'), 'code key leaks');
    const rows = (g.data as { rows: { inCode: number; inPos: number }[] }).rows;
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], { inCode: 3, inPos: 3 });
  });

  it('mid-day grid is honest — no author, no crown', () => {
    const s = solo();
    const g = s.grid('ABCD', 'https://x.test');
    assert.deepEqual(assertArtifact(g), []);
    assert.ok(g.title.includes('unread'));
    assert.equal((g.data as { author: unknown }).author, null);
  });
});
