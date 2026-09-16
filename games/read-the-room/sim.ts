import { buildGameUrl, type ShareArtifact } from '../../packages/share/src/index.js';

// games/read-the-room/sim — READ THE ROOM vote engine (RT-1).
// Party prediction: each round shows one curated prompt, everyone secretly
// votes ANOTHER player (answer i = seat index). Reveal crowns the most-picked
// player: +1 per vote received, +2 to every voter who read the crowd right.
// One vote per round (dedup), no self-votes, votes for leavers void at tally.
// Deterministic ms clock + injectable rand — headless-testable.
export type RoomPhase = 'lobby' | 'vote' | 'reveal' | 'final';

export interface RoomPlayer {
  id: string; name: string; isBot: boolean;
  score: number; best: number;
}

export interface RoomSnapshot {
  t: 'room';
  phase: RoomPhase;
  round: {
    no: number; of: number; question: string;
    options: { n: string; you: boolean; bot: boolean }[];
    endsInMs: number; voted: boolean; myPick: number | null;
  } | null;
  reveal: {
    question: string; crowns: string[];
    tally: { n: string; v: number; you: boolean; bot: boolean }[];
    youPickedCrown: boolean; youGot: number;
  } | null;
  scores: { n: string; s: number; you: boolean; bot: boolean }[];
  feed: string[];
  you: { score: number };
}

// Authored prompts (RT-1): playful, never mean — the room laughs WITH, not AT.
export const PROMPTS: string[] = [
  'Who would survive longest on a desert island?',
  'Who is most likely to laugh at the wrong moment?',
  'Who would win a dance battle right now?',
  'Who secretly talks to their plants?',
  'Who would eat dessert before dinner?',
  'Who is most likely to become famous?',
  'Who would adopt every stray they meet?',
  'Who tells the best late-night stories?',
  'Who would win at hide-and-seek?',
  'Who is most likely to nap through a party?',
  'Who would share their last snack?',
  'Who has the best victory dance?',
  'Who would befriend a grumpy cat first?',
  'Who is most likely to plan a surprise trip?',
];

export const ROUNDS = 5;
export const MIN_START = 3;
export const LOBBY_COUNTDOWN_MS = 1500;
export const VOTE_MS = 20_000;
export const REVEAL_MS = 6000;
export const FINAL_MS = 8000;

export class RoomSim {
  time = 0;
  phase: RoomPhase = 'lobby';
  players = new Map<string, RoomPlayer>();
  order: string[] = []; // join order; seat index = position
  votes = new Map<string, number>(); // voterId → seat index
  qOrder: number[] = []; // shuffled prompt indices for this game
  roundNo = 0; // 0-based within the game
  gameNo = 1;
  crowns: { q: string; crown: string }[] = []; // party history (share)
  lastTally: { id: string; v: number }[] = [];
  lastCrowns: string[] = [];
  phaseUntil = 0;
  feed: string[] = [];
  private rand: () => number;

  constructor(rand: () => number = Math.random) { this.rand = rand; }

  playerCount(): number { return this.players.size; }

  question(): string {
    if (this.qOrder.length === 0) return PROMPTS[0]!;
    return PROMPTS[this.qOrder[this.roundNo % this.qOrder.length]!]!;
  }

  join(id: string, name: string, isBot: boolean): void {
    if (this.players.has(id)) return;
    this.players.set(id, { id, name, isBot, score: 0, best: 0 });
    this.order.push(id);
    if (this.phase === 'lobby' && this.phaseUntil === 0 && this.order.length >= MIN_START) {
      this.phaseUntil = this.time + LOBBY_COUNTDOWN_MS;
    }
  }

