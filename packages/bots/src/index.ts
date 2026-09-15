// packages/bots — labelled-bot interface + backfill controller.
// Bots are always labelled (isBot) and deliberately imperfect per game policy.
import type { BotPolicy } from '../../catalog/src/index.js';

export const BOT_TAG = '🤖';

/** Solo joiners see a full room fast: bursts, never a 14s trickle. */
export function wantedBots(humans: number): number {
  if (humans < 2) return 7;
  if (humans < 8) return 5;
  if (humans < 14) return 3;
  return 0;
}

/** Imperfect reaction delay window (ms) so bots feel alive, never aimbotty. */
export function reactionDelayMs(tier: 0 | 1 | 2, rand: () => number = Math.random): number {
  const lo = [180, 320, 520][tier]!;
  const hi = [420, 700, 1100][tier]!;
  return lo + rand() * (hi - lo);
}

/** Aim error (radians) for spatial bot policies. */
export function aimErrorRad(rand: () => number = Math.random): number {
  return (rand() - 0.5) * 0.35;
}

export function tag(name: string): string {
  return name.includes(BOT_TAG) ? name : `${name} ${BOT_TAG}`;
}

export type { BotPolicy };
