// apps/web/src/procgen.ts — LZ-2 procedural core. Seeded, zero-dep, zero-asset.
// One deterministic engine feeds both renderers: TS-side value-noise/fBm +
// Voronoi + L-systems (2D canvas + baked 3D geometry), and a GLSL simplex
// snippet for GPU displacement later. Same (rift, chapter) seed → same bytes,
// so every visitor sees the SAME saga (shareable, oath-kept).
import { rng } from './art.js';

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const fade = (t: number): number => t * t * (3 - 2 * t);

/** String → uint32 seed (rift codes, motif keys). Stable across sessions. */
export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic 2D cell hash → [0,1). No tables, no RNG state. */
export function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 974634211);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Seeded Perlin-style gradient noise → roughly [-1,1]. */
export function makeNoise2D(seed: number): (x: number, y: number) => number {
  const rand = rng(seed);
  const p: number[] = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j]!, p[i]!];
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]!;
  const grad = (h: number, x: number, y: number): number => {
    switch (h & 3) {
      case 0: return x + y;
      case 1: return -x + y;
      case 2: return x - y;
      default: return -x - y;
    }
  };
  return (x: number, y: number): number => {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    const u = fade(x);
    const v = fade(y);
    const aa = perm[perm[X]! + Y]!;
    const ab = perm[perm[X]! + Y + 1]!;
    const ba = perm[perm[X + 1]! + Y]!;
    const bb = perm[perm[X + 1]! + Y + 1]!;
    return lerp(
      lerp(grad(aa, x, y), grad(ba, x - 1, y), u),
      lerp(grad(ab, x, y - 1), grad(bb, x - 1, y - 1), u),
      v,
    ) * 0.7071; // gradient magnitude → ~[-1,1]
  };
}

/** Fractal Brownian motion: layered octaves of the base noise. */
export function fbm(
  noise: (x: number, y: number) => number,
  x: number, y: number, octaves = 4, lacunarity = 2, gain = 0.5,
): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(x * freq, y * freq);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return norm > 0 ? sum / norm : 0;
}

/** Domain-warped marble/ash bands → [-1,1]. */
export function warpedBands(
  noise: (x: number, y: number) => number,
  x: number, y: number, warp = 1.2, freq = 1.6,
): number {
  const qx = fbm(noise, x + 5.2, y + 1.3, 3);
  const qy = fbm(noise, x + 1.7, y + 9.2, 3);
  return fbm(noise, x * freq + warp * qx, y * freq + warp * qy, 4);
}

export interface Voronoi { f1: number; f2: number; edge: number; cellX: number; cellY: number }

/** Jittered-grid Voronoi (F1/F2 + edge distance) — cracks, shells, columns. */
export function voronoi(x: number, y: number, seed: number): Voronoi {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  let f1 = 8;
  let f2 = 8;
  let ix = 0;
  let iy = 0;
  for (let j = cy - 1; j <= cy + 1; j++) {
    for (let i = cx - 1; i <= cx + 1; i++) {
      const px = i + hash2(i, j, seed);
      const py = j + hash2(j, i, seed ^ 0x9e3779b9);
      const dx = px - x;
      const dy = py - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < f1) { f2 = f1; f1 = d; ix = i; iy = j; }
      else if (d < f2) { f2 = d; }
    }
  }
  return { f1, f2, edge: f2 - f1, cellX: ix, cellY: iy };
}

/** L-system rewrite (vines, branches, coral) — renderer walks the string. */
export const LSYSTEM_MAX = 4096;
export function lsystem(axiom: string, rules: Record<string, string>, iters: number): string {
  let cur = axiom;
  for (let i = 0; i < iters; i++) {
    let next = '';
    for (const ch of cur) {
      next += rules[ch] ?? ch;
      if (next.length > LSYSTEM_MAX) return next.slice(0, LSYSTEM_MAX); // runaway guard
    }
    cur = next;
  }
  return cur;
}

/** Ashima 2D simplex (snoise) — injected into 3D shaders for GPU displacement.
 *  CPU stays out of the per-frame loop; the GPU parallelizes the weather. */
export const SIMPLEX_GLSL = `
vec3 permute_(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
float snoise_(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute_(permute_(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}`;
