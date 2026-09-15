// Steel Swarm headless suite: turret aim, shell ballistics, damage, cooldown,
// no-chomp/no-dash design pins, backfill, snapshot `a` channel.
// Run: npx tsx src/steel.test.ts  (exit 0 = all PASS)
import { SteelRoom } from './steel.js';
import { TUNE, massToRadius } from './types.js';

let failures = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) console.log(`PASS ${name}${extra ? ' — ' + extra : ''}`);
  else { failures++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

const room = new SteelRoom('test');
// Bots only: removePlayer/humans would touch persistScore. Bots never do.
const gunner = room.addPlayer('gunner', 'Gunner', true);
gunner.x = 1000; gunner.y = 1000; gunner.vx = gunner.vy = 0;
gunner.mass = 30; gunner.r = massToRadius(30);
gunner.shieldUntil = 0;
const victim = room.addPlayer('victim', 'Victim', true);
victim.x = 1100; victim.y = 1000; victim.vx = victim.vy = 0;
victim.mass = 30; victim.r = massToRadius(30);
victim.shieldUntil = 0;

function stepShellsUntil(cond: () => boolean, max = 120): number {
  let n = 0;
  while (!cond() && n < max) { room.stepShells(); n++; }
  return n;
}

// 1 — aim stored from input, NaN ignored (gate mirrors validate.ts)
room.handleInput('gunner', 0, 0, 1.57);
check('aim-stored', Math.abs(gunner.aim - 1.57) < 1e-9, `aim=${gunner.aim}`);
room.handleInput('gunner', 0, 0, NaN);
check('aim-nan-ignored', Math.abs(gunner.aim - 1.57) < 1e-9, `aim=${gunner.aim}`);
// touch fallback: no aim + travel east -> turret tracks travel (atan2(0,1)=0)
room.handleInput('gunner', 1, 0, undefined);
check('aim-travel-fallback', Math.abs(gunner.aim - 0) < 1e-9, `aim=${gunner.aim}`);

// 2 — fire spawns a shell toward AIM (not facing): aim east -> vx>500, vy~0
room.handleInput('gunner', 0, 0, 0);
room.tryFire('gunner');
check('fire-spawns-shell', room.shells.length === 1, `shells=${room.shells.length}`);
check('fire-costs-mass', gunner.mass === 28, `mass=${gunner.mass}`);
check('fire-aim-east', (room.shells[0]?.vx ?? 0) > 500 && Math.abs(room.shells[0]?.vy ?? 99) < 60, `vx=${room.shells[0]?.vx} vy=${room.shells[0]?.vy}`);
// aim north -> vy>500 (turret independent of hull: facing untouched by aim)
room.shells.length = 0;
room.tick += TUNE.ORB_COOLDOWN_TICKS;
room.handleInput('gunner', 0, 0, Math.PI / 2);
room.tryFire('gunner');
check('fire-aim-north', (room.shells[0]?.vy ?? 0) > 500 && Math.abs(room.shells[0]?.vx ?? 99) < 60, `vx=${room.shells[0]?.vx} vy=${room.shells[0]?.vy}`);

// 3 — cooldown blocks instant second shot, allows after ORB_COOLDOWN_TICKS
room.tryFire('gunner');
check('cooldown-blocks', room.shells.length === 1, `shells=${room.shells.length}`);
room.tick += TUNE.ORB_COOLDOWN_TICKS;
room.tryFire('gunner');
check('cooldown-releases', room.shells.length === 2, `shells=${room.shells.length}`);

// 4 — per-player shell cap (5): sustained fire never exceeds it
room.shells.length = 0;
for (let i = 0; i < 8; i++) { room.tick += TUNE.ORB_COOLDOWN_TICKS; room.tryFire('gunner'); }
check('shell-cap-player', room.shells.filter(s => s.owner === 'gunner').length <= TUNE.ORB_MAX_PER_PLAYER, `live=${room.shells.length}`);

// 5 — shell damages victim: -ORB_DMG mass, knockback, shell consumed
room.shells.length = 0;
room.handleInput('gunner', 0, 0, 0);
gunner.x = 1000; gunner.y = 1000; gunner.vx = gunner.vy = 0;
victim.x = 1100; victim.y = 1000;
victim.mass = 30; victim.r = massToRadius(30); victim.vx = victim.vy = 0;
victim.alive = true; victim.shieldUntil = 0;
room.tick += TUNE.ORB_COOLDOWN_TICKS;
room.tryFire('gunner');
const ticksToHit = stepShellsUntil(() => victim.mass < 30);
check('shell-damages', victim.mass === 24, `mass=${victim.mass} after ${ticksToHit} shell-steps`);
check('shell-knockback', victim.vx > 0, `vx=${victim.vx.toFixed(1)}`);
check('shell-consumed', room.shells.length === 0, `shells=${room.shells.length}`);
check('victim-survives-chip', victim.alive === true);

// 6 — shell kills low-mass victim: death, killer credit, feed, respawn scheduled
room.shells.length = 0;
victim.alive = true; victim.mass = 7; victim.r = massToRadius(7);
victim.vx = victim.vy = 0; victim.shieldUntil = 0;
room.tick += TUNE.ORB_COOLDOWN_TICKS;
room.tryFire('gunner');
stepShellsUntil(() => !victim.alive);
check('shell-kills', !victim.alive);
check('kill-credit', gunner.kills === 1 && gunner.streak === 1, `kills=${gunner.kills} streak=${gunner.streak}`);
check('kill-feed', room.feed.some(f => f.includes('shelled')), `feed0=${room.feed[0] ?? 'empty'}`);
check('respawn-scheduled', (room.respawns.get('victim') ?? -1) === room.tick + 60);

// 7 — spawn shield eats the shell: no damage, shell dies
room.shells.length = 0;
victim.alive = true; victim.mass = 30; victim.r = massToRadius(30);
victim.vx = victim.vy = 0; victim.shieldUntil = room.tick + 1000;
room.tick += TUNE.ORB_COOLDOWN_TICKS;
room.tryFire('gunner');
stepShellsUntil(() => room.shells.length === 0);
check('shield-blocks', victim.mass === 30 && victim.alive, `mass=${victim.mass}`);
victim.shieldUntil = 0;

// 8 — owner grace: fresh shell never turns around and hits its owner
room.shells.length = 0;
gunner.alive = true; gunner.mass = 30; gunner.r = massToRadius(30);
gunner.x = 1000; gunner.y = 1000; gunner.vx = gunner.vy = 0;
gunner.shieldUntil = 0;
victim.alive = true; victim.mass = 30; victim.r = massToRadius(30);
victim.x = 3000; victim.y = 3000; victim.vx = victim.vy = 0; // far: no interference
victim.shieldUntil = 0;
room.handleInput('gunner', 0, 0, 0);
room.tick += TUNE.ORB_COOLDOWN_TICKS;
const preMass = gunner.mass;
room.tryFire('gunner');
for (let i = 0; i < 6; i++) room.stepShells();
check('owner-grace', gunner.alive && gunner.mass === preMass - TUNE.ORB_MASS_COST, `mass=${gunner.mass}`);

// 9 — min mass gate: runts cannot fire
room.shells.length = 0;
room.tick += TUNE.ORB_COOLDOWN_TICKS;
gunner.mass = 9; gunner.r = massToRadius(9);
room.tryFire('gunner');
check('min-mass-gate', room.shells.length === 0, `shells=${room.shells.length}`);
gunner.mass = 30; gunner.r = massToRadius(30);

// 10 — NO CHOMP (design pin): overlapping giant/small stay alive without shells
{
  const cage = new SteelRoom('nochomp');
  const big = cage.addPlayer('big', 'Big', true);
  big.x = 2000; big.y = 2000; big.vx = big.vy = 0;
  big.mass = 200; big.r = massToRadius(200); big.shieldUntil = 0;
  const small = cage.addPlayer('small', 'Small', true);
  small.x = 2000; small.y = 2000; small.vx = small.vy = 0;
  small.mass = 12; small.r = massToRadius(12); small.shieldUntil = 0;
  for (let i = 0; i < 10; i++) cage.step();
  check('no-chomp', big.alive && small.alive, `big=${big.alive} small=${small.alive}`);
}

// 11 — NO DASH (design pin): movement input never sets dash cooldown or dash cost
{
  const before = gunner.mass;
  const cdBefore = gunner.dashCdUntil;
  room.handleInput('gunner', 1, 0, 0);
  check('no-dash', gunner.dashCdUntil === cdBefore && gunner.mass === before, `cd=${gunner.dashCdUntil} mass=${gunner.mass}`);
}

// 12 — snapshot carries turret `a` per player (what the client renders)
room.shells.length = 0;
room.tick += TUNE.ORB_COOLDOWN_TICKS;
room.handleInput('gunner', 0, 0, 0.78);
victim.x = 1050; victim.y = 1000; // inside AOI: snapshot must carry the turret
const snap = room.snapshot('victim');
const gSnap = snap.players.find(p => p.id === 'gunner');
check('snapshot-aim', gSnap !== undefined && Math.abs((gSnap.a ?? -99) - 0.78) < 0.01, `a=${gSnap?.a}`);
check('snapshot-shells', Array.isArray(snap.orbs), `orbs=${snap.orbs.length}`);

// 13 — backfill: a solo joiner gets a full room fast (anti-idle: 3-per-1s bursts)
{
  const lobby = new SteelRoom('lobby-probe');
  lobby.addPlayer('solo', 'Solo'); // human solo join (addPlayer never touches DB)
  for (let i = 0; i < 60; i++) lobby.step(); // 3s of sim
  const bots = [...lobby.players.values()].filter(p => p.isBot).length;
  check('backfill-fills', bots >= 6, `bots=${bots} after 60 ticks`);
  for (let i = 0; i < 240; i++) lobby.step();
  const bots2 = [...lobby.players.values()].filter(p => p.isBot).length;
  check('backfill-caps', bots2 <= 7, `bots=${bots2} after 300 ticks`);
}

// 14 — firing breaks spawn shield (anti-camp, same as mochi)
{
  const camp = new SteelRoom('camp');
  const c = camp.addPlayer('camper', 'Camper', true);
  c.shieldUntil = camp.tick + 1000;
  camp.tick += TUNE.ORB_COOLDOWN_TICKS;
  camp.tryFire('camper');
  check('fire-breaks-shield', c.shieldUntil === 0 && camp.shells.length === 1);
}

console.log(failures === 0 ? 'ALL STEEL TESTS PASSED' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
