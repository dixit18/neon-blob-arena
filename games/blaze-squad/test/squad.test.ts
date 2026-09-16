// games/blaze-squad/test/squad.test.ts — BZ-2 acceptance: squads of 3,
// friendly-fire off, last-squad-standing, tiered loot, budgets.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BlazeSim, MAX_HP, ROUND_MS } from '../sim.js';
import { createBlazeDriver } from '../driver.js';

const TICK = 50;

function withFight(n = 3): BlazeSim {
  const s = new BlazeSim();
  for (let i = 0; i < n; i++) s.join(`h${i}`, `P${i}`, false);
  let t = 0;
  while (s.phase !== 'fight' && t < 10_000) { s.step(TICK); t += TICK; }
  assert.equal(s.phase, 'fight');
  return s;
}

/** h0 shoots h1 dead (same lane, point-blank). */
function shootDead(s: BlazeSim, by: string, victim: string): void {
  const a = s.players.get(by)!;
  const b = s.players.get(victim)!;
  b.hp = 10;
  a.x = 40; a.y = 50; b.x = 44; b.y = 50;
  s.move(by, 0, 0);
  s.fire(by, 0);
  let t = 0;
  while (b.alive && t < 5000) { s.step(TICK); t += TICK; }
  assert.equal(b.alive, false);
}

