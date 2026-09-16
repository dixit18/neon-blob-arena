// games/read-the-room/driver — RoomSim adapted to the RoomDriver seam (RT-2).
// Bots are labelled (🤖) + tiered: sharps vote the current points leader
// (social bias — they read the room), casuals vote random 30% of the time.
// Solo humans get an instant party of 4, never a waiting screen.
// Transport: `answer` i = vote for seat i.
import type { RoomDriver, JoinInfo, GameCommand } from '../../packages/room/src/index.js';
import { RoomSim } from './sim.js';
import { tag } from '../../packages/bots/src/index.js';

const BOT_NAMES = ['Mim', 'Pip', 'Zed', 'Noor'];
const TABLE = 4;
const CASUAL_RANDOM = 0.3;

export function createRoomDriver(rand: () => number = Math.random): RoomDriver {
  const sim = new RoomSim(rand);
  const bots = new Map<string, 0 | 1>(); // id → tier (0 sharp, 1 casual)
  let botSeq = 0;

  function ensureBots(): void {
    const humans = [...sim.players.values()].filter((p) => !p.isBot).length;
    if (humans === 0) {
      for (const b of bots.keys()) sim.leave(b);
      bots.clear();
      return;
    }
    while (sim.playerCount() < TABLE) {
      const slot = botSeq++;
      const id = `bot-${slot}`;
      sim.join(id, tag(BOT_NAMES[slot % BOT_NAMES.length]!), true);
      bots.set(id, (slot % 2) as 0 | 1);
    }
  }

  /** Sharp pick: the points leader among others (lowest seat breaks ties). */
  function sharpPick(botId: string): number {
    let best = -1;
    let seat = -1;
    sim.order.forEach((id, i) => {
      if (id === botId) return;
      const sc = sim.players.get(id)?.score ?? 0;
      if (sc > best) { best = sc; seat = i; }
    });
    return seat;
  }

  function randomPick(botId: string): number {
    const mine = sim.order.indexOf(botId);
    const pool = sim.order.map((_, i) => i).filter((i) => i !== mine);
    return pool[Math.floor(rand() * pool.length)] ?? 0;
  }

  function botAct(id: string): void {
    if (sim.phase !== 'vote' || sim.votes.has(id)) return;
    if (!sim.order.includes(id)) return;
    const tier = bots.get(id) ?? 0;
    const pick = tier === 0 || rand() >= CASUAL_RANDOM ? sharpPick(id) : randomPick(id);
    if (pick >= 0) sim.vote(id, pick);
  }

  return {
    game: 'read-the-room',
    join(p: JoinInfo): void { sim.join(p.id, p.name, p.isBot); ensureBots(); },
    leave(id: string): void { sim.leave(id); bots.delete(id); ensureBots(); },
    accept(cmd: GameCommand): void {
      if (cmd.kind === 'answer' && typeof cmd.data === 'object' && cmd.data !== null) {
        const i = (cmd.data as Record<string, unknown>).i;
        if (Number.isInteger(i)) sim.vote(cmd.by, i as number);
      }
    },
    step(dt: number): void {
      sim.step(dt * 1000);
      for (const b of bots.keys()) botAct(b);
    },
    snapshot: (pid: string) => sim.snapshot(pid),
    createBot: (slot: number) => ({ name: tag(BOT_NAMES[slot % BOT_NAMES.length]!) }),
    playerCount: () => sim.playerCount(),
    dispose: () => { bots.clear(); },
  };
}
