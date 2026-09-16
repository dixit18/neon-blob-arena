// games/nitro-rift/physics — pure fixed-step race physics.
// WASM SEAM (NR-4 LANDED as crates/race-phys): this file is the TypeScript
// authority; the Rust crate mirrors stepRacer op-for-op over f64s with
// identical constants. Parity is PROVEN, not claimed: scripts/vectors.mjs +
// crates/race-phys/examples/vectors.rs print identical lines on 7 vectors
// (boost/coast/pad/bump/glide/clamp). A future wasm-pack build swaps this
// module import-for-import — sim.ts never learns which engine stepped it.
export const TRACK_LEN = 1200;
export const LANES = 4;
export const BASE_SPEED = 60; // units per second
export const BOOST_SPEED = 62; // extra while boosting
export const BOOST_DRAIN = 40; // per second while held
export const BOOST_REGEN = 8; // per second while released
export const PAD_GAIN = 35;
export const BUMP_WINDOW = 6; // |dProg| under this + same lane = bump
export const BUMP_SLOW_UNTIL_MS = 1000;

export interface RacerState { prog: number; lane: number; boost: number; slowUntil: number }
export interface RaceInput { steer: number; boost: boolean }
export interface Pad { at: number; lane: number }

export function stepRacer(
  s: RacerState,
  input: RaceInput,
  pads: Pad[],
  others: { prog: number; lane: number }[],
  now: number,
  dtMs: number,
): { padTaken: number } {
  const dt = dtMs / 1000;
  const wantBoost = input.boost && s.boost > 0;
  let v = BASE_SPEED + (wantBoost ? BOOST_SPEED : 0);
  if (now < s.slowUntil) v *= 0.6; // bumped: limping
  if (wantBoost) s.boost = Math.max(0, s.boost - BOOST_DRAIN * dt);
  else s.boost = Math.min(100, s.boost + BOOST_REGEN * dt);
  if (input.steer !== 0) {
    s.lane += Math.sign(input.steer) * Math.min(1, dt * 6); // smooth lane glide
    if (s.lane < 0) s.lane = 0;
    if (s.lane > LANES - 1) s.lane = LANES - 1;
  }
  s.prog += v * dt;
  let padTaken = -1;
  for (let i = 0; i < pads.length; i++) {
    const p = pads[i]!;
    if (Math.abs(s.prog - p.at) < 5 && Math.round(s.lane) === p.lane) {
      s.boost = Math.min(100, s.boost + PAD_GAIN);
      padTaken = i;
    }
  }
  for (const o of others) {
    if (Math.abs(o.prog - s.prog) < BUMP_WINDOW && Math.round(o.lane) === Math.round(s.lane)) {
      s.slowUntil = now + BUMP_SLOW_UNTIL_MS;
      break;
    }
  }
  return { padTaken };
}
