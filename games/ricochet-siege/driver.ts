// games/ricochet-siege/driver — SiegeSim on the RoomDriver seam (RS-2).
// Gunners pick the nearest live hull and fire direct: sharps with a
// whisper of error, casuals with a shout (bots-package error shape).
// Ricochet chaos does the rest — no bot computes bounces. Commits land
// 1-4s into the window, human-paced. Solo humans get a war of 6 instantly.
// Transport: `input` {dx, dy} = aim vector (flick convention, gate-safe).
import type { RoomDriver, JoinInfo, GameCommand } from '../../packages/room/src/index.js';
import { SiegeSim } from './sim.js';
import { tag } from '../../packages/bots/src/index.js';

const BOT_NAMES = ['Rook', 'Bishop', 'Knight', 'Pawn', 'Queen'];
const TABLE = 6;

export type Tier = 0 | 1; // 0 sharp, 1 casual

/** Aim error: sharps whisper (±0.06), casuals shout (±0.25). */
export function aimError(tier: Tier, rand: () => number = Math.random): number {
  return (rand() - 0.5) * (tier === 0 ? 0.12 : 0.5);
}

/** The gunner brain, exported pure for tests: aim at nearest live enemy. */
export function planAim(
  me: { x: number; y: number },
  foes: { x: number; y: number }[],
  tier: Tier,
  rand: () => number = Math.random,
): { angle: number; power: number } {
  if (foes.length === 0) {
    return { angle: rand() * Math.PI * 2, power: 0.5 }; // no targets: ranging shot
  }
  let best = foes[0]!;
  let bd = Infinity;
  for (const f of foes) {
    const d = Math.hypot(f.x - me.x, f.y - me.y);
    if (d < bd) { bd = d; best = f; }
  }
  const angle = Math.atan2(best.y - me.y, best.x - me.x) + aimError(tier, rand);
  const power = tier === 0 ? 0.7 + rand() * 0.3 : 0.4 + rand() * 0.5;
  return { angle, power };
}

function commitDelayMs(rand: () => number): number {
  return 1000 + rand() * 3000;
}

export function createSiegeDriver(rand: () => number = Math.random): RoomDriver {
  const sim = new SiegeSim(rand);
  const bots = new Map<string, Tier>();
  let botSeq = 0;
  let seenRound = 0;
  const dueAt = new Map<string, number>();

  function ensureBots(): void {
    const humans = [...sim.players.values()].filter((p) => !p.isBot && p.active).length;
    if (humans === 0) {
      for (const b of bots.keys()) sim.leave(b);
      bots.clear();
      return;
    }
    while (sim.playerCount() < TABLE) {
      const slot = botSeq++;
      const id = `bot-${slot}`;
      sim.join(id, tag(BOT_NAMES[slot % BOT_NAMES.length]!), true);
      bots.set(id, (slot % 2) as Tier);
    }
  }

  function botAct(id: string): void {
    if (sim.phase !== 'aim') return;
    const p = sim.players.get(id);
    if (!p || !p.active || !p.playsRound || !p.alive || p.commit) return;
    if (sim.roundNo !== seenRound) { seenRound = sim.roundNo; dueAt.clear(); }
    let due = dueAt.get(id);
    if (due === undefined) {
      due = sim.time + commitDelayMs(rand);
      dueAt.set(id, due);
    }
    if (sim.time < due) return; // still sighting — humans lock first
    const foes = [...sim.players.values()]
      .filter((e) => e.active && e.playsRound && e.alive && e.id !== id)
      .map((e) => ({ x: e.x, y: e.y }));
    const a = planAim({ x: p.x, y: p.y }, foes, bots.get(id) ?? 0, rand);
    sim.commit(id, a.angle, a.power);
    dueAt.delete(id);
  }

  return {
    game: 'ricochet-siege',
    join(info: JoinInfo): void { sim.join(info.id, info.name, info.isBot); ensureBots(); },
    leave(id: string): void { sim.leave(id); bots.delete(id); dueAt.delete(id); ensureBots(); },
    accept(cmd: GameCommand): void {
      // Aim vector in, angle/power out (zero-vector dies in commit).
      if (cmd.kind === 'input' && typeof cmd.data === 'object' && cmd.data !== null) {
        const d = cmd.data as Record<string, unknown>;
        if (typeof d.dx === 'number' && typeof d.dy === 'number') {
          sim.commit(cmd.by, Math.atan2(d.dy, d.dx), Math.min(1, Math.hypot(d.dx, d.dy)));
        }
      }
    },
    step(dt: number): void {
      sim.step(dt * 1000);
      for (const b of bots.keys()) botAct(b);
    },
    snapshot: (pid: string) => sim.snapshot(pid),
    createBot: (slot: number) => ({ name: tag(BOT_NAMES[slot % BOT_NAMES.length]!) }),
    playerCount: () => sim.playerCount(),
    dispose: () => { bots.clear(); dueAt.clear(); },
  };
}
