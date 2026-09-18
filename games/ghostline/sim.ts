import { buildGameUrl, type ShareArtifact } from '../../packages/share/src/index.js';

// games/ghostline/sim — GHOSTLINE flick engine (GH-1).
// Async time-trial: one seeded course per run; every player flicks the SAME
// layout on their own puck; fewest shots to the goal wins, time breaks ties.
// Fixed-substep physics + seeded PRNG only — same seed + same flicks replays
// bit-identically (the GhostChallenge contract GH-3/GH-5 will lean on).
// Solo-playable: MIN_START is 1, ghost bots arrive with the GH-2 driver.
export type LinePhase = 'lobby' | 'run' | 'final';

export const FIELD_W = 480;
export const FIELD_H = 320;
export const START = { x: 40, y: 160 };
export const GOAL = { x: 440, y: 160, r: 14 };
export const PUCK_R = 6;
export const MAX_V = 420; // units/s at full power
export const REST_EPS = 4; // below this the puck sleeps
export const FRICTION = 0.55; // per-second linear damping (full power runs ~760u: the 400u lane is makable, walls punish greed)
export const RESTITUTION = 0.72;
export const SUB_H = 1 / 120; // fixed physics substep (s)
export const MAX_SHOTS = 8;
export const WALL_COUNT = 6;
export const MIN_START = 1;
export const LOBBY_COUNTDOWN_MS = 1500;
export const FINAL_MS = 8000;
const TRAIL_EVERY = 6; // record a ghost point every N substeps (20Hz)
const TRAIL_CAP = 4000;

export interface Wall { x: number; y: number; w: number; h: number }
export interface Course { seed: number; walls: Wall[] }
export interface Flick { angle: number; power: number }

