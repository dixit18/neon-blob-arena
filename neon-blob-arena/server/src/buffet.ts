// BLACK-HOLE BUFFET — game #3. Mochi Panic meets wandering devourers: slingshot
// around gravity wells, dash to escape the pull, chomp rivals, dodge the horizon.
// One addition (WELLS), everything else proven: same transport, rounds, streaks,
// bots, backfill. Wells ride deterministic lissajous paths (tick-derived, zero
// state to sync) and ship in every snapshot (3 × {x,y,r} — ~60 bytes).
import { WebSocket } from 'ws';
import { TUNE, PlayerState, Pellet, SnapPlayer, ServerSnapshot, massToRadius, speedForMass, type GameId } from './types.js';
import { integrate, resolveCollision } from './physics.js';
import { persistScore } from './db.js';
import type { Conn } from './game.js';

const ROUND_TICKS = 180 * 20; // 3-minute rounds: same urgency engine
const WELL_R = 46; // event horizon: contact = spaghettified
const WELL_PULL_R = 520; // gravity reach (players)
const WELL_VAC_R = 420; // pellet vacuum reach
const FEED_R = 500; // nearest rival within this eats 50% of the spaghettified
let pelletId = 1;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const BOT_NAMES = ['Blip', 'Gloop', 'Zorp', 'Mochi', 'Vex', 'Pud', 'Nib', 'Quark', 'Slim', 'Orb', 'Fizz', 'Gup'];

// Deterministic wander (tick-derived): server + tests + future replays agree.
const WELLS = [
  { ax: 1100, ay: 800, w1: 0.11, w2: 0.13, p1: 0.0, p2: 1.7 },
  { ax: 900, ay: 1100, w1: 0.09, w2: 0.12, p1: 2.1, p2: 0.4 },
  { ax: 1300, ay: 900, w1: 0.13, w2: 0.10, p1: 4.0, p2: 2.9 },
];
export function wellPos(i: number, tick: number): { x: number; y: number; r: number } {
  const w = WELLS[i % WELLS.length];
  const t = tick / TUNE.TICK_HZ;
  return { x: 2000 + w.ax * Math.sin(t * w.w1 + w.p1), y: 2000 + w.ay * Math.cos(t * w.w2 + w.p2), r: WELL_R };
}
export const WELL_COUNT = WELLS.length;

function spawnPos(margin = 80) { return { x: rand(margin, TUNE.WORLD - margin), y: rand(margin, TUNE.WORLD - margin) }; }

export class BuffetRoom {
  id: string;
  readonly game = 'buffet' as const; // marketplace discriminant: matchmaking + dispatch narrow on this
  tick = 0;
  nextNum = 1;
  players = new Map<string, PlayerState>();
  conns = new Map<string, Conn>();
  pellets: Pellet[] = [];
  feed: string[] = [];
  respawns = new Map<string, number>();
  botTimer = 0;
  taunts: { id: string; e: number; until: number }[] = [];
  tauntCd = new Map<string, number>();
  roundTick = 0;
  roundCount = 0;
  tauntCount = 0;
  avgMass: number = TUNE.START_MASS;
  grid = new Map<number, number[]>();

  constructor(id: string) {
    this.id = id;
    console.log(`[buffet ${id}] created`);
    for (let i = 0; i < TUNE.PELLETS; i++) this.addPellet();
  }

  get humans() { return [...this.players.values()].filter(p => !p.isBot && p.alive).length; }
  get size() { return this.players.size; }

  addPellet() {
    this.pellets.push({ id: pelletId++, x: rand(20, TUNE.WORLD - 20), y: rand(20, TUNE.WORLD - 20), hue: Math.floor(rand(0, 360)) });
  }

  addPlayer(id: string, name: string, isBot = false): PlayerState {
    const p = spawnPos();
    const st: PlayerState = {
      id, num: this.nextNum++, name: name.slice(0, 14) || (isBot ? 'Bot' : 'Mochi'),
      x: p.x, y: p.y, vx: 0, vy: 0,
      mass: TUNE.START_MASS, r: massToRadius(TUNE.START_MASS),
      hue: Math.floor(rand(0, 360)), kills: 0, score: 0, alive: true, isBot,
      dashCdUntil: 0, spawnTick: this.tick, streak: 0,
      fireCdUntil: 0, fx: 1, fy: 0, hunter: false, shieldUntil: this.tick + 60,
    };
    this.players.set(id, st);
    return st;
  }

