import { buildGameUrl, type ShareArtifact } from '../../packages/share/src/index.js';

// games/totem-panic/sim — TOTEM PANIC co-op tower engine (TP-1).
// One seeded drop order per run; the table places round-robin. Two honest
// ways to fall: a block that doesn't overlap enough SLIPS, and a tower
// whose weight leans past the base TOPPLES. Ten levels + a 3s hold raises
// the totem. Placements are the replay — re-simulation is exact.
// Late joiners spectate to the next run; leavers ghost and reclaim the
// same seat (the Sprint 7 reconnect clause). Solo humans get bot hands
// with the TP-2 driver; the sim itself wants a party (MIN_START 2).
export type TotemPhase = 'lobby' | 'build' | 'hold' | 'final';

export const BASE = { w: 120, x: 0 };
export const WIN_LEVELS = 10;
export const HOLD_MS = 3000;
export const MIN_OVERLAP = 10;
export const LEAN_LIMIT = 60; // base half-width: COM past this topples
export const PLACE_RANGE = 90;
export const TURN_MS = 15_000; // dawdlers auto-place, never stall the table
export const MIN_START = 2;
export const LOBBY_COUNTDOWN_MS = 1500;
export const FINAL_MS = 8000;
const TABLE = 4;

export interface Block { w: number; x: number; by: string }
export interface Placement { by: string; w: number; x: number }

export type Outcome =
  | { result: 'raised'; levels: number }
  | { result: 'slipped'; at: number; x: number }
  | { result: 'toppled'; at: number; lean: number };

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seeded drop order: widths 40..110. Shared by the whole table. */
export function dropOrder(seed: number, n: number): number[] {
  const rand = mulberry32(seed);
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(40 + Math.floor(rand() * 71));
  return out;
}

export function centerOfMass(tower: Block[]): number {
  let m = 0;
  let wsum = 0;
  for (const b of tower) { m += b.w * b.x; wsum += b.w; }
  return wsum === 0 ? 0 : m / wsum;
}

/** Pure replay: placements onto a seeded order. Share + tests use this. */
export function reSim(seed: number, placements: Placement[]): {
  tower: Block[]; outcome: Outcome | null; used: number;
} {
  const widths = dropOrder(seed, placements.length);
  const tower: Block[] = [];
  for (let i = 0; i < placements.length; i++) {
    const p = placements[i]!;
    const w = widths[i]!;
    const below = tower.length === 0 ? BASE : tower[tower.length - 1]!;
    if (Math.abs(p.x - below.x) > (below.w + w) / 2 - MIN_OVERLAP) {
      tower.push({ w, x: p.x, by: p.by }); // the fallen block stays visible
      return { tower, outcome: { result: 'slipped', at: tower.length - 1, x: p.x }, used: i + 1 };
    }
    tower.push({ w, x: p.x, by: p.by });
    const lean = centerOfMass(tower) - BASE.x;
    if (Math.abs(lean) > LEAN_LIMIT) {
      return { tower, outcome: { result: 'toppled', at: i, lean }, used: i + 1 };
    }
  }
  if (tower.length >= WIN_LEVELS) {
    return { tower, outcome: { result: 'raised', levels: tower.length }, used: placements.length };
  }
  return { tower, outcome: null, used: placements.length };
}

export interface TotemPlayer {
  id: string; name: string; isBot: boolean;
  active: boolean; // false = ghosted (left mid-run, may reclaim)
  spectating: boolean; // late joiners watch until the next run
  placed: number;
  best: number | null; // most levels raised with this table
}

export interface TotemSnapshot {
  t: 'totem';
  phase: TotemPhase;
  seed: number;
  tower: { w: number; x: number }[];
  queue: number[]; // next widths (3)
  turn: { name: string; you: boolean; endsInMs: number } | null;
  spectating: boolean;
  lean: number;
  levelsLeft: number;
  outcome: Outcome | null;
  leaders: { n: string; placed: number; you: boolean; bot: boolean; gone: boolean }[];
  feed: string[];
  you: { placed: number; best: number | null };
}

export class TotemSim {
  time = 0;
  phase: TotemPhase = 'lobby';
  players = new Map<string, TotemPlayer>();
  order: string[] = []; // seating (ghosts keep their chairs)
  tower: Block[] = [];
  placements: Placement[] = [];
  seed = 0;
  runNo = 0;
  turnIdx = 0;
  turnUntil = 0;
  phaseUntil = 0;
  outcome: Outcome | null = null;
  feed: string[] = [];
  private base: number;
  private rand: () => number;