  leave(id: string): void {
    if (!this.players.delete(id)) return;
    this.order = this.order.filter((x) => x !== id);
    this.votes.delete(id);
    if (this.order.length === 0) {
      this.phase = 'lobby'; // empty room always resets, whatever the phase
      this.phaseUntil = 0;
      this.votes.clear();
      return;
    }
    if (this.phase === 'vote' || this.phase === 'reveal') {
      if (this.order.length === 1) {
        const champ = this.players.get(this.order[0]!);
        if (champ) {
          champ.score += 3;
          if (champ.score > champ.best) champ.best = champ.score;
          this.pushFeed(`🏆 ${champ.name} takes it — last one at the party!`);
        }
        this.phase = 'final';
        this.phaseUntil = this.time + FINAL_MS;
      } else if (this.phase === 'vote' && this.allVoted()) {
        this.doReveal();
      }
    }
  }

  private seatOf(id: string): number { return this.order.indexOf(id); }

  private allVoted(): boolean {
    for (const id of this.order) if (!this.votes.has(id)) return false;
    return true;
  }

  /** Cast the round's one vote (answer i = seat). Dupes + self-votes die here. */
  vote(id: string, seat: number): void {
    if (this.phase !== 'vote') return;
    const me = this.players.get(id);
    if (!me) return;
    if (!Number.isInteger(seat) || seat < 0 || seat >= this.order.length) return;
    if (this.order[seat] === id) return; // no voting for yourself
    if (this.votes.has(id)) return; // one vote per round — no double-score
    this.votes.set(id, seat);
    if (this.allVoted()) this.doReveal();
  }

