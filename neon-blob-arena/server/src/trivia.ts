// TRIVIA BLITZ — Sprint 3 diversifier (D10). The first non-arena verb: an
// 8-question party quiz for 2–100 players. No movement, no physics, no dash —
// players answer from 4 options, fastest correct scores most. Bots ANSWER in
// skill tiers, so a solo joiner gets a lively room with zero cold-start.
// Same shell contract as arenas (rooms/snapshots/feed/rounds/backfill); the
// only new channel is snapshot `quiz` + message {t:'answer', i:0-3}.
// Anti-copycat: others' answers stay hidden until reveal. One built-in 24-Q
// pack (no content treadmill until PMF).
import { TUNE, PlayerState, SnapPlayer, ServerSnapshot, massToRadius } from './types.js';
import { persistScore } from './db.js';
import type { Conn } from './game.js';

export const QN = 8; // questions per match
const Q_ANSWER_TICKS = 300; // 15s answer window
const Q_REVEAL_TICKS = 100; // 5s reveal
const Q_TOTAL = Q_ANSWER_TICKS + Q_REVEAL_TICKS;

interface Q { q: string; opts: [string, string, string, string]; a: number }

// v1 pack (Aarav curates): global, unambiguous, phone-readable in 3 seconds.
export const PACK: Q[] = [
  { q: 'How many continents are there?', opts: ['5', '6', '7', '8'], a: 2 },
  { q: 'Largest planet in our solar system?', opts: ['Mars', 'Jupiter', 'Saturn', 'Earth'], a: 1 },
  { q: 'H2O is…', opts: ['Salt', 'Water', 'Sugar', 'Oxygen'], a: 1 },
  { q: 'Days in a leap year?', opts: ['364', '365', '366', '367'], a: 2 },
  { q: 'Fastest land animal?', opts: ['Lion', 'Cheetah', 'Horse', 'Tiger'], a: 1 },
  { q: 'Capital of Japan?', opts: ['Beijing', 'Seoul', 'Tokyo', 'Osaka'], a: 2 },
  { q: 'Soccer: players per team on the field?', opts: ['9', '10', '11', '12'], a: 2 },
  { q: 'Which gas do plants absorb?', opts: ['Oxygen', 'Carbon dioxide', 'Helium', 'Nitrogen'], a: 1 },
  { q: 'Largest ocean?', opts: ['Atlantic', 'Indian', 'Pacific', 'Arctic'], a: 2 },
  { q: 'Colors in a rainbow?', opts: ['5', '6', '7', '8'], a: 2 },
  { q: 'Chess: squares on the board?', opts: ['48', '64', '72', '81'], a: 1 },
  { q: 'Boiling point of water (°C)?', opts: ['90', '95', '100', '110'], a: 2 },
  { q: 'Which animal is a marsupial?', opts: ['Kangaroo', 'Elephant', 'Giraffe', 'Zebra'], a: 0 },
  { q: 'Strings on a guitar?', opts: ['4', '5', '6', '7'], a: 2 },
  { q: 'Smallest prime number?', opts: ['0', '1', '2', '3'], a: 2 },
  { q: 'Capital of France?', opts: ['Paris', 'Lyon', 'Marseille', 'Nice'], a: 0 },
  { q: 'Hours in 2 days?', opts: ['24', '36', '48', '60'], a: 2 },
  { q: 'The Red Planet?', opts: ['Venus', 'Mars', 'Mercury', 'Jupiter'], a: 1 },
  { q: 'Legs on a spider?', opts: ['6', '8', '10', '12'], a: 1 },
  { q: 'Freezing point of water (°C)?', opts: ['-10', '0', '10', '32'], a: 1 },
  { q: 'Largest mammal?', opts: ['Elephant', 'Blue whale', 'Giraffe', 'Hippo'], a: 1 },
  { q: 'Sides on a hexagon?', opts: ['5', '6', '7', '8'], a: 1 },
  { q: 'Which instrument has keys?', opts: ['Guitar', 'Piano', 'Drums', 'Flute'], a: 1 },
  { q: 'Minutes in an hour?', opts: ['30', '60', '90', '100'], a: 1 },
];

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const BOT_NAMES = ['Blip', 'Gloop', 'Zorp', 'Mochi', 'Vex', 'Pud', 'Nib', 'Quark', 'Slim', 'Orb', 'Fizz', 'Gup'];
// bot tiers by hue%3: sharp answers fast + usually right, weak lollygags.
const TIER_ACC = [0.8, 0.55, 0.3];
const TIER_AT = [[40, 160], [80, 220], [120, 280]] as const;

function spawnPos(margin = 80) { return { x: rand(margin, TUNE.WORLD - margin), y: rand(margin, TUNE.WORLD - margin) }; }

