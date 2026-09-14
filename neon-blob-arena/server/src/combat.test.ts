// Headless combat test: deterministic coverage for the orb path Vikram flagged
// (random-aim soak clients rarely land orb HITS). No sockets, no DB, no timers.
// Run: npx tsx src/combat.test.ts  (exit 0 = all PASS)
import { Room } from './game.js';
import { TUNE, massToRadius } from './types.js';

let failures = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) console.log(`PASS ${name}${extra ? ' — ' + extra : ''}`);
  else { failures++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

const room = new Room('test');
// Bots only: removePlayer/humans would touch persistScore. Bots never do.
const shooter = room.addPlayer('shooter', 'Shooter', true);
shooter.x = 1000; shooter.y = 1000; shooter.vx = shooter.vy = 0;
shooter.mass = 30; shooter.r = massToRadius(30);
shooter.fx = 1; shooter.fy = 0; shooter.shieldUntil = 0;
const victim = room.addPlayer('victim', 'Victim', true);
victim.x = 1100; victim.y = 1000; victim.vx = victim.vy = 0;
victim.mass = 30; victim.r = massToRadius(30);
victim.shieldUntil = 0;

function stepOrbsUntil(cond: () => boolean, max = 120): number {
  let n = 0;
  while (!cond() && n < max) { room.stepOrbs(); n++; }
  return n;
}

// 1 — fire spawns an orb toward facing, costs mass
room.tryFire('shooter');
check('fire-spawns-orb', room.orbs.length === 1, `orbs=${room.orbs.length}`);
check('fire-costs-mass', shooter.mass === 28, `mass=${shooter.mass}`);
check('fire-direction', (room.orbs[0]?.vx ?? 0) > 500, `vx=${room.orbs[0]?.vx}`);

// 2 — cooldown blocks instant second shot, allows after ORB_COOLDOWN_TICKS
room.tryFire('shooter');
check('cooldown-blocks', room.orbs.length === 1, `orbs=${room.orbs.length}`);
room.tick += TUNE.ORB_COOLDOWN_TICKS;
room.tryFire('shooter');
check('cooldown-releases', room.orbs.length === 2, `orbs=${room.orbs.length}`);

// 3 — orb damages victim: -ORB_DMG mass, knockback, orb consumed
room.orbs.length = 0;
victim.mass = 30; victim.r = massToRadius(30); victim.vx = victim.vy = 0;
victim.alive = true; victim.shieldUntil = 0;
room.tick += TUNE.ORB_COOLDOWN_TICKS;
room.tryFire('shooter'); // shooter 26 -> 24
const ticksToHit = stepOrbsUntil(() => victim.mass < 30);
check('orb-damages', victim.mass === 24, `mass=${victim.mass} after ${ticksToHit} orb-steps`);
check('orb-knockback', victim.vx > 0, `vx=${victim.vx.toFixed(1)}`);
check('orb-consumed', room.orbs.length === 0, `orbs=${room.orbs.length}`);
check('victim-survives-chip', victim.alive === true);

// 4 — orb kills low-mass victim: death, killer credit, feed, respawn scheduled
room.orbs.length = 0;
victim.alive = true; victim.mass = 7; victim.r = massToRadius(7);
victim.vx = victim.vy = 0; victim.shieldUntil = 0;
room.tick += TUNE.ORB_COOLDOWN_TICKS;
room.tryFire('shooter'); // shooter 24 -> 22
stepOrbsUntil(() => !victim.alive);
// NOTE: `!victim.alive`, never `=== false` — TS 5.9 narrows the line-57
// assignment across the opaque helper call and errors on the literal compare.
// Deploy builds on floating latest-TS, so test code must be narrowing-proof.
check('orb-kills', !victim.alive);
check('kill-credit', shooter.kills === 1 && shooter.streak === 1, `kills=${shooter.kills} streak=${shooter.streak}`);
check('kill-feed', room.feed.some(f => f.includes('blasted')), `feed0=${room.feed[0] ?? 'empty'}`);
check('respawn-scheduled', (room.respawns.get('victim') ?? -1) === room.tick + 60);

// 5 — spawn shield eats the orb: no damage, orb dies
room.orbs.length = 0;
victim.alive = true; victim.mass = 30; victim.r = massToRadius(30);
victim.vx = victim.vy = 0; victim.shieldUntil = room.tick + 1000;
room.tick += TUNE.ORB_COOLDOWN_TICKS;
room.tryFire('shooter'); // shooter 22 -> 20
stepOrbsUntil(() => room.orbs.length === 0);
check('shield-blocks', victim.mass === 30 && victim.alive, `mass=${victim.mass}`);
victim.shieldUntil = 0;

// 6 — owner grace: fresh orb never turns around and hits its owner
room.orbs.length = 0;
room.tick += TUNE.ORB_COOLDOWN_TICKS;
const preMass = shooter.mass;
room.tryFire('shooter');
for (let i = 0; i < 6; i++) room.stepOrbs();
check('owner-grace', shooter.alive && shooter.mass === preMass - TUNE.ORB_MASS_COST, `mass=${shooter.mass}`);

// 7 — min mass gate: runts cannot fire
room.orbs.length = 0;
room.tick += TUNE.ORB_COOLDOWN_TICKS;
shooter.mass = 9; shooter.r = massToRadius(9);
room.tryFire('shooter');
check('min-mass-gate', room.orbs.length === 0, `orbs=${room.orbs.length}`);
shooter.mass = 30; shooter.r = massToRadius(30);

// 8 — snapshot carries live orbs (what the 3D client renders)
room.orbs.length = 0;
room.tick += TUNE.ORB_COOLDOWN_TICKS;
room.tryFire('shooter');
const snap = room.snapshot('shooter');
check('snapshot-orbs', snap.orbs.length >= 1, `orbs=${snap.orbs.length}`);

// 9 — hunter AI fires at mid-range humans (violent angle-cutter path)
room.orbs.length = 0;
const h1 = room.addPlayer('human1', 'Human1'); h1.x = 2000; h1.y = 2000; h1.shieldUntil = 0;
const h2 = room.addPlayer('human2', 'Human2'); h2.x = 2100; h2.y = 2000; h2.shieldUntil = 0;
room.ensureHunters();
const hunter = [...room.players.values()].find(p => p.hunter);
check('hunter-spawns', !!hunter, `hunters=${[...room.players.values()].filter(p => p.hunter).length}`);
if (hunter) {
  hunter.x = 1700; hunter.y = 2000; hunter.fireCdUntil = 0;
  const before = room.orbs.length;
  room.hunterAI(hunter);
  const fired = room.orbs.length === before + 1 && room.orbs[room.orbs.length - 1]?.owner === hunter.id;
  check('hunter-fires', fired, `orbs=${room.orbs.length}`);
  room.players.delete(hunter.id);
}
room.players.delete('human1'); room.players.delete('human2'); // no removePlayer: skips persistScore

// 10 — respawn: the orb victim comes back with starter mass + fresh shield
room.orbs.length = 0;
victim.alive = true; victim.mass = 7; victim.r = massToRadius(7);
victim.vx = victim.vy = 0; victim.shieldUntil = 0;
room.tick += TUNE.ORB_COOLDOWN_TICKS;
room.tryFire('shooter');
stepOrbsUntil(() => !victim.alive);
const respawnAt = room.respawns.get('victim') ?? -1;
let guard = 0;
while (!victim.alive && guard++ < 90) room.step();
check('respawn-revives', victim.alive === true, `at tick=${room.tick} (due ${respawnAt})`);
check('respawn-mass', victim.mass === TUNE.START_MASS, `mass=${victim.mass}`);
check('respawn-shield', victim.shieldUntil > room.tick, `shieldUntil=${victim.shieldUntil} tick=${room.tick}`);

// 11 — snapshot byte profile (binary-protocol decision data, QA budget: <=12KB green)
for (let i = 0; i < 24; i++) {
  const b = room.addPlayer('crowd' + i, 'Crowd' + i, true);
  b.x = 800 + (i % 6) * 80; b.y = 800 + Math.floor(i / 6) * 80;
  b.shieldUntil = 0;
}
shooter.mass = 30; shooter.r = massToRadius(30);
for (let i = 0; i < 3; i++) { room.tick += TUNE.ORB_COOLDOWN_TICKS; room.tryFire('shooter'); }
const full = room.snapshot('shooter');
const bytes = Buffer.byteLength(JSON.stringify(full));
console.log(`PROFILE players=${full.players.length} pellets=${full.pellets.length} orbs=${full.orbs.length} bytes=${bytes}`);
check('snapshot-bytes-green', bytes <= 12 * 1024, `${bytes}B vs 12KB green budget`);

console.log(failures === 0 ? 'ALL COMBAT TESTS PASSED' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
