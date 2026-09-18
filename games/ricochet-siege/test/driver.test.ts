// games/ricochet-siege/test/driver.test.ts — RS-2 acceptance: instant war,
// human aim transport, tier error gap, pacing, cleanup.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSiegeDriver, planAim, aimError } from '../driver.js';
import { BOT_TAG } from '../../../packages/bots/src/index.js';

const seq = (...rs: number[]): (() => number) => {
  let i = 0;
  return () => rs[i++ % rs.length]!;
};

function table(rand?: () => number) {
  const d = createSiegeDriver(rand ?? seq(0.13, 0.71, 0.37, 0.91, 0.53, 0.29));
  d.join({ id: 'h', name: 'Asha', isBot: false });
  for (let i = 0; i < 60; i++) {
    d.step(0.05);
    if ((d.snapshot('h') as { phase: string }).phase === 'aim') break;
  }
  return d;
}

describe('ricochet-siege driver', () => {
  it('solo human gets an instant labelled war of 6', () => {
    const d = table();
    assert.equal(d.playerCount(), 6);
    const snap = d.snapshot('h') as { leaders: { bot: boolean; n: string }[] };
    const bots = snap.leaders.filter((l) => l.bot);
    assert.equal(bots.length, 5);
    for (const b of bots) assert.ok(b.n.includes(BOT_TAG));
  });

  it('human aims flow through `input` {dx, dy}', () => {
    const d = table();
    d.accept({ kind: 'input', by: 'h', data: { dx: 1, dy: 0 }, at: 0 });
    const snap = d.snapshot('h') as { leaders: { n: string; locked: boolean }[] };
    assert.equal(snap.leaders.find((l) => l.n === 'Asha')!.locked, true);
  });

  it('garbage aims die quietly — the countdown survives', () => {
    const d = table();
    for (const data of [null, 42, { dx: 'east' }, { dy: 1 }, {}, { dx: 0, dy: 0 }, { dx: NaN, dy: 0 }]) {
      d.accept({ kind: 'nope', by: 'h', data, at: 0 });
      d.accept({ kind: 'input', by: 'h', data, at: 0 });
    }
    const snap = d.snapshot('h') as { phase: string; committed: number };
    assert.equal(snap.phase, 'aim');
    assert.equal(snap.committed, 0);
  });

  it('sharps whisper, casuals shout — the error gap is real', () => {
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
      assert.ok(Math.abs(aimError(0, () => r)) <= 0.06, `sharp err at ${r}`);
      assert.ok(Math.abs(aimError(1, () => r)) <= 0.25, `casual err at ${r}`);
    }
    assert.ok(Math.abs(aimError(1, () => 0.999)) > Math.abs(aimError(0, () => 0.999)));
  });

  it('brains aim at the nearest live hull', () => {
    const me = { x: 50, y: 50 };
    // Nearest is (50,270) at 220 — straight down — not (430,50) at 380.
    const foes = [{ x: 430, y: 50 }, { x: 50, y: 270 }];
    const a = planAim(me, foes, 0, seq(0.5, 0.5));
    assert.ok(Math.abs(a.angle - Math.PI / 2) < 0.1, `sharp bears ${a.angle}, want ~π/2`);
    assert.ok(a.power >= 0.7 && a.power <= 1);
    const lone = planAim(me, [], 1, seq(0.25, 0.5));
    assert.ok(Number.isFinite(lone.angle) && lone.power >= 0.4);
  });

  it('gunners hold fire at window open — no instant volley', () => {
    const d = table();
    const snap = d.snapshot('h') as { phase: string; committed: number };
    assert.equal(snap.phase, 'aim');
    assert.equal(snap.committed, 0);
  });

  it('a bot war plays five rounds to a crowned siege', () => {
    const d = table(seq(0.31, 0.17, 0.73, 0.41, 0.59, 0.83, 0.25, 0.65));
    let phase = 'aim';
    for (let i = 0; i < 6000 && phase !== 'final'; i++) {
      d.step(0.05);
      phase = (d.snapshot('h') as { phase: string }).phase;
    }
    assert.equal(phase, 'final');
    const snap = d.snapshot('h') as { leaders: { wins: number }[]; feed: string[] };
    assert.ok(snap.leaders[0]!.wins >= 0);
    assert.ok(snap.feed.join(' ').includes('siege'));
  });

  it('last human out clears the war; seam identity holds', () => {
    const d = table();
    assert.equal(d.game, 'ricochet-siege');
    assert.equal(d.createBot(0).name, `Rook ${BOT_TAG}`);
    d.leave('h');
    assert.equal(d.playerCount(), 0);
    d.dispose();
  });
});