  constructor(rand: () => number = Math.random, seed?: number) {
    this.rand = rand;
    this.base = (seed ?? Math.floor(rand() * 0x7fffffff)) >>> 0;
  }

  playerCount(): number {
    let n = 0;
    for (const p of this.players.values()) if (p.active) n++;
    return n;
  }

  private activeIds(): string[] {
    return this.order.filter((id) => {
      const p = this.players.get(id)!;
      return p.active && !p.spectating;
    });
  }

  join(id: string, name: string, isBot: boolean): void {
    const known = this.players.get(id);
    if (known) {
      // Reclaim: the ghost takes its chair back, record intact.
      known.active = true;
      known.name = name;
      if (this.phase === 'lobby' && this.phaseUntil === 0 && this.playerCount() >= MIN_START) {
        this.phaseUntil = this.time + LOBBY_COUNTDOWN_MS;
      }
      return;
    }
    const spectating = this.phase === 'build' || this.phase === 'hold';
    this.players.set(id, {
      id, name, isBot, active: true, spectating, placed: 0, best: null,
    });
    this.order.push(id);
    if (spectating) this.pushFeed(`👁️ ${name} spectates until the next raise!`);
    if (this.phase === 'lobby' && this.phaseUntil === 0 && this.playerCount() >= MIN_START) {
      this.phaseUntil = this.time + LOBBY_COUNTDOWN_MS;
    }
  }

  leave(id: string): void {
    const p = this.players.get(id);
    if (!p || !p.active) return;
    p.active = false; // ghost, don't delete — reclaim restores the seat
    if (this.playerCount() === 0) {
      this.phase = 'lobby'; // nobody home: reset, ghosts cleared
      this.phaseUntil = 0;
      this.players.clear();
      this.order = [];
      this.tower = [];
      this.placements = [];
      this.outcome = null;
      this.feed = [];
    }
  }

  private nextWidth(): number {
    return dropOrder(this.seed, this.tower.length + 1)[this.tower.length]!;
  }

  /** Place the queued block at x. Only the turn seat, only in build. */
  place(id: string, x: number): boolean {
    if (this.phase !== 'build') return false;
    const ids = this.activeIds();
    if (ids.length === 0 || ids[this.turnIdx % ids.length] !== id) return false;
    if (!Number.isFinite(x)) return false;
    const cx = Math.max(-PLACE_RANGE, Math.min(PLACE_RANGE, x));
    this.commit(id, cx);
    return true;
  }

  private commit(id: string, x: number): void {
    const p = this.players.get(id)!;
    const w = this.nextWidth();
    this.placements.push({ by: p.name, w, x });
    const below = this.tower.length === 0 ? BASE : this.tower[this.tower.length - 1]!;
    if (Math.abs(x - below.x) > (below.w + w) / 2 - MIN_OVERLAP) {
      this.tower.push({ w, x, by: p.name });
      this.outcome = { result: 'slipped', at: this.tower.length - 1, x };
      this.pushFeed(`💥 ${p.name}'s block slips off at level ${this.tower.length}!`);
      this.doFinal();
      return;
    }
    this.tower.push({ w, x, by: p.name });
    p.placed++;
    const lean = centerOfMass(this.tower) - BASE.x;
    if (Math.abs(lean) > LEAN_LIMIT) {
      this.outcome = { result: 'toppled', at: this.tower.length - 1, lean };
      this.pushFeed(`🗼 the totem topples at level ${this.tower.length}!`);
      this.doFinal();
      return;
    }
    if (this.tower.length >= WIN_LEVELS) {
      this.phase = 'hold';
      this.phaseUntil = this.time + HOLD_MS;
      this.pushFeed(`⏳ ${WIN_LEVELS} high — hold it ${HOLD_MS / 1000}s!`);
      return;
    }
    this.advanceTurn();
  }

  private advanceTurn(): void {
    const ids = this.activeIds();
    if (ids.length === 0) return;
    this.turnIdx = (this.turnIdx + 1) % ids.length;
    this.turnUntil = this.time + TURN_MS;
  }

  private startRun(): void {
    this.runNo++;
    this.seed = (this.base + this.runNo - 1) >>> 0;
    this.tower = [];
    this.placements = [];
    this.outcome = null;
    for (const p of this.players.values()) {
      p.placed = 0;
      if (p.spectating) p.spectating = false; // newcomers take their slot
    }
    this.turnIdx = 0;
    this.phase = 'build';
    this.phaseUntil = 0;
    this.turnUntil = this.time + TURN_MS;
  }

