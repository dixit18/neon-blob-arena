// games/blaze-squad/sim — squad survival (freefire-like, browser-safe).
// Top-down LAST-SQUAD-STANDING in a shrinking safe zone: squads of 3 (BZ-2),
// move (dx/dy), aim+fire energy bolts, grab tiered loot (green heals, gold
// full-heals + rapid-fire). Friendly fire is OFF — bolts pass through
// squadmates. No realistic weapons, no gore — stunned blobs pop into confetti
// and re-queue. Pure deterministic sim: time advances only via step(dtMs),
// seeded PRNG per round, headless-testable.
// Server-authoritative: clients send intent (move/fire), truth comes back.
import { buildGameUrl, type ShareArtifact } from '../../packages/share/src/index.js';

export type BlazePhase = 'lobby' | 'fight' | 'final';

export interface BlazePlayer {
  id: string;
  name: string;
  isBot: boolean;
  /** Squad 0|1|2, dealt round-robin at join. Friendly fire is off. */
  sq: number;
  x: number;
  y: number;
  hp: number;
  alive: boolean;
  kills: number;
  aim: number;
  nextFireAt: number;
  /** Gold-crate rapid-fire burns until this sim-time. */
  rapidUntil: number;
  dx: number;
  dy: number;
}

export interface BlazeBolt { x: number; y: number; vx: number; vy: number; life: number; owner: string; active: boolean }
/** tier 0 = green heal, tier 1 = gold full-heal + rapid-fire. */
export interface BlazeCrate { x: number; y: number; taken: boolean; tier: 0 | 1 }

export interface BlazeSnapshot {
  t: 'blaze';
  phase: BlazePhase;
  zone: { x: number; y: number; r: number; nextInMs: number };
  endsInMs: number;
  you: { hp: number; alive: boolean; kills: number };
  players: { n: string; hp: number; alive: boolean; you: boolean; bot: boolean; x: number; y: number; q: number }[];
  /** Untaken crates only (taken ones are noise on the wire). */
  crates: { x: number; y: number; t: number }[];
  feed: string[];
}

export const ARENA = 100;
export const MAX_HP = 100;
export const SPEED = 14; // units per second
export const FIRE_CD_MS = 400;
export const BOLT_SPEED = 46;
export const BOLT_DMG = 18;
export const BOLT_LIFE_MS = 1400;
export const MAX_BOLTS = 40;
export const ROUND_MS = 150_000;
export const LOBBY_MS = 1500;
export const FINAL_MS = 6000;
export const ZONE_TICKS = [30_000, 60_000, 90_000, 120_000];
export const ZONE_RADII = [60, 44, 30, 18, 10];
export const ZONE_DPS = 4;
export const CRATES = 12;
export const CRATE_HEAL = 30;
export const SQUAD_SIZE = 3;
export const SQUAD_NAMES = ['🔥 Ember', '🌊 Tide', '⚡ Volt'];
export const RAPID_MS = 12_000;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

export class BlazeSim {
  time = 0;
  phase: BlazePhase = 'lobby';
  phaseUntil = 0;
  roundNo = 1;
  players = new Map<string, BlazePlayer>();
  bolts: BlazeBolt[] = [];
  crates: BlazeCrate[] = [];
  zone = { x: 50, y: 50, r: ZONE_RADII[0]! };
  zoneStage = 0;
  feed: string[] = [];
  private rand: () => number = mulberry32(7);
  private joinSeq = 0;

  humanCount(): number { let n = 0; for (const p of this.players.values()) if (!p.isBot) n++; return n; }
  playerCount(): number { return this.players.size; }
  aliveCount(): number { let n = 0; for (const p of this.players.values()) if (p.alive) n++; return n; }

  join(id: string, name: string, isBot: boolean): void {
    if (this.players.has(id)) return;
    const r = this.rand;
    this.players.set(id, {
      id, name, isBot,
      sq: this.joinSeq++ % SQUAD_NAMES.length,
      x: 20 + r() * 60, y: 20 + r() * 60,
      hp: MAX_HP, alive: true, kills: 0, aim: 0, nextFireAt: 0, rapidUntil: 0, dx: 0, dy: 0,
    });
    if (!isBot && this.phase === 'lobby' && this.phaseUntil === 0) {
      this.phaseUntil = this.time + LOBBY_MS;
    }
  }

  leave(id: string): void {
    this.players.delete(id);
  }

  /** Move intent for this tick (-1..1 each axis). */
  move(id: string, dx: number, dy: number): void {
    const p = this.players.get(id);
    if (!p || !p.alive) return;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    p.dx = clamp(dx, -1, 1);
    p.dy = clamp(dy, -1, 1);
  }