export class TriviaRoom {
  id: string;
  readonly game = 'trivia' as const; // marketplace discriminant: matchmaking + dispatch narrow on this
  tick = 0;
  nextNum = 1;
  players = new Map<string, PlayerState>();
  conns = new Map<string, Conn>();
  feed: string[] = [];
  respawns = new Map<string, number>(); // unused (no death) — kept for shell shape
  botTimer = 0;
  taunts: { id: string; e: number; until: number }[] = [];
  tauntCd = new Map<string, number>();
  roundTick = 0;
  roundCount = 0; // PMF stat: matches completed (see /stats)
  tauntCount = 0; // PMF stat: taunts sent (invite-loop proxy)

  // quiz state
  qi = 0; // 1-based question number inside the match
  qTick = 0; // ticks inside the current question
  phase: 0 | 1 = 0; // 0 answer window, 1 reveal
  qIdx = 0; // index into PACK
  qStart = Math.floor(rand(0, PACK.length)); // per-room rotation offset
  answers = new Map<string, { i: number; tick: number }>(); // playerId -> first answer
  botPlan = new Map<string, { at: number; i: number }>(); // botId -> scheduled answer

  constructor(id: string) {
    this.id = id;
    console.log(`[trivia ${id}] created`);
    this.nextQuestion();
  }

  get humans() { return [...this.players.values()].filter(p => !p.isBot).length; }
  get size() { return this.players.size; }

  cur(): Q { return PACK[(this.qStart + this.qi - 1) % PACK.length]!; }

  addPlayer(id: string, name: string, isBot = false): PlayerState {
    const p = spawnPos();
    const st: PlayerState = {
      id, num: this.nextNum++, name: name.slice(0, 14) || (isBot ? 'Bot' : 'Blob'),
      x: p.x, y: p.y, vx: 0, vy: 0,
      mass: TUNE.START_MASS, r: massToRadius(TUNE.START_MASS),
      hue: Math.floor(rand(0, 360)), kills: 0, score: 0, alive: true, isBot,
      dashCdUntil: 0, spawnTick: this.tick, streak: 0,
      fireCdUntil: 0, fx: 1, fy: 0, hunter: false, shieldUntil: 0,
    };
    this.players.set(id, st);
    // mid-question joiners play immediately: bots get a plan for THIS question
    // (nextQuestion only schedules bots already in the room — without this,
    // backfilled bots idle until Q2 and Q1 reads "0/0 nailed it").
    if (isBot && this.phase === 0 && this.qi >= 1) this.scheduleBot(st);
    return st;
  }

  removePlayer(id: string) {
    const p = this.players.get(id);
    if (p && !p.isBot) {
      persistScore({ id: p.id, name: p.name, score: Math.floor(p.score), kills: p.kills, room: this.id, survivedSec: Math.floor((this.tick - p.spawnTick) / TUNE.TICK_HZ) });
    }
    this.players.delete(id);
    this.conns.delete(id);
    this.answers.delete(id);
    this.botPlan.delete(id);
  }

  pushFeed(msg: string) {
    this.feed.unshift(msg);
    if (this.feed.length > 6) this.feed.pop();
  }

  // First answer wins: late changes + reveal-phase picks are ignored.
  answer(id: string, i: unknown) {
    const p = this.players.get(id);
    if (!p || this.phase !== 0) return;
    if (!Number.isInteger(i) || (i as number) < 0 || (i as number) > 3) return;
    if (this.answers.has(id)) return;
    this.answers.set(id, { i: i as number, tick: this.tick });
  }

  scheduleBot(p: PlayerState) {
    const tier = p.hue % 3;
    const [lo, hi] = TIER_AT[tier]!;
    const at = this.tick + Math.floor(rand(lo, hi));
    const correct = Math.random() < TIER_ACC[tier]!;
    const a = this.cur().a;
    let pick = a;
    if (!correct) {
      const wrongs = [0, 1, 2, 3].filter(o => o !== a);
      pick = wrongs[Math.floor(rand(0, wrongs.length))]!;
    }
    this.botPlan.set(p.id, { at, i: pick });
  }

  nextQuestion() {
    this.qi++;
    this.qTick = 0;
    this.phase = 0;
    this.answers.clear();
    this.botPlan.clear();
    // schedule bot answers now (deterministic-ish per question, no per-tick RNG)
    for (const p of this.players.values()) {
      if (!p.isBot) continue;
      this.scheduleBot(p);
    }
  }

  reveal() {
    this.phase = 1;
    const q = this.cur();
    let right = 0, total = 0;
    for (const p of this.players.values()) {
      const an = this.answers.get(p.id);
      if (!an) { p.streak = 0; continue; } // silence = wrong (streak breaks)
      total++;
      if (an.i === q.a) {
        right++;
        const speed = 1 - (an.tick - (this.tick - this.qTick)) / Q_ANSWER_TICKS;
        p.score += 100 + Math.max(0, Math.floor(speed * 100)) + Math.min(p.streak, 5) * 10;
        p.kills++; // kills = correct answers (leaderboard + share card read it)
        p.streak++;
        if (p.streak >= 3) this.pushFeed(`🔥 ${p.name} is on fire x${p.streak}!`);
      } else {
        p.streak = 0;
      }
    }
    this.pushFeed(`✅ ${right}/${total} nailed Q${this.qi} — ${q.opts[q.a]}`);
  }