export interface RunResult {
  x: number; y: number;
  shots: number; timeMs: number;
  finished: boolean;
  trail: [number, number][];
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

function clearOf(x: number, y: number): boolean {
  const ds = Math.hypot(x - START.x, y - START.y);
  const dg = Math.hypot(x - GOAL.x, y - GOAL.y);
  return ds > 46 && dg > GOAL.r + 26;
}

/** Seeded obstacle course — pure, so tests, ghosts and links share it. */
export function createCourse(seed: number): Course {
  const rand = mulberry32(seed);
  const walls: Wall[] = [];
  let guard = 0;
  while (walls.length < WALL_COUNT && guard++ < 200) {
    const vertical = rand() < 0.5;
    const w = vertical ? 10 + rand() * 8 : 46 + rand() * 70;
    const h = vertical ? 46 + rand() * 70 : 10 + rand() * 8;
    const x = 90 + rand() * (FIELD_W - 180 - w);
    const y = 20 + rand() * (FIELD_H - 40 - h);
    const cx = x + w / 2;
    const cy = y + h / 2;
    if (!clearOf(cx, cy)) continue;
    if (!clearOf(x, y) || !clearOf(x + w, y + h)) continue;
    walls.push({ x, y, w, h });
  }
  return { seed: seed >>> 0, walls };
}

function bounceCircleBox(
  p: { x: number; y: number; vx: number; vy: number }, b: Wall,
): void {
  const cx = Math.min(Math.max(p.x, b.x), b.x + b.w);
  const cy = Math.min(Math.max(p.y, b.y), b.y + b.h);
  let nx = p.x - cx;
  let ny = p.y - cy;
  let d = Math.hypot(nx, ny);
  if (d >= PUCK_R) return;
  if (d === 0) {
    // Center inside the box: shove out along the thinnest axis.
    const l = p.x - b.x;
    const r = b.x + b.w - p.x;
    const t = p.y - b.y;
    const bo = b.y + b.h - p.y;
    const m = Math.min(l, r, t, bo);
    nx = m === l ? -1 : m === r ? 1 : 0;
    ny = m === t ? -1 : m === bo ? 1 : 0;
    d = 1;
  } else {
    nx /= d; ny /= d;
  }
  p.x += nx * (PUCK_R - d);
  p.y += ny * (PUCK_R - d);
  const vn = p.vx * nx + p.vy * ny;
  if (vn < 0) {
    p.vx -= (1 + RESTITUTION) * vn * nx;
    p.vy -= (1 + RESTITUTION) * vn * ny;
  }
}

/** Pure replay: run flicks against a course. Ghosts, links and tests use this. */
export function simulate(course: Course, flicks: Flick[], wantTrail = false): RunResult {
  const p = { x: START.x, y: START.y, vx: 0, vy: 0 };
  const trail: [number, number][] = [];
  let timeMs = 0;
  let finished = false;
  let used = 0;
  let sub = 0;
  for (const f of flicks) {
    if (finished || used >= MAX_SHOTS) break;
    if (!Number.isFinite(f.angle) || !Number.isFinite(f.power)) continue;
    if (f.power <= 0 || f.power > 1) continue;
    used++;
    p.vx = Math.cos(f.angle) * f.power * MAX_V;
    p.vy = Math.sin(f.angle) * f.power * MAX_V;
    for (;;) {
      const sp = Math.hypot(p.vx, p.vy);
      if (sp < REST_EPS) { p.vx = 0; p.vy = 0; break; }
      const damp = Math.max(0, 1 - FRICTION * SUB_H);
      p.vx *= damp; p.vy *= damp;
      p.x += p.vx * SUB_H;
      p.y += p.vy * SUB_H;
      if (p.x < PUCK_R) { p.x = PUCK_R; p.vx = Math.abs(p.vx) * RESTITUTION; }
      if (p.x > FIELD_W - PUCK_R) { p.x = FIELD_W - PUCK_R; p.vx = -Math.abs(p.vx) * RESTITUTION; }
      if (p.y < PUCK_R) { p.y = PUCK_R; p.vy = Math.abs(p.vy) * RESTITUTION; }
      if (p.y > FIELD_H - PUCK_R) { p.y = FIELD_H - PUCK_R; p.vy = -Math.abs(p.vy) * RESTITUTION; }
      for (const w of course.walls) bounceCircleBox(p, w);
      timeMs += SUB_H * 1000;
      if (wantTrail && sub++ % TRAIL_EVERY === 0 && trail.length < TRAIL_CAP) {
        trail.push([Math.round(p.x), Math.round(p.y)]);
      }
      if (Math.hypot(p.x - GOAL.x, p.y - GOAL.y) < GOAL.r) {
        finished = true;
        p.vx = 0; p.vy = 0;
        break;
      }
      if (timeMs > 120_000) break; // a runaway flick never hangs the room
    }
  }
  return { x: p.x, y: p.y, shots: used, timeMs, finished, trail };
}

/** Replay a recorded run: seed + flicks → the exact result, or null. */
export function runReplay(rep: { seed: number; flicks: Flick[] }): RunResult | null {
  if (!Number.isInteger(rep.seed)) return null;
  if (!Array.isArray(rep.flicks)) return null;
  return simulate(createCourse(rep.seed >>> 0), rep.flicks);
}

export interface LinePlayer {
  id: string; name: string; isBot: boolean;
  x: number; y: number; vx: number; vy: number;
  shots: number; timeMs: number; finished: boolean; exhausted: boolean;
  flicks: Flick[];
  best: number | null; // fewest finishing shots, all runs
}

export interface LineSnapshot {
  t: 'line';
  phase: LinePhase;
  seed: number;
  walls: Wall[];
  shotsLeft: number;
  puck: { x: number; y: number };
  atRest: boolean;
  endsInMs: number;
  leaders: { n: string; shots: number; finished: boolean; timeMs: number; you: boolean; bot: boolean }[];
  feed: string[];
  you: { shots: number; best: number | null };
}

export class LineSim {
  time = 0;
  phase: LinePhase = 'lobby';
  players = new Map<string, LinePlayer>();
  order: string[] = [];
  seed = 0;
  course: Course = { seed: 0, walls: [] };
  runNo = 0;
  phaseUntil = 0;
  feed: string[] = [];
  private base: number;

