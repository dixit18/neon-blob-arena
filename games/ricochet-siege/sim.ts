import { buildGameUrl, type ShareArtifact } from '../../packages/share/src/index.js';

// games/ricochet-siege/sim — RICOCHET SIEGE simultaneous-commit artillery (RS-1).
// Every round: all hulls secretly commit {angle, power}, the window shuts,
// ALL shots fly at once and bounce off bounds + seeded bumpers. Hits cost
// HP (3 per round); last hull rolling — or most HP standing — takes the
// round; 5 rounds take the siege. Zero client authority: the wire carries
// aim numbers only, the server sims every bounce. Commits ARE the replay —
// seed + commit log re-simulates bit-identically (RS-3 leans on this).
// Party game (MIN_START 2, bots backfill with the RS-2 driver); leavers
// ghost and reclaim; joiners roll in next round.
export type SiegePhase = 'lobby' | 'aim' | 'volley' | 'final';

export const ARENA_W = 480;
export const ARENA_H = 320;
export const HULL_R = 10;
export const HIT_R = 13;
export const MAX_HP = 3;
export const ROUNDS = 5;
export const SHOT_SPEED = 380;
export const RESTITUTION = 0.92;
export const MAX_BOUNCE = 6;
export const SHOT_LIFE_MS = 6000;
export const SUB_H = 1 / 120;
export const AIM_MS = 8000;
export const BUMPER_COUNT = 5;
export const MIN_START = 2;
export const LOBBY_COUNTDOWN_MS = 1500;
export const FINAL_MS = 8000;

export interface Bumper { x: number; y: number; w: number; h: number }
export interface Commit { angle: number; power: number }
export interface RoundLog { seed: number; commits: { by: string; angle: number; power: number }[] }

export interface Shot {
  by: string;
  x: number; y: number; vx: number; vy: number;
  bounces: number; lifeMs: number; dead: boolean;
}

export interface Hull {
  id: string; name: string; isBot: boolean;
  active: boolean; // false = ghosted (may reclaim)
  playsRound: boolean; // joiners wait for the next round
  x: number; y: number; hp: number; alive: boolean;
  commit: Commit | null;
  wins: number; hits: number;
  best: number | null; // most round-wins in one siege
}