  private shuffled(n: number): number[] {
    const a = Array.from({ length: n }, (_, i) => i);
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1));
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
  }

  private startGame(): void {
    this.qOrder = this.shuffled(PROMPTS.length);
    this.roundNo = 0;
    this.crowns = [];
    this.beginVote();
  }

  private beginVote(): void {
    this.phase = 'vote';
    this.votes.clear();
    this.lastTally = [];
    this.lastCrowns = [];
    this.phaseUntil = this.time + VOTE_MS;
  }

  /** Nappers get a random (non-self) vote — the party never stalls. */
  private autoVote(): void {
    for (const id of this.order) {
      if (this.votes.has(id)) continue;
      const mine = this.seatOf(id);
      const pool = this.order.map((_, i) => i).filter((i) => i !== mine);
      if (pool.length === 0) continue;
      this.votes.set(id, pool[Math.floor(this.rand() * pool.length)]!);
    }
  }

  private doReveal(): void {
    // Tally only votes for players still at the party.
    const counts = new Map<string, number>();
    for (const id of this.order) counts.set(id, 0);
    for (const [voter, seat] of this.votes) {
      const target = this.order[seat];
      if (target && target !== voter && counts.has(target)) {
        counts.set(target, counts.get(target)! + 1);
      }
    }
    let top = 0;
    for (const v of counts.values()) top = Math.max(top, v);
    // Tie → lowest seat takes it (deterministic, stated on the card).
    const crownIds = this.order.filter((id) => counts.get(id) === top);
    const crownId = crownIds[0]!;
    const crownName = this.players.get(crownId)?.name ?? '?';
    for (const [id, v] of counts) {
      const p = this.players.get(id);
      if (p) {
        p.score += v; // +1 per vote received
        if (p.score > p.best) p.best = p.score;
      }
    }
    let readers = 0;
    for (const [voter, seat] of this.votes) {
      if (this.order[seat] === crownId) {
        const p = this.players.get(voter);
        if (p) {
          p.score += 2; // read the room right
          if (p.score > p.best) p.best = p.score;
          readers++;
        }
      }
    }
    this.lastTally = this.order.map((id) => ({ id, v: counts.get(id) ?? 0 }));
    this.lastCrowns = [crownId];
    this.crowns.push({ q: this.question(), crown: crownName });
    this.pushFeed(`👑 ${crownName} is MOST ${this.crowns.length}/${ROUNDS} — ${readers} read it right!`);
    this.phase = 'reveal';
    this.phaseUntil = this.time + REVEAL_MS;
  }

  step(dtMs: number): void {
    this.time += dtMs;
    if (this.phase === 'lobby') {
      if (this.phaseUntil !== 0 && this.time >= this.phaseUntil && this.order.length >= MIN_START) {
        this.startGame();
      } else if (this.phaseUntil !== 0 && this.time >= this.phaseUntil) {
        this.phaseUntil = this.time + LOBBY_COUNTDOWN_MS; // keep waiting for the party
      }
    } else if (this.phase === 'vote') {
      if (this.time >= this.phaseUntil) {
        this.autoVote();
        this.doReveal();
      }
    } else if (this.phase === 'reveal') {
      if (this.time >= this.phaseUntil) {
        this.roundNo++;
        if (this.roundNo >= ROUNDS) {
          const champ = [...this.players.values()].sort((a, b) => b.score - a.score)[0];
          if (champ) this.pushFeed(`🏆 ${champ.name} read the room best (${champ.score})!`);
          this.phase = 'final';
          this.phaseUntil = this.time + FINAL_MS;
        } else {
          this.beginVote();
        }
      }
    } else if (this.phase === 'final') {
      if (this.time >= this.phaseUntil) this.nextGame();
    }
  }

  private nextGame(): void {
    this.gameNo++;
    for (const p of this.players.values()) p.score = 0;
    if (this.order.length >= MIN_START) {
      this.qOrder = this.shuffled(PROMPTS.length);
      this.roundNo = 0;
      this.crowns = [];
      this.beginVote();
    } else {
      this.phase = 'lobby';
      this.phaseUntil = 0;
    }
  }

  private pushFeed(s: string): void {
    this.feed.push(s);
    if (this.feed.length > 3) this.feed.splice(0, this.feed.length - 3);
  }

  snapshot(pid: string): RoomSnapshot {
    const me = this.players.get(pid);
    const scores = [...this.players.values()]
      .sort((a, b) => b.score - a.score).slice(0, 15)
      .map((p) => ({ n: p.name, s: p.score, you: p.id === pid, bot: p.isBot }));
    const round = this.phase === 'vote' ? {
      no: this.roundNo + 1,
      of: ROUNDS,
      question: this.question(),
      options: this.order.map((id) => {
        const p = this.players.get(id)!;
        return { n: p.name, you: id === pid, bot: p.isBot };
      }),
      endsInMs: Math.max(0, this.phaseUntil - this.time),
      voted: this.votes.has(pid),
      myPick: this.votes.get(pid) ?? null, // only YOUR ballot ever leaves the server
    } : null;
    const reveal = this.phase === 'reveal' ? {
      question: this.question(),
      crowns: this.lastCrowns.map((id) => this.players.get(id)?.name ?? '?'),
      tally: this.lastTally.map(({ id, v }) => {
        const p = this.players.get(id)!;
        return { n: p.name, v, you: id === pid, bot: p.isBot };
      }),
      youPickedCrown: (this.votes.get(pid) !== undefined) &&
        this.order[this.votes.get(pid)!] === this.lastCrowns[0],
      youGot: this.lastTally.find((t) => t.id === pid)?.v ?? 0,
    } : null;
    return {
      t: 'room',
      phase: this.phase,
      round,
      reveal,
      scores,
      feed: [...this.feed],
      you: { score: me?.score ?? 0 },
    };
  }

  /** RT-3: Party Fingerprint — every round's crown + the room's best reader. */
  fingerprint(room: string, origin: string): ShareArtifact {
    const rows = [...this.players.values()]
      .sort((a, b) => b.score - a.score)
      .map((p) => ({ n: p.name, s: p.score, bot: p.isBot }));
    const champ = rows[0] ?? null;
    const done = this.phase === 'final';
    return {
      kind: 'PartyFingerprint',
      game: 'read-the-room',
      room,
      title: done && champ
        ? `👑 ${champ.n} read the room best (${champ.s})!`
        : '🔮 the party is still voting — come read them!',
      url: buildGameUrl(origin, 'read-the-room', room),
      data: {
        gameNo: this.gameNo,
        rounds: this.crowns.map((c) => ({ q: c.q, crown: c.crown })),
        rows,
      },
    };
  }
}