  constructor(rand: () => number = Math.random, seed?: number) {
    this.base = (seed ?? Math.floor(rand() * 0x7fffffff)) >>> 0;
  }

  playerCount(): number { return this.players.size; }

  join(id: string, name: string, isBot: boolean): void {
    if (this.players.has(id)) return;
    this.players.set(id, {
      id, name, isBot,
      x: START.x, y: START.y, vx: 0, vy: 0,
      shots: 0, timeMs: 0, finished: false, exhausted: false,
      flicks: [], best: null,
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
      this.feed = [];
      return;
    }
    if (this.phase === 'run' && this.allDone()) this.doFinal();
  }

  /** Flick the puck. Only at rest, only on your run, bad input dies here. */
  flick(id: string, angle: number, power: number): boolean {
    if (this.phase !== 'run') return false;
    const p = this.players.get(id);
    if (!p || p.finished || p.exhausted) return false;
    if (Math.hypot(p.vx, p.vy) >= REST_EPS) return false; // no mid-roll flicks
    if (!Number.isFinite(angle) || !Number.isFinite(power)) return false;
    if (power <= 0 || power > 1) return false;
    if (p.shots >= MAX_SHOTS) return false;
    p.flicks.push({ angle, power });
    p.shots++;
    p.vx = Math.cos(angle) * power * MAX_V;
    p.vy = Math.sin(angle) * power * MAX_V;
    return true;
  }

  private allDone(): boolean {
    for (const id of this.order) {
      const p = this.players.get(id)!;
      if (!p.finished && !p.exhausted) return false;
    }
    return true;
  }

  private startRun(): void {
    this.runNo++;
    // Run N plays base+N-1, so LineSim(rand, seed) opens on seed exactly —
    // links and ghosts name the course the room actually plays.
    this.seed = (this.base + this.runNo - 1) >>> 0;
    this.course = createCourse(this.seed);
    for (const p of this.players.values()) {
      p.x = START.x; p.y = START.y; p.vx = 0; p.vy = 0;
      p.shots = 0; p.timeMs = 0;
      p.finished = false; p.exhausted = false;
      p.flicks = [];
    }
    this.phase = 'run';
    this.phaseUntil = 0; // the run ends when every line is done, not on a clock
  }

  private stepPuck(p: LinePlayer, dtMs: number): void {
    if (p.finished || p.exhausted) return;
    // Quantized to whole fixed substeps — no residue slivers, so the live
    // puck walks the same op sequence as simulate() on the same flicks.
    let n = Math.max(0, Math.round(dtMs / 1000 / SUB_H));
    while (n-- > 0) {
      const h = SUB_H;
      const sp = Math.hypot(p.vx, p.vy);
      if (sp < REST_EPS) { p.vx = 0; p.vy = 0; break; }
      const damp = Math.max(0, 1 - FRICTION * h);
      p.vx *= damp; p.vy *= damp;
      p.x += p.vx * h;
      p.y += p.vy * h;
      if (p.x < PUCK_R) { p.x = PUCK_R; p.vx = Math.abs(p.vx) * RESTITUTION; }
      if (p.x > FIELD_W - PUCK_R) { p.x = FIELD_W - PUCK_R; p.vx = -Math.abs(p.vx) * RESTITUTION; }
      if (p.y < PUCK_R) { p.y = PUCK_R; p.vy = Math.abs(p.vy) * RESTITUTION; }
      if (p.y > FIELD_H - PUCK_R) { p.y = FIELD_H - PUCK_R; p.vy = -Math.abs(p.vy) * RESTITUTION; }
      for (const w of this.course.walls) bounceCircleBox(p, w);
      p.timeMs += h * 1000;
      if (Math.hypot(p.x - GOAL.x, p.y - GOAL.y) < GOAL.r) {
        p.finished = true;
        p.vx = 0; p.vy = 0;
        if (p.best === null || p.shots < p.best) p.best = p.shots;
        this.pushFeed(`🎯 ${p.name} holes it in ${p.shots}!`);
        break;
      }
    }
    if (!p.finished && p.shots >= MAX_SHOTS && Math.hypot(p.vx, p.vy) < REST_EPS) {
      p.exhausted = true;
    }
  }

  private rank(): LinePlayer[] {
    return [...this.players.values()].sort((a, b) => {
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (a.shots !== b.shots) return a.shots - b.shots;
      return a.timeMs - b.timeMs;
    });
  }

  private doFinal(): void {
    const champ = this.rank()[0];
    if (champ) {
      this.pushFeed(champ.finished
        ? `👻 ${champ.name} sets the ghost (${champ.shots} shots)!`
        : `👻 ${champ.name} gets closest — no finish this run!`);
    }
    this.phase = 'final';
    this.phaseUntil = this.time + FINAL_MS;
  }

  step(dtMs: number): void {
    this.time += dtMs;
    if (this.phase === 'lobby') {
      if (this.phaseUntil !== 0 && this.time >= this.phaseUntil && this.order.length >= MIN_START) {
        this.startRun();
      } else if (this.phaseUntil !== 0 && this.time >= this.phaseUntil) {
        this.phaseUntil = this.time + LOBBY_COUNTDOWN_MS;
      }
    } else if (this.phase === 'run') {
      for (const id of this.order) this.stepPuck(this.players.get(id)!, dtMs);
      if (this.allDone()) this.doFinal();
    } else if (this.phase === 'final') {
      if (this.time >= this.phaseUntil) {
        if (this.order.length >= MIN_START) this.startRun();
        else { this.phase = 'lobby'; this.phaseUntil = 0; }
      }
    }
  }

  private pushFeed(s: string): void {
    this.feed.push(s);
    if (this.feed.length > 3) this.feed.splice(0, this.feed.length - 3);
  }

  /** The exact recorded run — GH-3 turns this into a GhostChallenge link. */
  replayOf(id: string): { seed: number; flicks: Flick[] } | null {
    const p = this.players.get(id);
    if (!p) return null;
    return { seed: this.seed, flicks: p.flicks.map((f) => ({ ...f })) };
  }

  snapshot(pid: string): LineSnapshot {
    const me = this.players.get(pid);
    return {
      t: 'line',
      phase: this.phase,
      seed: this.seed,
      walls: this.course.walls,
      shotsLeft: me ? MAX_SHOTS - me.shots : MAX_SHOTS,
      puck: { x: me?.x ?? START.x, y: me?.y ?? START.y },
      atRest: me ? Math.hypot(me.vx, me.vy) < REST_EPS : true,
      endsInMs: this.phase === 'final' ? Math.max(0, this.phaseUntil - this.time) : 0,
      leaders: this.rank().slice(0, 8).map((p) => ({
        n: p.name, shots: p.shots, finished: p.finished,
        timeMs: Math.round(p.timeMs), you: p.id === pid, bot: p.isBot,
      })),
      feed: [...this.feed],
      you: { shots: me?.shots ?? 0, best: me?.best ?? null },
    };
  }

  /** GH-3: GhostChallenge — the author's exact seed + replay as the dare. */
  ghost(room: string, origin: string): ShareArtifact {
    const champ = this.rank().find((p) => p.finished) ?? null;
    const done = this.phase === 'final';
    const rep = champ ? this.replayOf(champ.id) : null;
    return {
      kind: 'GhostChallenge',
      game: 'ghostline',
      room,
      title: done && champ
        ? `👻 ${champ.name} ran it in ${champ.shots} — chase the ghost!`
        : '👻 no ghost set yet — run the line first!',
      url: buildGameUrl(origin, 'ghostline', room, rep ? { seed: String(rep.seed) } : undefined),
      data: {
        runNo: this.runNo,
        seed: this.seed,
        author: champ?.name ?? null,
        shots: champ?.shots ?? null,
        flicks: rep?.flicks ?? [],
      },
    };
  }
}