  removePlayer(id: string) {
    const p = this.players.get(id);
    if (p && !p.isBot) {
      persistScore({ id: p.id, name: p.name, score: Math.floor(p.score), kills: p.kills, room: this.id, survivedSec: Math.floor((this.tick - p.spawnTick) / TUNE.TICK_HZ) });
    }
    this.players.delete(id);
    this.conns.delete(id);
    this.respawns.delete(id);
  }

  pushFeed(msg: string) {
    this.feed.unshift(msg);
    if (this.feed.length > 6) this.feed.pop();
  }

  handleInput(id: string, dx: number, dy: number, dash = false) {
    const p = this.players.get(id);
    if (!p || !p.alive) return;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    const len = Math.hypot(dx, dy);
    let nx = 0, ny = 0;
    if (len > 0.01) { const c = Math.min(1, len) / len; nx = dx * c; ny = dy * c; p.fx = nx; p.fy = ny; }
    const speed = speedForMass(p.mass);
    const k = 1 - Math.exp(-8 * (1 / TUNE.TICK_HZ));
    p.vx += (nx * speed - p.vx) * k;
    p.vy += (ny * speed - p.vy) * k;
    if (dash && this.tick >= p.dashCdUntil && p.mass > TUNE.START_MASS * 0.6) {
      const dl = Math.hypot(nx, ny);
      const ddx = dl > 0.01 ? nx / Math.max(1, dl) * dl : (p.vx / (Math.hypot(p.vx, p.vy) || 1));
      const ddy = dl > 0.01 ? ny / Math.max(1, dl) * dl : (p.vy / (Math.hypot(p.vx, p.vy) || 1));
      const m = Math.hypot(ddx, ddy) || 1;
      p.vx += (ddx / m) * TUNE.DASH_IMPULSE * (dl > 0.01 ? 1 : 0.6);
      p.vy += (ddy / m) * TUNE.DASH_IMPULSE * (dl > 0.01 ? 1 : 0.6);
      p.dashCdUntil = this.tick + TUNE.DASH_COOLDOWN_TICKS;
      p.mass = Math.max(6, p.mass - TUNE.DASH_MASS_COST);
    }
  }

  updateBots() {
    for (const p of this.players.values()) {
      if (!p.isBot || !p.alive) continue;
      if ((this.tick + p.hue) % 2 !== 0) continue; // cheap AI @10Hz
      // well dodge first: nothing else matters inside 380px of a horizon
      let wx = 0, wy = 0, wd = 380;
      for (let i = 0; i < WELL_COUNT; i++) {
        const w = wellPos(i, this.tick);
        const d = Math.hypot(w.x - p.x, w.y - p.y);
        if (d < wd) { wd = d; wx = p.x - w.x; wy = p.y - w.y; }
      }
      let tx = 0, ty = 0, threat: PlayerState | null = null, prey: PlayerState | null = null;
      let bestPel = Infinity;
      for (const pl of this.pellets) {
        const d = (pl.x - p.x) ** 2 + (pl.y - p.y) ** 2;
        if (d < bestPel) { bestPel = d; tx = pl.x; ty = pl.y; }
        if (bestPel < 200 * 200) break;
      }
      for (const o of this.players.values()) {
        if (o.id === p.id || !o.alive) continue;
        const d = Math.hypot(o.x - p.x, o.y - p.y);
        if (d > 700) continue;
        if (o.r > p.r * 1.1 && (!threat || d < Math.hypot(threat.x - p.x, threat.y - p.y))) threat = o;
        if (p.r > o.r * 1.12 && d < 550 && (!prey || d < Math.hypot(prey.x - p.x, prey.y - p.y))) prey = o;
      }
      let dx = 0, dy = 0, dash = false;
      if (wd < 380) { dx = wx; dy = wy; dash = wd < 220 && this.tick >= p.dashCdUntil; }
      else if (threat) { dx = p.x - threat.x; dy = p.y - threat.y; dash = Math.hypot(dx, dy) < 320 && this.tick >= p.dashCdUntil; }
      else if (prey) { dx = prey.x - p.x; dy = prey.y - p.y; dash = Math.hypot(dx, dy) < 380 && Math.hypot(dx, dy) > 150 && this.tick >= p.dashCdUntil; }
      else { dx = tx - p.x; dy = ty - p.y; }
      const l = Math.hypot(dx, dy) || 1;
      this.handleInput(p.id, dx / l, dy / l, dash);
    }
  }

