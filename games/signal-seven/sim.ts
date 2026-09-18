import { buildGameUrl, type ShareArtifact } from '../../packages/share/src/index.js';

// games/signal-seven/sim — SIGNAL SEVEN daily deduction engine (SI-1).
// One UTC-day mystery: a hidden 3-rune code (no repeats) from 7 runes plus
// 7 clues, every clue true, the set always narrowing to exactly one code
// (greedy narrow + positional fallback — total, not lucky). Guesses earn
// Mastermind pips; fewest guesses wins. A brute-force solver both builds
// the clue set and proves all 365 days of 2026 uniquely solvable in-test.
// Solo-safe: MIN_START is 1; rival tablets arrive with the SI-2 driver.
export type SignalPhase = 'lobby' | 'puzzle' | 'final';

export interface Rune { name: string; glyph: string }
export const RUNES: Rune[] = [
  { name: 'EMBER', glyph: '🔥' },
  { name: 'TIDE', glyph: '🌊' },
  { name: 'THORN', glyph: '🌵' },
  { name: 'MOSS', glyph: '🌿' },
  { name: 'GALE', glyph: '💨' },
  { name: 'OPAL', glyph: '💠' },
  { name: 'ASH', glyph: '🌫️' },
];
export const CODE_LEN = 3;
export const CLUE_COUNT = 7;
export const MAX_GUESSES = 7;
export const MIN_START = 1;
export const LOBBY_COUNTDOWN_MS = 1500;
export const FINAL_MS = 8000;

export type Clue =
  | { k: 'in'; rune: number }
  | { k: 'out'; rune: number }
  | { k: 'pos'; rune: number; at: number }
  | { k: 'notpos'; rune: number; at: number }
  | { k: 'count'; n: number; set: number[] };

export interface Mystery { seed: number; day: string; code: number[]; clues: Clue[] }
export interface Attempt { guess: number[]; inCode: number; inPos: number; won: boolean }

const POS_WORD = ['first', 'second', 'third'];

export function clueText(c: Clue): string {
  const R = (i: number): string => `${RUNES[i]!.glyph} ${RUNES[i]!.name}`;
  switch (c.k) {
    case 'in': return `${R(c.rune)} sings in the code`;
    case 'out': return `${R(c.rune)} is silent tonight`;
    case 'pos': return `${R(c.rune)} stands ${POS_WORD[c.at]}`;
    case 'notpos': return `${R(c.rune)} does not stand ${POS_WORD[c.at]}`;
    case 'count': return `exactly ${c.n} of {${c.set.map((i) => RUNES[i]!.name).join(', ')}} sing`;
  }
}

