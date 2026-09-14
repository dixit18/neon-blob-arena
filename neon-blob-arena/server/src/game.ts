// Authoritative room sim: fixed 20Hz tick, 15Hz snapshots, spatial hash, bots.
import { WebSocket } from 'ws';
import { TUNE, PlayerState, Pellet, Projectile, SnapPlayer, ServerSnapshot, massToRadius, speedForMass } from './types.js';
import { integrate, resolveCollision } from './physics.js';
import { persistScore } from './db.js';

export interface Conn { ws: WebSocket; playerId: string; room: Room; msgTimes: number[]; lastSeq: number }

let pelletId = 1;
const ROUND_TICKS = 180 * 20; // 3-minute rounds: the urgency engine
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const BOT_NAMES = ['Blip','Gloop','Zorp','Mochi','Vex','Pud','Nib','Quark','Slim','Orb','Fizz','Gup'];

function spawnPos(margin = 80) { return { x: rand(margin, TUNE.WORLD - margin), y: rand(margin, TUNE.WORLD - margin) }; }

export class Room {
  id: string;
  tick = 0;
  nextNum = 1; // numeric entity ids (rooms cap ~40 entities, keys stay small ints)
  players = new Map<string, PlayerState>();
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
  orbs: Projectile[] = [];
  orbId = 1;
  avgMass: number = TUNE.START_MASS; // comeback baseline (runts get +12% speed)
  grid = new Map<number, number[]>(); // spatial hash cell -> player indices (int keys, zero string garbage)

  constructor(id: string) {
    this.id = id;
    for (let i = 0; i < TUNE.PELLETS; i++) this.addPellet();
    console.log(`[room ${id}] created`);
  }

  get humans() { return [...this.players.values()].filter(p => !p.isBot && p.alive).length; }
  get size() { return this.players.size; }

  addPellet() {
    this.pellets.push({ id: pelletId++, x: rand(20, TUNE.WORLD - 20), y: rand(20, TUNE.WORLD - 20), hue: Math.floor(rand(0, 360)) });
  }

