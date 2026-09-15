// Trivia Blitz headless suite: phases, answers, scoring, bots, matches.
// Run: npx tsx src/trivia.test.ts  (exit 0 = all PASS)
import { TriviaRoom, PACK, QN } from './trivia.js';

let failures = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) console.log(`PASS ${name}${extra ? ' — ' + extra : ''}`);
  else { failures++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

check('pack-size', PACK.length >= 24, `n=${PACK.length}`);
check('pack-shape', PACK.every(q => q.opts.length === 4 && q.a >= 0 && q.a <= 3 && q.q.length > 0));

const room = new TriviaRoom('test');
const me = room.addPlayer('me', 'Me', true);
const rival = room.addPlayer('rival', 'Rival', true);

// 1 — room opens on Q1 answer phase with hidden correct idx
{
  const s = room.snapshot('me');
  check('opens-q1', s.quiz!.qi === 1 && s.quiz!.qn === QN, `qi=${s.quiz!.qi}`);
  check('opens-answering', s.quiz!.phase === 0 && s.quiz!.reveal === -1);
  check('opts-four', s.quiz!.opts.length === 4, `opts=${s.quiz!.opts.length}`);
  check('mine-unanswered', s.quiz!.mine === -1 && s.quiz!.ok === -1);
}

// 2 — correct answer recorded; double-answer ignored (first wins)
{
  const a = room.cur().a;
  room.answer('me', a);
  room.answer('me', (a + 1) % 4); // change-of-mind must not count
  const got = room.answers.get('me');
  check('answer-recorded', got !== undefined && got.i === a, `i=${got?.i}`);
}

// 3 — invalid answers ignored (out of range, non-integer)
{
  room.answer('rival', 9);
  room.answer('rival', 1.5);
  check('invalid-ignored', !room.answers.has('rival'));
  room.answer('rival', (room.cur().a + 2) % 4); // valid wrong answer
  check('wrong-recorded', room.answers.get('rival') !== undefined);
}

// 4 — advance to reveal: correct idx shown, scorer paid, streaks set
for (let i = 0; i < 300; i++) room.step();
{
  const s = room.snapshot('me');
  check('reveal-phase', s.quiz!.phase === 1 && s.quiz!.reveal === room.cur().a, `reveal=${s.quiz!.reveal}`);
  check('correct-paid', me.score > 0 && me.kills === 1, `score=${me.score} kills=${me.kills}`);
  check('wrong-unpaid', rival.score === 0 && rival.streak === 0, `score=${rival.score}`);
  check('mine-ok', s.quiz!.mine === room.cur().a && s.quiz!.ok === 1);
}

// 5 — reveal-phase answers ignored
{
  const before = room.answers.size;
  room.answer('me', 0);
  check('reveal-locked', room.answers.size === before);
}

// 6 — speed bonus: earlier answer outscores later answer (same correctness)
{
  const r2 = new TriviaRoom('speed');
  const early = r2.addPlayer('early', 'Early', true);
  const late = r2.addPlayer('late', 'Late', true);
  const a = r2.cur().a;
  r2.answer('early', a); // tick ~0
  for (let i = 0; i < 200; i++) r2.step();
  r2.answer('late', a); // tick 200, still answering
  for (let i = 0; i < 200; i++) r2.step(); // through reveal
  check('speed-bonus', early.score > late.score, `early=${early.score} late=${late.score}`);
}

// 7 — silence breaks streak (no free points for AFK)
{
  const r3 = new TriviaRoom('afk');
  const quiet = r3.addPlayer('quiet', 'Quiet'); // human: never auto-answers (addPlayer never touches DB)
  quiet.streak = 4;
  for (let i = 0; i < 400; i++) r3.step(); // full question, never answers
  check('afk-no-points', quiet.score === 0 && quiet.streak === 0, `score=${quiet.score} streak=${quiet.streak}`);
}

// 8 — bots answer during the window (zero cold-start: solo human gets a room)
{
  const lobby = new TriviaRoom('lobby-probe');
  lobby.addPlayer('solo', 'Solo'); // human solo join (addPlayer never touches DB)
  for (let i = 0; i < 60; i++) lobby.step();
  const bots = [...lobby.players.values()].filter(p => p.isBot).length;
  check('backfill-fills', bots >= 6, `bots=${bots} after 60 ticks`);
  for (let i = 0; i < 240; i++) lobby.step(); // finish Q1 (300 ticks of answers)
  const answered = [...lobby.players.values()].filter(p => p.kills > 0 || p.streak > 0 || lobby.answers.has(p.id)).length;
  check('bots-play', answered >= 1 || lobby.feed.some(f => f.includes('nailed')), `feed0=${lobby.feed[0] ?? 'empty'}`);
}

// 9 — full match (8 questions) crowns, resets, and restarts at Q1
{
  const m = new TriviaRoom('match');
  const champ = m.addPlayer('champ', 'Champ', true);
  for (let q = 0; q < QN; q++) {
    m.answer('champ', m.cur().a);
    for (let i = 0; i < 400; i++) m.step();
  }
  check('match-crowns', m.roundCount === 1 && m.feed.some(f => f.includes('wins trivia night')), `rounds=${m.roundCount} feed0=${m.feed[0] ?? 'empty'}`);
  check('match-resets', champ.score === 0 && champ.kills === 0, `score=${champ.score}`);
  check('match-restarts', m.qi === 1 && m.phase === 0, `qi=${m.qi}`);
}

// 10 — leaders sort by score desc, snapshot stays tiny (quiz = text, no entities)
{
  const s = room.snapshot('me');
  const ls = s.leaders.map(l => l.s);
  const sorted = ls.every((v, i) => i === 0 || ls[i - 1]! >= v);
  check('leaders-sorted', sorted, `top=${ls.slice(0, 3).join(',')}`);
  const bytes = Buffer.byteLength(JSON.stringify(s));
  check('snapshot-tiny', bytes <= 4 * 1024, `${bytes}B vs 4KB quiz budget`);
}

// 11 — mid-question joiners can answer immediately (no lockout)
{
  const j = new TriviaRoom('join');
  for (let i = 0; i < 50; i++) j.step();
  const late = j.addPlayer('late', 'Late', true);
  void late;
  j.answer('late', j.cur().a);
  check('joiner-plays', j.answers.has('late'));
}

console.log(failures === 0 ? 'ALL TRIVIA TESTS PASSED' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
