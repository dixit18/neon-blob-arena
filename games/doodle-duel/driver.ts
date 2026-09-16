// games/doodle-duel/driver — DoodleSim on the RoomDriver seam (DD-2/DD-6).
// Bots guess, NEVER draw: they answer mid-drawing with tiered delays and a
// 15% flub rate. Solo humans draw with an instant audience.
import type { RoomDriver, JoinInfo, GameCommand } from '../../packages/room/src/index.js';
import { DoodleSim } from './sim.js';
import { wantedBots, reactionDelayMs, tag } from '../../packages/bots/src/index.js';

const BOT_NAMES = ['Gogo', 'Pip', 'Lulu', 'Kiki', 'Momo', 'Zuzu', 'Tutu', 'Nana'];
const MAX_TOTAL = 10;
const MISTAKE_RATE = 0.15;

interface BotBrain {
  id: string;
  tier: 0 | 1 | 2;
  planned: string; // drawing signature already answered
  planAt: number;
  pick: number; // option index to play
}

export function createDoodleDriver(rand: () => number = Math.random): RoomDriver {
  const sim = new DoodleSim();
  const bots = new Map<string, BotBrain>();
  let botSeq = 0;

  function drawingSig(): string {
    return `${sim.gameNo}:${sim.drawingIdx}:${sim.prompt}`;
  }

  function ensureBots(): void {
    const humans = sim.humanCount();
    if (humans === 0) {
      for (const b of bots.keys()) sim.leave(b);
      bots.clear();
      return;
    }
    const want = Math.min(wantedBots(humans), MAX_TOTAL - humans);
    let have = 0;
    for (const p of sim.players.values()) if (p.isBot) have++;
    while (have < want) {
      const slot = botSeq++;
      const id = `dbot-${slot}`;
      sim.join(id, tag(BOT_NAMES[slot % BOT_NAMES.length]!), true);
      bots.set(id, { id, tier: (slot % 3) as 0 | 1 | 2, planned: '', planAt: 0, pick: -1 });
      have++;
    }
  }

  function botAct(b: BotBrain): void {
    if (sim.phase !== 'draw' || sim.prompt === '') return;
    const sig = drawingSig();
    if (b.planned === sig) return; // answered this drawing
    if (b.planned !== `${sig}#waiting`) {
      // Guess mid-drawing like a watching friend, not an aimbot.
      const mistake = rand() < MISTAKE_RATE;
      const correct = sim.options.indexOf(sim.prompt);
      b.pick = mistake ? (correct + 1 + Math.floor(rand() * 3)) % 4 : correct;
      b.planAt = sim.time + 6000 + reactionDelayMs(b.tier, rand) * 20;
      b.planned = `${sig}#waiting`;
    }
    if (sim.time >= b.planAt) {
      b.planned = sig;
      sim.answer(b.id, b.pick, sim.time);
    }
  }

  return {
    game: 'doodle-duel',
    join(p: JoinInfo): void { sim.join(p.id, p.name, p.isBot); ensureBots(); },
    leave(id: string): void { sim.leave(id); bots.delete(id); ensureBots(); },
    accept(cmd: GameCommand): void {
      if (cmd.kind === 'strokeBatch' && typeof cmd.data === 'object' && cmd.data !== null) {
        const d = cmd.data as { strokeId?: unknown; pts?: unknown; done?: unknown };
        if (Number.isInteger(d.strokeId) && Array.isArray(d.pts) && typeof d.done === 'boolean') {
          sim.stroke(cmd.by, d.strokeId as number,
            (d.pts as { x: unknown; y: unknown }[]).filter((p) => Number.isInteger(p.x) && Number.isInteger(p.y)) as { x: number; y: number }[],
            d.done as boolean);
        }
      } else if (cmd.kind === 'answer' && typeof cmd.data === 'object' && cmd.data !== null) {
        const i = (cmd.data as Record<string, unknown>).i;
        if (Number.isInteger(i)) sim.answer(cmd.by, i as number, sim.time);
      }
    },
    step(dt: number): void {
      sim.step(dt * 1000);
      if (sim.phase === 'draw') { for (const b of bots.values()) botAct(b); }
      else { for (const b of bots.values()) b.planned = ''; }
    },
    snapshot: (pid: string) => sim.snapshot(pid),
    createBot: (slot: number) => ({ name: tag(BOT_NAMES[slot % BOT_NAMES.length]!) }),
    playerCount: () => sim.playerCount(),
    dispose: () => { bots.clear(); },
  };
}