  /** Fire intent. Returns true if a bolt left the blob. */
  fire(id: string, aim: number, at: number = this.time): boolean {
    const p = this.players.get(id);
    if (!p || !p.alive || this.phase !== 'fight') return false;
    if (!Number.isFinite(aim)) return false;
    if (at < p.nextFireAt) return false;
    let slot = this.bolts.find((b) => !b.active) ?? null;
    if (!slot) {
      if (this.bolts.length >= MAX_BOLTS) return false;
      slot = { x: 0, y: 0, vx: 0, vy: 0, life: 0, owner: '', active: false };
      this.bolts.push(slot);
    }
    p.aim = aim;
    const cd = at < p.rapidUntil ? FIRE_CD_MS / 2 : FIRE_CD_MS; // gold-crate rapid
    p.nextFireAt = at + cd;
    slot.x = p.x; slot.y = p.y;
    slot.vx = Math.cos(aim) * BOLT_SPEED; slot.vy = Math.sin(aim) * BOLT_SPEED;
    slot.life = BOLT_LIFE_MS; slot.owner = id; slot.active = true;
    return true;
  }

  step(dtMs: number): void {
    this.time += dtMs;
    if (this.phase === 'lobby') {
      if (this.phaseUntil !== 0 && this.time >= this.phaseUntil && this.humanCount() > 0) this.startFight();
      return;
    }
    if (this.phase === 'fight') {
      const dt = dtMs / 1000;
      // zone shrink stages
      const foughtFor = this.time - this.fightStart;
      while (this.zoneStage < ZONE_TICKS.length && foughtFor >= ZONE_TICKS[this.zoneStage]!) {
        this.zoneStage++;
        this.zone.r = ZONE_RADII[this.zoneStage]!;
        this.pushFeed(`🔥 the safe zone shrinks (r=${this.zone.r})!`);
      }
      // move
      for (const p of this.players.values()) {
        if (!p.alive) continue;
        p.x = clamp(p.x + p.dx * SPEED * dt, 2, ARENA - 2);
        p.y = clamp(p.y + p.dy * SPEED * dt, 2, ARENA - 2);
        // zone burn
        const d = Math.hypot(p.x - this.zone.x, p.y - this.zone.y);
        if (d > this.zone.r) this.hurt(p, ZONE_DPS * dt, null);
        // loot: green heals the hurt, gold full-heals + rapid-fire
        for (const c of this.crates) {
          if (c.taken) continue;
          if (Math.hypot(p.x - c.x, p.y - c.y) >= 3) continue;
          if (c.tier === 0) {
            if (p.hp >= MAX_HP) continue; // leave it for a hurt teammate
            c.taken = true;
            p.hp = Math.min(MAX_HP, p.hp + CRATE_HEAL);
          } else {
            if (p.hp >= MAX_HP && this.time < p.rapidUntil) continue;
            c.taken = true;
            p.hp = MAX_HP;
            p.rapidUntil = this.time + RAPID_MS;
          }
        }
      }
      // bolts
      for (const b of this.bolts) {
        if (!b.active) continue;
        b.life -= dtMs;
        if (b.life <= 0) { b.active = false; continue; }
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.x < 0 || b.y < 0 || b.x > ARENA || b.y > ARENA) { b.active = false; continue; }
        for (const p of this.players.values()) {
          if (!p.alive || p.id === b.owner) continue;
          const owner = this.players.get(b.owner);
          if (owner && owner.sq === p.sq) continue; // friendly fire is OFF
          if (Math.hypot(p.x - b.x, p.y - b.y) < 1.8) {
            b.active = false;
            this.hurt(p, BOLT_DMG, b.owner);
            break;
          }
        }
      }
      // Last SQUAD standing ends the round (BZ-2): lone-winner needs a rival
      // squad in the room, otherwise the clock decides (solo/small-room rule).
      const populated = new Set<number>();
      const aliveSq = new Set<number>();
      for (const p of this.players.values()) {
        populated.add(p.sq);
        if (p.alive) aliveSq.add(p.sq);
      }
      const squadDecided = aliveSq.size <= 1 && populated.size > 1;
      if (squadDecided || this.time - this.fightStart >= ROUND_MS) this.endFight();
      return;
    }
    if (this.phase === 'final') {
      if (this.time >= this.phaseUntil) this.nextRound();
    }
  }

  private fightStart = 0;

  private startFight(): void {
    this.phase = 'fight';
    this.fightStart = this.time;
    this.zoneStage = 0;
    this.zone = { x: 50, y: 50, r: ZONE_RADII[0]! };
    const r = this.rand;
    this.crates = [];
    for (let i = 0; i < CRATES; i++) {
      this.crates.push({ x: 8 + r() * 84, y: 8 + r() * 84, taken: false, tier: i % 3 === 0 ? 1 : 0 });
    }
    this.pushFeed(`⚔️ round ${this.roundNo} — last squad popping wins!`);
  }

  private hurt(p: BlazePlayer, dmg: number, by: string | null): void {
    if (!p.alive) return;
    p.hp -= dmg;
    if (p.hp <= 0) {
      p.hp = 0; p.alive = false; p.dx = 0; p.dy = 0;
      if (by && by !== p.id) {
        const k = this.players.get(by);
        if (k) k.kills++;
        this.pushFeed(`💥 ${(k ? k.name : 'someone')} popped ${p.name}!`);
      } else {
        this.pushFeed(`🌪️ ${p.name} fizzled out!`);
      }
    }
  }

  private endFight(): void {
    // Rank squads: alive first, then kills, then total hp. MVP = top killer
    // of the winning squad.
    const sq = new Map<number, { kills: number; hp: number; alive: boolean }>();
    for (const p of this.players.values()) {
      const s = sq.get(p.sq) ?? { kills: 0, hp: 0, alive: false };
      s.kills += p.kills;
      s.hp += p.hp;
      s.alive = s.alive || p.alive;
      sq.set(p.sq, s);
    }
    const order = [...sq.entries()].sort((a, b) =>
      (b[1].alive ? 1 : 0) - (a[1].alive ? 1 : 0) || b[1].kills - a[1].kills || b[1].hp - a[1].hp);
    const top = order[0] ?? null;
    if (top && (top[1].alive || top[1].kills > 0)) {
      let mvp: BlazePlayer | null = null;
      for (const p of this.players.values()) {
        if (p.sq !== top[0]) continue;
        if (!mvp || p.kills > mvp.kills || (p.kills === mvp.kills && p.hp > mvp.hp)) mvp = p;
      }
      this.pushFeed(`🏆 ${SQUAD_NAMES[top[0]]} squad takes round ${this.roundNo}! MVP ${mvp?.name ?? '?'} (${mvp?.kills ?? 0} pops)`);
    } else this.pushFeed(`round ${this.roundNo} ends quiet — no pops.`);
    this.phase = 'final';
    this.phaseUntil = this.time + FINAL_MS;
  }

  private nextRound(): void {
    this.roundNo++;
    this.rand = mulberry32(this.roundNo * 2654435761);
    for (const p of this.players.values()) {
      const r = this.rand;
      p.x = 20 + r() * 60; p.y = 20 + r() * 60;
      p.hp = MAX_HP; p.alive = true; p.kills = 0; p.dx = 0; p.dy = 0; p.rapidUntil = 0;
    }
    for (const b of this.bolts) b.active = false;
    this.phase = 'lobby';
    this.phaseUntil = this.humanCount() > 0 ? this.time + LOBBY_MS : 0;
  }

  private pushFeed(s: string): void {
    this.feed.push(s);
    if (this.feed.length > 3) this.feed.splice(0, this.feed.length - 3);
  }

  moment(room: string, origin: string): ShareArtifact {
    let win: BlazePlayer | null = null;
    for (const p of this.players.values()) if (!win || p.kills > win.kills) win = p;
    const title = win && win.kills > 0
      ? `🏆 ${win.name} popped ${win.kills} in blaze-squad!`
      : '🔥 the squad is still popping — no winner yet';
    return {
      kind: 'ReplayMoment',
      game: 'blaze-squad',
      room,
      title,
      url: buildGameUrl(origin, 'blaze-squad', room),
      data: {
        round: this.roundNo,
        top: [...this.players.values()].sort((a, b) => b.kills - a.kills).slice(0, 3).map((p) => ({ n: p.name, s: p.kills })),
      },
    };
  }

  snapshot(pid: string): BlazeSnapshot {
    const me = this.players.get(pid);
    const foughtFor = this.phase === 'fight' ? this.time - this.fightStart : 0;
    const nextStageAt = this.zoneStage < ZONE_TICKS.length ? ZONE_TICKS[this.zoneStage]! : ROUND_MS;
    return {
      t: 'blaze',
      phase: this.phase,
      zone: { x: Math.round(this.zone.x), y: Math.round(this.zone.y), r: this.zone.r, nextInMs: Math.max(0, nextStageAt - foughtFor) },
      endsInMs: this.phase === 'fight' ? Math.max(0, ROUND_MS - foughtFor) : 0,
      you: { hp: Math.ceil(me?.hp ?? 0), alive: me?.alive ?? false, kills: me?.kills ?? 0 },
      players: [...this.players.values()].slice(0, 12).map((p) => ({
        n: p.name, hp: Math.ceil(p.hp), alive: p.alive, you: p.id === pid, bot: p.isBot,
        x: Math.round(p.x), y: Math.round(p.y), q: p.sq,
      })),
      crates: this.crates.filter((c) => !c.taken).map((c) => ({ x: Math.round(c.x), y: Math.round(c.y), t: c.tier })),
      feed: [...this.feed],
    };
  }
}