  addPlayer(id: string, name: string, isBot = false): PlayerState {
    const p = spawnPos();
    const hue = Math.floor(rand(0, 360));
    const st: PlayerState = {
      id, num: this.nextNum++, name: name.slice(0, 14) || (isBot ? 'Bot' : 'Blob'),
      x: p.x, y: p.y, vx: 0, vy: 0,
      mass: TUNE.START_MASS, r: massToRadius(TUNE.START_MASS),
      hue, kills: 0, score: 0, alive: true, isBot,
      dashCdUntil: 0, spawnTick: this.tick, streak: 0,
      fireCdUntil: 0, fx: 1, fy: 0, hunter: false, shieldUntil: this.tick + 60, // 3s spawn shield
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

  handleInput(id: string, dx: number, dy: number, dash: boolean) {
    const p = this.players.get(id);
    if (!p || !p.alive) return;
    // sanitize (anti-cheat: intent only, server clamps everything)
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    const len = Math.hypot(dx, dy);
    let nx = 0, ny = 0;
    if (len > 0.01) { const c = Math.min(1, len) / len; nx = dx * c; ny = dy * c; p.fx = nx; p.fy = ny; }
    let speed = speedForMass(p.mass);
    if (p.hunter) speed *= 0.86; // R&D: hunters angle-cut, never outrun prey
    else if (!p.isBot && p.mass < this.avgMass * 0.5) speed *= 1.12; // runt comeback
    // steering: accelerate toward desired velocity (arcade feel)
    const k = 1 - Math.exp(-8 * (1 / TUNE.TICK_HZ));
    p.vx += (nx * speed - p.vx) * k;
    p.vy += (ny * speed - p.vy) * k;
    if (dash && this.tick >= p.dashCdUntil && p.mass > TUNE.START_MASS * 0.6) {
      const dl = Math.hypot(nx, ny);
      const ddx = dl > 0.01 ? nx / Math.max(1, dl) * dl : (p.vx / (Math.hypot(p.vx, p.vy) || 1));
      const ddy = dl > 0.01 ? ny / Math.max(1, dl) * dl : (p.vy / (Math.hypot(p.vx, p.vy) || 1));
      // dash along input dir, or facing if no input
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
      // cheap AI @10Hz
      if ((this.tick + p.hue) % 2 !== 0) continue;
      if (p.hunter) { this.hunterAI(p); continue; }
      // find nearest pellet + threat/prey
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
      if (threat) { dx = p.x - threat.x; dy = p.y - threat.y; dash = Math.hypot(dx, dy) < 320 && this.tick >= p.dashCdUntil; }
      else if (prey) { dx = prey.x - p.x; dy = prey.y - p.y; dash = Math.hypot(dx, dy) < 380 && Math.hypot(dx, dy) > 150 && this.tick >= p.dashCdUntil; }
      else { dx = tx - p.x; dy = ty - p.y; }
      const l = Math.hypot(dx, dy) || 1;
      this.handleInput(p.id, dx / l, dy / l, dash);
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
    this.eatPlayers();
    this.stepOrbs();
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
    if (this.botTimer % 20 === 0) { this.ensureBots(); this.ensureHunters(); } // 1s backfill cadence
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

  eatPlayers() {
    const list = [...this.players.values()].filter(p => p.alive).sort((a, b) => b.r - a.r);
    for (const eater of list) {
      if (!eater.alive) continue;
      for (const victim of list) {
        if (victim.id === eater.id || !victim.alive) continue;
        if (this.tick < victim.shieldUntil) continue; // spawn shield blocks eats
        if (eater.r < victim.r * TUNE.EAT_RATIO) continue;
        const d = Math.hypot(eater.x - victim.x, eater.y - victim.y);
        if (d < eater.r - victim.r * 0.35) {
          // eat! 75% mass transfer (area-ish), victim respawns in 3s
          eater.mass += victim.mass * 0.75;
          eater.r = massToRadius(eater.mass);
          eater.kills++;
          eater.streak++;
          if (eater.streak >= 3) this.pushFeed(`🔥 ${eater.name} is on fire x${eater.streak}!`);
          victim.alive = false;
          victim.vx = victim.vy = 0;
          victim.streak = 0;
          this.respawns.set(victim.id, this.tick + 60);
          // knockback pop for eater (juice + space)
          eater.vx *= 0.6; eater.vy *= 0.6;
          this.pushFeed(`💥 ${eater.name} ate ${victim.name}`);
          if (!victim.isBot) {
            const c = this.conns.get(victim.id);
            c?.ws.send(JSON.stringify({ t: 'died', by: eater.name, respawnIn: 3 }));
          }
          if (eater.mass > 220) { // anti-snowball cap: big blobs slowly leak
            eater.mass = 220 + (eater.mass - 220) * 0.995;
          }
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

  respawnNow(p: PlayerState) {
    const s = spawnPos();
    p.x = s.x; p.y = s.y; p.vx = p.vy = 0;
    p.mass = TUNE.START_MASS; p.r = massToRadius(p.mass);
    p.alive = true; p.dashCdUntil = 0; p.streak = 0; p.spawnTick = this.tick;
    p.fireCdUntil = 0; p.shieldUntil = this.tick + 60; // fresh 3s shield
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

  // ---- combat: firing, orbs, hunters (R&D: diep/Mini-Militia numbers) ----
  tryFire(id: string) {
    const p = this.players.get(id);
    if (!p || !p.alive) return;
    if (this.tick < p.fireCdUntil) return;
    if (p.mass < TUNE.FIRE_MIN_MASS) return;
    let live = 0;
    for (const o of this.orbs) if (o.owner === id && ++live >= TUNE.ORB_MAX_PER_PLAYER) return;
    if (this.orbs.length >= TUNE.ORB_MAX_ROOM) return;
    p.fireCdUntil = this.tick + (p.hunter ? TUNE.HUNTER_FIRE_CD : TUNE.ORB_COOLDOWN_TICKS);
    p.mass = Math.max(6, p.mass - TUNE.ORB_MASS_COST);
    p.r = massToRadius(p.mass);
    p.shieldUntil = 0; // firing breaks spawn shield (anti-camp)
    const m = Math.hypot(p.fx, p.fy) || 1;
    const nx = p.fx / m, ny = p.fy / m;
    this.orbs.push({
      id: this.orbId++, owner: id,
      x: p.x + nx * (p.r + 10), y: p.y + ny * (p.r + 10),
      vx: nx * TUNE.ORB_SPEED + p.vx * 0.35, vy: ny * TUNE.ORB_SPEED + p.vy * 0.35,
      hue: p.hue, bounces: 1, life: TUNE.ORB_LIFE_TICKS, grace: 5,
    });
  }

  stepOrbs() {
    const W = TUNE.WORLD;
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      o.life--;
      if (o.grace > 0) o.grace--;
      if (o.life <= 0) { this.orbs[i] = this.orbs[this.orbs.length - 1]; this.orbs.pop(); continue; }
      let dead = false;
      for (let s = 0; s < 2 && !dead; s++) { // 2 substeps: no tunneling small blobs
        o.x += (o.vx * (1 / TUNE.TICK_HZ)) / 2;
        o.y += (o.vy * (1 / TUNE.TICK_HZ)) / 2;
        if (o.x < TUNE.ORB_R) { o.x = TUNE.ORB_R; o.vx = Math.abs(o.vx); if (o.bounces-- <= 0) dead = true; }
        else if (o.x > W - TUNE.ORB_R) { o.x = W - TUNE.ORB_R; o.vx = -Math.abs(o.vx); if (o.bounces-- <= 0) dead = true; }
        if (o.y < TUNE.ORB_R) { o.y = TUNE.ORB_R; o.vy = Math.abs(o.vy); if (o.bounces-- <= 0) dead = true; }
        else if (o.y > W - TUNE.ORB_R) { o.y = W - TUNE.ORB_R; o.vy = -Math.abs(o.vy); if (o.bounces-- <= 0) dead = true; }
        if (!dead) dead = this.orbHits(o);
      }
      if (dead) { this.orbs[i] = this.orbs[this.orbs.length - 1]; this.orbs.pop(); }
    }
  }

  orbHits(o: Projectile): boolean {
    for (const p of this.players.values()) {
      if (!p.alive || (p.id === o.owner && o.grace > 0)) continue;
      const dx = p.x - o.x, dy = p.y - o.y;
      const rr = p.r + TUNE.ORB_R;
      if (dx > rr || dx < -rr || dy > rr || dy < -rr) continue;
      if (dx * dx + dy * dy > rr * rr) continue;
      if (this.tick < p.shieldUntil) return true; // shield eats the orb
      const m = Math.hypot(o.vx, o.vy) || 1;
      p.vx += (o.vx / m) * TUNE.ORB_KNOCK * (TUNE.START_MASS / p.mass);
      p.vy += (o.vy / m) * TUNE.ORB_KNOCK * (TUNE.START_MASS / p.mass);
      if (p.mass - TUNE.ORB_DMG <= 6) {
        const owner = this.players.get(o.owner);
        p.alive = false; p.vx = p.vy = 0; p.streak = 0;
        this.respawns.set(p.id, this.tick + 60);
        if (owner && owner.id !== p.id) {
          owner.kills++; owner.streak++;
          this.pushFeed(`💥 ${owner.name} blasted ${p.name}`);
          if (owner.streak >= 3) this.pushFeed(`🔥 ${owner.name} is on fire x${owner.streak}!`);
        } else this.pushFeed(`💥 ${p.name} blew themself up`);
        const c = this.conns.get(p.id);
        if (c && !p.isBot) {
          try { c.ws.send(JSON.stringify({ t: 'died', by: owner?.name ?? 'an orb', respawnIn: 3 })); } catch { /* gone */ }
        }
      } else {
        p.mass -= TUNE.ORB_DMG;
        p.r = massToRadius(p.mass);
      }
      return true; // orb dies on hit
    }
    return false;
  }

  hunterAI(p: PlayerState) {
    // violent angle-cutter: stalks weakest human in 900px, fires mid-range, never dashes
    let prey: PlayerState | null = null, bd = 900 * 900;
    for (const o of this.players.values()) {
      if (o.isBot || o.id === p.id || !o.alive) continue;
      const d2 = (o.x - p.x) ** 2 + (o.y - p.y) ** 2;
      if (d2 < bd) { bd = d2; prey = o; }
    }
    if (!prey) {
      let tx = p.x, ty = p.y, best = Infinity;
      for (const pl of this.pellets) {
        const d2 = (pl.x - p.x) ** 2 + (pl.y - p.y) ** 2;
        if (d2 < best) { best = d2; tx = pl.x; ty = pl.y; }
      }
      const dx = tx - p.x, dy = ty - p.y, l = Math.hypot(dx, dy) || 1;
      this.handleInput(p.id, dx / l, dy / l, false);
      return;
    }
    const dx = prey.x - p.x, dy = prey.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    this.handleInput(p.id, dx / d, dy / d, false);
    if (d < 520 && d > 120 && this.tick >= p.fireCdUntil) this.tryFire(p.id);
  }

  ensureHunters() {
    const humans = [...this.players.values()].filter(p => !p.isBot).length;
    const hunters = [...this.players.values()].filter(p => p.hunter).length;
    if (hunters < (humans >= 2 ? 2 : 0) && this.size < TUNE.MAX_HUMANS_PER_ROOM + 10) {
      const names = ['👹RIPPER', '👹MAULER', '👹CHOMP'];
      const st = this.addPlayer('hunter-' + Math.random().toString(36).slice(2, 8), names[Math.floor(Math.random() * names.length)], true);
      st.hunter = true;
      st.mass = 55; st.r = massToRadius(st.mass);
      this.pushFeed(`👹 a HUNTER stalks the arena…`);
    }
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
      players.push({ id: p.id, n: p.name, x: Math.round(p.x * 2) / 2, y: Math.round(p.y * 2) / 2, r: Math.round(p.r * 10) / 10, h: p.hue, k: p.kills, s: Math.floor(p.mass), b: p.isBot ? 1 : 0, ht: p.hunter ? 1 : 0 });
    }
    const pellets: Pellet[] = [];
    const PR = 1100;
    for (const pl of this.pellets) {
      if (Math.abs(pl.x - vx) > PR || Math.abs(pl.y - vy) > PR) continue;
      pellets.push(pl);
      if (pellets.length >= 220) break;
    }
    const orbs: { i: number; x: number; y: number; h: number }[] = [];
    for (const o of this.orbs) {
      if (Math.abs(o.x - vx) > PR || Math.abs(o.y - vy) > PR) continue;
      orbs.push({ i: o.id, x: Math.round(o.x), y: Math.round(o.y), h: o.hue });
      if (orbs.length >= 80) break;
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
      orbs,
    };
  }
}
