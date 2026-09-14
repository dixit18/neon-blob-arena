// POLAR PANIC — game #2. Magnet-charge arena: flip your polarity, vacuum
// opposite pellets, attract opposite rivals to absorb them, repel same charge.
// One mechanic (FLIP) done well: no dash, no orbs, no hunters. Same transport
// shape as mochi (snapshot + rounds + streaks + bots), independent sim.
// Pellet charge rides id parity (even=+1): zero extra bytes, client mirrors it.
import { WebSocket } from 'ws';
import { TUNE, PolarPlayer, Pellet, SnapPlayer, ServerSnapshot, massToRadius, speedForMass, pelletCharge } from './types.js';
import { integrate, resolveCollision } from './physics.js';
import { persistScore } from './db.js';
import type { Conn } from './game.js';

const ROUND_TICKS = 180 * 20; // 3-minute rounds: same urgency engine as mochi
const FLIP_CD_TICKS = 20; // 1s flip cooldown — spam-proof, escape-ready
const VAC_R = 320; // pellet vacuum radius (opposite charge)
const PULL_R = 280; // rival attract radius (opposite charge)
const PUSH_R = 240; // rival repel radius (same charge — the escape tool)
let pelletId = 1;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const BOT_NAMES = ['Blip', 'Gloop', 'Zorp', 'Mochi', 'Vex', 'Pud', 'Nib', 'Quark', 'Slim', 'Orb', 'Fizz', 'Gup'];

function spawnPos(margin = 80) { return { x: rand(margin, TUNE.WORLD - margin), y: rand(margin, TUNE.WORLD - margin) }; }

