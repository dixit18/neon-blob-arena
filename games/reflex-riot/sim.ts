// games/reflex-riot/sim — Reflex Riot task engine (RR-1).
// Pure deterministic sim: time advances only via step(dtMs). No sockets,
// no DOM, no Math.random inside (seeded PRNG per round) — headless-testable.
// The screen invents a new rule every few seconds: tap / hold / avoid /
// mash / copy. First task begins <=3s after the first human arrives.
export type TaskKind = 'tap' | 'hold' | 'avoid' | 'mash' | 'copy';
export type RiotPhase = 'lobby' | 'task' | 'reveal' | 'final';

export interface RiotTask {
  kind: TaskKind;
  startedAt: number;
  endsAt: number;
  /** hold: ms that must be held. mash: presses needed. copy: seq length. */
  need: number;
  /** copy: pad sequence (0-3) the player must repeat. */
  seq: number[];
}

export interface RiotPlayer {
  id: string;
  name: string;
  isBot: boolean;
  score: number;
  best: number;
  streak: number;
  pressed: boolean;
  pressAt: number;
  presses: number;
  copyIdx: number;
  acted: boolean;
  failed: boolean;
  /** points earned on the last finished task (for reveal + receipts). */
  gain: number;
}

export interface RiotScoreLine { n: string; s: number; you: boolean; bot: boolean }

export interface RiotSnapshot {
  t: 'riot';
  phase: RiotPhase;
  task: { kind: TaskKind; endsInMs: number; need: number; seq: number[] } | null;
  round: { n: number; task: number; total: number };
  scores: RiotScoreLine[];
  feed: string[];
  you: { score: number; streak: number; gain: number };
}

export const TASKS_PER_ROUND = 8;
export const LOBBY_COUNTDOWN_MS = 1000;
export const REVEAL_MS = 1500;
export const FINAL_MS = 6000;
export const FIRST_TASK_BUDGET_MS = 3000;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KINDS: TaskKind[] = ['tap', 'hold', 'avoid', 'mash', 'copy'];

function makeTask(kind: TaskKind, now: number, rand: () => number): RiotTask {
  switch (kind) {
    case 'tap': return { kind, startedAt: now, endsAt: now + 2500, need: 0, seq: [] };
    case 'hold': return { kind, startedAt: now, endsAt: now + 3000, need: 2000, seq: [] };
    case 'avoid': return { kind, startedAt: now, endsAt: now + 3000, need: 0, seq: [] };
    case 'mash': return { kind, startedAt: now, endsAt: now + 3000, need: 8, seq: [] };
    case 'copy': {
      const seq = [0, 1, 2].map(() => Math.floor(rand() * 4));
      return { kind, startedAt: now, endsAt: now + 6000, need: 3, seq };
    }
  }
}

export class RiotSim {
  time = 0;
  phase: RiotPhase = 'lobby';
  task: RiotTask | null = null;
  taskIndex = 0;
  roundNo = 1;
  phaseUntil = 0;
  players = new Map<string, RiotPlayer>();
  feed: string[] = [];
  private rand: () => number = mulberry32(1);
  private lastKind: TaskKind | null = null;

  humanCount(): number { let n = 0; for (const p of this.players.values()) if (!p.isBot) n++; return n; }
  playerCount(): number { return this.players.size; }

  join(id: string, name: string, isBot: boolean): void {
    if (this.players.has(id)) return;
    this.players.set(id, {
      id, name, isBot, score: 0, best: 0, streak: 0,
      pressed: false, pressAt: 0, presses: 0, copyIdx: 0,
      acted: false, failed: false, gain: 0,
    });
    // First human in: the round starts NOW, first task within ~1s (budget 3s).
    if (!isBot && this.phase === 'lobby' && this.phaseUntil === 0) {
      this.phaseUntil = this.time + LOBBY_COUNTDOWN_MS;
    }
  }

  leave(id: string): void { this.players.delete(id); }

  /** Finger down. Returns nothing; scoring resolves at release / task end. */
  press(id: string, at: number = this.time): void {
    const p = this.players.get(id);
    if (!p || p.pressed) return;
    p.pressed = true;
    p.pressAt = at;
    p.presses++;
    if (this.phase !== 'task' || !this.task || p.acted) return;
    const t = this.task;
    if (t.kind === 'avoid') {
      p.failed = true; p.acted = true; p.streak = 0; p.gain = 0; // touched the lava
    } else if (t.kind === 'mash') {
      p.gain += 60; // every edge pays immediately
    }
  }

  /** Finger up. Hold tasks score here; late releases still count partial. */
  release(id: string, at: number = this.time): void {
    const p = this.players.get(id);
    if (!p || !p.pressed) return;
    p.pressed = false;
    if (this.phase !== 'task' || !this.task || p.acted) return;
    const t = this.task;
    if (t.kind === 'tap' && !p.acted) {
      const react = p.pressAt - t.startedAt; // reaction = first finger-down, not release
      if (react < 0) return;
      p.gain = Math.max(100, 1000 - Math.round(react)) + p.streak * 50;
      p.acted = true;
    } else if (t.kind === 'hold' && !p.acted) {
      const held = at - p.pressAt;
      if (p.pressAt - t.startedAt > 1000) { p.acted = true; p.streak = 0; p.gain = 0; return; } // slept on it
      if (held >= t.need) { p.gain = 800 + p.streak * 50; p.acted = true; }
      else p.gain = Math.round((800 * held) / t.need); // partial, settles at task end
    }
  }

