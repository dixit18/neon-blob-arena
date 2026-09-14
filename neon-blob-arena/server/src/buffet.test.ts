// Black-Hole Buffet headless tests: deterministic wells, gravity, devour+credit,
// shields, dash, backfill, snapshot shape. Run: npx tsx src/buffet.test.ts
import { BuffetRoom, wellPos, WELL_COUNT } from './buffet.js';
import { TUNE, massToRadius } from './types.js';

let failures = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) console.log(`PASS ${name}${extra ? ' — ' + extra : ''}`);
  else { failures++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

check('well-count', WELL_COUNT === 3);
{
  const a = wellPos(0, 0), b = wellPos(0, 0);
  check('well-deterministic', a.x === b.x && a.y === b.y, `(${a.x.toFixed(0)},${a.y.toFixed(0)})`);
  const c = wellPos(0, 600);
  check('well-wanders', Math.hypot(c.x - a.x, c.y - a.y) > 50, `moved ${Math.hypot(c.x - a.x, c.y - a.y).toFixed(0)}px in 30s`);
  check('well-in-arena', a.x > 100 && a.x < 3900 && a.y > 100 && a.y < 3900);
}

const room = new BuffetRoom('test');
const me = room.addPlayer('me', 'Me'); // human: no bot AI (deterministic physics)
me.x = 2000; me.y = 2000; me.vx = me.vy = 0; me.shieldUntil = 0;

// 1 — gravity drags toward the well (velocity first, then positions converge)
{
  const w = wellPos(0, room.tick);
  me.x = w.x + 300; me.y = w.y; me.vx = me.vy = 0;
  for (let i = 0; i < 10; i++) room.gravity(); // gravity writes velocity; integrate moves
  check('gravity-pulls', me.vx < -50 && Math.abs(me.vy) < 1, `vx=${me.vx.toFixed(0)}`);
  const d0 = Math.hypot(w.x - me.x, w.y - me.y);
  for (let i = 0; i < 10; i++) room.step();
  const w2 = wellPos(0, room.tick);
  const d1 = Math.hypot(w2.x - me.x, w2.y - me.y);
  check('gravity-converges', d1 < d0 && me.alive, `${d0.toFixed(0)} → ${d1.toFixed(0)}`);
}

// 2 — horizon kill with beneficiary credit + feed + respawn
const lunch = room.addPlayer('lunch', 'Lunch'); // human: bots would dodge-dash away (flaky)
const w0 = wellPos(1, room.tick);
lunch.x = w0.x; lunch.y = w0.y; lunch.vx = lunch.vy = 0;
lunch.mass = 12; lunch.r = massToRadius(12); lunch.shieldUntil = 0;
const diner = room.addPlayer('diner', 'Diner'); // human: stays put for credit check
diner.x = w0.x + 300; diner.y = w0.y; diner.vx = diner.vy = 0;
diner.mass = 20; diner.r = massToRadius(20); diner.shieldUntil = 0;
room.step();
check('void-kills', !lunch.alive);
check('void-credit', diner.kills === 1 && diner.mass > 20, `kills=${diner.kills} mass=${diner.mass}`);
check('void-feed', room.feed.some(f => f.includes('void')), `feed0=${room.feed[0] ?? 'empty'}`);
check('void-respawn', (room.respawns.get('lunch') ?? -1) > room.tick);

// 3 — shields hold vs the void
const tank = room.addPlayer('tank', 'Tank'); // human: true shield test (bots flee)
const w1 = wellPos(2, room.tick);
tank.x = w1.x; tank.y = w1.y; tank.vx = tank.vy = 0;
tank.shieldUntil = room.tick + 1000;
room.step();
check('void-shield', tank.alive === true);

// 4 — dash escapes pull (impulse + cooldown + mass cost)
me.x = 2000; me.y = 2000; me.vx = me.vy = 0; me.alive = true;
const dm0 = me.mass; // pellet snacking may have fattened me; dash must still cost
room.handleInput('me', 1, 0, true);
check('buffet-dash', me.vx > 300 && room.tick < me.dashCdUntil && me.mass < dm0, `vx=${me.vx.toFixed(0)} mass=${me.mass}`);

// 5 — backfill fills fast, caps clean
{
  const lobby = new BuffetRoom('lobby');
  lobby.addPlayer('solo', 'Solo');
  for (let i = 0; i < 60; i++) lobby.step();
  const bots = [...lobby.players.values()].filter(p => p.isBot).length;
  check('buffet-backfill', bots >= 6, `bots=${bots}`);
}

// 6 — snapshot carries wells; byte profile for the binary debate
{
  const snap = room.snapshot('me');
  const wells = snap.wells ?? [];
  check('snap-wells', wells.length === 3 && wells.every(v => v.r > 0), `n=${wells.length}`);
  const bytes = Buffer.byteLength(JSON.stringify(snap));
  console.log(`PROFILE players=${snap.players.length} pellets=${snap.pellets.length} wells=${wells.length} bytes=${bytes}`);
  check('snap-bytes-green', bytes <= 12 * 1024, `${bytes}B vs 12KB`);
}

console.log(failures === 0 ? 'ALL BUFFET TESTS PASSED' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
