// STEEL SWARM — game #7. Tank arena: drive a steel blob, aim an independent
// turret, fire shells. No dash, no chomp — kills come from gunnery only.
// Same transport shape as mochi (snapshot + rounds + streaks + bots), own sim:
// turret angle rides validated `aim` (radians) + snapshot `a` (2-decimals).
// Mass = armor (physics already makes big=tank, small=assassin).
import { WebSocket } from 'ws';
import { TUNE, PlayerState, Pellet, Projectile, SnapPlayer, ServerSnapshot, massToRadius, speedForMass } from './types.js';
import { integrate, resolveCollision } from './physics.js';
import { persistScore } from './db.js';
import type { Conn } from './game.js';

const ROUND_TICKS = 180 * 20; // 3-minute rounds: same urgency engine
const SPEED_MUL = 0.92; // tanks cruise slightly slower (armor is the payoff)
const FIRE_RANGE_MIN = 140;
const FIRE_RANGE_MAX = 560;
let pelletId = 1;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const BOT_NAMES = ['Blip', 'Gloop', 'Zorp', 'Mochi', 'Vex', 'Pud', 'Nib', 'Quark', 'Slim', 'Orb', 'Fizz', 'Gup'];

function spawnPos(margin = 80) { return { x: rand(margin, TUNE.WORLD - margin), y: rand(margin, TUNE.WORLD - margin) }; }

export interface SteelPlayer extends PlayerState {
  aim: number; // turret angle, radians (server truth; client predicts its own only)
}

export class SteelRoom {
  id: string;
  readonly game = 'steel' as const; // marketplace discriminant: matchmaking + dispatch narrow on this
  tick = 0;
  nextNum = 1;
  players = new Map<string, SteelPlayer>();
  conns = new Map<string, Conn>();
  pellets: Pellet[] = [];
  feed: string[] = [];
  lastSnap = 0;
  respawns = new Map<string, number>(); // playerId -> tick ready
  botTimer = 0;
  taunts: { id: string; e: number; until: number }[] = [];
  tauntCd = new Map<string, number>(); // playerId -> tick when they may taunt again
  roundTick = 0;
  roundCount = 0; // PMF stat: rounds completed (see /stats)
  tauntCount = 0; // PMF stat: taunts sent (invite-loop proxy)
  shells: Projectile[] = [];
  shellId = 1;
  avgMass: number = TUNE.START_MASS; // comeback baseline (runts get +12% speed)
  grid = new Map<number, number[]>(); // spatial hash cell -> player indices (int keys, zero string garbage)

  constructor(id: string) {
    this.id = id;
    for (let i = 0; i < TUNE.PELLETS; i++) this.addPellet();
    console.log(`[steel ${id}] created`);
  }

  get humans() { return [...this.players.values()].filter(p => !p.isBot && p.alive).length; }
  get size() { return this.players.size; }

  addPellet() {
    this.pellets.push({ id: pelletId++, x: rand(20, TUNE.WORLD - 20), y: rand(20, TUNE.WORLD - 20), hue: Math.floor(rand(0, 360)) });
  }