export interface VolleyResult {
  hits: { by: string; victim: string }[];
  alive: string[];
  shotsFired: number;
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

/** 8 spawn pads around the rim, seats take them in order. */
export const PADS: { x: number; y: number }[] = [
  { x: 50, y: 50 }, { x: 430, y: 50 }, { x: 50, y: 270 }, { x: 430, y: 270 },
  { x: 240, y: 50 }, { x: 240, y: 270 }, { x: 50, y: 160 }, { x: 430, y: 160 },
];

/** Seeded bumpers, kept clear of every pad. */
export function makeBumpers(seed: number): Bumper[] {
  const rand = mulberry32(seed);
  const out: Bumper[] = [];
  let guard = 0;
  while (out.length < BUMPER_COUNT && guard++ < 200) {
    const vertical = rand() < 0.5;
    const w = vertical ? 10 + rand() * 8 : 50 + rand() * 70;
    const h = vertical ? 50 + rand() * 70 : 10 + rand() * 8;
    const x = 100 + rand() * (ARENA_W - 200 - w);
    const y = 50 + rand() * (ARENA_H - 100 - h);
    const cx = x + w / 2;
    const cy = y + h / 2;
    if (PADS.every((p) => Math.hypot(p.x - cx, p.y - cy) > 70)) {
      out.push({ x, y, w, h });
    }
  }
  return out;
}

function bounceShot(s: Shot, b: Bumper): void {
  const cx = Math.min(Math.max(s.x, b.x), b.x + b.w);
  const cy = Math.min(Math.max(s.y, b.y), b.y + b.h);
  let nx = s.x - cx;
  let ny = s.y - cy;
  let d = Math.hypot(nx, ny);
  if (d >= 3) return;
  if (d === 0) {
    const l = s.x - b.x;
    const r = b.x + b.w - s.x;
    const t = s.y - b.y;
    const bo = b.y + b.h - s.y;
    const m = Math.min(l, r, t, bo);
    nx = m === l ? -1 : m === r ? 1 : 0;
    ny = m === t ? -1 : m === bo ? 1 : 0;
    d = 1;
  } else {
    nx /= d; ny /= d;
  }
  s.x += nx * (3 - d);
  s.y += ny * (3 - d);
  const vn = s.vx * nx + s.vy * ny;
  if (vn < 0) {
    s.vx -= (1 + RESTITUTION) * vn * nx;
    s.vy -= (1 + RESTITUTION) * vn * ny;
    s.bounces++;
  }
}

/**
 * Pure volley: pads + bumpers + commits → hits. Terminates always
 * (bounce + life caps), so 1,000 seeded cases stay cheap.
 */
export function reVolley(
  pads: { x: number; y: number }[],
  bumpers: Bumper[],
  commits: { by: string; angle: number; power: number }[],
): VolleyResult {
  const hp = new Map<string, number>();
  const pos = new Map<string, { x: number; y: number }>();
  commits.forEach((c, i) => {
    hp.set(c.by, MAX_HP);
    pos.set(c.by, { ...pads[i % pads.length]! });
  });
  const shots: Shot[] = commits.map((c, i) => ({
    by: c.by,
    x: pads[i % pads.length]!.x,
    y: pads[i % pads.length]!.y,
    vx: Math.cos(c.angle) * c.power * SHOT_SPEED,
    vy: Math.sin(c.angle) * c.power * SHOT_SPEED,
    bounces: 0, lifeMs: SHOT_LIFE_MS, dead: false,
  }));
  const hits: { by: string; victim: string }[] = [];
  for (;;) {
    let flying = 0;
    for (const s of shots) {
      if (s.dead) continue;
      flying++;
      let left = SUB_H;
      while (left > 0 && !s.dead) {
        const h = Math.min(1 / 120, left);
        left -= h;
        s.x += s.vx * h;
        s.y += s.vy * h;
        if (s.x < 3) { s.x = 3; s.vx = Math.abs(s.vx) * RESTITUTION; s.bounces++; }
        if (s.x > ARENA_W - 3) { s.x = ARENA_W - 3; s.vx = -Math.abs(s.vx) * RESTITUTION; s.bounces++; }
        if (s.y < 3) { s.y = 3; s.vy = Math.abs(s.vy) * RESTITUTION; s.bounces++; }
        if (s.y > ARENA_H - 3) { s.y = ARENA_H - 3; s.vy = -Math.abs(s.vy) * RESTITUTION; s.bounces++; }
        for (const b of bumpers) bounceShot(s, b);
        s.lifeMs -= h * 1000;
        for (const [id, p] of pos) {
          if (id === s.by || (hp.get(id) ?? 0) <= 0) continue; // no self-hits, no corpse-hits
          if (Math.hypot(s.x - p.x, s.y - p.y) < HIT_R) {
            hp.set(id, (hp.get(id) ?? 1) - 1);
            hits.push({ by: s.by, victim: id });
            s.dead = true;
            break;
          }
        }
        if (s.bounces > MAX_BOUNCE || s.lifeMs <= 0) s.dead = true;
      }
    }
    if (flying === 0) break;
  }
  return {
    hits,
    alive: [...hp.entries()].filter(([, v]) => v > 0).map(([k]) => k),
    shotsFired: shots.length,
  };
}

export interface SiegeSnapshot {
  t: 'siege';
  phase: SiegePhase;
  round: number;
  of: number;
  seed: number;
  bumpers: Bumper[];
  tanks: { n: string; x: number; y: number; hp: number; alive: boolean; you: boolean; bot: boolean }[];
  tracers: { x: number; y: number }[];
  committed: number;
  need: number;
  endsInMs: number;
  leaders: { n: string; wins: number; hits: number; you: boolean; bot: boolean; locked: boolean }[];
  feed: string[];
  you: { hp: number; wins: number; best: number | null };
}

export class SiegeSim {
  time = 0;
  phase: SiegePhase = 'lobby';
  players = new Map<string, Hull>();
  order: string[] = [];
  roundNo = 0;
  seed = 0;
  bumpers: Bumper[] = [];
  shots: Shot[] = [];
  log: RoundLog[] = [];
  phaseUntil = 0;
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

  private entered(): Hull[] {
    return this.order
      .map((id) => this.players.get(id)!)
      .filter((p) => p.active && p.playsRound);
  }

  join(id: string, name: string, isBot: boolean): void {
    const known = this.players.get(id);
    if (known) {
      known.active = true; // reclaim: record intact
      known.name = name;
      if (this.phase === 'lobby' && this.phaseUntil === 0 && this.playerCount() >= MIN_START) {
        this.phaseUntil = this.time + LOBBY_COUNTDOWN_MS;
      }
      return;
    }
    const midMatch = this.phase === 'aim' || this.phase === 'volley';
    this.players.set(id, {
      id, name, isBot, active: true, playsRound: !midMatch,
      x: 0, y: 0, hp: MAX_HP, alive: false, commit: null,
      wins: 0, hits: 0, best: null,
    });
    this.order.push(id);
    if (midMatch) this.pushFeed(`👁️ ${name} rolls in next round!`);
    if (this.phase === 'lobby' && this.phaseUntil === 0 && this.playerCount() >= MIN_START) {
      this.phaseUntil = this.time + LOBBY_COUNTDOWN_MS;
    }
  }