  gravity() {
    const dt = 1 / TUNE.TICK_HZ;
    for (let i = 0; i < WELL_COUNT; i++) {
      const w = wellPos(i, this.tick);
      for (const p of this.players.values()) {
        if (!p.alive) continue;
        const dx = w.x - p.x, dy = w.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d < 1 || d > WELL_PULL_R) continue;
        const s = 520 * (1 - d / WELL_PULL_R) * dt; // strong near horizon, escapable at edge
        p.vx += (dx / d) * s; p.vy += (dy / d) * s;
      }
      for (const pl of this.pellets) {
        const dx = w.x - pl.x, dy = w.y - pl.y;
        const d = Math.hypot(dx, dy);
        if (d < 1 || d > WELL_VAC_R) continue;
        const s = Math.min(d, 300 * (1 - d / WELL_VAC_R) * dt);
        pl.x += (dx / d) * s; pl.y += (dy / d) * s;
      }
    }
  }

  devour() {
    for (const p of this.players.values()) {
      if (!p.alive || this.tick < p.shieldUntil) continue; // shields hold vs the void
      for (let i = 0; i < WELL_COUNT; i++) {
        const w = wellPos(i, this.tick);
        if (Math.hypot(w.x - p.x, w.y - p.y) >= w.r) continue;
        // nearest rival within FEED_R feasts on 50% (the void shares); else no credit
        let best: PlayerState | null = null, bd = FEED_R;
        for (const o of this.players.values()) {
          if (o.id === p.id || !o.alive) continue;
          const d = Math.hypot(o.x - p.x, o.y - p.y);
          if (d < bd) { bd = d; best = o; }
        }
        p.alive = false; p.vx = p.vy = 0; p.streak = 0;
        this.respawns.set(p.id, this.tick + 60);
        if (best) {
          best.mass += p.mass * 0.5;
          best.r = massToRadius(best.mass);
          best.kills++; best.streak++;
          if (best.streak >= 3) this.pushFeed(`🔥 ${best.name} is on fire x${best.streak}!`);
          this.pushFeed(`🕳️ ${best.name} fed ${p.name} to the void`);
        } else {
          this.pushFeed(`🕳️ ${p.name} fell into the void`);
        }
        if (!p.isBot) {
          const c = this.conns.get(p.id);
          if (c) {
            try { c.ws.send(JSON.stringify({ t: 'died', by: best ? best.name : 'a black hole', respawnIn: 3 })); } catch { /* gone */ }
          }
        }
        break; // one horizon per tick is plenty dead
      }
    }
    // wells eat pellets too (respawned elsewhere — the void is hungry, not full)
    for (let i = this.pellets.length - 1; i >= 0; i--) {
      const pl = this.pellets[i];
      for (let w = 0; w < WELL_COUNT; w++) {
        const pos = wellPos(w, this.tick);
        if (Math.abs(pos.x - pl.x) > pos.r || Math.abs(pos.y - pl.y) > pos.r) continue;
        if ((pos.x - pl.x) ** 2 + (pos.y - pl.y) ** 2 < pos.r * pos.r) {
          this.pellets[i] = this.pellets[this.pellets.length - 1];
          this.pellets.pop();
          this.addPellet();
          break;
        }
      }
    }
  }

  step() {
    this.tick++;
    this.updateBots();
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      integrate(p, 1 / TUNE.TICK_HZ);
      p.score = Math.max(p.score, p.mass);
    }
    this.gravity();
    this.collide();
    this.eatPellets();
    this.eatPlayers();
    this.devour();
    if (this.tick % 20 === 0) {
      let m = 0, n = 0;
      for (const p of this.players.values()) if (p.alive && !p.isBot) { m += p.mass; n++; }
      this.avgMass = n > 0 ? m / n : TUNE.START_MASS;
    }
    for (const [id, at] of this.respawns) {
      if (this.tick >= at) {
        const p = this.players.get(id);
        if (p) this.respawnNow(p);
        this.respawns.delete(id);
      }
    }
    this.roundTick++;
    if (this.roundTick >= ROUND_TICKS) this.endRound();
    while (this.pellets.length < TUNE.PELLETS) this.addPellet();
    this.botTimer++;
    if (this.botTimer % 20 === 0) this.ensureBots(); // 1s backfill cadence (anti-idle)
    if (this.tick % 10 === 0 && this.taunts.length > 0) this.taunts = this.taunts.filter(t => t.until > this.tick);
  }

  rebuildGrid(list: PlayerState[]) {
    this.grid.clear();
    const cell = 220;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!p.alive) continue;
      const key = Math.floor(p.x / cell) * 256 + Math.floor(p.y / cell);
      let arr = this.grid.get(key);
      if (!arr) { arr = []; this.grid.set(key, arr); }
      arr.push(i);
    }
  }

  collide() {
    const list = [...this.players.values()];
    this.rebuildGrid(list);
    const cell = 220;
    const seen = new Set<number>();
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!p.alive) continue;
      const cx = Math.floor(p.x / cell), cy = Math.floor(p.y / cell);
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        if (gx < 0) continue;
        for (let gy = cy - 1; gy <= cy + 1; gy++) {
          if (gy < 0) continue;
          const arr = this.grid.get(gx * 256 + gy);
          if (!arr) continue;
          for (let k = 0; k < arr.length; k++) {
            const j = arr[k];
            if (j <= i) continue;
            const key = i * 256 + j;
            if (seen.has(key)) continue;
            seen.add(key);
            const o = list[j];
            if (!o.alive) continue;
            resolveCollision(p, o);
          }
        }
      }
    }
  }

  eatPellets() {
    if (this.pellets.length === 0) return;
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      for (let i = this.pellets.length - 1; i >= 0; i--) {
        const pl = this.pellets[i];
        const dx = pl.x - p.x, dy = pl.y - p.y;
        if (dx > p.r + 10 || dx < -p.r - 10 || dy > p.r + 10 || dy < -p.r - 10) continue;
        if (dx * dx + dy * dy < (p.r * 0.9) ** 2) {
          p.mass += 1;
          p.r = massToRadius(p.mass);
          this.pellets[i] = this.pellets[this.pellets.length - 1];
          this.pellets.pop();
          this.addPellet();
        }
      }
    }
  }

  eatPlayers() {
    const list = [...this.players.values()].filter(p => p.alive).sort((a, b) => b.r - a.r);
    for (const eater of list) {
      if (!eater.alive) continue;
      for (const victim of list) {
        if (victim.id === eater.id || !victim.alive) continue;
        if (this.tick < victim.shieldUntil) continue;
        if (eater.r < victim.r * TUNE.EAT_RATIO) continue;
        const d = Math.hypot(eater.x - victim.x, eater.y - victim.y);
        if (d < eater.r - victim.r * 0.35) {
          eater.mass += victim.mass * 0.75;
          eater.r = massToRadius(eater.mass);
          eater.kills++;
          eater.streak++;
          if (eater.streak >= 3) this.pushFeed(`🔥 ${eater.name} is on fire x${eater.streak}!`);
          victim.alive = false;
          victim.vx = victim.vy = 0;
          victim.streak = 0;
          this.respawns.set(victim.id, this.tick + 60);
          eater.vx *= 0.6; eater.vy *= 0.6;
          this.pushFeed(`💥 ${eater.name} ate ${victim.name}`);
          if (!victim.isBot) {
            const c = this.conns.get(victim.id);
            if (c) {
              try { c.ws.send(JSON.stringify({ t: 'died', by: eater.name, respawnIn: 3 })); } catch { /* gone */ }
            }
          }
          if (eater.mass > 220) {
            eater.mass = 220 + (eater.mass - 220) * 0.995;
          }
        }
      }
    }
  }

  addTaunt(id: string, e: unknown) {
    const p = this.players.get(id);
    if (!p || !p.alive || p.isBot) return;
    if (!Number.isInteger(e) || (e as number) < 0 || (e as number) > 4) return;
    if (this.tick < (this.tauntCd.get(id) ?? 0)) return;
    this.tauntCd.set(id, this.tick + 60);
    this.taunts.push({ id, e: e as number, until: this.tick + 40 });
    this.tauntCount++;
    if (this.taunts.length > 12) this.taunts.shift();
  }

  respawnNow(p: PlayerState) {
    const s = spawnPos();
    p.x = s.x; p.y = s.y; p.vx = p.vy = 0;
    p.mass = TUNE.START_MASS; p.r = massToRadius(p.mass);
    p.alive = true; p.dashCdUntil = 0; p.streak = 0; p.spawnTick = this.tick;
    p.fireCdUntil = 0; p.shieldUntil = this.tick + 60;
  }

  endRound() {
    this.roundTick = 0;
    this.roundCount++;
    const alive = [...this.players.values()].filter(p => p.alive);
    const champ = alive.filter(p => !p.isBot).sort((a, b) => b.mass - a.mass)[0]
      ?? alive.sort((a, b) => b.mass - a.mass)[0];
    if (champ) {
      champ.mass += 10; champ.r = massToRadius(champ.mass);
      this.pushFeed(`🏆 ${champ.name} wins the round!`);
    }
    for (const p of this.players.values()) {
      if (p.alive) {
        p.mass = TUNE.START_MASS + (p.mass - TUNE.START_MASS) * 0.35;
        p.r = massToRadius(p.mass);
      } else if (!p.isBot) {
        this.respawns.delete(p.id);
        this.respawnNow(p);
      }
    }
  }

  ensureBots() {
    const humans = [...this.players.values()].filter(p => !p.isBot).length;
    const wantBots = humans < 2 ? 7 : humans < 8 ? 5 : humans < 14 ? 3 : 0;
    let bots = [...this.players.values()].filter(p => p.isBot).length;
    let added = 0;
    while (bots < wantBots && added < 3 && this.size < TUNE.MAX_HUMANS_PER_ROOM + 10) {
      const name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)] + '-' + Math.floor(rand(10, 99));
      this.addPlayer('bot-' + Math.random().toString(36).slice(2, 8), name, true);
      bots++; added++;
    }
    if (bots > wantBots && bots > 0 && humans >= 8) {
      const b = [...this.players.values()].find(p => p.isBot);
      if (b) this.players.delete(b.id);
    }
  }

  snapshot(forId: string): ServerSnapshot {
    const me = this.players.get(forId);
    const leaders = [...this.players.values()].filter(p => p.alive)
      .sort((a, b) => b.mass - a.mass).slice(0, 5).map(p => ({ n: p.name, s: Math.floor(p.mass) }));
    const players: SnapPlayer[] = [];
    const vx = me?.x ?? TUNE.WORLD / 2, vy = me?.y ?? TUNE.WORLD / 2;
    const R = 1400;
    for (const p of this.players.values()) {
      if (!p.alive || p.id === forId) continue;
      if (Math.abs(p.x - vx) > R || Math.abs(p.y - vy) > R) continue;
      players.push({ id: p.id, n: p.name, x: Math.round(p.x * 2) / 2, y: Math.round(p.y * 2) / 2, r: Math.round(p.r * 10) / 10, h: p.hue, k: p.kills, s: Math.floor(p.mass), b: p.isBot ? 1 : 0, ht: 0, c: 0 });
    }
    const pellets: Pellet[] = [];
    const PR = 1100;
    for (const pl of this.pellets) {
      if (Math.abs(pl.x - vx) > PR || Math.abs(pl.y - vy) > PR) continue;
      pellets.push(pl);
      if (pellets.length >= 220) break;
    }
    const wells = [];
    for (let i = 0; i < WELL_COUNT; i++) {
      const w = wellPos(i, this.tick);
      wells.push({ x: Math.round(w.x), y: Math.round(w.y), r: w.r });
    }
    return {
      t: 'snap', tick: this.tick, you: forId,
      me: me ? {
        x: me.x, y: me.y, r: me.r, mass: Math.floor(me.mass),
        dashReady: this.tick >= me.dashCdUntil, score: Math.floor(me.score),
        kills: me.kills, alive: me.alive, streak: me.streak, sh: this.tick < me.shieldUntil ? 1 : 0,
        respawnIn: me.alive ? undefined : Math.max(0, ((this.respawns.get(forId) ?? this.tick) - this.tick) / TUNE.TICK_HZ),
      } : undefined,
      players, pellets, leaders, feed: [...this.feed],
      taunts: this.taunts.map(t => ({ id: t.id, e: t.e })),
      round: Math.max(0, Math.ceil((ROUND_TICKS - this.roundTick) / TUNE.TICK_HZ)),
      orbs: [],
      wells,
    };
  }
}
