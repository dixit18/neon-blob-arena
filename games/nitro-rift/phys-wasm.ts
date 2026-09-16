// games/nitro-rift/phys-wasm — Rust/WASM hot-path with TS fallback (NR-5).
//
// WHAT: batchStep() steps N racers in ONE call. When the race-phys.wasm
// binary is loaded (server boot does this from apps/server/assets/;
// browsers can fetch apps/web/public/wasm/race-phys.wasm), the integrate
// runs as compiled Rust. Otherwise the TS mirror below runs — same f64 op
// order, bit-identical outputs (proven by test/wasm.test.ts).
//
// SPLIT: hot per-racer integrate (boost drain/regen, lane glide + clamp,
// prog advance, slow limp) is batched. Branchy pads/bumps stay in the caller
// (sim.ts) exactly as stepRacer did them — small, irregular, not worth the
// boundary crossing.
//
// RULES: this module is runtime-agnostic (no node:*, no DOM, no fetch) so
// both the Node server and the browser bundle can import it. TS stays the
// authority: WASM is a speedup, never a behavior change.

export const WASM_MAX_RACERS = 16;

const BASE_SPEED = 60;
const BOOST_SPEED = 62;
const BOOST_DRAIN = 40;
const BOOST_REGEN = 8;
const LANES = 4;

interface WasmExports {
  memory: WebAssembly.Memory;
  race_states_ptr(): number;
  race_inputs_ptr(): number;
  race_batch_step(count: number, now: number, dtMs: number): void;
}

let wasm: WasmExports | null = null;
let memStates: Float64Array | null = null;
let memInputs: Float64Array | null = null;

/** Instantiate from raw bytes (fs-read on the server, fetch on the client). */
export async function initRaceWasm(bytes: Uint8Array | ArrayBuffer): Promise<boolean> {
  try {
    // Pre-Safari-11 / ancient WebViews: no WebAssembly → TS mirror, silently.
    if (typeof WebAssembly === 'undefined' || typeof WebAssembly.instantiate !== 'function') return false;
    const buf = bytes instanceof Uint8Array ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer : bytes;
    const mod = await WebAssembly.instantiate(buf, {});
    const ex = (mod.instance ?? mod) as unknown as { exports: WasmExports };
    if (typeof ex.exports?.race_batch_step !== 'function') return false;
    const mem = ex.exports.memory;
    if (!(mem instanceof WebAssembly.Memory)) return false;
    wasm = ex.exports;
    // Static buffers never move (no growth in this module): cache the views.
    memStates = new Float64Array(mem.buffer, wasm.race_states_ptr(), WASM_MAX_RACERS * 4);
    memInputs = new Float64Array(mem.buffer, wasm.race_inputs_ptr(), WASM_MAX_RACERS * 2);
    return true;
  } catch { return false; }
}

export function wasmReady(): boolean {
  return wasm !== null;
}

/** Drop the instance (tests only): forces the TS-mirror path. */
export function resetRaceWasm(): void {
  wasm = null;
  memStates = null;
  memInputs = null;
}

/**
 * TS mirror of race_batch_step: identical f64 op order to the Rust export
 * AND to stepRacer's hot section. states = [prog,lane,boost,slowUntil] x N,
 * inputs = [steer,boostHeld01] x N. Mutates states in place.
 */
export function batchIntegrateTs(
  states: Float64Array, inputs: Float64Array, count: number, now: number, dtMs: number,
): void {
  const n = Math.min(count, WASM_MAX_RACERS);
  if (n <= 0) return;
  const dt = dtMs / 1000;
  for (let i = 0; i < n; i++) {
    const s = i * 4;
    const k = i * 2;
    const steer = inputs[k]!;
    const boostHeld = inputs[k + 1] !== 0;
    let prog = states[s]!;
    let lane = states[s + 1]!;
    let boost = states[s + 2]!;
    const slowUntil = states[s + 3]!;
    const wantBoost = boostHeld && boost > 0;
    let v = BASE_SPEED + (wantBoost ? BOOST_SPEED : 0);
    if (now < slowUntil) v *= 0.6;
    if (wantBoost) boost = Math.max(0, boost - BOOST_DRAIN * dt);
    else boost = Math.min(100, boost + BOOST_REGEN * dt);
    if (steer !== 0) {
      lane += Math.sign(steer) * Math.min(1, dt * 6);
      if (lane < 0) lane = 0;
      if (lane > LANES - 1) lane = LANES - 1;
    }
    prog += v * dt;
    states[s] = prog;
    states[s + 1] = lane;
    states[s + 2] = boost;
  }
}

/** One call steps the grid: WASM when loaded, TS mirror otherwise. */
export function batchStep(
  states: Float64Array, inputs: Float64Array, count: number, now: number, dtMs: number,
): void {
  const w = wasm;
  if (w && memStates && memInputs) {
    const n = Math.min(count, WASM_MAX_RACERS);
    if (n <= 0) return;
    memStates.set(states.subarray(0, n * 4), 0);
    memInputs.set(inputs.subarray(0, n * 2), 0);
    w.race_batch_step(n, now, dtMs);
    states.set(memStates.subarray(0, n * 4), 0);
    return;
  }
  batchIntegrateTs(states, inputs, count, now, dtMs);
}
