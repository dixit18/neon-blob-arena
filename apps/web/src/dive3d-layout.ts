// apps/web/src/dive3d-layout.ts — pure math behind the Rift Dive 3D.
// No three.js, no DOM: seeded world placement, depth mapping, portal
// picking, and the 3D-vs-2D fallback decision. Fully headless-testable;
// dive3d.ts renders whatever this lays out.
import type { World } from './descent.js';

export interface Caps {
  webgl: boolean;
  /** navigator.deviceMemory GB (null = unknown/browser hides it). */
  ramGB: number | null;
  reducedMotion: boolean;
}

/** 3D only when it can stun: real WebGL, motion OK, and not a 2GB phone. */
export function shouldUse3D(caps: Caps): boolean {
  if (!caps.webgl) return false;
  if (caps.reducedMotion) return false;
  if (caps.ramGB !== null && caps.ramGB <= 2) return false;
  return true;
}

export const LAP_LEN = 6; // worlds per endless lap
export const WORLD_GAP = 90; // scene units between world hearts
export const RING_EVERY = 18; // tunnel rings spacing

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface PlacedWorld {
  index: number; // 0..5 within the lap
  x: number;
  z: number; // negative down-lap
  seed: number;
  world: World;
}

/** Deterministic per-lap placement: alternating sway, fixed gap. */
export function layoutLap(worlds: World[], lap: number): PlacedWorld[] {
  return worlds.map((world, i) => {
    const rand = mulberry32(lap * 7919 + i * 131 + 7);
    const sway = (i % 2 === 0 ? -1 : 1) * (10 + rand() * 8);
    return {
      index: i,
      x: sway,
      z: -(lap * LAP_LEN + i) * WORLD_GAP,
      seed: Math.floor(rand() * 1e9),
      world,
    };
  });
}

/** Continuous depth (world units, grows forever) → lap + lap-local depth. */
export function splitDepth(depth: number): { lap: number; local: number } {
  const lapLen = LAP_LEN;
  const lap = Math.floor(depth / lapLen);
  return { lap, local: depth - lap * lapLen };
}

/** Which world heart the camera currently faces (for labels + tap). */
export function facedWorld(depth: number, count = LAP_LEN): number {
  const d = ((depth % count) + count) % count;
  return Math.floor(d) % count;
}

/** Depth progress 0..1 toward the next heart (drives label crossfade). */
export function heartFrac(depth: number): number {
  const d = ((depth % 1) + 1) % 1;
  return d;
}

/** Total tunnel length that must exist for a seamless endless lap. */
export function tunnelLength(): number {
  return LAP_LEN * WORLD_GAP;
}

// ---------------------------------------------------------------------------
// Shard spiral (the STAR NURSERY look): hundreds of small colored dashes
// wound in a helix down the tunnel. Pure placement math; dive3d.ts renders
// them as ONE InstancedMesh (1 draw call) and flows them past the camera.
// ---------------------------------------------------------------------------

export const SHARD_COUNT = 220;
/** Shard color weights: greens/teal lead, coral + gold + cream sparkle. */
export const SHARD_COLORS = [
  '#C6F135', '#46E0D4', '#C6F135', '#FFE9A8',
  '#FF5D5D', '#F2EDE3', '#46E0D4', '#FF3D8A',
];

export interface Shard {
  angle: number; // radians around the tunnel axis
  radius: number; // 14..30 from the axis
  z: number; // spread over one full lap, negative down-lap
  spin: number; // angular drift rad/s
  flow: number; // +z drift units/s (toward camera)
  color: number; // index into SHARD_COLORS
  size: number; // 0.7..1.6 scale
}

/** Deterministic helix: golden-angle steps, full-lap z spread. */
export function layoutShards(count: number, seed: number): Shard[] {
  const rand = mulberry32(seed >>> 0);
  const span = tunnelLength();
  const out: Shard[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      angle: (i * 2.39996 + rand() * 0.6) % (Math.PI * 2),
      radius: 14 + rand() * 16,
      z: -rand() * span,
      spin: 0.05 + rand() * 0.25,
      flow: 18 + rand() * 22,
      color: Math.floor(rand() * SHARD_COLORS.length),
      size: 0.7 + rand() * 0.9,
    });
  }
  return out;
}

/** Advance one shard by dt, wrapping past the camera back down-lap. */
export function stepShard(s: Shard, dt: number, camZ: number, span: number): void {
  s.angle += s.spin * dt;
  s.z += s.flow * dt;
  if (s.z > camZ + 40) s.z -= span;
}

// ---------------------------------------------------------------------------
// Steering (the site IS the ride): pointer position becomes a camera target,
// approached smoothly; flying through a portal ring enters its game.
// ---------------------------------------------------------------------------

/** Frame-rate independent approach: rate ~3 feels like flying, ~6 like glue. */
export function smoothApproach(cur: number, target: number, dt: number, rate: number): number {
  const t = Math.min(1, Math.max(0, dt * rate));
  return cur + (target - cur) * t;
}

/** True when the camera pierces a portal ring (squared-distance test). */
export function portalHit(camX: number, camY: number, px: number, py: number, r: number): boolean {
  const dx = camX - px;
  const dy = camY - py;
  return dx * dx + dy * dy < r * r;
}

/** Pointer NDC (-1..1) → tunnel-space steer target. Clamped, no alloc. */
export function steerTarget(nx: number, ny: number): { x: number; y: number } {
  const x = Math.max(-1, Math.min(1, nx)) * 24;
  const y = 2 - Math.max(-1, Math.min(1, ny)) * 12;
  return { x, y };
}
