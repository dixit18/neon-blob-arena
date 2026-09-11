// Shared types + tuning constants. Server is source of truth.
export interface Vec { x: number; y: number }

export interface PlayerState {
  id: string;
  name: string;
  x: number; y: number;
  vx: number; vy: number;
  mass: number;
  r: number;
  hue: number;
  kills: number;
  score: number;
  alive: boolean;
  isBot: boolean;
  dashCdUntil: number; // tick index when dash ready again
  spawnTick: number;
}

export interface Pellet { id: number; x: number; y: number; hue: number }

export interface ClientInput {
  t: 'input';
  seq: number;
  dx: number; // -1..1
  dy: number; // -1..1
  dash: boolean;
}

export interface SnapPlayer {
  id: string; n: string;
  x: number; y: number;
  r: number; h: number;
  k: number; s: number;
  b: number; // 1 if bot
}

export interface ServerSnapshot {
  t: 'snap';
  tick: number;
  you: string;
  me?: { x: number; y: number; r: number; mass: number; dashReady: boolean; score: number; kills: number; alive: boolean; respawnIn?: number };
  players: SnapPlayer[];
  pellets: Pellet[];
  leaders: { n: string; s: number }[];
  feed: string[];
}

export const TUNE = {
  WORLD: 4000,
  TICK_HZ: 20,
  SNAP_HZ: 15,
  MAX_HUMANS_PER_ROOM: 25,
  PELLETS: 340,
  PELLET_R: 6,
  START_MASS: 12,
  FRICTION: 2.6,          // /s exponential damping
  KNOCK_FRICTION: 5.0,    // extra damping handled via same friction (knock decays naturally)
  BASE_SPEED: 330,        // px/s at start mass, scales down with size
  DASH_IMPULSE: 950,
  DASH_COOLDOWN_TICKS: 50, // 2.5s @20Hz
  DASH_MASS_COST: 1.5,
  EAT_RATIO: 1.12,        // eater.r must exceed victim.r * ratio
  VIEW_W: 1700,
  VIEW_H: 1000,
  MAX_SPEED_CAP: 1200,
  INPUT_RATE_LIMIT_PER_SEC: 40,
} as const;

export function massToRadius(mass: number): number {
  return 10 + Math.sqrt(Math.max(1, mass)) * 2.6;
}
export function speedForMass(mass: number): number {
  // big = tank: 330 -> ~170 at 150 mass
  return TUNE.BASE_SPEED * Math.pow(TUNE.START_MASS / mass, 0.22);
}
