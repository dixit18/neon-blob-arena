// apps/web/src/dive-wasm — Rust/WASM procgen with TS fallback (DV-2).
//
// WHAT: scalar + scratch-buffer access to the dive-procgen exports
// (hash2/noise/fBm/warp/Voronoi/shard/scatter). When dive-procgen.wasm is
// loaded (server boot reads apps/server/assets/; browsers fetch
// /wasm/dive-procgen.wasm), batch layout math runs as compiled Rust.
// Otherwise the procgen.ts mirrors below run — same f64 op order,
// bit-identical outputs (proven by apps/server/test/dive-wasm.test.ts).
//
// TS stays the authority: WASM is a speedup, never a behavior change.
// This module is runtime-agnostic (no node:*, no DOM, no fetch).
import {
  hash2 as hash2Ts, makeNoise2D as makeNoise2DTs, fbm as fbmTs,
  warpedBands as warpedBandsTs, voronoi as voronoiTs,
  scatterPoints as scatterPointsTs,
} from './procgen.js';
import { layoutShards as layoutShardsTs } from './dive3d-layout.js';
import { rng as rngTs } from './art.js';

interface WasmExports {
  memory: WebAssembly.Memory;
  dive_scratch_ptr(): number;
  dive_hash2(x: number, y: number, seed: number): number;
  dive_noise(x: number, y: number, seed: number): number;
  dive_fbm(x: number, y: number, seed: number, octaves: number): number;
  dive_warped(x: number, y: number, seed: number, warp: number, freq: number): number;
  dive_voronoi(x: number, y: number, seed: number): number;
  dive_shard(i: number, count: number, seed: number): void;
  dive_scatter(n: number, seed: number, sx: number, sy: number, sz: number, y0: number): number;
}

let wasm: WasmExports | null = null;
let scratch: Float64Array | null = null;

/** Instantiate from raw bytes (fs-read on the server, fetch on the client). */
export async function initDiveWasm(bytes: Uint8Array | ArrayBuffer): Promise<boolean> {
  try {
    if (typeof WebAssembly === 'undefined' || typeof WebAssembly.instantiate !== 'function') return false;
    const buf = bytes instanceof Uint8Array ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer : bytes;
    const mod = await WebAssembly.instantiate(buf, {});
    const ex = (mod.instance ?? mod) as unknown as { exports: WasmExports };
    if (typeof ex.exports?.dive_hash2 !== 'function') return false;
    const mem = ex.exports.memory;
    if (!(mem instanceof WebAssembly.Memory)) return false;
    wasm = ex.exports;
    scratch = new Float64Array(mem.buffer, wasm.dive_scratch_ptr(), 2048);
    return true;
  } catch { return false; }
}

export function wasmReady(): boolean {
  return wasm !== null;
}

/** Drop the instance (tests only): forces the TS-mirror path. */
export function resetDiveWasm(): void {
  wasm = null;
  scratch = null;
}

function view(): Float64Array | null {
  return wasm && scratch ? scratch : null;
}

export function hash2W(x: number, y: number, seed: number): number {
  const w = wasm;
  if (w) return w.dive_hash2(x | 0, y | 0, seed >>> 0);
  return hash2Ts(x, y, seed);
}

export function noiseW(x: number, y: number, seed: number): number {
  const w = wasm;
  if (w) return w.dive_noise(x, y, seed >>> 0);
  return makeNoise2DTs(seed)(x, y);
}

export function fbmW(x: number, y: number, seed: number, octaves = 4): number {
  const w = wasm;
  if (w) return w.dive_fbm(x, y, seed >>> 0, octaves | 0);
  return fbmTs(makeNoise2DTs(seed), x, y, octaves);
}

export function warpedW(x: number, y: number, seed: number, warp = 1.2, freq = 1.6): number {
  const w = wasm;
  if (w) return w.dive_warped(x, y, seed >>> 0, warp, freq);
  return warpedBandsTs(makeNoise2DTs(seed), x, y, warp, freq);
}

export interface VoronoiOut { f1: number; f2: number; edge: number }

export function voronoiW(x: number, y: number, seed: number): VoronoiOut {
  const v = view();
  if (wasm && v) {
    const edge = wasm.dive_voronoi(x, y, seed >>> 0);
    return { f1: v[0]!, f2: v[1]!, edge };
  }
  return voronoiTs(x, y, seed);
}

export interface ShardOut {
  angle: number; radius: number; z: number;
  spin: number; flow: number; color: number; size: number;
}

export function shardW(i: number, seed: number): ShardOut {
  const v = view();
  if (wasm && v) {
    wasm.dive_shard(i | 0, 220, seed >>> 0);
    return {
      angle: v[0]!, radius: v[1]!, z: v[2]!, spin: v[3]!,
      flow: v[4]!, color: v[5]!, size: v[6]!,
    };
  }
  const s = layoutShardsTs(220, seed)[i]!;
  return {
    angle: s.angle, radius: s.radius, z: s.z, spin: s.spin,
    flow: s.flow, color: s.color, size: s.size,
  };
}

export function scatterW(n: number, seed: number, sx: number, sy: number, sz: number, y0: number): number[] {
  const v = view();
  if (wasm && v) {
    const wrote = wasm.dive_scatter(n | 0, seed >>> 0, sx, sy, sz, y0);
    return Array.from(v.slice(0, wrote * 3));
  }
  return scatterPointsTs(rngTs(seed), n, sx, sy, sz, y0);
}
