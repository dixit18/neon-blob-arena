// games/signal-seven/driver — SignalSim on the RoomDriver seam (SI-2).
// Rival tablets deduce with the solver, not dice: each keeps the codes
// consistent with the clues AND its own pip history, then guesses inside
// that set. Sharps read the top of the set (3-5 to solve); casuals wander
// it and sometimes guess wild (5-8+, beatable). Solo humans get an instant
// table of 4, never a waiting screen.
// Transport: `input` {dx, dy, aim} = one rune per axis (the protocol's
// answer shape only carries 0-3; the triple rides the input vector instead
// — zero contract change, same trick as the flick vector).
import type { RoomDriver, JoinInfo, GameCommand } from '../../packages/room/src/index.js';
import {
  SignalSim, RUNES, CODE_LEN, MAX_GUESSES, allCodes, holds, feedback,
  type Clue,
} from './sim.js';
import { tag } from '../../packages/bots/src/index.js';

const BOT_NAMES = ['Sage', 'Rune', 'Omen'];
const TABLE = 4;

export type Tier = 0 | 1; // 0 sharp, 1 casual

export interface Hist { guess: number[]; inCode: number; inPos: number }

/** Codes still alive given the clues + everything the pips taught. */
export function candidates(clues: Clue[], hist: Hist[]): number[][] {
  return allCodes().filter((c) =>
    clues.every((cl) => holds(c, cl)) &&
    hist.every((h) => {
      const f = feedback(c, h.guess);
      return f.inCode === h.inCode && f.inPos === h.inPos;
    }),
  );
}

/** The tablet brain, exported pure for tests. */
export function planGuess(
  clues: Clue[], hist: Hist[], tier: Tier, rand: () => number = Math.random,
): number[] {
  const alive = candidates(clues, hist);
  const pool = alive.length > 0 ? alive : allCodes();
  if (tier === 1 && rand() < 0.3) {
    // Casual wanders: any legal triple, wisdom optional.
    return allCodes()[Math.floor(rand() * allCodes().length)]!;
  }
  const top = Math.min(tier === 0 ? 3 : 12, pool.length);
  return pool[Math.floor(rand() * top)]!;
}

function guessDelayMs(tier: Tier, rand: () => number): number {
  return tier === 0 ? 3000 + rand() * 3000 : 6000 + rand() * 6000;
}

export function createSignalDriver(
  rand: () => number = Math.random, day?: { seed: number; day: string },
): RoomDriver {
  const sim = new SignalSim(rand, day);
  const bots = new Map<string, Tier>();
  let botSeq = 0;
  const dueAt = new Map<string, number>();
  const seenAttempts = new Map<string, number>();

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
      bots.set(id, (slot % 2) as Tier);
    }
  }

  function botAct(id: string): void {
    if (sim.phase !== 'puzzle' || !sim.mystery) return;
    const p = sim.players.get(id);
    if (!p || p.done || p.attempts.length >= MAX_GUESSES) return;
    if (seenAttempts.get(id) !== p.attempts.length) {
      seenAttempts.set(id, p.attempts.length);
      dueAt.set(id, sim.time + guessDelayMs(bots.get(id) ?? 0, rand));
    }
    if (sim.time < (dueAt.get(id) ?? Infinity)) return; // still reading
    const hist: Hist[] = p.attempts.map((a) => ({
      guess: [...a.guess], inCode: a.inCode, inPos: a.inPos,
    }));
    const g = planGuess(sim.mystery.clues, hist, bots.get(id) ?? 0, rand);
    if (sim.guess(id, g)) dueAt.delete(id);
  }

  return {
    game: 'signal-seven',
    join(info: JoinInfo): void { sim.join(info.id, info.name, info.isBot); ensureBots(); },
    leave(id: string): void {
      sim.leave(id); bots.delete(id); dueAt.delete(id); seenAttempts.delete(id); ensureBots();
    },
    accept(cmd: GameCommand): void {
      if (cmd.kind === 'input' && typeof cmd.data === 'object' && cmd.data !== null) {
        const d = cmd.data as Record<string, unknown>;
        if (typeof d.dx === 'number' && typeof d.dy === 'number' && typeof d.aim === 'number') {
          const g = [d.dx, d.dy, d.aim].map((n) => Math.round(n));
          sim.guess(cmd.by, g);
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
    dispose: () => { bots.clear(); dueAt.clear(); seenAttempts.clear(); },
  };
}

export { RUNES, CODE_LEN };
