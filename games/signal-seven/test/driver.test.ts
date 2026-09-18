// games/signal-seven/test/driver.test.ts — SI-2 acceptance: instant rival
// table, human triple transport, solver-driven tiers, pacing, cleanup.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSignalDriver, planGuess, candidates, type Hist } from '../driver.js';
import { genMystery, feedback, MAX_GUESSES, LOBBY_COUNTDOWN_MS } from '../sim.js';
import { BOT_TAG } from '../../../packages/bots/src/index.js';

const DAY = { seed: 20260117, day: '2026-01-17' };
const seq = (...rs: number[]): (() => number) => {
  let i = 0;
  return () => rs[i++ % rs.length]!;
};

function table(rand?: () => number) {
  const d = createSignalDriver(rand ?? seq(0.13, 0.71, 0.37, 0.91, 0.53, 0.29), DAY);
  d.join({ id: 'h', name: 'Asha', isBot: false });
  for (let i = 0; i < 60; i++) {
    d.step(0.05);
    if ((d.snapshot('h') as { phase: string }).phase === 'puzzle') break;
  }
  return d;
}

describe('signal-seven driver', () => {
  it('solo human gets an instant labelled table of 4', () => {
    const d = table();
    assert.equal(d.playerCount(), 4);
    const snap = d.snapshot('h') as { leaders: { bot: boolean; n: string }[] };
    const bots = snap.leaders.filter((l) => l.bot);
    assert.equal(bots.length, 3);
    for (const b of bots) assert.ok(b.n.includes(BOT_TAG));
  });

  it('human guesses flow through `input` {dx, dy, aim}', () => {
    const d = table();
    d.accept({ kind: 'input', by: 'h', data: { dx: 0, dy: 1, aim: 2 }, at: 0 });
    const snap = d.snapshot('h') as { attempts: { guess: number[] }[]; attemptsLeft: number };
    assert.equal(snap.attempts.length, 1);
    assert.deepEqual(snap.attempts[0]!.guess, [0, 1, 2]);
    assert.equal(snap.attemptsLeft, MAX_GUESSES - 1);
  });

  it('garbage triples die quietly — the tablet survives', () => {
    const d = table();
    for (const data of [
      null, 42, { dx: 0, dy: 1 }, { dx: 0, dy: 0, aim: 0 },
      { dx: 99, dy: 0, aim: 1 }, { dx: NaN, dy: 1, aim: 2 },
      { angle: 0, power: 1 },
    ]) {
      d.accept({ kind: 'nope', by: 'h', data, at: 0 });
      d.accept({ kind: 'input', by: 'h', data, at: 0 });
    }
    const snap = d.snapshot('h') as { attempts: unknown[]; phase: string };
    assert.equal(snap.attempts.length, 0);
    assert.equal(snap.phase, 'puzzle');
  });

  it('candidates honor clues + pip history', () => {
    const m = genMystery(DAY.seed, DAY.day);
    const all = candidates(m.clues, []);
    assert.equal(all.length, 1);
    assert.deepEqual(all[0], m.code);
    // A 2-in-pos history narrows to the code alone.
    const hist: Hist[] = [{ guess: m.code, inCode: 3, inPos: 3 }];
    assert.deepEqual(candidates([], hist).length, 1);
    // A lying history empties the set (brain falls back to all codes).
    const lie: Hist[] = [{ guess: [0, 1, 2], inCode: 0, inPos: 3 }];
    assert.equal(candidates([], lie).length, 0);
  });

  it('sharp plans inside the alive set; casuals wander legally', () => {
    const m = genMystery(DAY.seed, DAY.day);
    for (let i = 0; i < 10; i++) {
      const g = planGuess(m.clues, [], 0, seq(0.1 + i * 0.07, 0.5, 0.9));
      const alive = candidates(m.clues, []);
      assert.ok(alive.some((c) => c.join() === g.join()), `sharp guess ${g} off-set`);
    }
    const wild = planGuess(m.clues, [], 1, seq(0.0, 0.99, 0.99));
    assert.equal(wild.length, 3);
    assert.equal(new Set(wild).size, 3);
  });

  it('a bot-only table reads the day out to a final', () => {
    const d = createSignalDriver(seq(0.31, 0.17, 0.73, 0.41, 0.59, 0.83), DAY);
    d.join({ id: 'h', name: 'Watcher', isBot: false });
    let phase = 'lobby';
    for (let i = 0; i < 6000 && phase !== 'final'; i++) {
      d.step(0.05);
      phase = (d.snapshot('h') as { phase: string }).phase;
    }
    assert.equal(phase, 'final');
    const snap = d.snapshot('h') as {
      leaders: { n: string; guesses: number; won: boolean; bot: boolean }[];
      feed: string[];
    };
    const winner = snap.leaders[0]!;
    assert.equal(winner.won, true);
    assert.ok(winner.guesses >= 1 && winner.guesses <= MAX_GUESSES);
    assert.ok(snap.feed.join(' ').includes('🏆'));
  });

  it('sharps close faster than casuals on average', () => {
    // Ten fixed days: sharp tablets must never lose the average to casuals.
    let sharp = 0;
    let casual = 0;
    for (let day = 0; day < 10; day++) {
      const seed = 20260201 + day;
      const m = genMystery(seed, `2026-02-${String(day + 1).padStart(2, '0')}`);
      const r = seq(0.4, 0.6, 0.2, 0.8, 0.1, 0.9, 0.3, 0.7);
      const play = (tier: 0 | 1): number => {
        const hist: Hist[] = [];
        for (let t = 0; t < MAX_GUESSES; t++) {
          const g = planGuess(m.clues, hist, tier, r);
          const f = feedback(m.code, g);
          if (f.inPos === 3) return t + 1;
          hist.push({ guess: g, inCode: f.inCode, inPos: f.inPos });
        }
        return MAX_GUESSES + 1;
      };
      sharp += play(0);
      casual += play(1);
    }
    assert.ok(sharp <= casual, `sharps avg ${sharp / 10} vs casuals ${casual / 10}`);
  });

  it('last human out clears the tablets; seam identity holds', () => {
    const d = table();
    assert.equal(d.game, 'signal-seven');
    assert.equal(d.createBot(0).name, `Sage ${BOT_TAG}`);
    d.leave('h');
    assert.equal(d.playerCount(), 0);
    d.dispose();
  });
});