  private doFinal(): void {
    const raised = this.outcome?.result === 'raised';
    for (const p of this.players.values()) {
      if (!p.active || p.spectating) continue;
      if (raised && (p.best === null || this.tower.length > p.best)) p.best = this.tower.length;
    }
    if (raised) this.pushFeed(`🎉 TOTEM RAISED — ${this.tower.length} levels standing!`);
    this.phase = 'final';
    this.phaseUntil = this.time + FINAL_MS;
  }

  step(dtMs: number): void {
    this.time += dtMs;
    if (this.phase === 'lobby') {
      if (this.phaseUntil !== 0 && this.time >= this.phaseUntil && this.playerCount() >= MIN_START) {
        this.startRun();
      } else if (this.phaseUntil !== 0 && this.time >= this.phaseUntil) {
        this.phaseUntil = this.time + LOBBY_COUNTDOWN_MS;
      }
    } else if (this.phase === 'build') {
      const ids = this.activeIds();
      if (ids.length === 0) return;
      if (this.time >= this.turnUntil) {
        // Dawdlers auto-place near-center: the table never stalls.
        const id = ids[this.turnIdx % ids.length]!;
        const below = this.tower.length === 0 ? BASE : this.tower[this.tower.length - 1]!;
        const jitter = (this.rand() - 0.5) * 20;
        this.commit(id, below.x + jitter);
      }
    } else if (this.phase === 'hold') {
      if (this.time >= this.phaseUntil) {
        this.outcome = { result: 'raised', levels: this.tower.length };
        this.doFinal();
      }
    } else if (this.phase === 'final') {
      if (this.time >= this.phaseUntil) {
        if (this.playerCount() >= MIN_START) this.startRun();
        else {
          this.phase = 'lobby';
          this.phaseUntil = 0;
        }
      }
    }
  }

  private pushFeed(s: string): void {
    this.feed.push(s);
    if (this.feed.length > 3) this.feed.splice(0, this.feed.length - 3);
  }

  snapshot(pid: string): TotemSnapshot {
    const me = this.players.get(pid);
    const ids = this.activeIds();
    const turnId = ids.length > 0 ? ids[this.turnIdx % ids.length]! : null;
    const turnName = turnId ? this.players.get(turnId)?.name ?? '—' : '—';
    return {
      t: 'totem',
      phase: this.phase,
      seed: this.seed,
      tower: this.tower.map((b) => ({ w: b.w, x: Math.round(b.x * 10) / 10 })),
      queue: dropOrder(this.seed, this.tower.length + 3).slice(this.tower.length, this.tower.length + 3),
      turn: this.phase === 'build' ? {
        name: turnName, you: turnId === pid,
        endsInMs: Math.max(0, this.turnUntil - this.time),
      } : null,
      spectating: me ? me.spectating && me.active : false,
      lean: Math.round((centerOfMass(this.tower) - BASE.x) * 10) / 10,
      levelsLeft: Math.max(0, WIN_LEVELS - this.tower.length),
      outcome: this.outcome,
      leaders: [...this.players.values()]
        .filter((p) => p.active)
        .sort((a, b) => b.placed - a.placed).slice(0, 10)
        .map((p) => ({ n: p.name, placed: p.placed, you: p.id === pid, bot: p.isBot, gone: false })),
      feed: [...this.feed],
      you: { placed: me?.placed ?? 0, best: me?.best ?? null },
    };
  }

  /** TP-3: ReplayMoment — the placements ARE the replay (exact re-sim). */
  replay(room: string, origin: string): ShareArtifact {
    const done = this.phase === 'final';
    const o = this.outcome;
    const title = done && o
      ? o.result === 'raised'
        ? `🎉 raised ${o.levels} high — beat our totem!`
        : o.result === 'slipped'
          ? `💥 it slipped at level ${this.tower.length} — hold it steadier!`
          : `🗼 it toppled at level ${this.tower.length} — raise it higher!`
      : '🗼 the raising is live — come hold a block!';
    return {
      kind: 'ReplayMoment',
      game: 'totem-panic',
      room,
      title,
      url: buildGameUrl(origin, 'totem-panic', room),
      data: {
        runNo: this.runNo,
        seed: this.seed,
        outcome: o,
        placements: this.placements,
      },
    };
  }
}
