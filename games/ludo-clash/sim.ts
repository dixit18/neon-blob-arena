// games/ludo-clash/sim — Ludo Clash turn engine (LD-1).
// Classic-flavoured race: 6 leaves base, exact roll finishes, captures on
// unsafe cells, extra turns on 6/capture/finish, three 6s forfeits.
// Turn transport: `input` fire = roll the dice, `answer` i = pick token.
// Deterministic ms clock + injectable dice rand — headless-testable.
export type LudoPhase = 'lobby' | 'play' | 'final';
export type LudoStage = 'roll' | 'pick';

export interface LudoPlayer {
  id: string; name: string; isBot: boolean; seat: number;
  tokens: number[]; // -1 base, 0..50 track, 51..56 home run, 57 finished
  score: number; best: number;
}

export interface LudoSnapshot {
  t: 'ludo';
  phase: LudoPhase;
  board: {
    seats: { n: string; you: boolean; bot: boolean; color: number; tokens: number[]; finished: number }[];
    turn: { name: string; you: boolean; endsInMs: number; dice: number; options: number[]; canRoll: boolean } | null;
  } | null;
  scores: { n: string; s: number; you: boolean; bot: boolean }[];
  feed: string[];
  you: { score: number; finished: number };
}

export const TRACK = 52;
export const FINISH = 57;
export const STARTS = [0, 13, 26, 39];
export const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
export const SEAT_COLORS = ['#FF3D8A', '#46E0D4', '#C6F135', '#B78CFF'];
export const ROLL_TIMEOUT_MS = 15_000;
export const PICK_TIMEOUT_MS = 10_000;
export const LOBBY_COUNTDOWN_MS = 1000;
export const FINAL_MS = 6000;
export const MAX_SEATS = 4;

export class LudoSim {
  time = 0;
  phase: LudoPhase = 'lobby';
  players = new Map<string, LudoPlayer>();
  order: string[] = []; // seat order (player ids, max 4)
  turnPos = 0;
  stage: LudoStage = 'roll';
  dice = 0;
  sixes = 0;
  options: number[] = [];
  phaseUntil = 0;
  gameNo = 1;
  feed: string[] = [];
  private rand: () => number;

  constructor(rand: () => number = Math.random) { this.rand = rand; }

  playerCount(): number { return this.players.size; }

  join(id: string, name: string, isBot: boolean): void {
    if (this.players.has(id) || this.order.length >= MAX_SEATS) return;
    const seat = this.order.length;
    this.players.set(id, { id, name, isBot, seat, tokens: [-1, -1, -1, -1], score: 0, best: 0 });
    this.order.push(id);
    if (this.phase === 'lobby' && this.phaseUntil === 0 && this.order.length >= 2) {
      this.phaseUntil = this.time + LOBBY_COUNTDOWN_MS;
    }
  }

  leave(id: string): void {
    if (!this.players.delete(id)) return;
    this.order = this.order.filter((x) => x !== id);
    if (this.order.length === 0) {
      this.phase = 'lobby'; // empty room always resets, whatever the phase
      this.phaseUntil = 0;
      return;
    }
    if (this.phase === 'play') {
      if (this.order.length === 1) {
        const champ = this.players.get(this.order[0]!);
        if (champ) {
          champ.score = this.scoreOf(champ);
          if (champ.score > champ.best) champ.best = champ.score;
          this.pushFeed(`🏆 ${champ.name} takes it — last one racing!`);
        }
        this.phase = 'final';
        this.phaseUntil = this.time + FINAL_MS;
      } else {
        this.turnPos = this.turnPos % this.order.length;
        this.beginTurn();
      }
    }
  }

  private scoreOf(p: LudoPlayer): number {
    const finished = p.tokens.filter((t) => t === FINISH).length;
    const prog = p.tokens.reduce((a, t) => a + Math.max(0, t), 0);
    return finished * 1000 + prog;
  }

  absOf(seat: number, rel: number): number {
    return (STARTS[seat]! + rel) % TRACK;
  }

  legalMoves(id: string): number[] {
    const p = this.players.get(id);
    if (!p) return [];
    const out: number[] = [];
    for (let k = 0; k < 4; k++) {
      const r = p.tokens[k]!;
      if (r === FINISH) continue;
      if (r === -1) { if (this.dice === 6) out.push(k); continue; }
      if (r + this.dice <= FINISH) out.push(k);
    }
    return out;
  }

  private turnId(): string { return this.order[this.turnPos % Math.max(1, this.order.length)] ?? ''; }

  /** Roll the dice (input fire). */
  roll(id: string): void {
    if (this.phase !== 'play' || this.stage !== 'roll' || id !== this.turnId()) return;
    this.dice = 1 + Math.floor(this.rand() * 6);
    if (this.dice === 6) this.sixes++;
    else this.sixes = 0;
    if (this.sixes >= 3) {
      this.pushFeed(`🎲 ${this.players.get(id)?.name ?? '?'} rolled three 6s — turn gone!`);
      this.sixes = 0;
      this.advance();
      return;
    }
    this.options = this.legalMoves(id);
    if (this.options.length === 0) {
      this.advance(); // nothing moves
    } else if (this.options.length === 1) {
      this.applyMove(id, this.options[0]!);
    } else {
      this.stage = 'pick';
      this.phaseUntil = this.time + PICK_TIMEOUT_MS;
    }
  }