  /** Copy-task pad answer (0-3). Wrong pad ends the attempt. */
  answer(id: string, i: number, _at: number = this.time): void {
    const p = this.players.get(id);
    if (!p || this.phase !== 'task' || !this.task || p.acted) return;
    const t = this.task;
    if (t.kind !== 'copy' || i < 0 || i > 3) return;
    if (i === t.seq[p.copyIdx]) {
      p.copyIdx++;
      p.gain += 150;
      if (p.copyIdx >= t.seq.length) { p.gain += 300; p.acted = true; }
    } else {
      p.acted = true; p.streak = 0; // blown it
    }
  }

  step(dtMs: number): void {
    this.time += dtMs;
    if (this.phase === 'lobby') {
      if (this.phaseUntil !== 0 && this.time >= this.phaseUntil && this.humanCount() > 0) this.startTask();
      return;
    }
    if (this.phase === 'task') {
      if (this.time >= (this.task?.endsAt ?? Infinity)) this.finishTask();
      return;
    }
    if (this.phase === 'reveal') {
      if (this.time >= this.phaseUntil) this.nextAfterReveal();
      return;
    }
    if (this.phase === 'final') {
      if (this.time >= this.phaseUntil) this.nextRound();
    }
  }

  private startTask(): void {
    // New rule, never the same twice in a row.
    let kind: TaskKind = KINDS[Math.floor(this.rand() * KINDS.length)]!;
    if (kind === this.lastKind) kind = KINDS[(KINDS.indexOf(kind) + 1) % KINDS.length]!;
    this.lastKind = kind;
    this.task = makeTask(kind, this.time, this.rand);
    this.phase = 'task';
    for (const p of this.players.values()) {
      p.pressed = false; p.presses = 0; p.copyIdx = 0;
      p.acted = false; p.failed = false; p.gain = 0;
    }
  }

  private finishTask(): void {
    const t = this.task;
    if (t) {
      for (const p of this.players.values()) {
        if (t.kind === 'tap' && !p.acted) { p.streak = 0; p.gain = 0; } // never tapped
        else if (t.kind === 'hold' && !p.acted) {
          if (p.pressed) { // still holding at the whistle: full marks
            p.gain = Math.max(p.gain, 800 + p.streak * 50);
            p.acted = true;
          } else if (p.presses === 0) { p.streak = 0; p.gain = 0; }
        }         else if (t.kind === 'avoid' && !p.failed) { p.gain = 400 + p.streak * 25; p.streak++; }
        else if (t.kind === 'mash') { if (p.presses >= t.need) { p.gain += 300; p.streak++; } else if (p.presses === 0) { p.streak = 0; } }
        else if (t.kind === 'copy' && p.copyIdx >= t.seq.length && !p.failed) { p.streak++; }
        if (p.gain > 0 && (t.kind === 'tap' || (t.kind === 'hold' && p.acted) || (t.kind === 'copy' && p.acted))) {
          if (t.kind !== 'copy') p.streak++;
        }
        if (p.gain > 0) { p.score += p.gain; if (p.score > p.best) p.best = p.score; }
        else if (t.kind === 'tap' || t.kind === 'hold') { /* streak already handled */ }
      }
    }
    this.phase = 'reveal';
    this.phaseUntil = this.time + REVEAL_MS;
  }

  private nextAfterReveal(): void {
    this.taskIndex++;
    if (this.taskIndex >= TASKS_PER_ROUND) {
      // Crown the round.
      let win: RiotPlayer | null = null;
      for (const p of this.players.values()) if (!win || p.score > win.score) win = p;
      if (win && win.score > 0) this.pushFeed(`🏆 ${win.name} takes round ${this.roundNo} with ${win.score}!`);
      else this.pushFeed(`round ${this.roundNo} ends quiet — no scores.`);
      this.phase = 'final';
      this.phaseUntil = this.time + FINAL_MS;
      this.task = null;
    } else {
      this.startTask();
    }
  }

  private nextRound(): void {
    this.roundNo++;
    this.taskIndex = 0;
    this.rand = mulberry32(this.roundNo * 2654435761);
    for (const p of this.players.values()) { p.score = 0; p.streak = 0; p.gain = 0; }
    this.phase = 'lobby';
    this.phaseUntil = this.humanCount() > 0 ? this.time + LOBBY_COUNTDOWN_MS : 0;
  }

  private pushFeed(s: string): void {
    this.feed.push(s);
    if (this.feed.length > 3) this.feed.splice(0, this.feed.length - 3);
  }

  snapshot(pid: string): RiotSnapshot {
    const me = this.players.get(pid);
    const scores: RiotScoreLine[] = [...this.players.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((p) => ({ n: p.name, s: p.score, you: p.id === pid, bot: p.isBot }));
    return {
      t: 'riot',
      phase: this.phase,
      task: this.task && this.phase === 'task'
        ? { kind: this.task.kind, endsInMs: Math.max(0, this.task.endsAt - this.time), need: this.task.need, seq: this.task.seq }
        : null,
      round: { n: this.roundNo, task: Math.min(this.taskIndex + 1, TASKS_PER_ROUND), total: TASKS_PER_ROUND },
      scores,
      feed: [...this.feed],
      you: { score: me?.score ?? 0, streak: me?.streak ?? 0, gain: me?.gain ?? 0 },
    };
  }
}