export class PolarRoom {
  id: string;
  tick = 0;
  nextNum = 1;
  players = new Map<string, PolarPlayer>();
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
    console.log(`[polar ${id}] created`);
    for (let i = 0; i < TUNE.PELLETS; i++) this.addPellet();
  }

  get humans() { return [...this.players.values()].filter(p => !p.isBot && p.alive).length; }
  get size() { return this.players.size; }

  addPellet() {
    this.pellets.push({ id: pelletId++, x: rand(20, TUNE.WORLD - 20), y: rand(20, TUNE.WORLD - 20), hue: Math.floor(rand(0, 360)) });
  }

  addPlayer(id: string, name: string, isBot = false): PolarPlayer {
    const p = spawnPos();
    const charge = (Math.random() < 0.5 ? 1 : -1) as 1 | -1;
    const st: PolarPlayer = {
      id, num: this.nextNum++, name: name.slice(0, 14) || (isBot ? 'Bot' : 'Mochi'),
      x: p.x, y: p.y, vx: 0, vy: 0,
      mass: TUNE.START_MASS, r: massToRadius(TUNE.START_MASS),
      hue: charge > 0 ? 200 : 335, // soda blue + / raspberry − (matches client ring)
      kills: 0, score: 0, alive: true, isBot,
      dashCdUntil: 0, spawnTick: this.tick, streak: 0,
      fireCdUntil: 0, fx: 1, fy: 0, hunter: false, shieldUntil: this.tick + 60,
      charge, flipCdUntil: 0,
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

  handleInput(id: string, dx: number, dy: number, _dash = false) {
    const p = this.players.get(id);
    if (!p || !p.alive) return;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    const len = Math.hypot(dx, dy);
    let nx = 0, ny = 0;
    if (len > 0.01) { const c = Math.min(1, len) / len; nx = dx * c; ny = dy * c; }
    const speed = speedForMass(p.mass);
    const k = 1 - Math.exp(-8 * (1 / TUNE.TICK_HZ));
    p.vx += (nx * speed - p.vx) * k;
    p.vy += (ny * speed - p.vy) * k;
  }

  tryFlip(id: string) {
    const p = this.players.get(id);
    if (!p || !p.alive) return;
    if (this.tick < p.flipCdUntil) return;
    p.flipCdUntil = this.tick + FLIP_CD_TICKS;
    p.charge = (p.charge > 0 ? -1 : 1) as 1 | -1;
    p.hue = p.charge > 0 ? 200 : 335;
  }

  updateBots() {
    for (const p of this.players.values()) {
      if (!p.isBot || !p.alive) continue;
      if ((this.tick + p.hue) % 2 !== 0) continue; // cheap AI @10Hz
      // threat = nearest opposite + bigger: FLIP to escape (self-balancing design)
      let threat: PolarPlayer | null = null, td = 520 * 520;
      let prey: PolarPlayer | null = null, pd = 420 * 420;
      for (const o of this.players.values()) {
        if (o.id === p.id || !o.alive || o.charge === p.charge) continue;
        const d2 = (o.x - p.x) ** 2 + (o.y - p.y) ** 2;
        if (o.r > p.r * 1.05 && d2 < td) { td = d2; threat = o; }
        else if (p.r > o.r * 1.12 && d2 < pd) { pd = d2; prey = o; }
      }
      if (threat && this.tick >= p.flipCdUntil) this.tryFlip(p.id); // escape flip
      // dinner = nearest opposite-charge pellet (vacuum does the rest)
      let tx = p.x, ty = p.y, best = Infinity;
      for (const pl of this.pellets) {
        if (pelletCharge(pl.id) !== -p.charge) continue;
        const d2 = (pl.x - p.x) ** 2 + (pl.y - p.y) ** 2;
        if (d2 < best) { best = d2; tx = pl.x; ty = pl.y; }
        if (best < 200 * 200) break;
      }
      let dx = tx - p.x, dy = ty - p.y;
      if (threat) { dx = p.x - threat.x; dy = p.y - threat.y; }
      else if (prey) { dx = prey.x - p.x; dy = prey.y - p.y; }
      const l = Math.hypot(dx, dy) || 1;
      this.handleInput(p.id, dx / l, dy / l);
    }
  }

  magnet() {
    const dt = 1 / TUNE.TICK_HZ;
    // pellet vacuum: opposite charge drifts in, same charge scatters (positions only)
    for (const pl of this.pellets) {
      const pc = pelletCharge(pl.id);
      let bx = 0, by = 0;
      for (const p of this.players.values()) {
        if (!p.alive) continue;
        const dx = p.x - pl.x, dy = p.y - pl.y;
        const d = Math.hypot(dx, dy);
        if (d < 1 || d > VAC_R) continue;
        if (pc !== p.charge && d < VAC_R) { const s = 260 * (1 - d / VAC_R) * dt; bx += (dx / d) * s; by += (dy / d) * s; }
        else if (pc === p.charge && d < 200) { const s = 120 * (1 - d / 200) * dt; bx -= (dx / d) * s; by -= (dy / d) * s; }
      }
      if (bx !== 0 || by !== 0) {
        pl.x = Math.max(10, Math.min(TUNE.WORLD - 10, pl.x + bx));
        pl.y = Math.max(10, Math.min(TUNE.WORLD - 10, pl.y + by));
      }
    }
    // rivals: opposite attracts, same repels (repel = built-in escape)
    const list = [...this.players.values()].filter(p => p.alive);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d < 1) continue;
        if (a.charge !== b.charge && d < PULL_R) {
          const s = 260 * (1 - d / PULL_R) * dt;
          const nx = dx / d * s, ny = dy / d * s;
          a.vx += nx; a.vy += ny; b.vx -= nx; b.vy -= ny;
        } else if (a.charge === b.charge && d < PUSH_R) {
          const s = 420 * (1 - d / PUSH_R) * dt;
          const nx = dx / d * s, ny = dy / d * s;
          a.vx -= nx; a.vy -= ny; b.vx += nx; b.vy += ny;
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
    this.magnet();
    this.collide();
    this.eatPellets();
    this.eatPlayers();
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

  rebuildGrid(list: PolarPlayer[]) {
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
    // Charge-gated collision: SAME charge bounces (elastic bumps), OPPOSITE
    // charges phase through each other and merge. This is load-bearing: elastic
    // separation parks pairs at r1+r2 forever, and the eat threshold sits deep
    // inside that radius — with separation, opposite-charge eats could NEVER
    // consummate without a dash impulse (which polar cut). Merging opposites
    // is also the fantasy: magnets snap together, likes repel.
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
            if (o.charge !== p.charge) continue; // opposites merge (see eatPlayers)
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
    // Opposite charge only: same charge bumps (collide), never eats. Flip to escape.
    const list = [...this.players.values()].filter(p => p.alive).sort((a, b) => b.r - a.r);
    for (const eater of list) {
      if (!eater.alive) continue;
      for (const victim of list) {
        if (victim.id === eater.id || !victim.alive) continue;
        if (victim.charge === eater.charge) continue;
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
          this.pushFeed(`⚡ ${eater.name} discharged ${victim.name}`);
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

  respawnNow(p: PolarPlayer) {
    const s = spawnPos();
    p.x = s.x; p.y = s.y; p.vx = p.vy = 0;
    p.mass = TUNE.START_MASS; p.r = massToRadius(p.mass);
    p.alive = true; p.streak = 0; p.spawnTick = this.tick;
    p.flipCdUntil = 0; p.shieldUntil = this.tick + 60;
    p.charge = (Math.random() < 0.5 ? 1 : -1) as 1 | -1;
    p.hue = p.charge > 0 ? 200 : 335;
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
      players.push({ id: p.id, n: p.name, x: Math.round(p.x * 2) / 2, y: Math.round(p.y * 2) / 2, r: Math.round(p.r * 10) / 10, h: p.hue, k: p.kills, s: Math.floor(p.mass), b: p.isBot ? 1 : 0, ht: 0, c: p.charge });
    }
    const pellets: Pellet[] = [];
    const PR = 1100;
    for (const pl of this.pellets) {
      if (Math.abs(pl.x - vx) > PR || Math.abs(pl.y - vy) > PR) continue;
      pellets.push(pl);
      if (pellets.length >= 220) break;
    }
    return {
      t: 'snap', tick: this.tick, you: forId,
      me: me ? {
        x: me.x, y: me.y, r: me.r, mass: Math.floor(me.mass),
        dashReady: this.tick >= me.flipCdUntil, // polar reads dashReady as FLIP-ready
        score: Math.floor(me.score), ch: me.charge,
        kills: me.kills, alive: me.alive, streak: me.streak, sh: this.tick < me.shieldUntil ? 1 : 0,
        respawnIn: me.alive ? undefined : Math.max(0, ((this.respawns.get(forId) ?? this.tick) - this.tick) / TUNE.TICK_HZ),
      } : undefined,
      players, pellets, leaders, feed: [...this.feed],
      taunts: this.taunts.map(t => ({ id: t.id, e: t.e })),
      round: Math.max(0, Math.ceil((ROUND_TICKS - this.roundTick) / TUNE.TICK_HZ)),
      orbs: [],
    };
  }
}
