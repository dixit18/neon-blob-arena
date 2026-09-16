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
