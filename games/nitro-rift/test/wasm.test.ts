// games/nitro-rift/test/wasm.test.ts — NR-5 parity proof: the Rust/WASM
// batch stepper returns BIT-IDENTICAL f64s to the TS authority (stepRacer
// hot section + batchIntegrateTs mirror). No sockets. Requires the committed
// binary at apps/server/assets/race-phys.wasm (built from crates/race-phys
// via `cargo build --target wasm32-unknown-unknown --release`).
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stepRacer } from '../physics.js';
import { batchIntegrateTs, batchStep, initRaceWasm, resetRaceWasm, wasmReady, WASM_MAX_RACERS } from '../phys-wasm.js';

const WASM_URL = new URL('../../../apps/server/assets/race-phys.wasm', import.meta.url);

interface V { prog: number; lane: number; boost: number; slowUntil: number; steer: number; held: boolean; now: number; dt: number }

// The 7 NR-4 parity vectors (integrate-relevant state; pads/bumps stay TS).
const VECTORS: V[] = [
  { prog: 0, lane: 1, boost: 100, slowUntil: 0, steer: 0, held: true, now: 0, dt: 1000 },
  { prog: 0, lane: 1, boost: 40, slowUntil: 0, steer: 0, held: false, now: 0, dt: 1000 },
  { prog: 0, lane: 1, boost: 10, slowUntil: 0, steer: 0, held: false, now: 0, dt: 100 },
  { prog: 0, lane: 1, boost: 100, slowUntil: 0, steer: 0, held: true, now: 1000, dt: 100 },
  { prog: 12.2, lane: 1, boost: 60, slowUntil: 2000, steer: 0, held: true, now: 1100, dt: 1000 },
  { prog: 0, lane: 0, boost: 100, slowUntil: 0, steer: -1, held: false, now: 0, dt: 50 },
  { prog: 0, lane: 0.3, boost: 100, slowUntil: 0, steer: 1, held: false, now: 0, dt: 50 },
];

function tsReference(v: V): number[] {
  const s = { prog: v.prog, lane: v.lane, boost: v.boost, slowUntil: v.slowUntil };
  stepRacer(s, { steer: v.steer, boost: v.held }, [], [], v.now, v.dt);
  return [s.prog, s.lane, s.boost, s.slowUntil];
}

describe('race-phys.wasm parity', () => {
  before(async () => {
    const bytes = await readFile(WASM_URL);
    const ok = await initRaceWasm(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    assert.equal(ok, true, 'wasm binary must instantiate');
    assert.equal(wasmReady(), true);
  });

  it('WASM batch == stepRacer on all 7 parity vectors (exact f64)', () => {
    for (const v of VECTORS) {
      const states = new Float64Array(WASM_MAX_RACERS * 4);
      const inputs = new Float64Array(WASM_MAX_RACERS * 2);
      states[0] = v.prog; states[1] = v.lane; states[2] = v.boost; states[3] = v.slowUntil;
      inputs[0] = v.steer; inputs[1] = v.held ? 1 : 0;
      batchStep(states, inputs, 1, v.now, v.dt);
      const ref = tsReference(v);
      assert.ok(Object.is(states[0], ref[0]), `prog ${states[0]} !== ${ref[0]}`);
      assert.ok(Object.is(states[1], ref[1]), `lane ${states[1]} !== ${ref[1]}`);
      assert.ok(Object.is(states[2], ref[2]), `boost ${states[2]} !== ${ref[2]}`);
      assert.ok(Object.is(states[3], ref[3]), `slowUntil ${states[3]} !== ${ref[3]}`);
    }
  });

  it('8-racer mixed grid identical WASM vs TS mirror', () => {
    const mk = (): { s: Float64Array; k: Float64Array } => {
      const s = new Float64Array(WASM_MAX_RACERS * 4);
      const k = new Float64Array(WASM_MAX_RACERS * 2);
      for (let i = 0; i < 8; i++) {
        s[i * 4] = i * 37.5; s[i * 4 + 1] = i % 4; s[i * 4 + 2] = 20 + i * 10; s[i * 4 + 3] = i === 3 ? 5000 : 0;
        k[i * 2] = (i % 3) - 1; k[i * 2 + 1] = i % 2;
      }
      return { s, k };
    };
    const a = mk();
    batchStep(a.s, a.k, 8, 1200, 50); // WASM path (init in before())
    resetRaceWasm();
    assert.equal(wasmReady(), false);
    const b = mk();
    batchStep(b.s, b.k, 8, 1200, 50); // TS mirror path
    for (let i = 0; i < 8 * 4; i++) {
      assert.ok(Object.is(a.s[i], b.s[i]), `slot ${i}: ${a.s[i]} !== ${b.s[i]}`);
    }
    // batchIntegrateTs direct call matches too.
    const c = mk();
    batchIntegrateTs(c.s, c.k, 8, 1200, 50);
    for (let i = 0; i < 8 * 4; i++) {
      assert.ok(Object.is(a.s[i], c.s[i]), `mirror slot ${i} differs`);
    }
  });
});