  /** Pick a token (answer i). */
  pick(id: string, i: number): void {
    if (this.phase !== 'play' || this.stage !== 'pick' || id !== this.turnId()) return;
    if (!this.options.includes(i)) return;
    this.applyMove(id, i);
  }

  private applyMove(id: string, k: number): void {
    const p = this.players.get(id);
    if (!p) { this.advance(); return; }
    let captured = false;
    let finishedOne = false;
    if (p.tokens[k] === -1) {
      p.tokens[k] = 0;
    } else {
      p.tokens[k]! += this.dice;
      const rel = p.tokens[k]!;
      if (rel === FINISH) finishedOne = true;
      else if (rel <= 50) {
        const cell = this.absOf(p.seat, rel);
        if (!SAFE.has(cell)) {
          for (const q of this.players.values()) {
            if (q.id === id) continue;
            for (let j = 0; j < 4; j++) {
              const qr = q.tokens[j]!;
              if (qr >= 0 && qr <= 50 && this.absOf(q.seat, qr) === cell) {
                q.tokens[j] = -1;
                captured = true;
              }
            }
          }
        }
      }
    }
    if (captured) this.pushFeed(`💥 ${p.name} sends one home!`);
    p.score = this.scoreOf(p);
    if (p.score > p.best) p.best = p.score;
    if (p.tokens.every((t) => t === FINISH)) {
      this.pushFeed(`🏆 ${p.name} brings all four home with ${p.score}!`);
      this.phase = 'final';
      this.phaseUntil = this.time + FINAL_MS;
      return;
    }
    if (this.dice === 6 || captured || finishedOne) {
      this.stage = 'roll'; // roll again
      this.phaseUntil = this.time + ROLL_TIMEOUT_MS;
    } else {
      this.advance();
    }
  }

  private advance(): void {
    if (this.order.length === 0) { this.phase = 'lobby'; this.phaseUntil = 0; return; }
    this.turnPos = (this.turnPos + 1) % this.order.length;
    this.beginTurn();
  }

  private beginTurn(): void {
    this.stage = 'roll';
    this.dice = 0;
    this.sixes = 0;
    this.options = [];
    this.phaseUntil = this.time + ROLL_TIMEOUT_MS;
  }

  step(dtMs: number): void {
    this.time += dtMs;
    if (this.phase === 'lobby') {
      if (this.phaseUntil !== 0 && this.time >= this.phaseUntil && this.order.length >= 2) {
        this.phase = 'play';
        this.turnPos = 0;
        this.beginTurn();
      } else if (this.phaseUntil !== 0 && this.time >= this.phaseUntil) {
        this.phaseUntil = this.time + LOBBY_COUNTDOWN_MS; // keep waiting for a second player
      }
    } else if (this.phase === 'play') {
      if (this.time >= this.phaseUntil) {
        const id = this.turnId();
        if (this.stage === 'roll') this.roll(id); // nap timeout: auto-roll
        else if (this.options.length > 0) this.pick(id, this.options[0]!); // dawdled: first move
        else this.advance();
      }
    } else if (this.phase === 'final') {
      if (this.time >= this.phaseUntil) this.nextGame();
    }
  }

  private nextGame(): void {
    this.gameNo++;
    for (const p of this.players.values()) { p.tokens = [-1, -1, -1, -1]; p.score = 0; }
    this.sixes = 0;
    this.dice = 0;
    this.options = [];
    if (this.order.length >= 2) {
      this.phase = 'play';
      this.turnPos = (this.gameNo - 1) % this.order.length;
      this.beginTurn();
    } else {
      this.phase = 'lobby';
      this.phaseUntil = 0;
    }
  }

  private pushFeed(s: string): void {
    this.feed.push(s);
    if (this.feed.length > 3) this.feed.splice(0, this.feed.length - 3);
  }

  snapshot(pid: string): LudoSnapshot {
    const me = this.players.get(pid);
    const finished = (id: string): number => this.players.get(id)?.tokens.filter((t) => t === FINISH).length ?? 0;
    return {
      t: 'ludo',
      phase: this.phase,
      board: this.phase === 'play' ? {
        seats: this.order.map((id) => {
          const p = this.players.get(id)!;
          return { n: p.name, you: id === pid, bot: p.isBot, color: p.seat, tokens: [...p.tokens], finished: finished(id) };
        }),
        turn: {
          name: this.players.get(this.turnId())?.name ?? '?',
          you: this.turnId() === pid,
          endsInMs: Math.max(0, this.phaseUntil - this.time),
          dice: this.dice,
          options: this.stage === 'pick' && this.turnId() === pid ? [...this.options] : [],
          canRoll: this.stage === 'roll' && this.turnId() === pid,
        },
      } : null,
      scores: [...this.players.values()]
        .sort((a, b) => b.score - a.score).slice(0, 4)
        .map((p) => ({ n: p.name, s: p.score, you: p.id === pid, bot: p.isBot })),
      feed: [...this.feed],
      you: { score: me?.score ?? 0, finished: me ? finished(me.id) : 0 },
    };
  }
}
