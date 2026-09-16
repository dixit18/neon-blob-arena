// games/nitro-rift/test/sim.test.ts — acceptance: heats, boost, pads,
// bumps, places, budgets, determinism. No sockets.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NitroSim, HEAT_MS } from '../sim.js';
import { stepRacer, TRACK_LEN } from '../physics.js';

const TICK = 50;

function withRace(n = 2): NitroSim {
  const s = new NitroSim();
  for (let i = 0; i < n; i++) s.join(`h${i}`, `R${i}`, false);
  let t = 0;
  while (s.phase !== 'race' && t < 10_000) { s.step(TICK); t += TICK; }
  assert.equal(s.phase, 'race');
  return s;
}

describe('nitro physics seam', () => {
  it('boost is faster, drains; coasting regens', () => {
    const a = { prog: 0, lane: 1, boost: 100, slowUntil: 0 };
    const b = { prog: 0, lane: 1, boost: 100, slowUntil: 0 };
    stepRacer(a, { steer: 0, boost: true }, [], [], 0, 1000);
    stepRacer(b, { steer: 0, boost: false }, [], [], 0, 1000);
    assert.ok(a.prog > b.prog);
    assert.ok(a.boost < 100 && b.boost === 100);
  });

  it('pads refund boost, bumps slow you down', () => {
    const s = { prog: 0, lane: 1, boost: 10, slowUntil: 0 };
    const { padTaken } = stepRacer(s, { steer: 0, boost: false }, [{ at: 3, lane: 1 }], [], 0, 100);
    assert.equal(padTaken, 0);
    assert.ok(s.boost > 30);
    const v0 = { prog: 0, lane: 1, boost: 100, slowUntil: 0 };
    stepRacer(v0, { steer: 0, boost: true }, [], [{ prog: 12, lane: 1 }], 1000, 100);
    assert.ok(v0.slowUntil > 1000);
    const p1 = v0.prog;
    stepRacer(v0, { steer: 0, boost: true }, [], [], 1100, 1000);
    const free = { prog: 0, lane: 3, boost: 100, slowUntil: 0 };
    stepRacer(free, { steer: 0, boost: true }, [], [], 1100, 1000);
    assert.ok(v0.prog - p1 < free.prog);
  });

  it('lanes clamp 0..3, steering glides (no teleport)', () => {
    const s = { prog: 0, lane: 0, boost: 100, slowUntil: 0 };
    stepRacer(s, { steer: -1, boost: false }, [], [], 0, 50);
    assert.equal(s.lane, 0);
    stepRacer(s, { steer: 1, boost: false }, [], [], 0, 50);
    assert.ok(s.lane > 0 && s.lane < 1);
  });
});

describe('nitro sim', () => {
  it('lobby waits empty; heats start fast with humans', () => {
    const e = new NitroSim();
    for (let i = 0; i < 100; i++) e.step(TICK);
    assert.equal(e.phase, 'lobby');
    const s = withRace(1);
    assert.equal(s.pads.length, 6);
  });

  it('drive intent moves you: boost beats coast over 5s', () => {
    const s = withRace(2);
    s.drive('h0', 0, true);
    s.drive('h1', 0, false);
    for (let i = 0; i < 100; i++) s.step(TICK);
    const a = s.racers.get('h0')!;
    const b = s.racers.get('h1')!;
    assert.ok(a.st.prog > b.st.prog);
  });

  it('finishing crowns the heat, then a fresh heat resets the grid', () => {
    const s = withRace(2);
    // park the whole grid at the line: every finisher ends the heat
    // (first-across + chase window is slice 2, ticket NR-3).
    for (const r of s.racers.values()) {
      r.st.prog = TRACK_LEN - 1;
      s.drive(r.id, 0, true);
    }
    let t = 0;
    while (s.phase === 'race' && t < 10_000) { s.step(TICK); t += TICK; }
    assert.equal(s.phase, 'final');
    assert.ok(s.feed.some((f) => f.includes('🏆')));
    assert.ok([...s.racers.values()].some((r) => r.wins === 1));
    while (s.phase === 'final') s.step(TICK);
    assert.equal(s.phase, 'lobby');
    assert.equal(s.heatNo, 2);
    for (const r of s.racers.values()) assert.equal(r.st.prog, 0);
  });

  it('timeout crowns whoever is furthest', () => {
    const s = withRace(2);
    const a = s.racers.get('h0')!;
    const b = s.racers.get('h1')!;
    a.st.prog = 900; b.st.prog = 100;
    let t = 0;
    while (s.phase === 'race' && t < HEAT_MS + 10_000) { s.step(TICK); t += TICK; }
    assert.equal(s.phase, 'final');
    assert.equal(a.wins, 1);
  });

  it('places() ranks finishers before distance', () => {
    const s = withRace(2);
    const a = s.racers.get('h0')!;
    const b = s.racers.get('h1')!;
    a.st.prog = 100; b.st.prog = 1100;
    b.finishedAt = 0;
    a.finishedAt = s.time; // a crossed earlier (shorter heat quirk aside)
    const order = s.places();
    assert.equal(order[0]!.id, 'h0');
  });

  it('snapshot is small and carries grid + pads', () => {
    const s = withRace(2);
    const bytes = Buffer.byteLength(JSON.stringify(s.snapshot('h0')));
    assert.ok(bytes <= 1536, `nitro snapshot ${bytes}B > 1.5KB`);
    const snap = s.snapshot('h0');
    assert.equal(snap.t, 'nitro');
    assert.equal(snap.racers.length, 2);
    assert.equal(snap.pads.length, 6);
    assert.ok(snap.you.place >= 1);
  });

  it('deterministic: same inputs, same progress', () => {
    const run = (): number => {
      const s = new NitroSim();
      s.join('h0', 'A', false);
      s.join('h1', 'B', false);
      let t = 0;
      while (s.phase !== 'race' && t < 10_000) { s.step(TICK); t += TICK; }
      s.drive('h0', 1, true);
      for (let i = 0; i < 100; i++) s.step(TICK);
      return Math.round(s.racers.get('h0')!.st.prog * 100);
    };
    assert.equal(run(), run());
  });

  it('GhostChallenge validates via share asserts and re-enters play', async () => {
    const { assertArtifact } = await import('../../../packages/share/src/index.js');
    const s = withRace(1);
    const g = s.ghost('ABCD', 'https://x.test');
    assert.deepEqual(assertArtifact(g), []);
    assert.ok((g.url as string).includes('nitro-rift'));
  });
});
