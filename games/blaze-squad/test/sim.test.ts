// games/blaze-squad/test/sim.test.ts — acceptance: movement, fire, zone,
// loot, kills, round flow, budgets. Deterministic clock, no sockets.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BlazeSim, ARENA, MAX_HP, ROUND_MS } from '../sim.js';

const TICK = 50; // 20Hz like the server

function withFight(players = 2): BlazeSim {
  const s = new BlazeSim();
  for (let i = 0; i < players; i++) s.join(`h${i}`, `P${i}`, false);
  let t = 0;
  while (s.phase !== 'fight' && t < 10_000) { s.step(TICK); t += TICK; }
  assert.equal(s.phase, 'fight');
  return s;
}

describe('blaze sim', () => {
  it('lobby waits with no humans; fight starts fast with humans', () => {
    const empty = new BlazeSim();
    for (let i = 0; i < 100; i++) empty.step(TICK);
    assert.equal(empty.phase, 'lobby');
    const s = withFight(1);
    assert.equal(s.phase, 'fight');
    assert.equal(s.crates.length, 12);
  });

  it('movement clamps inside the arena', () => {
    const s = withFight(1);
    const p = s.players.get('h0')!;
    p.x = 50; p.y = 50;
    s.move('h0', 1, 1);
    for (let i = 0; i < 400; i++) s.step(TICK);
    assert.ok(p.x <= ARENA - 2 && p.y <= ARENA - 2);
    assert.ok(p.x >= 2 && p.y >= 2);
  });

  it('garbage move intent is ignored, never NaN', () => {
    const s = withFight(1);
    s.move('h0', NaN, Infinity);
    s.step(TICK);
    const p = s.players.get('h0')!;
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
  });

  it('fire respects the cooldown gate', () => {
    const s = withFight(1);
    assert.equal(s.fire('h0', 0), true);
    assert.equal(s.fire('h0', 0), false); // still cooling
    for (let i = 0; i < 10; i++) s.step(TICK); // 500ms
    assert.equal(s.fire('h0', 0), true);
  });

  it('fire is dead outside fight and for the dead', () => {
    const s = new BlazeSim();
    s.join('h0', 'P0', false);
    assert.equal(s.fire('h0', 0), false); // lobby
    const f = withFight(1);
    const p = f.players.get('h0')!;
    p.hp = 0.5;
    p.x = 0; p.y = 0; // far outside the zone burns
    for (let i = 0; i < 40; i++) f.step(TICK);
    assert.equal(p.alive, false);
    assert.equal(f.fire('h0', 0), false);
  });

  it('bolts fly straight and die off-arena', () => {
    const s = withFight(1);
    const p = s.players.get('h0')!;
    p.x = 50; p.y = 50;
    s.fire('h0', 0);
    const b = s.bolts.find((x) => x.active)!;
    assert.ok(b);
    const x0 = b.x;
    for (let i = 0; i < 4; i++) s.step(TICK);
    assert.ok(b.x > x0);
    for (let i = 0; i < 200; i++) s.step(TICK);
    assert.equal(s.bolts.every((x) => !x.active || x.life > 0), true);
  });

  it('a bolt hit deals damage and credits the kill + feed', () => {
    const s = withFight(2);
    const a = s.players.get('h0')!;
    const b = s.players.get('h1')!;
    a.x = 40; a.y = 50; b.x = 44; b.y = 50;
    b.hp = 10;
    s.fire('h0', 0);
    for (let i = 0; i < 20 && b.alive; i++) s.step(TICK);
    assert.equal(b.alive, false);
    assert.equal(a.kills, 1);
    assert.ok(s.feed.some((f) => f.includes('P0') && f.includes('P1')));
  });

  it('owner never hits themselves', () => {
    const s = withFight(1);
    const p = s.players.get('h0')!;
    p.x = 50; p.y = 50;
    const hp = p.hp;
    s.fire('h0', Math.PI); // fires away, bolt spawns on top of owner
    for (let i = 0; i < 4; i++) s.step(TICK);
    assert.equal(p.hp, hp); // self-immune (spawn overlap must not count)
  });

  it('the zone shrinks on schedule and burns outsiders', () => {
    const s = withFight(1);
    const r0 = s.zone.r;
    for (let i = 0; i < 620; i++) s.step(TICK); // 31s
    assert.ok(s.zone.r < r0);
    const p = s.players.get('h0')!;
    p.x = 2; p.y = 2; // corner, far outside r=44 around (50,50)
    const hp = p.hp;
    for (let i = 0; i < 20; i++) s.step(TICK);
    assert.ok(p.hp < hp);
  });

  it('loot heals the hurt, capped at max', () => {
    const s = withFight(1);
    const p = s.players.get('h0')!;
    const c = s.crates[0]!;
    p.hp = 40;
    p.x = c.x; p.y = c.y;
    s.step(TICK);
    assert.equal(c.taken, true);
    assert.equal(p.hp, 70);
    const c2 = s.crates[1]!;
    p.hp = 95;
    p.x = c2.x; p.y = c2.y;
    s.step(TICK);
    assert.equal(p.hp, MAX_HP);
  });

  it('last blob popping ends the round with a crown', () => {
    const s = withFight(2);
    const b = s.players.get('h1')!;
    b.hp = 1;
    const a = s.players.get('h0')!;
    a.x = 40; a.y = 50; b.x = 43; b.y = 50;
    s.fire('h0', 0);
    let t = 0;
    while (s.phase === 'fight' && t < 10_000) { s.step(TICK); t += TICK; }
    assert.equal(s.phase, 'final');
    assert.ok(s.feed.some((f) => f.includes('🏆')));
  });

  it('timeout crowns most kills, then a fresh round resets', () => {
    const s = withFight(2);
    // park both in the zone so nobody burns; no firing
    for (const p of s.players.values()) { p.x = 50; p.y = 50; s.move(p.id, 0, 0); }
    let t = 0;
    while (s.phase === 'fight' && t < ROUND_MS + 10_000) { s.step(TICK); t += TICK; }
    assert.equal(s.phase, 'final');
    while (s.phase === 'final') s.step(TICK);
    assert.equal(s.phase, 'lobby');
    assert.equal(s.roundNo, 2);
    for (const p of s.players.values()) assert.equal(p.hp, MAX_HP);
  });

  it('snapshot is small and carries everything the client needs', () => {
    const s = withFight(2);
    const bytes = Buffer.byteLength(JSON.stringify(s.snapshot('h0')));
    assert.ok(bytes <= 1536, `blaze snapshot ${bytes}B > 1.5KB`);
    const snap = s.snapshot('h0');
    assert.equal(snap.t, 'blaze');
    assert.equal(snap.players.length, 2);
    assert.ok(snap.zone.r > 0);
  });

  it('deterministic: same joins + inputs, same end state', () => {
    const run = (): number => {
      const s = new BlazeSim();
      s.join('h0', 'A', false);
      s.join('h1', 'B', false);
      let t = 0;
      while (s.phase !== 'fight' && t < 10_000) { s.step(TICK); t += TICK; }
      s.move('h0', 1, 0);
      s.fire('h0', 0.3);
      for (let i = 0; i < 100; i++) s.step(TICK);
      return Math.round(s.players.get('h0')!.x * 1000) + Math.round(s.players.get('h0')!.hp * 7);
    };
    assert.equal(run(), run());
  });

  it('ReplayMoment validates via share asserts and re-enters play', async () => {
    const { assertArtifact } = await import('../../../packages/share/src/index.js');
    const s = withFight(2);
    const m = s.moment('ABCD', 'https://x.test');
    assert.deepEqual(assertArtifact(m), []);
    assert.ok((m.url as string).includes('blaze-squad'));
  });
});