  leave(id: string): void {
    const p = this.players.get(id);
    if (!p || !p.active) return;
    p.active = false; // ghost — reclaim restores the hull
    p.commit = null;
    if (this.playerCount() === 0) {
      this.phase = 'lobby';
      this.phaseUntil = 0;
      this.players.clear();
      this.order = [];
      this.shots = [];
      this.log = [];
      this.feed = [];
    } else if (this.phase === 'aim' && this.entered().every((e) => e.commit)) {
      this.fire();
    }
  }

  /** Lock an aim. Sealed until the volley; bad numbers die here. */
  commit(id: string, angle: number, power: number): boolean {
    if (this.phase !== 'aim') return false;
    const p = this.players.get(id);
    if (!p || !p.active || !p.playsRound || !p.alive) return false;
    if (!Number.isFinite(angle) || !Number.isFinite(power)) return false;
    if (power <= 0 || power > 1) return false;
    p.commit = { angle, power };
    if (this.entered().every((e) => e.commit)) this.fire();
    return true;
  }

  private startMatch(): void {
    this.roundNo = 0;
    this.log = [];
    this.startRound();
  }

  private startRound(): void {
    this.roundNo++;
    this.seed = (this.base + this.roundNo - 1) >>> 0;
    this.bumpers = makeBumpers(this.seed);
    this.shots = [];
    const ids = this.entered();
    ids.forEach((p, i) => {
      p.x = PADS[i % PADS.length]!.x;
      p.y = PADS[i % PADS.length]!.y;
      p.hp = MAX_HP;
      p.alive = true;
      p.commit = null;
      p.playsRound = true;
    });
    // Joiners waiting in the wings roll in now.
    for (const p of this.players.values()) {
      if (p.active && !p.playsRound) {
        p.playsRound = true;
        p.x = PADS[ids.length % PADS.length]!.x;
        p.y = PADS[ids.length % PADS.length]!.y;
        p.hp = MAX_HP;
        p.alive = true;
        p.commit = null;
      }
    }
    this.phase = 'aim';
    this.phaseUntil = this.time + AIM_MS;
  }

  private autoCommit(p: Hull): void {
    // Dawdlers fire straight ahead-down-range, never stall the volley.
    p.commit = { angle: Math.atan2(ARENA_H / 2 - p.y, ARENA_W / 2 - p.x), power: 0.5 };
  }

  private fire(): void {
    const ids = this.entered();
    for (const p of ids) if (!p.commit) this.autoCommit(p);
    const commits = ids.map((p) => ({ by: p.id, angle: p.commit!.angle, power: p.commit!.power }));
    this.log.push({ seed: this.seed, commits: commits.map((c) => ({ ...c })) });
    this.shots = commits.map((c) => {
      const p = this.players.get(c.by)!;
      return {
        by: c.by, x: p.x, y: p.y,
        vx: Math.cos(c.angle) * c.power * SHOT_SPEED,
        vy: Math.sin(c.angle) * c.power * SHOT_SPEED,
        bounces: 0, lifeMs: SHOT_LIFE_MS, dead: false,
      };
    });
    // The log IS the replay: seed + commits re-simulate exactly (RS-3).
    this.phase = 'volley';
    this.phaseUntil = 0;
    this.pushFeed(`💥 ${commits.length} shots away!`);
  }

  private stepVolley(dtMs: number): void {
    // Quantized to whole fixed substeps — no residue slivers.
    let n = Math.max(0, Math.round(dtMs / 1000 / SUB_H));
    while (n-- > 0) {
      const h = SUB_H;
      let flying = 0;
      for (const s of this.shots) {
        if (s.dead) continue;
        flying++;
        s.x += s.vx * h;
        s.y += s.vy * h;
        if (s.x < 3) { s.x = 3; s.vx = Math.abs(s.vx) * RESTITUTION; s.bounces++; }
        if (s.x > ARENA_W - 3) { s.x = ARENA_W - 3; s.vx = -Math.abs(s.vx) * RESTITUTION; s.bounces++; }
        if (s.y < 3) { s.y = 3; s.vy = Math.abs(s.vy) * RESTITUTION; s.bounces++; }
        if (s.y > ARENA_H - 3) { s.y = ARENA_H - 3; s.vy = -Math.abs(s.vy) * RESTITUTION; s.bounces++; }
        for (const b of this.bumpers) bounceShot(s, b);
        s.lifeMs -= h * 1000;
        for (const e of this.entered()) {
          if (e.id === s.by || !e.alive) continue;
          if (Math.hypot(s.x - e.x, s.y - e.y) < HIT_R) {
            e.hp--;
            const shooter = this.players.get(s.by);
            if (shooter) shooter.hits++;
            this.pushFeed(`💢 ${shooter?.name ?? '?'} tags ${e.name}!`);
            if (e.hp <= 0) {
              e.alive = false;
              this.pushFeed(`🔥 ${e.name} is wrecked!`);
            }
            s.dead = true;
            break;
          }
        }
        if (s.bounces > MAX_BOUNCE || s.lifeMs <= 0) s.dead = true;
      }
      if (flying === 0) { this.resolve(); return; }
    }
  }