  endMatch() {
    this.roundCount++;
    const alive = [...this.players.values()];
    const champ = alive.filter(p => !p.isBot).sort((a, b) => b.score - a.score)[0]
      ?? alive.sort((a, b) => b.score - a.score)[0];
    if (champ) this.pushFeed(`🏆 ${champ.name} wins trivia night with ${Math.floor(champ.score)}!`);
    for (const p of this.players.values()) { p.score = 0; p.kills = 0; p.streak = 0; }
    this.qi = 0;
    this.nextQuestion();
  }

  updateBots() {
    // bots answer on schedule (cheap: map scan only while answering)
    if (this.phase !== 0 || this.botPlan.size === 0) return;
    for (const [id, plan] of this.botPlan) {
      if (this.tick >= plan.at) {
        this.answer(id, plan.i);
        this.botPlan.delete(id);
      }
    }
  }

  ensureBots() {
    // backfill so the quiz never feels empty: bots answer, never idle.
    const humans = [...this.players.values()].filter(p => !p.isBot).length;
    const wantBots = humans < 2 ? 7 : humans < 8 ? 5 : humans < 14 ? 3 : 0;
    let bots = [...this.players.values()].filter(p => p.isBot).length;
    let added = 0;
    while (bots < wantBots && added < 3 && this.size < 100) {
      const name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)] + '-' + Math.floor(rand(10, 99));
      this.addPlayer('bot-' + Math.random().toString(36).slice(2, 8), name, true);
      bots++; added++;
    }
    if (bots > wantBots && bots > 0 && humans >= 8) {
      const b = [...this.players.values()].find(p => p.isBot);
      if (b) { this.players.delete(b.id); this.botPlan.delete(b.id); }
    }
  }

  step() {
    this.tick++;
    this.roundTick++;
    this.updateBots();
    this.qTick++;
    if (this.phase === 0 && this.qTick >= Q_ANSWER_TICKS) this.reveal();
    else if (this.phase === 1 && this.qTick >= Q_TOTAL) {
      if (this.qi >= QN) this.endMatch();
      else this.nextQuestion();
    }
    this.botTimer++;
    if (this.botTimer % 20 === 0) this.ensureBots(); // 1s backfill cadence
    if (this.tick % 10 === 0 && this.taunts.length > 0) this.taunts = this.taunts.filter(t => t.until > this.tick);
  }

  // Preset emote taunt: fixed set, 3s cooldown, 2s life. No free text (zero moderation).
  addTaunt(id: string, e: unknown) {
    const p = this.players.get(id);
    if (!p || p.isBot) return;
    if (!Number.isInteger(e) || (e as number) < 0 || (e as number) > 4) return;
    if (this.tick < (this.tauntCd.get(id) ?? 0)) return;
    this.tauntCd.set(id, this.tick + 60);
    this.taunts.push({ id, e: e as number, until: this.tick + 40 });
    this.tauntCount++;
    if (this.taunts.length > 12) this.taunts.shift();
  }

  snapshot(forId: string): ServerSnapshot {
    const me = this.players.get(forId);
    const leaders = [...this.players.values()]
      .sort((a, b) => b.score - a.score).slice(0, 5).map(p => ({ n: p.name, s: Math.floor(p.score) }));
    const players: SnapPlayer[] = [];
    for (const p of this.players.values()) {
      if (p.id === forId) continue;
      players.push({ id: p.id, n: p.name, x: Math.round(p.x), y: Math.round(p.y), r: Math.round(p.r * 10) / 10, h: p.hue, k: p.kills, s: Math.floor(p.score), b: p.isBot ? 1 : 0, ht: 0, c: 0 });
    }
    const q = this.cur();
    const mine = this.answers.get(forId);
    const leftTicks = this.phase === 0 ? Q_ANSWER_TICKS - this.qTick : Q_TOTAL - this.qTick;
    return {
      t: 'snap', tick: this.tick, you: forId,
      me: me ? {
        x: me.x, y: me.y, r: me.r, mass: Math.floor(me.mass),
        dashReady: true, score: Math.floor(me.score),
        kills: me.kills, alive: true, streak: me.streak, sh: 0,
      } : undefined,
      players, pellets: [], leaders, feed: [...this.feed],
      taunts: this.taunts.map(t => ({ id: t.id, e: t.e })),
      round: Math.max(0, Math.ceil(leftTicks / TUNE.TICK_HZ)),
      orbs: [],
      quiz: {
        q: q.q, opts: [...q.opts], qi: this.qi, qn: QN,
        phase: this.phase, reveal: this.phase === 1 ? q.a : -1,
        left: Math.max(0, Math.ceil(leftTicks / TUNE.TICK_HZ)),
        mine: mine ? mine.i : -1,
        ok: this.phase === 1 && mine ? (mine.i === q.a ? 1 : 0) : -1,
      },
    };
  }
}
