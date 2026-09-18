// apps/server/test/dive-wasm.test.ts — DV-2 parity proof: the Rust/WASM
// procgen returns BIT-IDENTICAL f64s to the TS authority (procgen.ts +
// layoutShards + scatterPoints). No sockets. Requires the committed binary
// at apps/server/assets/dive-procgen.wasm (built from crates/dive-procgen
// via `cargo build --target wasm32-unknown-unknown --release`).
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  initDiveWasm, resetDiveWasm, wasmReady,
  hash2W, noiseW, fbmW, warpedW, voronoiW, shardW, scatterW,
} from '../../web/src/dive-wasm.js';
import { hash2, makeNoise2D, fbm, warpedBands, voronoi, scatterPoints } from '../../web/src/procgen.js';
import { layoutShards } from '../../web/src/dive3d-layout.js';
import { rng } from '../../web/src/art.js';

const WASM_URL = new URL('../../../apps/server/assets/dive-procgen.wasm', import.meta.url);

function tsHash2(x: number, y: number, s: number): number { return hash2(x, y, s); }
function tsNoise(x: number, y: number, s: number): number { return makeNoise2D(s)(x, y); }
function tsFbm(x: number, y: number, s: number): number { return fbm(makeNoise2D(s), x, y, 4); }
function tsWarp(x: number, y: number, s: number): number { return warpedBands(makeNoise2D(s), x, y, 1.2, 1.6); }

describe('dive-procgen.wasm parity', () => {
  before(async () => {
    const bytes = await readFile(WASM_URL);
    const ok = await initDiveWasm(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    assert.equal(ok, true, 'wasm binary must instantiate');
    assert.equal(wasmReady(), true);
  });

  it('WASM == TS mirror on every scalar vector (exact f64)', () => {
    const cases: [string, number, number][] = [
      ['hash2(3,-7,42)', hash2W(3, -7, 42), tsHash2(3, -7, 42)],
      ['hash2(0,0,0)', hash2W(0, 0, 0), tsHash2(0, 0, 0)],
      ['noise(1.7,-2.3,s7)', noiseW(1.7, -2.3, 7), tsNoise(1.7, -2.3, 7)],
      ['noise(-0.5,4.25,s7)', noiseW(-0.5, 4.25, 7), tsNoise(-0.5, 4.25, 7)],
      ['fbm(0.5,0.25,s7)', fbmW(0.5, 0.25, 7), tsFbm(0.5, 0.25, 7)],
      ['fbm(3.1,-1.2,s7)', fbmW(3.1, -1.2, 7), tsFbm(3.1, -1.2, 7)],
      ['warped(1.1,-0.4,s7)', warpedW(1.1, -0.4, 7), tsWarp(1.1, -0.4, 7)],
    ];
    for (const [name, a, b] of cases) {
      assert.ok(Object.is(a, b), `${name}: wasm ${a} !== ts ${b}`);
    }
    const wv = voronoiW(2.3, 4.7, 99);
    const tv = voronoi(2.3, 4.7, 99);
    assert.ok(Object.is(wv.f1, tv.f1) && Object.is(wv.f2, tv.f2) && Object.is(wv.edge, tv.edge), 'voronoi diverges');
  });

  it('WASM shard #5 == layoutShards #5 (exact f64)', () => {
    const a = shardW(5, 7);
    const b = layoutShards(220, 7)[5]!;
    for (const k of ['angle', 'radius', 'z', 'spin', 'flow', 'color', 'size'] as const) {
      assert.ok(Object.is(a[k], b[k]), `shard.${k}: ${a[k]} !== ${b[k]}`);
    }
  });

  it('WASM scatter box == scatterPoints (exact f64)', () => {
    const a = scatterW(4, 99, 30, 20, 16, -6);
    const b = scatterPoints(rng(99), 4, 30, 20, 16, -6);
    assert.equal(a.length, b.length);
    for (let i = 0; i < a.length; i++) {
      assert.ok(Object.is(a[i], b[i]), `scatter[${i}]: ${a[i]} !== ${b[i]}`);
    }
  });

  it('TS mirror path (reset) matches the WASM path', () => {
    const wv = voronoiW(2.3, 4.7, 99);
    const ws = shardW(5, 7);
    resetDiveWasm();
    assert.equal(wasmReady(), false);
    const tv = voronoiW(2.3, 4.7, 99);
    const ts = shardW(5, 7);
    for (const k of ['f1', 'f2', 'edge'] as const) {
      assert.ok(Object.is(tv[k], wv[k]), `voronoi.${k} differs across paths`);
    }
    assert.deepEqual(ts, ws);
    assert.ok(Object.is(noiseW(1.7, -2.3, 7), tsNoise(1.7, -2.3, 7)));
  });
});