  private resolve(): void {
    const ids = this.entered();
    const standing = ids.filter((p) => p.alive);
    let winner: Hull | null = null;
    if (standing.length === 1) {
      winner = standing[0]!;
    } else if (standing.length > 1) {
      // Most HP standing; ties hold fire (no cheap crown).
      const top = Math.max(...standing.map((p) => p.hp));
      const tied = standing.filter((p) => p.hp === top);
      winner = tied.length === 1 ? tied[0]! : null;
    }
    if (winner) {
      winner.wins++;
      this.pushFeed(`🏆 ${winner.name} takes round ${this.roundNo}!`);
    } else {
      this.pushFeed(`🤝 round ${this.roundNo} is a draw — no crown!`);
    }
    if (this.roundNo >= ROUNDS) {
      const champ = [...this.players.values()]
        .filter((p) => p.active)
        .sort((a, b) => b.wins - a.wins || b.hits - a.hits)[0];
      if (champ) {
        if (champ.best === null || champ.wins > champ.best) champ.best = champ.wins;
        this.pushFeed(`👑 ${champ.name} takes the siege ${champ.wins}-${ROUNDS}!`);
      }
      this.phase = 'final';
      this.phaseUntil = this.time + FINAL_MS;
    } else {
      this.startRound();
    }
  }

  step(dtMs: number): void {
    this.time += dtMs;
    if (this.phase === 'lobby') {
      if (this.phaseUntil !== 0 && this.time >= this.phaseUntil && this.playerCount() >= MIN_START) {
        this.startMatch();
      } else if (this.phaseUntil !== 0 && this.time >= this.phaseUntil) {
        this.phaseUntil = this.time + LOBBY_COUNTDOWN_MS;
      }
    } else if (this.phase === 'aim') {
      if (this.time >= this.phaseUntil) this.fire();
    } else if (this.phase === 'volley') {
      this.stepVolley(dtMs);
    } else if (this.phase === 'final') {
      if (this.time >= this.phaseUntil) {
        if (this.playerCount() >= MIN_START) this.startMatch();
        else {
          this.phase = 'lobby';
          this.phaseUntil = 0;
        }
      }
    }
  }

  private rank(): Hull[] {
    return [...this.players.values()]
      .filter((p) => p.active)
      .sort((a, b) => b.wins - a.wins || b.hits - a.hits)
      .slice(0, 8);
  }

  private pushFeed(s: string): void {
    this.feed.push(s);
    if (this.feed.length > 3) this.feed.splice(0, this.feed.length - 3);
  }

  snapshot(pid: string): SiegeSnapshot {
    const me = this.players.get(pid);
    const ids = this.entered();
    return {
      t: 'siege',
      phase: this.phase,
      round: Math.max(1, this.roundNo),
      of: ROUNDS,
      seed: this.seed,
      bumpers: this.bumpers,
      tanks: ids.map((p) => ({
        n: p.name, x: Math.round(p.x), y: Math.round(p.y),
        hp: p.hp, alive: p.alive, you: p.id === pid, bot: p.isBot,
      })),
      tracers: this.shots.filter((s) => !s.dead).slice(0, 24)
        .map((s) => ({ x: Math.round(s.x), y: Math.round(s.y) })),
      committed: ids.filter((p) => p.commit).length,
      need: ids.length,
      endsInMs: this.phase === 'aim' ? Math.max(0, this.phaseUntil - this.time) : 0,
      leaders: this.rank().map((p) => ({
        n: p.name, wins: p.wins, hits: p.hits,
        you: p.id === pid, bot: p.isBot, locked: p.commit !== null,
      })),
      feed: [...this.feed],
      you: { hp: me && me.alive ? me.hp : 0, wins: me?.wins ?? 0, best: me?.best ?? null },
    };
  }

  /** RS-3: ReplayMoment — seed + commits re-simulate the round exactly. */
  replay(room: string, origin: string): ShareArtifact {
    const last = this.log[this.log.length - 1] ?? null;
    const done = this.phase === 'final';
    const champ = done ? this.rank()[0] ?? null : null;
    return {
      kind: 'ReplayMoment',
      game: 'ricochet-siege',
      room,
      title: done && champ
        ? `💥 ${champ.name} takes the siege ${champ.wins}-${ROUNDS} — dodge this!`
        : '💥 the siege is live — lock your aim!',
      url: buildGameUrl(origin, 'ricochet-siege', room),
      data: {
        match: this.base,
        round: this.roundNo,
        rounds: this.log,
        last,
      },
    };
  }
}