/** UTC-day seed: YYYYMMDD. The whole world shares one mystery per day. */
export function daySeedUTC(d: Date = new Date()): { seed: number; day: string } {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return { seed: Number(`${y}${m}${dd}`), day: `${y}-${m}-${dd}` };
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clueKey(c: Clue): string { return JSON.stringify(c); }

/** Every code: ordered triples, no repeats (7P3 = 210). */
export function allCodes(): number[][] {
  const out: number[][] = [];
  for (let a = 0; a < RUNES.length; a++) {
    for (let b = 0; b < RUNES.length; b++) {
      if (b === a) continue;
      for (let c = 0; c < RUNES.length; c++) {
        if (c === a || c === b) continue;
        out.push([a, b, c]);
      }
    }
  }
  return out;
}

const CODES = allCodes();

function holds(code: number[], c: Clue): boolean {
  switch (c.k) {
    case 'in': return code.includes(c.rune);
    case 'out': return !code.includes(c.rune);
    case 'pos': return code[c.at] === c.rune;
    case 'notpos': return code[c.at] !== c.rune;
    case 'count': return c.set.filter((r) => code.includes(r)).length === c.n;
  }
}

/** The solver: how many codes fit these clues (and the first of them). */
export function countConsistent(clues: Clue[]): { n: number; first: number[] | null } {
  let n = 0;
  let first: number[] | null = null;
  for (const code of CODES) {
    let ok = true;
    for (const c of clues) {
      if (!holds(code, c)) { ok = false; break; }
    }
    if (ok) {
      n++;
      if (!first) first = [...code];
    }
  }
  return { n, first };
}

/** Every TRUE statement pool for a code — the generator's raw material. */
function candidatePool(code: number[], rand: () => number): Clue[] {
  const pool: Clue[] = [];
  const seen = new Set<string>();
  const push = (c: Clue): void => {
    const k = clueKey(c);
    if (!seen.has(k)) { seen.add(k); pool.push(c); }
  };
  for (const r of code) push({ k: 'in', rune: r });
  for (let r = 0; r < RUNES.length; r++) {
    if (!code.includes(r)) push({ k: 'out', rune: r });
  }
  code.forEach((r, i) => push({ k: 'pos', rune: r, at: i }));
  for (let at = 0; at < CODE_LEN; at++) {
    for (let r = 0; r < RUNES.length; r++) {
      if (r !== code[at]) push({ k: 'notpos', rune: r, at });
    }
  }
  for (let i = 0; i < 14; i++) {
    const size = 2 + Math.floor(rand() * 3); // 2-4 runes
    const set = [...Array(RUNES.length).keys()].sort(() => rand() - 0.5).slice(0, size).sort((a, b) => a - b);
    push({ k: 'count', n: set.filter((r) => code.includes(r)).length, set });
  }
  // Shuffle so greedy ties break differently per seed (variety, not luck —
  // uniqueness is enforced below regardless of order).
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool;
}

/** Build the day's mystery: greedy narrow to one code, positional fallback. */
export function genMystery(seed: number, day = ''): Mystery {
  const rand = mulberry32(seed);
  const code = [...Array(RUNES.length).keys()]
    .sort(() => rand() - 0.5)
    .slice(0, CODE_LEN);
  const pool = candidatePool(code, rand);
  const clues: Clue[] = [];
  const used = new Set<string>();
  while (clues.length < CLUE_COUNT) {
    let best: Clue | null = null;
    let bestN = Infinity;
    for (const c of pool) {
      if (used.has(clueKey(c))) continue;
      const { n } = countConsistent([...clues, c]);
      if (n > 0 && n < bestN) { bestN = n; best = c; }
      if (bestN === 1) break;
    }
    if (!best) break;
    clues.push(best);
    used.add(clueKey(best));
    if (bestN === 1 && clues.length >= 3) break;
  }
  // Fallback (total, never lucky): positional clues pin any survivor set.
  // Three pos-clues always suffice, so evict from the tail to hold the budget.
  let guard = 0;
  while (countConsistent(clues).n !== 1 && guard++ < 10) {
    const need = code.map((r, i) => ({ k: 'pos', rune: r, at: i }) as Clue)
      .find((c) => !used.has(clueKey(c)));
    if (!need) break; // all three pinned and still ambiguous: impossible
    if (clues.length >= CLUE_COUNT) {
      const evicted = clues.pop()!;
      used.delete(clueKey(evicted));
    }
    clues.push(need);
    used.add(clueKey(need));
  }
  const check = countConsistent(clues);
  if (check.n !== 1 || clues.length > CLUE_COUNT) {
    throw new Error(`seed ${seed}: clue set failed (n=${check.n}, k=${clues.length})`);
  }
  while (clues.length < CLUE_COUNT) {
    // Pad with fresh true statements (variety filler, never ambiguity:
    // the set is already unique, extra true clues keep it unique).
    const extra = pool.find((c) => !used.has(clueKey(c)));
    if (!extra) break;
    clues.push(extra);
    used.add(clueKey(extra));
  }
  return { seed: seed >>> 0, day, code, clues };
}

/** Mastermind pips for a guess (caller validates shape). */
export function feedback(code: number[], guess: number[]): { inCode: number; inPos: number } {
  let inPos = 0;
  for (let i = 0; i < CODE_LEN; i++) if (guess[i] === code[i]) inPos++;
  const inCode = guess.filter((r) => code.includes(r)).length;
  return { inCode, inPos };
}

export function validGuess(g: unknown): g is number[] {
  return Array.isArray(g) && g.length === CODE_LEN
    && g.every((r) => Number.isInteger(r) && r >= 0 && r < RUNES.length)
    && new Set(g).size === CODE_LEN;
}

export interface SignalPlayer {
  id: string; name: string; isBot: boolean;
  attempts: Attempt[]; won: boolean; done: boolean; solveMs: number;
  best: number | null; // fewest winning guesses, all puzzles
}

export interface SignalSnapshot {
  t: 'signal';
  phase: SignalPhase;
  day: string;
  seed: number;
  clues: string[];
  attempts: Attempt[];
  attemptsLeft: number;
  won: boolean;
  endsInMs: number;
  leaders: { n: string; guesses: number; won: boolean; you: boolean; bot: boolean }[];
  feed: string[];
  you: { guesses: number; best: number | null };
}

export class SignalSim {
  time = 0;
  phase: SignalPhase = 'lobby';
  players = new Map<string, SignalPlayer>();
  order: string[] = [];
  mystery: Mystery | null = null;
  phaseUntil = 0;
  feed: string[] = [];
  private rand: () => number;
  private daySeed: number;
  private dayStr: string;

  constructor(rand: () => number = Math.random, day?: { seed: number; day: string }) {
    this.rand = rand;
    const d = day ?? daySeedUTC();
    this.daySeed = d.seed;
    this.dayStr = d.day;
  }

  playerCount(): number { return this.players.size; }

  join(id: string, name: string, isBot: boolean): void {
    if (this.players.has(id)) return;
    this.players.set(id, {
      id, name, isBot, attempts: [], won: false, done: false, solveMs: 0, best: null,
    });
    this.order.push(id);
    if (this.phase === 'lobby' && this.phaseUntil === 0 && this.order.length >= MIN_START) {
      this.phaseUntil = this.time + LOBBY_COUNTDOWN_MS;
    }
  }

  leave(id: string): void {
    if (!this.players.delete(id)) return;
    this.order = this.order.filter((x) => x !== id);
    if (this.order.length === 0) {
      this.phase = 'lobby'; // empty room always resets, whatever the phase
      this.phaseUntil = 0;
      this.mystery = null;
      this.feed = [];
      return;
    }
    if (this.phase === 'puzzle' && this.allDone()) this.doFinal();
  }

  /** Submit a guess. Bad shapes, dupes-after-done and post-final die here. */
  guess(id: string, g: unknown): boolean {
    if (this.phase !== 'puzzle' || !this.mystery) return false;
    const p = this.players.get(id);
    if (!p || p.done) return false;
    if (!validGuess(g)) return false;
    if (p.attempts.length >= MAX_GUESSES) return false;
    const fb = feedback(this.mystery.code, g);
    const won = fb.inPos === CODE_LEN;
    p.attempts.push({ guess: [...g], inCode: fb.inCode, inPos: fb.inPos, won });
    if (won) {
      p.won = true;
      p.done = true;
      p.solveMs = this.time;
      if (p.best === null || p.attempts.length < p.best) p.best = p.attempts.length;
      this.pushFeed(`🔮 ${p.name} reads the signs in ${p.attempts.length}!`);
    } else if (p.attempts.length >= MAX_GUESSES) {
      p.done = true;
      this.pushFeed(`🌫️ ${p.name} runs out of guesses!`);
    }
    if (this.allDone()) this.doFinal();
    return true;
  }

  private allDone(): boolean {
    for (const id of this.order) {
      if (!this.players.get(id)!.done) return false;
    }
    return true;
  }

  private rank(): SignalPlayer[] {
    return [...this.players.values()].sort((a, b) => {
      if (a.won !== b.won) return a.won ? -1 : 1;
      if (a.attempts.length !== b.attempts.length) return a.attempts.length - b.attempts.length;
      return a.solveMs - b.solveMs;
    });
  }

  private doFinal(): void {
    const champ = this.rank()[0];
    if (champ) {
      this.pushFeed(champ.won
        ? `🏆 ${champ.name} takes the day in ${champ.attempts.length}!`
        : `🏆 ${champ.name} gets closest — the signs stay silent!`);
    }
    this.phase = 'final';
    this.phaseUntil = this.time + FINAL_MS;
  }

  step(dtMs: number): void {
    this.time += dtMs;
    if (this.phase === 'lobby') {
      if (this.phaseUntil !== 0 && this.time >= this.phaseUntil && this.order.length >= MIN_START) {
        this.mystery = genMystery(this.daySeed, this.dayStr);
        this.phase = 'puzzle';
        this.phaseUntil = 0; // the puzzle ends when every tablet is done
      } else if (this.phaseUntil !== 0 && this.time >= this.phaseUntil) {
        this.phaseUntil = this.time + LOBBY_COUNTDOWN_MS;
      }
    } else if (this.phase === 'puzzle') {
      if (this.allDone()) this.doFinal();
    } else if (this.phase === 'final') {
      if (this.time >= this.phaseUntil) {
        if (this.order.length >= MIN_START) {
          this.mystery = genMystery(this.daySeed, this.dayStr);
          for (const p of this.players.values()) {
            p.attempts = []; p.won = false; p.done = false; p.solveMs = 0;
          }
          this.phase = 'puzzle';
        } else {
          this.phase = 'lobby';
          this.phaseUntil = 0;
          this.mystery = null;
        }
      }
    }
  }

  private pushFeed(s: string): void {
    this.feed.push(s);
    if (this.feed.length > 3) this.feed.splice(0, this.feed.length - 3);
  }

  snapshot(pid: string): SignalSnapshot {
    const me = this.players.get(pid);
    return {
      t: 'signal',
      phase: this.phase,
      day: this.dayStr,
      seed: this.daySeed,
      clues: (this.mystery?.clues ?? []).map(clueText),
      attempts: me ? me.attempts.map((a) => ({ ...a, guess: [...a.guess] })) : [],
      attemptsLeft: me ? MAX_GUESSES - me.attempts.length : MAX_GUESSES,
      won: me?.won ?? false,
      endsInMs: this.phase === 'final' ? Math.max(0, this.phaseUntil - this.time) : 0,
      leaders: this.rank().slice(0, 8).map((p) => ({
        n: p.name, guesses: p.attempts.length, won: p.won,
        you: p.id === pid, bot: p.isBot,
      })),
      feed: [...this.feed],
      you: { guesses: me?.attempts.length ?? 0, best: me?.best ?? null },
    };
  }

  /** SI-3: DailyGrid — pip rows + count, never the code (assert-guarded). */
  grid(room: string, origin: string): ShareArtifact {
    const champ = this.rank().find((p) => p.won) ?? null;
    const done = this.phase === 'final';
    return {
      kind: 'DailyGrid',
      game: 'signal-seven',
      room,
      title: done && champ
        ? `🔮 ${champ.name} read ${this.dayStr} in ${champ.attempts.length} — can you?`
        : `🔮 today's signs are still unread (${this.dayStr}) — take the tablet!`,
      url: buildGameUrl(origin, 'signal-seven', room),
      data: {
        // NOTE: no seed, no code — the seed regenerates the solution, so a
        // spoiler-safe grid carries pips only. Day + rows render the card.
        day: this.dayStr,
        author: champ?.name ?? null,
        guesses: champ?.attempts.length ?? null,
        rows: (champ?.attempts ?? []).map((a) => ({ inCode: a.inCode, inPos: a.inPos })),
      },
    };
  }
}
