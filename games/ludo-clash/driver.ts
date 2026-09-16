// games/ludo-clash/driver — LudoSim adapted to the RoomDriver seam (LD-2).
// Bots are labelled (🤖) + tiered: sharps follow capture > leave-base >
// finish > progress, casuals pick random 20-40% of the time. Solo humans get
// an instant full table of 4, never a waiting screen. Transport: `input`
// fire = roll, `answer` i = pick token.
import type { RoomDriver, JoinInfo, GameCommand } from '../../packages/room/src/index.js';
import { LudoSim, TRACK, SAFE, STARTS } from './sim.js';
import { tag } from '../../packages/bots/src/index.js';

const BOT_NAMES = ['Raja', 'Rani', 'Mantri', 'Sipahi'];
const TABLE = 4;
const MISTAKE = [0.1, 0.3]; // sharp / casual tiers — averages ~20%

export interface LudoFoe { seat: number; tokens: number[] }

/** Rank a token pick, pure and headless-testable:
 * capture (3) > leave-base (2) > finish (1.5) > progress (0..0.57). */
export function scoreLudoPick(
  seat: number, myTokens: number[], k: number, dice: number, foes: LudoFoe[],
): number {
  const rel = myTokens[k]!;
  if (rel === -1) return dice === 6 ? 2 : -1;
  const next = rel + dice;
  if (next > 57) return -1;
  if (next === 57) return 1.5;
  if (next <= 50) {
    const cell = (STARTS[seat]! + next) % TRACK;
    if (!SAFE.has(cell)) {
      for (const q of foes) {
        for (let j = 0; j < 4; j++) {
          const qr = q.tokens[j]!;
          if (qr >= 0 && qr <= 50 && (STARTS[q.seat]! + qr) % TRACK === cell) return 3;
        }
      }
    }
  }
  return next / 100; // progress tiebreak
}

export function createLudoDriver(rand: () => number = Math.random): RoomDriver {
  const sim = new LudoSim(rand);
  const bots = new Map<string, 0 | 1>(); // id → tier
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

  /** Rank an option: capture (3) > leave-base (2) > finish (1.5) > progress. */
  function scoreOption(botId: string, k: number): number {
    const me = sim.players.get(botId);
    if (!me) return -1;
    const foes: LudoFoe[] = [];
    for (const q of sim.players.values()) {
      if (q.id === botId) continue;
      foes.push({ seat: q.seat, tokens: [...q.tokens] });
    }
    return scoreLudoPick(me.seat, me.tokens, k, sim.dice, foes);
  }

  function botAct(id: string): void {
    const turn = sim.order[sim.turnPos % Math.max(1, sim.order.length)];
    if (turn !== id || sim.phase !== 'play') return;
    if (sim.stage === 'roll') {
      sim.roll(id);
    } else if (sim.stage === 'pick') {
      const opts = [...sim.options];
      if (opts.length === 0) return;
      const tier = bots.get(id) ?? 0;
      let pick: number;
      if (rand() < MISTAKE[tier]!) {
        pick = opts[Math.floor(rand() * opts.length)]!; // casual afternoon
      } else {
        pick = opts[0]!;
        let best = -Infinity;
        for (const k of opts) {
          const s = scoreOption(id, k);
          if (s > best) { best = s; pick = k; }
        }
      }
      sim.pick(id, pick);
    }
  }

  return {
    game: 'ludo-clash',
    join(p: JoinInfo): void { sim.join(p.id, p.name, p.isBot); ensureBots(); },
    leave(id: string): void { sim.leave(id); bots.delete(id); ensureBots(); },
    accept(cmd: GameCommand): void {
      if (cmd.kind === 'input') sim.roll(cmd.by);
      else if (cmd.kind === 'answer' && typeof cmd.data === 'object' && cmd.data !== null) {
        const i = (cmd.data as Record<string, unknown>).i;
        if (Number.isInteger(i)) sim.pick(cmd.by, i as number);
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