  addPlayer(id: string, name: string, isBot = false): SteelPlayer {
    const p = spawnPos();
    const st: SteelPlayer = {
      id, num: this.nextNum++, name: name.slice(0, 14) || (isBot ? 'Bot' : 'Blob'),
      x: p.x, y: p.y, vx: 0, vy: 0,
      mass: TUNE.START_MASS, r: massToRadius(TUNE.START_MASS),
      hue: Math.floor(rand(0, 360)), kills: 0, score: 0, alive: true, isBot,
      dashCdUntil: 0, spawnTick: this.tick, streak: 0,
      fireCdUntil: 0, fx: 1, fy: 0, hunter: false, shieldUntil: this.tick + 60, // 3s spawn shield
      aim: rand(-Math.PI, Math.PI),
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

  handleInput(id: string, dx: number, dy: number, aim?: number) {
    const p = this.players.get(id);
    if (!p || !p.alive) return;
    // sanitize (anti-cheat: intent only, server clamps everything)
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    const len = Math.hypot(dx, dy);
    let nx = 0, ny = 0;
    if (len > 0.01) { const c = Math.min(1, len) / len; nx = dx * c; ny = dy * c; p.fx = nx; p.fy = ny; }
    if (typeof aim === 'number' && Number.isFinite(aim)) {
      p.aim = aim; // turret is independent of hull (the whole game)
    } else if (len > 0.01) {
      p.aim = Math.atan2(ny, nx); // touch fallback: turret tracks travel
    }
    let speed = speedForMass(p.mass) * SPEED_MUL;
    if (!p.isBot && p.mass < this.avgMass * 0.5) speed *= 1.12; // runt comeback
    // steering: accelerate toward desired velocity (arcade feel, same k as mochi)
    const k = 1 - Math.exp(-8 * (1 / TUNE.TICK_HZ));
    p.vx += (nx * speed - p.vx) * k;
    p.vy += (ny * speed - p.vy) * k;
    // NOTE: no dash in steel. No chomp either — shells are the only kills.
  }

  updateBots() {
    for (const p of this.players.values()) {
      if (!p.isBot || !p.alive) continue;
      // cheap AI @10Hz
      if ((this.tick + p.hue) % 2 !== 0) continue;
      // nearest rival -> turret tracks them; hull closes to mid-range
      let prey: SteelPlayer | null = null, bd = 700 * 700;
      for (const o of this.players.values()) {
        if (o.id === p.id || !o.alive) continue;
        const d2 = (o.x - p.x) ** 2 + (o.y - p.y) ** 2;
        if (d2 < bd) { bd = d2; prey = o; }
      }
      let dx = 0, dy = 0;
      if (prey) {
        const d = Math.sqrt(bd) || 1;
        p.aim = Math.atan2(prey.y - p.y, prey.x - p.x);
        // hold mid-range: advance past shell-max, back off inside shell-min
        if (d > FIRE_RANGE_MAX) { dx = prey.x - p.x; dy = prey.y - p.y; }
        else if (d < FIRE_RANGE_MIN) { dx = p.x - prey.x; dy = p.y - prey.y; }
        else { dx = -(prey.y - p.y); dy = prey.x - p.x; } // strafe orbit at kill range
        const l = Math.hypot(dx, dy) || 1;
        this.handleInput(p.id, dx / l, dy / l, p.aim);
        if (d < FIRE_RANGE_MAX && d > FIRE_RANGE_MIN * 0.6) this.tryFire(p.id);
      } else {
        // graze: nearest pellet
        let tx = p.x, ty = p.y, best = Infinity;
        for (const pl of this.pellets) {
          const d2 = (pl.x - p.x) ** 2 + (pl.y - p.y) ** 2;
          if (d2 < best) { best = d2; tx = pl.x; ty = pl.y; }
          if (best < 200 * 200) break;
        }
        const dx2 = tx - p.x, dy2 = ty - p.y, l = Math.hypot(dx2, dy2) || 1;
        this.handleInput(p.id, dx2 / l, dy2 / l, p.aim);
      }
    }
  }

  ensureBots() {
    // backfill so lobby never feels empty (R&D insight #2).
    // Bursts of 3 every 1s (called on botTimer%20): a solo joiner sees a full
    // room in ~2.5s. The old 1-per-2s trickle left rooms feeling dead for 14s.
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

  step() {
    this.tick++;
    this.updateBots();
    // integrate
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      integrate(p, 1 / TUNE.TICK_HZ);
      p.score = Math.max(p.score, p.mass);
    }
    this.collide();
    this.eatPellets();
    // NOTE: no eatPlayers — steel kills are shells-only (no chomp by design).
    this.stepShells();
    if (this.tick % 20 === 0) { // comeback baseline, 1Hz is plenty
      let m = 0, n = 0;
      for (const p of this.players.values()) if (p.alive && !p.isBot) { m += p.mass; n++; }
      this.avgMass = n > 0 ? m / n : TUNE.START_MASS;
    }
    // respawn timers
    for (const [id, at] of this.respawns) {
      if (this.tick >= at) {
        const p = this.players.get(id);
        if (p) this.respawnNow(p);
        this.respawns.delete(id);
      }
    }
    // rounds: the urgency engine — crown, compress, revive
    this.roundTick++;
    if (this.roundTick >= ROUND_TICKS) this.endRound();
    // pellet upkeep
    while (this.pellets.length < TUNE.PELLETS) this.addPellet();
    this.botTimer++;
    if (this.botTimer % 20 === 0) this.ensureBots(); // 1s backfill cadence
    if (this.tick % 10 === 0 && this.taunts.length > 0) this.taunts = this.taunts.filter(t => t.until > this.tick);
  }

  rebuildGrid(list: SteelPlayer[]) {
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
            const key = i * 256 + j; // rooms cap ~40 entities: int pair key, no strings
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
    // per-player check against nearby pellets (pellets few enough for brute force w/ early-out)
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

  // Preset emote taunt: fixed set, 3s cooldown, 2s life. No free text (zero moderation).
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

  respawnNow(p: SteelPlayer) {
    const s = spawnPos();
    p.x = s.x; p.y = s.y; p.vx = p.vy = 0;
    p.mass = TUNE.START_MASS; p.r = massToRadius(p.mass);
    p.alive = true; p.dashCdUntil = 0; p.streak = 0; p.spawnTick = this.tick;
    p.fireCdUntil = 0; p.shieldUntil = this.tick + 60; // fresh 3s shield
    p.aim = rand(-Math.PI, Math.PI);
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
    // soft reset: compress masses so the next round starts hungry, revive the dead
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

  // ---- gunnery: turret-aimed shells (mochi orb ballistics, aim direction) ----
  tryFire(id: string) {
    const p = this.players.get(id);
    if (!p || !p.alive) return;
    if (this.tick < p.fireCdUntil) return;
    if (p.mass < TUNE.FIRE_MIN_MASS) return;
    let live = 0;
    for (const o of this.shells) if (o.owner === id && ++live >= TUNE.ORB_MAX_PER_PLAYER) return;
    if (this.shells.length >= TUNE.ORB_MAX_ROOM) return;
    p.fireCdUntil = this.tick + TUNE.ORB_COOLDOWN_TICKS;
    p.mass = Math.max(6, p.mass - TUNE.ORB_MASS_COST);
    p.r = massToRadius(p.mass);
    p.shieldUntil = 0; // firing breaks spawn shield (anti-camp)
    const nx = Math.cos(p.aim), ny = Math.sin(p.aim);
    this.shells.push({
      id: this.shellId++, owner: id,
      x: p.x + nx * (p.r + 10), y: p.y + ny * (p.r + 10),
      vx: nx * TUNE.ORB_SPEED + p.vx * 0.35, vy: ny * TUNE.ORB_SPEED + p.vy * 0.35,
      hue: p.hue, bounces: 1, life: TUNE.ORB_LIFE_TICKS, grace: 5,
    });
  }

  stepShells() {
    const W = TUNE.WORLD;
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const o = this.shells[i];
      o.life--;
      if (o.grace > 0) o.grace--;
      if (o.life <= 0) { this.shells[i] = this.shells[this.shells.length - 1]; this.shells.pop(); continue; }
      let dead = false;
      for (let s = 0; s < 2 && !dead; s++) { // 2 substeps: no tunneling small tanks
        o.x += (o.vx * (1 / TUNE.TICK_HZ)) / 2;
        o.y += (o.vy * (1 / TUNE.TICK_HZ)) / 2;
        if (o.x < TUNE.ORB_R) { o.x = TUNE.ORB_R; o.vx = Math.abs(o.vx); if (o.bounces-- <= 0) dead = true; }
        else if (o.x > W - TUNE.ORB_R) { o.x = W - TUNE.ORB_R; o.vx = -Math.abs(o.vx); if (o.bounces-- <= 0) dead = true; }
        if (o.y < TUNE.ORB_R) { o.y = TUNE.ORB_R; o.vy = Math.abs(o.vy); if (o.bounces-- <= 0) dead = true; }
        else if (o.y > W - TUNE.ORB_R) { o.y = W - TUNE.ORB_R; o.vy = -Math.abs(o.vy); if (o.bounces-- <= 0) dead = true; }
        if (!dead) dead = this.shellHits(o);
      }
      if (dead) { this.shells[i] = this.shells[this.shells.length - 1]; this.shells.pop(); }
    }
  }

  shellHits(o: Projectile): boolean {
    for (const p of this.players.values()) {
      if (!p.alive || (p.id === o.owner && o.grace > 0)) continue;
      const dx = p.x - o.x, dy = p.y - o.y;
      const rr = p.r + TUNE.ORB_R;
      if (dx > rr || dx < -rr || dy > rr || dy < -rr) continue;
      if (dx * dx + dy * dy > rr * rr) continue;
      if (this.tick < p.shieldUntil) return true; // shield eats the shell
      const m = Math.hypot(o.vx, o.vy) || 1;
      p.vx += (o.vx / m) * TUNE.ORB_KNOCK * (TUNE.START_MASS / p.mass);
      p.vy += (o.vy / m) * TUNE.ORB_KNOCK * (TUNE.START_MASS / p.mass);
      if (p.mass - TUNE.ORB_DMG <= 6) {
        const owner = this.players.get(o.owner);
        p.alive = false; p.vx = p.vy = 0; p.streak = 0;
        this.respawns.set(p.id, this.tick + 60);
        if (owner && owner.id !== p.id) {
          owner.kills++; owner.streak++;
          this.pushFeed(`💥 ${owner.name} shelled ${p.name}`);
          if (owner.streak >= 3) this.pushFeed(`🔥 ${owner.name} is on fire x${owner.streak}!`);
        } else this.pushFeed(`💥 ${p.name} blew themself up`);
        const c = this.conns.get(p.id);
        if (c && !p.isBot) {
          try { c.ws.send(JSON.stringify({ t: 'died', by: owner?.name ?? 'a shell', respawnIn: 3 })); } catch { /* gone */ }
        }
      } else {
        p.mass -= TUNE.ORB_DMG;
        p.r = massToRadius(p.mass);
      }
      return true; // shell dies on hit
    }
    return false;
  }

  snapshot(forId: string): ServerSnapshot {
    const me = this.players.get(forId);
    const leaders = [...this.players.values()].filter(p => p.alive)
      .sort((a, b) => b.mass - a.mass).slice(0, 5).map(p => ({ n: p.name, s: Math.floor(p.mass) }));
    const players: SnapPlayer[] = [];
    // AOI: only send entities near viewer (+ generous margin so knockback reads well)
    const vx = me?.x ?? TUNE.WORLD / 2, vy = me?.y ?? TUNE.WORLD / 2;
    const R = 1400;
    for (const p of this.players.values()) {
      if (!p.alive || p.id === forId) continue;
      if (Math.abs(p.x - vx) > R || Math.abs(p.y - vy) > R) continue;
      players.push({ id: p.id, n: p.name, x: Math.round(p.x * 2) / 2, y: Math.round(p.y * 2) / 2, r: Math.round(p.r * 10) / 10, h: p.hue, k: p.kills, s: Math.floor(p.mass), b: p.isBot ? 1 : 0, ht: 0, c: 0, a: Math.round(p.aim * 100) / 100 });
    }
    const pellets: Pellet[] = [];
    const PR = 1100;
    for (const pl of this.pellets) {
      if (Math.abs(pl.x - vx) > PR || Math.abs(pl.y - vy) > PR) continue;
      pellets.push(pl);
      if (pellets.length >= 220) break;
    }
    const orbs: { i: number; x: number; y: number; h: number }[] = [];
    for (const o of this.shells) {
      if (Math.abs(o.x - vx) > PR || Math.abs(o.y - vy) > PR) continue;
      orbs.push({ i: o.id, x: Math.round(o.x), y: Math.round(o.y), h: o.hue });
      if (orbs.length >= 80) break;
    }
    return {
      t: 'snap', tick: this.tick, you: forId,
      me: me ? {
        x: me.x, y: me.y, r: me.r, mass: Math.floor(me.mass),
        dashReady: this.tick >= me.fireCdUntil, score: Math.floor(me.score),
        kills: me.kills, alive: me.alive, streak: me.streak, sh: this.tick < me.shieldUntil ? 1 : 0,
        respawnIn: me.alive ? undefined : Math.max(0, ((this.respawns.get(forId) ?? this.tick) - this.tick) / TUNE.TICK_HZ),
      } : undefined,
      players, pellets, leaders, feed: [...this.feed],
      taunts: this.taunts.map(t => ({ id: t.id, e: t.e })),
      round: Math.max(0, Math.ceil((ROUND_TICKS - this.roundTick) / TUNE.TICK_HZ)),
      orbs, // shells ride the orb channel: client renders them identically
    };
  }
}
