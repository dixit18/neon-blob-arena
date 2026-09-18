// games/totem-panic/test/driver.test.ts — TP-2 acceptance: instant party,
// human drop transport, tier nerves, pacing, cleanup.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTotemDriver, planX, legalWindow } from '../driver.js';
import { BASE, LOBBY_COUNTDOWN_MS } from '../sim.js';
import { BOT_TAG } from '../../../packages/bots/src/index.js';

const seq = (...rs: number[]): (() => number) => {
  let i = 0;
  return () => rs[i++ % rs.length]!;
};

function table(rand?: () => number) {
  const d = createTotemDriver(rand ?? seq(0.13, 0.71, 0.37, 0.91, 0.53, 0.29));
  d.join({ id: 'h', name: 'Asha', isBot: false });
  for (let i = 0; i < 60; i++) {
    d.step(0.05);
    if ((d.snapshot('h') as { phase: string }).phase === 'build') break;
  }
  return d;
}

describe('totem-panic driver', () => {
  it('solo human gets an instant labelled party of 4', () => {
    const d = table();
    assert.equal(d.playerCount(), 4);
    const snap = d.snapshot('h') as { leaders: { bot: boolean; n: string }[] };
    const bots = snap.leaders.filter((l) => l.bot);
    assert.equal(bots.length, 3);
    for (const b of bots) assert.ok(b.n.includes(BOT_TAG));
  });

  it('human drops flow through `input` {dx}', () => {
    // Human joins first = seat 0 = opening turn; bots still sighting (2-5s),
    // so the first block is deterministically ours.
    const d = table();
    d.accept({ kind: 'input', by: 'h', data: { dx: 12, dy: 0 }, at: 0 });
    const snap = d.snapshot('h') as { tower: { x: number }[] };
    assert.equal(snap.tower.length, 1);
    assert.equal(snap.tower[0]!.x, 12);
  });

  it('garbage drops die quietly — the tower survives', () => {
    const d = table();
    for (const data of [null, 42, { dx: 'left' }, {}, { dx: NaN }, { angle: 0 }]) {
      d.accept({ kind: 'nope', by: 'h', data, at: 0 });
      d.accept({ kind: 'input', by: 'h', data, at: 0 });
    }
    const snap = d.snapshot('h') as { phase: string };
    assert.equal(snap.phase, 'build');
  });

  it('sharps hug center, casuals breathe — all inside the legal window', () => {
    for (let i = 0; i < 20; i++) {
      const w = 40 + (i * 37) % 71;
      const [lo, hi] = legalWindow(BASE.w, BASE.x, w);
      const sharp = planX(BASE.w, BASE.x, w, 0, seq(0.1, 0.9, 0.5));
      assert.ok(Math.abs(sharp - BASE.x) <= 8, `sharp ${sharp} wanders`);
      const casual = planX(BASE.w, BASE.x, w, 1, seq(0.5, 0.5, 0.5));
      assert.ok(casual >= lo && casual <= hi, `casual ${casual} outside [${lo},${hi}]`);
    }
    // Rigged edge-flirt: rand 0.0 trips the 15% branch, side picks lo.
    const flirt = planX(120, 0, 60, 1, seq(0.0, 0.0, 0.0));
    const [lo] = legalWindow(120, 0, 60);
    assert.ok(flirt < 0 && flirt >= lo, `flirt ${flirt} should lean to lo=${lo}`);
  });

  it('bots wait their turn — no instant table-flip at build start', () => {
    const d = table();
    const snap = d.snapshot('h') as { tower: unknown[] };
    assert.equal(snap.tower.length, 0);
  });

  it('a bot party raises the totem to a final', () => {
    const d = table(seq(0.31, 0.17, 0.73, 0.41, 0.59, 0.83, 0.25, 0.65));
    let phase = 'build';
    for (let i = 0; i < 4000 && phase !== 'final'; i++) {
      d.step(0.05);
      phase = (d.snapshot('h') as { phase: string }).phase;
    }
    assert.equal(phase, 'final');
    const snap = d.snapshot('h') as { outcome: { result: string } | null; feed: string[] };
    assert.equal(snap.outcome?.result, 'raised');
    assert.ok(snap.feed.join(' ').includes('RAISED'));
  });

  it('last human out clears the hands; seam identity holds', () => {
    const d = table();
    assert.equal(d.game, 'totem-panic');
    assert.equal(d.createBot(0).name, `Mason ${BOT_TAG}`);
    d.leave('h');
    assert.equal(d.playerCount(), 0);
    d.dispose();
  });

  it('lobby still forms under the bot law (sanity of the seam)', () => {
    void LOBBY_COUNTDOWN_MS;
    const d = createTotemDriver(seq(0.5));
    d.join({ id: 'h', name: 'Asha', isBot: false });
    assert.ok(d.playerCount() >= 2);
    d.dispose();
  });
});
