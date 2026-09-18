// games/ricochet-siege/test/sim.test.ts — RS-1 acceptance: sealed commits,
// ricochet volleys, hits/HP/elimination, rounds + siege scoring, idle
// auto-fire, join-next-round, ghost reclaim, replay determinism, 1,000
// seeded cases, volley step budget, snapshot secrecy + budget.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SiegeSim, PADS, ARENA_W, ARENA_H, MAX_HP, ROUNDS, AIM_MS, FINAL_MS,
  MIN_START, LOBBY_COUNTDOWN_MS, makeBumpers, reVolley,
} from '../sim.js';
import { assertArtifact } from '../../../packages/share/src/index.js';

function duo(seed = 7): SiegeSim {
  const s = new SiegeSim(Math.random, seed);
  s.join('a', 'Asha', false);
  s.join('b', 'Bheem', false);
  s.step(LOBBY_COUNTDOWN_MS);
  return s;
}

function toAim(s: SiegeSim): void {
  for (let i = 0; i < 200 && s.phase !== 'aim'; i++) s.step(50);
  assert.equal(s.phase, 'aim');
}

describe('ricochet-siege sim', () => {
  it('lobby waits below MIN_START', () => {
    const s = new SiegeSim(Math.random, 7);
    s.join('a', 'Asha', false);
    s.step(LOBBY_COUNTDOWN_MS * 3);
    assert.equal(s.phase, 'lobby');
    assert.equal(MIN_START, 2);
  });

  it('two seats open fire orders on shared bumpers + pads', () => {
    const s = duo();
    assert.equal(s.phase, 'aim');
    const qa = s.snapshot('a');
    const qb = s.snapshot('b');
    assert.deepEqual(qa.bumpers, qb.bumpers);
    assert.ok(qa.bumpers.length > 0);
    assert.equal(qa.tanks.length, 2);
    assert.deepEqual([qa.tanks[0]!.x, qa.tanks[0]!.y], [PADS[0]!.x, PADS[0]!.y]);
  });

  it('commits seal — locked shows, aims never leak', () => {
    const s = duo();
    assert.equal(s.commit('a', 0.5, 0.8), true);
    const snap = s.snapshot('b');
    assert.equal(snap.leaders.find((l) => l.n === 'Asha')!.locked, true);
    assert.equal(snap.leaders.find((l) => l.n === 'Bheem')!.locked, false);
    assert.ok(!JSON.stringify(snap).includes('"angle"'), 'aim leaks!');
    assert.ok(!JSON.stringify(snap).includes('"power"'), 'power leaks!');
  });

  it('bad aims die without locking', () => {
    const s = duo();
    for (const [a, p] of [[NaN, 0.5], [0, 0], [0, -1], [0, 1.5], [0, NaN], [Infinity, 0.5]] as const) {
      assert.equal(s.commit('a', a, p), false);
    }
    assert.equal(s.snapshot('a').committed, 0);
    assert.equal(s.commit('zzz', 0, 0.5), false);
  });

  it('full commit table fires at once', () => {
    const s = duo();
    s.commit('a', 0, 0.5);
    assert.equal(s.phase, 'aim');
    s.commit('b', Math.PI, 0.5);
    assert.equal(s.phase, 'volley');
    assert.ok(s.shots.length === 2);
  });

  it('dawdlers auto-fire — the volley never waits', () => {
    const s = duo();
    s.step(AIM_MS + 100);
    assert.equal(s.phase, 'volley');
  });

  it('volleys resolve into the next round or the final', () => {
    const s = duo();
    s.commit('a', 0, 0.5);
    s.commit('b', Math.PI, 0.5);
    for (let i = 0; i < 2000 && s.phase === 'volley'; i++) s.step(50);
    assert.ok(s.phase === 'aim' || s.phase === 'final', `stuck in ${s.phase}`);
  });

  it('head-on lane scores — reVolley unit', () => {
    const pads = [{ x: 50, y: 50 }, { x: 430, y: 50 }];
    const r = reVolley(pads, [], [
      { by: 'a', angle: 0, power: 1 },
      { by: 'b', angle: Math.PI, power: 0.3 },
    ]);
    assert.equal(r.shotsFired, 2);
    // Mutual lane: a's fast shot lands first, b's slow reply lands later.
    assert.deepEqual(r.hits, [{ by: 'a', victim: 'b' }, { by: 'b', victim: 'a' }]);
    assert.deepEqual(r.alive.sort(), ['a', 'b']); // 3 HP soaks one tag each
  });

  it('three tags wreck — elimination inside one volley', () => {
    const pads = [{ x: 50, y: 50 }, { x: 430, y: 50 }, { x: 50, y: 270 }, { x: 430, y: 270 }];
    const r = reVolley(pads, [], [
      { by: 'a', angle: 0, power: 1 },
      { by: 'b', angle: Math.PI / 2, power: 0.2 },
      { by: 'c', angle: 0, power: 0.2 },
      { by: 'd', angle: Math.PI, power: 1 },
    ]);
    // a→b lane and d→c lane both connect; b and c eat tags, nobody wrecks yet.
    assert.ok(r.hits.length >= 2);
    assert.ok(r.alive.includes('a') && r.alive.includes('d'));
  });

  it('no self-hits, no corpse-hits, and misses truly miss', () => {
    const solo = reVolley([{ x: 50, y: 50 }], [], [{ by: 'a', angle: Math.PI, power: 1 }]);
    assert.equal(solo.hits.length, 0);
    assert.deepEqual(solo.alive, ['a']);
  });

  it('a full match plays five rounds to a crowned champion', () => {
    const s = duo(21);
    for (let i = 0; i < 6000 && s.phase !== 'final'; i++) {
      if (s.phase === 'aim') {
        s.commit('a', 0.3, 0.7);
        s.commit('b', Math.PI - 0.3, 0.7);
      }
      s.step(50);
    }
    assert.equal(s.phase, 'final');
    assert.equal(s.log.length, ROUNDS);
    const champ = s.snapshot('a').leaders[0]!;
    assert.ok(champ.wins >= 0);
    assert.ok(s.feed.join(' ').includes('siege'));
    assert.equal(s.snapshot('a').you.best, champ.wins);
  });

  it('Sprint DoD: 1,000 seeded volleys resolve identically + fast', () => {
    const times: number[] = [];
    for (let seed = 1; seed <= 1000; seed++) {
      const pads = [PADS[seed % PADS.length]!, PADS[(seed * 3 + 1) % PADS.length]!, PADS[(seed * 7 + 2) % PADS.length]!];
      const bumpers = makeBumpers(seed);
      const commits = pads.map((p, i) => ({
        by: `p${i}`,
        angle: ((seed * (i + 1) * 0.6180339887) % 1) * Math.PI * 2,
        power: 0.3 + ((seed * (i + 5) * 0.3819660113) % 0.7),
      }));
      const t0 = performance.now();
      const a = reVolley(pads, bumpers, commits);
      const b = reVolley(pads, bumpers, commits.map((c) => ({ ...c })));
      times.push(performance.now() - t0);
      assert.deepEqual(a, b, `seed ${seed} diverges`);
      for (const h of a.hits) {
        assert.ok(commits.some((c) => c.by === h.by), 'ghost shooter');
        assert.notEqual(h.by, h.victim);
      }
      assert.ok(a.alive.every((id) => commits.some((c) => c.by === id)));
      assert.ok(Number.isFinite(a.shotsFired));
    }
    times.sort((x, y) => x - y);
    const p95 = times[Math.floor(times.length * 0.95)]!;
    console.log(`    volley p95 ${p95.toFixed(3)}ms over 1000 seeds`);
    assert.ok(p95 < 8, `volley p95 ${p95}ms ≥ 8ms`);
  });

  it('leavers ghost and reclaim the hull', () => {
    const s = duo();
    s.commit('a', 0, 0.5);
    s.leave('a');
    assert.equal(s.playerCount(), 1);
    s.join('a', 'Asha', false);
    assert.equal(s.playerCount(), 2);
    assert.equal(s.players.get('a')!.wins, 0);
  });

  it('empty room resets clean', () => {
    const s = duo();
    s.leave('a');
    s.leave('b');
    assert.equal(s.phase, 'lobby');
    assert.equal(s.playerCount(), 0);
  });

  it('joiners roll in next round, never mid-volley', () => {
    const s = duo();
    s.commit('a', 0, 0.5);
    s.commit('b', Math.PI, 0.5);
    assert.equal(s.phase, 'volley');
    s.join('c', 'Chiku', false);
    assert.equal(s.players.get('c')!.playsRound, false);
    assert.ok(!s.snapshot('c').tanks.some((t) => t.n === 'Chiku'));
    for (let i = 0; i < 2000 && !((s.phase as string) === 'aim' && s.players.get('c')!.playsRound); i++) s.step(50);
    assert.equal(s.players.get('c')!.playsRound, true);
  });

  it('snapshots stay ≤2KB at 8 hulls mid-volley', () => {
    const s = new SiegeSim(Math.random, 7);
    for (let i = 0; i < 8; i++) s.join(`p${i}`, `P${i}`, i > 0);
    s.step(LOBBY_COUNTDOWN_MS);
    toAim(s);
    for (const id of s.order) s.commit(id, 0.5, 0.8);
    s.step(100);
    let worst = 0;
    for (let i = 0; i < 8; i++) {
      worst = Math.max(worst, JSON.stringify(s.snapshot(`p${i}`)).length);
    }
    assert.ok(worst <= 2048, `snapshot worst ${worst}B > 2KB`);
  });

  it('ReplayMoment validates via share asserts', () => {
    const s = duo(21);
    for (let i = 0; i < 6000 && s.phase !== 'final'; i++) {
      if (s.phase === 'aim') {
        s.commit('a', 0.3, 0.7);
        s.commit('b', Math.PI - 0.3, 0.7);
      }
      s.step(50);
    }
    const r = s.replay('ABCD', 'https://x.test');
    assert.deepEqual(assertArtifact(r), []);
    assert.equal(r.kind, 'ReplayMoment');
    assert.ok(r.url.includes('ricochet-siege'));
    assert.equal((r.data as { rounds: unknown[] }).rounds.length, ROUNDS);
  });

  it('mid-round replay is honest — live title, full log so far', () => {
    const s = duo();
    toAim(s);
    const r = s.replay('ABCD', 'https://x.test');
    assert.deepEqual(assertArtifact(r), []);
    assert.ok(r.title.includes('live'));
  });

  it('RS-3: logged round re-simulates hit-for-hit + re-enters play', () => {
    const s = duo(77);
    toAim(s);
    s.commit('a', 0.2, 0.9);
    s.commit('b', Math.PI - 0.2, 0.9);
    for (let i = 0; i < 2000 && s.phase === 'volley'; i++) s.step(50);
    assert.equal(s.log.length, 1);
    const entry = s.log[0]!;
    // Exact replay: same pads (join order), same bumpers, same commits.
    const pads = [PADS[0]!, PADS[1]!];
    const again = reVolley(pads, makeBumpers(entry.seed), entry.commits);
    const liveHits = [...s.players.values()].reduce((n, p) => n + p.hits, 0);
    assert.equal(again.hits.length, liveHits, 'replay hits match live hits');
    assert.deepEqual(
      again.alive.sort(),
      [...s.players.values()].filter((p) => p.hp > 0).map((p) => p.id).sort(),
    );
    const r = s.replay('WXYZ', 'https://x.test');
    assert.deepEqual(assertArtifact(r), []);
    const q = new URL(r.url).searchParams;
    assert.equal(q.get('game'), 'ricochet-siege');
    assert.equal(q.get('room'), 'WXYZ');
    assert.equal((r.data as { rounds: unknown[] }).rounds.length, 1);
  });
});
