// Polar Panic headless tests: flip, vacuum, charge-gated eating, bot escape,
// backfill, snapshot shape. No sockets, no DB. Run: npx tsx src/polar.test.ts
import { PolarRoom } from './polar.js';
import { TUNE, massToRadius, pelletCharge } from './types.js';

let failures = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) console.log(`PASS ${name}${extra ? ' — ' + extra : ''}`);
  else { failures++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}
// Narrowing-proof charge assert (see combat.test.ts NOTE: deploy TS errors on
// opposite-literal compares after assignment — always compare via the union type).
import type { PolarPlayer } from './types.js';
function isCharge(p: PolarPlayer, c: 1 | -1): boolean { return p.charge === c; }

check('pellet-charge-rule', pelletCharge(2) === 1 && pelletCharge(3) === -1);

const room = new PolarRoom('test');
const me = room.addPlayer('me', 'Me', true);
me.x = 2000; me.y = 2000; me.vx = me.vy = 0;
me.charge = 1; me.hue = 200; me.shieldUntil = 0;

// 1 — flip toggles charge + hue, costs nothing, cooldown gates
const m0 = me.mass;
room.tryFlip('me');
check('flip-toggles', isCharge(me, -1) && me.hue === 335, `charge=${me.charge}`);
check('flip-free', me.mass === m0, `mass=${me.mass}`);
room.tryFlip('me');
check('flip-cooldown', isCharge(me, -1));
room.tick += 20;
room.tryFlip('me');
check('flip-releases', isCharge(me, 1) && me.hue === 200);

// 2 — vacuum: opposite pellet drifts in (magnet only, no eating)
const pl = room.pellets.find(p => p.id % 2 === 1)!; // odd = −1, me is +1
pl.x = me.x + 200; pl.y = me.y;
const d0 = Math.hypot(pl.x - me.x, pl.y - me.y);
for (let i = 0; i < 20; i++) room.magnet();
const d1 = Math.hypot(pl.x - me.x, pl.y - me.y);
check('vacuum-pulls', d1 < d0, `${d0.toFixed(0)} → ${d1.toFixed(0)}`);

// 3 — same charge never eats (repel bumps only)
const big = room.addPlayer('big', 'Big', true);
big.x = 2000; big.y = 2000; big.vx = big.vy = 0;
big.mass = 40; big.r = massToRadius(40); big.charge = 1; big.hue = 200; big.shieldUntil = 0;
const small = room.addPlayer('small', 'Small', true);
small.x = 2000; small.y = 2000; small.vx = small.vy = 0;
small.mass = 12; small.r = massToRadius(12); small.charge = 1; small.hue = 200; small.shieldUntil = 0; small.shieldUntil = 0;
for (let i = 0; i < 5; i++) room.step();
check('same-charge-safe', big.alive && small.alive);

// 4 — opposite charge eats: credit, feed, respawn
small.charge = -1; small.hue = 335;
small.alive = true; small.x = big.x; small.y = big.y; small.vx = small.vy = 0;
let n = 0;
while (small.alive && n++ < 30) room.step();
check('opposite-eats', !small.alive);
check('polar-credit', big.kills >= 1, `kills=${big.kills}`);
check('polar-feed', room.feed.some(f => f.includes('discharged')), `feed0=${room.feed[0] ?? 'empty'}`);
check('polar-respawn', (room.respawns.get('small') ?? -1) > room.tick);

// 5 — bot escape flip: threatened bot flips to its hunter's charge
const bot = room.addPlayer('bot', 'Bot', true);
bot.x = 1000; bot.y = 1000; bot.vx = bot.vy = 0;
bot.mass = 12; bot.r = massToRadius(12); bot.shieldUntil = 0;
const threat = room.addPlayer('threat', 'Threat', true);
threat.x = 1300; threat.y = 1000; threat.vx = threat.vy = 0;
threat.mass = 60; threat.r = massToRadius(60); threat.shieldUntil = 0;
threat.charge = 1; threat.hue = 200;
bot.charge = -1; bot.hue = 335; // opposite + smaller = lunch (unless it flips)
for (let i = 0; i < 4; i++) room.step();
check('bot-escape-flip', isCharge(bot, threat.charge), `bot=${bot.charge} threat=${threat.charge}`);

// 6 — backfill fills fast, caps clean
{
  const lobby = new PolarRoom('lobby');
  lobby.addPlayer('solo', 'Solo');
  for (let i = 0; i < 60; i++) lobby.step();
  const bots = [...lobby.players.values()].filter(p => p.isBot).length;
  check('polar-backfill', bots >= 6, `bots=${bots}`);
}

// 7 — snapshot: charges ride along, no orbs, flip-ready in dashReady
me.flipCdUntil = 0; // test 1's cooldown may still cover the current tick (timing-dependent)
const snap = room.snapshot('me');
check('snap-charges', snap.players.every(p => p.c === 1 || p.c === -1), `n=${snap.players.length}`);
check('snap-no-orbs', snap.orbs.length === 0);
check('snap-flip-ready', (snap.me?.dashReady ?? false) === true);

console.log(failures === 0 ? 'ALL POLAR TESTS PASSED' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
