// Shared types + tuning constants. Server is source of truth.
export interface Vec { x: number; y: number }

export interface PlayerState {
  id: string;
  num: number; // small numeric id: GC-free pair keys now, binary protocol next
  name: string;
  x: number; y: number;
  vx: number; vy: number;
  mass: number;
  r: number;
  hue: number;
  kills: number;
  score: number;
  streak: number; // consecutive eats without dying (resets on death)
  alive: boolean;
  isBot: boolean;
  dashCdUntil: number; // tick index when dash ready again
  spawnTick: number;
  fireCdUntil: number; // tick index when next orb may fire
  fx: number; fy: number; // facing (last nonzero move dir) — orb direction
  hunter: boolean; // violent AI: chases humans, fires, never dashes
  shieldUntil: number; // spawn-protection tick (blocks orbs+eats, breaks on fire)
}

export interface Pellet { id: number; x: number; y: number; hue: number }

export interface Projectile {
  id: number; owner: string;
  x: number; y: number; vx: number; vy: number;
  hue: number; bounces: number; life: number; grace: number; // grace: owner-immune ticks
}

export interface ClientInput {
  t: 'input';
  seq: number;
  dx: number; // -1..1
  dy: number; // -1..1
  dash: boolean;
  fire: boolean; // orb shot toward facing
}

export interface SnapPlayer {
  id: string; n: string;
  x: number; y: number;
  r: number; h: number;
  k: number; s: number;
  b: number; // 1 if bot
  ht: number; // 1 if hunter (violent AI)
}

export interface ServerSnapshot {
  t: 'snap';
  tick: number;
  you: string;
  me?: { x: number; y: number; r: number; mass: number; dashReady: boolean; score: number; kills: number; alive: boolean; streak: number; sh: number; respawnIn?: number };
  players: SnapPlayer[];
  pellets: Pellet[];
  leaders: { n: string; s: number }[];
  feed: string[];
  taunts: { id: string; e: number }[]; // active emote taunts (server-pruned, 2s life)
  round: number; // seconds left in the current 3-min round (urgency engine)
  orbs: { i: number; x: number; y: number; h: number }[]; // live projectiles, AOI-culled
}

export const EMOTES = ['😂', '😈', '💪', '😱', '👋'] as const; // must match client

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
  // combat (R&D: diep/Mini-Militia numbers, adapted to mass game)
  ORB_SPEED: 640,            // ~1.9x base player speed — dodgeable, not hitscan
  ORB_R: 6,
  ORB_LIFE_TICKS: 70,        // 3.5s max flight
  ORB_COOLDOWN_TICKS: 5,     // 250ms — Mini-Militia TTK feel
  ORB_DMG: 6,                // mass per hit (~4-6 hits that matter)
  ORB_KNOCK: 130,            // RedTeam: tiny nudge, no wall-to-wall flings
  ORB_MASS_COST: 2,          // firing costs growth (ammo economy)
  ORB_MAX_PER_PLAYER: 5,
  ORB_MAX_ROOM: 110,
  HUNTER_FIRE_CD: 20,        // hunters shoot slower than players
  FIRE_MIN_MASS: 10,
} as const;

export function massToRadius(mass: number): number {
  return 10 + Math.sqrt(Math.max(1, mass)) * 2.6;
}
export function speedForMass(mass: number): number {
  // big = tank: 330 -> ~170 at 150 mass
  return TUNE.BASE_SPEED * Math.pow(TUNE.START_MASS / mass, 0.22);
}
