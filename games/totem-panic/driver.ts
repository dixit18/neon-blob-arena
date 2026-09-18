// games/totem-panic/driver — TotemSim on the RoomDriver seam (TP-2).
// Steady bot hands with tiered nerves: sharps hug the block below,
// casuals breathe wider and sometimes flirt with the edge (drama, not
// suicide — picks clamp inside the legal overlap). Bots take their turn
// 2-5s in, human-paced. Solo humans get a party of 4 instantly.
// Transport: `input` {dx} = drop offset (dy rides along for the gate).
import type { RoomDriver, JoinInfo, GameCommand } from '../../packages/room/src/index.js';
import { TotemSim, BASE, MIN_OVERLAP, PLACE_RANGE } from './sim.js';
import { tag } from '../../packages/bots/src/index.js';

const BOT_NAMES = ['Mason', 'Pebble', 'Arch'];
const TABLE = 4;

export type Tier = 0 | 1; // 0 sharp, 1 casual

/** Legal window for the next block (never hands the table a slip). */
export function legalWindow(belowW: number, belowX: number, w: number): [number, number] {
  const half = (belowW + w) / 2 - MIN_OVERLAP;
  const lo = Math.max(-PLACE_RANGE, belowX - half);
  const hi = Math.min(PLACE_RANGE, belowX + half);
  return [lo, hi];
}

/** The steady-hands brain, exported pure for tests. */
export function planX(
  belowW: number, belowX: number, w: number, tier: Tier, rand: () => number = Math.random,
): number {
  const [lo, hi] = legalWindow(belowW, belowX, w);
  const clamp = (x: number): number => Math.max(lo, Math.min(hi, x));
  if (tier === 0) {
    return clamp(belowX + (rand() - 0.5) * 16); // sharps hug center (±8)
  }
  if (rand() < 0.15) {
    // Casual edge-flirt: 80% out to the legal edge, both sides in play.
    const side = rand() < 0.5 ? lo : hi;
    return clamp(belowX + (side - belowX) * 0.8);
  }
  return clamp(belowX + (rand() - 0.5) * 60); // casuals breathe (±30)
}

function placeDelayMs(rand: () => number): number {
  return 2000 + rand() * 3000;
}

export function createTotemDriver(rand: () => number = Math.random): RoomDriver {
  const sim = new TotemSim(rand);
  const bots = new Map<string, Tier>();
  let botSeq = 0;
  let seenTurn = '';
  const dueAt = new Map<string, number>();

  function ensureBots(): void {
    const humans = [...sim.players.values()].filter((p) => p.isBot === false && p.active).length;
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
    if (sim.turnId() !== id) return;
    const key = `${sim.runNo}:${sim.tower.length}`;
    if (key !== seenTurn) { seenTurn = key; dueAt.clear(); }
    let due = dueAt.get(id);
    if (due === undefined) {
      due = sim.time + placeDelayMs(rand);
      dueAt.set(id, due);
    }
    if (sim.time < due) return; // still sighting — humans place first
    const below = sim.tower.length === 0 ? BASE : sim.tower[sim.tower.length - 1]!;
    const widths = sim.snapshot(id).queue;
    const w = widths[0] ?? 60;
    sim.place(id, planX(below.w, below.x, w, bots.get(id) ?? 0, rand));
    dueAt.delete(id);
  }

  return {
    game: 'totem-panic',
    join(info: JoinInfo): void { sim.join(info.id, info.name, info.isBot); ensureBots(); },
    leave(id: string): void { sim.leave(id); bots.delete(id); dueAt.delete(id); ensureBots(); },
    accept(cmd: GameCommand): void {
      if (cmd.kind === 'input' && typeof cmd.data === 'object' && cmd.data !== null) {
        const d = cmd.data as Record<string, unknown>;
        if (typeof d.dx === 'number') sim.place(cmd.by, d.dx);
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
