// games/blaze-squad/driver — BlazeSim adapted to the RoomDriver seam.
// Bots are labelled (🤖) + imperfect: tiered aim error from packages/bots,
// zone-aware (drift to safety), loot-seeking, 20% trigger-happy mistakes.
// Solo joiners get instant opponents, never a waiting screen.
import type { RoomDriver, JoinInfo, GameCommand } from '../../packages/room/src/index.js';
import { BlazeSim } from './sim.js';
import { wantedBots, tag } from '../../packages/bots/src/index.js';

const BOT_NAMES = ['Blitz', 'Ember', 'Cinder', 'Flare', 'Ash', 'Spark', 'Scorch', 'Wisp'];
const MAX_TOTAL = 9; // room cap: keeps snapshots ≤1.5KB, fights readable
const MISTAKE_RATE = 0.2;

export function createBlazeDriver(rand: () => number = Math.random): RoomDriver {
  const sim = new BlazeSim();
  const bots = new Set<string>();
  let botSeq = 0;

  function ensureBots(): void {
    const humans = sim.humanCount();
    if (humans === 0) {
      for (const b of bots) sim.leave(b);
      bots.clear();
      return;
    }
    const want = Math.min(wantedBots(humans), MAX_TOTAL - humans);
    let have = 0;
    for (const p of sim.players.values()) if (p.isBot) have++;
    while (have < want) {
      const slot = botSeq++;
      const id = `bot-${slot}`;
      sim.join(id, tag(BOT_NAMES[slot % BOT_NAMES.length]!), true);
      bots.add(id);
      have++;
    }
  }

  function nearestEnemy(id: string): { dx: number; dy: number; d: number } | null {
    const me = sim.players.get(id);
    if (!me) return null;
    let best: { dx: number; dy: number; d: number } | null = null;
    for (const p of sim.players.values()) {
      if (p.id === id || !p.alive) continue;
      if (p.sq === me.sq) continue; // squadmate: friendly fire is off, don't aim
      const dx = p.x - me.x;
      const dy = p.y - me.y;
      const d = Math.hypot(dx, dy);
      if (!best || d < best.d) best = { dx, dy, d };
    }
    return best;
  }

  function botThink(id: string): void {
    const me = sim.players.get(id);
    if (!me || !me.alive || sim.phase !== 'fight') { return; }
    // 1) safety first: outside the zone → run to center.
    const zd = Math.hypot(me.x - sim.zone.x, me.y - sim.zone.y);
    if (zd > sim.zone.r * 0.85) {
      sim.move(id, Math.sign(sim.zone.x - me.x), Math.sign(sim.zone.y - me.y));
    } else {
      // 2) loot when hurt, else strafe toward the enemy.
      const foe = nearestEnemy(id);
      if (me.hp < 55) {
        let crate: { x: number; y: number } | null = null;
        for (const c of sim.crates) {
          if (c.taken) continue;
          if (!crate || Math.hypot(c.x - me.x, c.y - me.y) < Math.hypot(crate.x - me.x, crate.y - me.y)) crate = c;
        }
        if (crate) sim.move(id, Math.sign(crate.x - me.x), Math.sign(crate.y - me.y));
        else if (foe) sim.move(id, Math.sign(foe.dx), Math.sign(-foe.dy));
      } else if (foe) {
        // orbit at mid range instead of face-hugging
        const s = foe.d > 20 ? 1 : -1;
        sim.move(id, Math.sign(foe.dx) * s, Math.sign(foe.dy) * s);
      }
    }
    // 3) fire in range, with tiered error + trigger-happy mistakes.
    const foe = nearestEnemy(id);
    if (foe && foe.d < 19) {
      const tier = botSeq % 3;
      const err = (tier === 0 ? 0.22 : tier === 1 ? 0.12 : 0.05) * (rand() - 0.5) * 2;
      const wild = rand() < MISTAKE_RATE ? (rand() - 0.5) * 1.2 : 0;
      sim.fire(id, Math.atan2(foe.dy, foe.dx) + err + wild, sim.time);
    }
  }

  return {
    game: 'blaze-squad',
    join(p: JoinInfo): void { sim.join(p.id, p.name, p.isBot); ensureBots(); },
    leave(id: string): void { sim.leave(id); bots.delete(id); ensureBots(); },
    accept(cmd: GameCommand): void {
      if (cmd.kind !== 'input' || typeof cmd.data !== 'object' || cmd.data === null) return;
      const d = cmd.data as Record<string, unknown>;
      const dx = typeof d.dx === 'number' ? d.dx : 0;
      const dy = typeof d.dy === 'number' ? d.dy : 0;
      sim.move(cmd.by, dx, dy);
      if (d.fire === true) {
        const aim = typeof d.aim === 'number' ? d.aim : 0;
        sim.fire(cmd.by, aim, sim.time);
      }
    },
    step(dt: number): void {
      sim.step(dt * 1000);
      if (sim.phase === 'fight') for (const b of bots) botThink(b);
    },
    snapshot: (pid: string) => sim.snapshot(pid),
    createBot: (slot: number) => ({ name: tag(BOT_NAMES[slot % BOT_NAMES.length]!) }),
    playerCount: () => sim.playerCount(),
    dispose: () => { bots.clear(); },
  };
}
