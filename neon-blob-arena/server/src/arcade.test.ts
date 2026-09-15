// Variant arenas headless tests: rush config+chomp, hill scoring+crown, tag pass+
// grace+successor+scoring, backfill, snapshot shapes. Run: npx tsx src/arcade.test.ts
import { VariantRoom } from './arcade.js';
import { massToRadius } from './types.js';

let failures = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) console.log(`PASS ${name}${extra ? ' — ' + extra : ''}`);
  else { failures++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

// humans everywhere deterministic: no bot AI moves actors mid-assert
function human(room: VariantRoom, id: string, x: number, y: number, mass: number) {
  const p = room.addPlayer(id, id);
  p.x = x; p.y = y; p.vx = p.vy = 0;
  p.mass = mass; p.r = massToRadius(mass); p.shieldUntil = 0;
  return p;
}

// 1 — rush config: blitz tuning on the wire
{
  const rush = new VariantRoom('rush', 'cfg');
  const snap = rush.snapshot('nobody');
  check('rush-round', snap.round === 90, `round=${snap.round}`);
  check('rush-pellets', rush.pellets.length >= 500, `pellets=${rush.pellets.length}`);
  check('rush-no-v', snap.v === undefined);
}

// 2 — rush chomp: dash pressure consummates (the core mechanic, proven headless).
// Needs a real size gap: near-equal radii park at r1+r2 outside the eat radius
// (same dead zone mochi has — dash closes it, small victim can't hide).
// Corner kill, engineered: victim 30px off the east wall (the clamp absorbs the
// knockback share that otherwise flings light victims clear), eater 60px behind
// with a fresh dash. Dash is a 2-3 tick burst (steering drags it to cruise speed),
// so chomps happen close-in — same as mochi, proven headless here.
{
  const rush = new VariantRoom('rush', 'chomp');
  const eater = human(rush, 'eater', 3890, 2000, 200);
  const victim = human(rush, 'victim', 3950, 2000, 12);
  rush.handleInput('eater', 1, 0, true); // dash in
  let n = 0;
  while (victim.alive && n++ < 8) {
    rush.handleInput('eater', 1, 0, false);
    rush.step();
  }
  check('rush-chomp', !victim.alive, `after ${n} steps`);
  check('rush-credit', eater.kills >= 1, `kills=${eater.kills}`);
}

// 3 — hill: holders score, crown goes to score king
{
  const hill = new VariantRoom('hill', 'crown');
  const holder = human(hill, 'holder', 2000, 2000, 30);
  for (let i = 0; i < 20; i++) hill.step();
  check('hill-scores', holder.score >= 14, `score=${holder.score}`);
  const snap = hill.snapshot('holder');
  check('hill-zone', snap.v?.zone?.r === 260, `r=${snap.v?.zone?.r}`);
  const champ = human(hill, 'champ', 500, 500, 12);
  champ.score = 500;
  holder.score = 10;
  hill.endRound();
  check('hill-crown', hill.feed.some(f => f.includes('champ') && f.includes('wins')), `feed0=${hill.feed[0] ?? 'empty'}`);
}

// 4 — tag: touch passes IT, grace blocks instant re-pass, leaver crowns successor
{
  const tag = new VariantRoom('tag', 'pass');
  const it = human(tag, 'it', 2000, 2000, 20);
  const nxt = human(tag, 'nxt', 2000, 2000, 20);
  tag.itId = 'it';
  tag.itGraceUntil = 0;
  tag.step();
  check('tag-pass', tag.itId === 'nxt', `it=${tag.itId}`);
  check('tag-feed', tag.feed.some(f => f.includes('nxt') && f.includes('IT')), `feed0=${tag.feed[0] ?? 'empty'}`);
  tag.step(); // grace: still nxt despite overlap
  check('tag-grace', tag.itId === 'nxt', `it=${tag.itId}`);
  // Separate the pair: exactly-overlapped bodies never gain separation velocity
  // (zero normal), so grace expiry would ping-pong IT back and forth in-test.
  // Real play always has relative velocity; here we just walk away.
  it.x = 500; it.y = 500; it.vx = it.vy = 0;
  const s0 = it.score; // it is now a survivor: must tick up
  for (let i = 0; i < 20; i++) tag.step();
  check('tag-survivor-scores', it.score > s0, `${s0} → ${it.score}`);
  const snap = tag.snapshot('nxt');
  check('tag-me-it', snap.me?.it === 1);
  check('tag-v-it', snap.v?.it === 'nxt');
  const a = tag.addPlayer('a', 'a', true);
  const b = tag.addPlayer('b', 'b', true);
  a.x = 500; a.y = 500; b.x = 600; b.y = 600;
  tag.itId = 'a';
  tag.removePlayer('a');
  check('tag-successor', tag.itId !== 'a' && tag.itId !== null, `it=${tag.itId}`);
  void it;
}

// 5 — backfill fills every variant fast
for (const g of ['rush', 'hill', 'tag'] as const) {
  const lobby = new VariantRoom(g, 'lobby-' + g);
  lobby.addPlayer('solo', 'Solo');
  for (let i = 0; i < 60; i++) lobby.step();
  const bots = [...lobby.players.values()].filter(p => p.isBot).length;
  check(`${g}-backfill`, bots >= 6, `bots=${bots}`);
}

console.log(failures === 0 ? 'ALL ARCADE TESTS PASSED' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