describe('blaze squads', () => {
  it('squads deal round-robin 0/1/2, balanced across joins', () => {
    const s = new BlazeSim();
    for (let i = 0; i < 6; i++) s.join(`p${i}`, `N${i}`, i % 2 === 0);
    const sq = (id: string): number => s.players.get(id)!.sq;
    assert.deepEqual([sq('p0'), sq('p1'), sq('p2'), sq('p3'), sq('p4'), sq('p5')], [0, 1, 2, 0, 1, 2]);
  });

  it('friendly fire is OFF: bolts pass squadmates, kill enemies', () => {
    const s = withFight(4); // h0,h3 sq0 · h1 sq1 · h2 sq2
    const mate = s.players.get('h3')!;
    const foe = s.players.get('h1')!;
    foe.hp = 10;
    const a = s.players.get('h0')!;
    a.x = 40; a.y = 50; mate.x = 42; mate.y = 50; foe.x = 44; foe.y = 50;
    const mateHp = mate.hp;
    s.fire('h0', 0);
    let t = 0;
    while (foe.alive && t < 5000) { s.step(TICK); t += TICK; }
    assert.equal(foe.alive, false);
    assert.equal(mate.hp, mateHp); // untouched mid-flight
  });

  it('the zone burns squadmates too — no team immunity', () => {
    const s = withFight(2);
    const p = s.players.get('h0')!;
    p.x = 2; p.y = 2;
    const hp = p.hp;
    for (let i = 0; i < 20; i++) s.step(TICK);
    assert.ok(p.hp < hp);
  });

  it('wiping every rival squad ends the round with a squad crown', () => {
    const s = withFight(3); // sq 0,1,2
    shootDead(s, 'h0', 'h1');
    for (let i = 0; i < 10; i++) s.step(TICK); // clear cooldown
    shootDead(s, 'h0', 'h2');
    let t = 0;
    while (s.phase === 'fight' && t < 10_000) { s.step(TICK); t += TICK; }
    assert.equal(s.phase, 'final');
    assert.ok(s.feed.some((f) => f.includes('🏆') && f.includes('Ember')), s.feed.join('|'));
    assert.ok(s.feed.some((f) => f.includes('MVP') && f.includes('P0')));
  });

  it('timeout crowns the top-kill squad, MVP named', () => {
    const s = withFight(3);
    shootDead(s, 'h0', 'h1'); // sq0: 1 kill, sq2 alive → fight continues
    assert.equal(s.phase, 'fight');
    for (const p of s.players.values()) { p.x = 50; p.y = 50; s.move(p.id, 0, 0); }
    let t = 0;
    while (s.phase === 'fight' && t < ROUND_MS + 10_000) { s.step(TICK); t += TICK; }
    assert.equal(s.phase, 'final');
    assert.ok(s.feed.some((f) => f.includes('🏆') && f.includes('Ember')));
  });

  it('a no-survivor wipe stays honest — quiet, no fake crown', () => {
    const s = withFight(2);
    for (const p of s.players.values()) { p.hp = 5; p.x = 2; p.y = 2; s.move(p.id, 0, 0); }
    let t = 0;
    while (s.phase === 'fight' && t < 30_000) { s.step(TICK); t += TICK; }
    assert.equal(s.phase, 'final');
    assert.ok(!s.feed.some((f) => f.includes('🏆')));
  });

  it('gold crate: full heal + rapid-fire halves the cooldown', () => {
    const s = withFight(2);
    const p = s.players.get('h0')!;
    const gold = s.crates.find((c) => c.tier === 1 && !c.taken)!;
    assert.ok(gold);
    p.hp = 40;
    p.x = gold.x; p.y = gold.y;
    s.step(TICK);
    assert.equal(gold.taken, true);
    assert.equal(p.hp, MAX_HP);
    assert.ok(p.rapidUntil > s.time);
    assert.equal(s.fire('h0', 0), true);
    for (let i = 0; i < 5; i++) s.step(TICK); // 250ms: rapid cd is 200
    assert.equal(s.fire('h0', 0), true);
  });

  it('without gold the same 250ms gap is still cooling', () => {
    const s = withFight(2);
    assert.equal(s.fire('h0', 0), true);
    for (let i = 0; i < 5; i++) s.step(TICK);
    assert.equal(s.fire('h0', 0), false); // normal cd is 400
  });

  it('rapid expires after 12s', () => {
    const s = withFight(2);
    const p = s.players.get('h0')!;
    p.rapidUntil = s.time + 100;
    for (let i = 0; i < 4; i++) s.step(TICK); // 200ms > rapid left
    assert.equal(s.fire('h0', 0), true);
    for (let i = 0; i < 5; i++) s.step(TICK);
    assert.equal(s.fire('h0', 0), false); // back to 400ms cd
  });

  it('green crates wait for the hurt; gold refreshes rapid at full hp', () => {
    const s = withFight(1);
    const p = s.players.get('h0')!;
    const green = s.crates.find((c) => c.tier === 0)!;
    p.x = green.x; p.y = green.y;
    s.step(TICK);
    assert.equal(green.taken, false); // full hp: leave it
    p.hp = 50;
    s.step(TICK);
    assert.equal(green.taken, true);
    const gold = s.crates.find((c) => c.tier === 1 && !c.taken)!;
    p.hp = MAX_HP; p.rapidUntil = 0;
    p.x = gold.x; p.y = gold.y;
    s.step(TICK);
    assert.equal(gold.taken, true);
    assert.ok(p.rapidUntil > s.time);
  });

  it('snapshot carries squads + untaken crates, stays ≤1.5KB full', () => {
    const s = new BlazeSim();
    s.join('h0', 'Hero', false);
    for (let i = 1; i < 9; i++) s.join(`b${i}`, `Bot${i}`, true);
    let t = 0;
    while (s.phase !== 'fight' && t < 10_000) { s.step(TICK); t += TICK; }
    const snap = s.snapshot('h0');
    assert.equal(snap.players.length, 9);
    assert.ok(snap.players.every((p) => p.q >= 0 && p.q <= 2));
    assert.equal(snap.crates.length, 12);
    assert.ok(snap.crates.some((c) => c.t === 1));
    assert.ok(Buffer.byteLength(JSON.stringify(snap)) <= 1536);
  });

  it('driver: bots spare squadmates, snapshots carry squads + crates', () => {
    const d = createBlazeDriver(() => 0.5);
    d.join({ id: 'h1', name: 'Ria', isBot: false });
    for (let i = 0; i < 40; i++) d.step(1 / 20);
    const snap = d.snapshot('h1') as unknown as {
      players: { q: number; bot: boolean }[]; crates: unknown[];
    };
    assert.ok(snap.players.length >= 4);
    assert.ok(snap.players.every((p) => p.q >= 0 && p.q <= 2));
    assert.ok(snap.crates.length > 0);
  });

  it('BZ-3: snapshot carries rapidMs — 0 normally, counting down on gold', () => {
    const s = withFight(1);
    assert.equal(s.snapshot('h0').you.rapidMs, 0);
    const p = s.players.get('h0')!;
    const gold = s.crates.find((c) => c.tier === 1 && !c.taken)!;
    p.hp = 40;
    p.x = gold.x; p.y = gold.y;
    s.step(TICK);
    const snap = s.snapshot('h0');
    assert.ok(snap.you.rapidMs > 11_000 && snap.you.rapidMs <= 12_000);
    assert.ok(Buffer.byteLength(JSON.stringify(snap)) <= 1536);
  });
});
