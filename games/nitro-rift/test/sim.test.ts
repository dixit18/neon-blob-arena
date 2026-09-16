// games/nitro-rift/test/sim.test.ts — acceptance: heats, boost, pads,
// bumps, places, budgets, determinism. No sockets.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NitroSim, HEAT_MS, RACE_DIST } from '../sim.js';
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
    // (NR-2 covers first-across + chase below).
    for (const r of s.racers.values()) {
      r.st.prog = RACE_DIST - 1;
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
    assert.equal((g.data as { laps: number }).laps, 2);
  });
});

describe('nitro NR-2: flag, chase, laps', () => {
  it('crossing lap 1 is not finishing — lap 2 begins', () => {
    const s = withRace(1);
    const r = s.racers.get('h0')!;
    r.st.prog = TRACK_LEN + 10;
    s.step(TICK);
    assert.equal(r.finishedAt, 0);
    assert.equal(s.phase, 'race');
    assert.equal(s.snapshot('h0').you.lap, 2);
  });

  it('first across plants the flag, race continues for the chase', () => {
    const s = withRace(2);
    const a = s.racers.get('h0')!;
    const b = s.racers.get('h1')!;
    a.st.prog = RACE_DIST - 1;
    b.st.prog = 100;
    s.drive('h0', 0, true);
    s.step(TICK);
    assert.notEqual(a.finishedAt, 0);
    assert.equal(s.phase, 'race'); // chase window, not final
    assert.ok(s.feed.some((f) => f.includes('🏁') && f.includes('chase')));
  });

  it('chase expiry ends the heat with stragglers out', () => {
    const s = withRace(2);
    s.racers.get('h0')!.st.prog = RACE_DIST - 1;
    s.racers.get('h1')!.st.prog = 100;
    s.drive('h0', 0, true);
    let t = 0;
    while (s.phase === 'race' && t < 20_000) { s.step(TICK); t += TICK; }
    assert.equal(s.phase, 'final');
    assert.ok(s.feed.some((f) => f.includes('🏆')));
  });

  it('a chase-window finisher outranks every non-finisher', () => {
    const s = withRace(3);
    const [a, b, c] = ['h0', 'h1', 'h2'].map((id) => s.racers.get(id)!);
    a.st.prog = RACE_DIST - 1;
    b.st.prog = RACE_DIST - 50;
    c.st.prog = 100; // far back — never finishes inside the chase
    s.drive('h0', 0, true);
    s.drive('h1', 0, true);
    let t = 0;
    while (s.phase === 'race' && t < 20_000) { s.step(TICK); t += TICK; }
    assert.equal(s.phase, 'final');
    const order = s.places().map((r) => r.id);
    assert.deepEqual(order, ['h0', 'h1', 'h2']);
  });

  it('a full 2-lap heat crowns the first finisher', () => {
    const s = withRace(2);
    for (const r of s.racers.values()) {
      r.st.prog = RACE_DIST - 1;
      s.drive(r.id, 0, true);
    }
    let t = 0;
    while (s.phase === 'race' && t < 10_000) { s.step(TICK); t += TICK; }
    assert.equal(s.phase, 'final');
    assert.equal(s.places()[0]!.wins, 1);
  });

  it('snapshot lap counts 1 then 2 across the line', () => {
    const s = withRace(1);
    assert.equal(s.snapshot('h0').you.lap, 1);
    // inspect the line without stepping (steps coast forward 3u/tick)
    const r = s.racers.get('h0')!;
    r.st.prog = TRACK_LEN - 1;
    assert.equal(s.snapshot('h0').you.lap, 1);
    r.st.prog = TRACK_LEN + 1;
    assert.equal(s.snapshot('h0').you.lap, 2);
  });

  it('fresh heat resets laps, prog, and the flag', () => {
    const s = withRace(2);
    for (const r of s.racers.values()) {
      r.st.prog = RACE_DIST - 1;
      s.drive(r.id, 0, true);
    }
    let t = 0;
    while (s.phase === 'race' && t < 10_000) { s.step(TICK); t += TICK; }
    while (s.phase === 'final') s.step(TICK);
    assert.equal(s.phase, 'lobby');
    assert.equal(s.heatNo, 2);
    const snap = s.snapshot('h0');
    assert.equal(snap.you.lap, 1);
    assert.equal(snap.you.prog, 0);
  });

  it('2-lap heat snapshot stays ≤1.5KB', () => {
    const s = withRace(2);
    const r = s.racers.get('h0')!;
    r.st.prog = TRACK_LEN + 500; // mid lap 2
    s.step(TICK);
    assert.ok(Buffer.byteLength(JSON.stringify(s.snapshot('h0'))) <= 1536);
  });
});
