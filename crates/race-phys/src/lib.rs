//! race-phys — Nitro Rift fixed-step race physics (NR-4).
//!
//! Rust mirror of `games/nitro-rift/physics.ts`. The two files implement
//! `step_racer` over plain f64s with IDENTICAL constants and op order, so a
//! future `wasm-pack` build can replace the TS module import-for-import:
//! `sim.ts` never learns which engine stepped it. Zero dependencies —
//! `cargo test` runs offline.
//!
//! Vectors below match `games/nitro-rift/test/sim.test.ts` ("nitro physics
//! seam") case for case: boost/drain/regen, pad refund, bump slow, lane
//! glide + clamp.

pub const TRACK_LEN: f64 = 1200.0;
pub const LANES: f64 = 4.0;
pub const BASE_SPEED: f64 = 60.0;
pub const BOOST_SPEED: f64 = 62.0;
pub const BOOST_DRAIN: f64 = 40.0;
pub const BOOST_REGEN: f64 = 8.0;
pub const PAD_GAIN: f64 = 35.0;
pub const BUMP_WINDOW: f64 = 6.0;
pub const BUMP_SLOW_UNTIL_MS: f64 = 1000.0;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct RacerState {
    pub prog: f64,
    pub lane: f64,
    pub boost: f64,
    pub slow_until: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct RaceInput {
    pub steer: f64,
    pub boost: bool,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Pad {
    pub at: f64,
    pub lane: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Other {
    pub prog: f64,
    pub lane: f64,
}

/// One fixed step. Returns the taken pad index, or -1.
/// Mirrors `stepRacer` op-for-op (f64, same order).
pub fn step_racer(
    s: &mut RacerState,
    input: RaceInput,
    pads: &[Pad],
    others: &[Other],
    now: f64,
    dt_ms: f64,
) -> i32 {
    let dt = dt_ms / 1000.0;
    let want_boost = input.boost && s.boost > 0.0;
    let mut v = BASE_SPEED + if want_boost { BOOST_SPEED } else { 0.0 };
    if now < s.slow_until {
        v *= 0.6;
    }
    if want_boost {
        s.boost = (s.boost - BOOST_DRAIN * dt).max(0.0);
    } else {
        s.boost = (s.boost + BOOST_REGEN * dt).min(100.0);
    }
    if input.steer != 0.0 {
        s.lane += input.steer.signum() * (1.0f64).min(dt * 6.0);
        s.lane = s.lane.clamp(0.0, LANES - 1.0);
    }
    s.prog += v * dt;
    let mut pad_taken: i32 = -1;
    for (i, p) in pads.iter().enumerate() {
        if (s.prog - p.at).abs() < 5.0 && s.lane.round() as i32 == p.lane as i32 {
            s.boost = (s.boost + PAD_GAIN).min(100.0);
            pad_taken = i as i32;
        }
    }
    for o in others {
        if (o.prog - s.prog).abs() < BUMP_WINDOW && (o.lane.round() as i32) == (s.lane.round() as i32) {
            s.slow_until = now + BUMP_SLOW_UNTIL_MS;
            break;
        }
    }
    pad_taken
}

#[cfg(test)]
mod tests {
    use super::*;

    fn state() -> RacerState {
        RacerState { prog: 0.0, lane: 1.0, boost: 100.0, slow_until: 0.0 }
    }

    #[test]
    fn boost_is_faster_drains_coasting_regens() {
        let mut a = state();
        let mut b = state();
        step_racer(&mut a, RaceInput { steer: 0.0, boost: true }, &[], &[], 0.0, 1000.0);
        step_racer(&mut b, RaceInput { steer: 0.0, boost: false }, &[], &[], 0.0, 1000.0);
        assert!(a.prog > b.prog);
        assert!(a.boost < 100.0 && b.boost == 100.0);
    }

    #[test]
    fn pads_refund_boost_bumps_slow_you_down() {
        let mut s = RacerState { boost: 10.0, ..state() };
        let taken = step_racer(
            &mut s,
            RaceInput { steer: 0.0, boost: false },
            &[Pad { at: 3.0, lane: 1.0 }],
            &[],
            0.0,
            100.0,
        );
        assert_eq!(taken, 0);
        assert!(s.boost > 30.0);
        let mut v0 = state();
        step_racer(
            &mut v0,
            RaceInput { steer: 0.0, boost: true },
            &[],
            &[Other { prog: 12.0, lane: 1.0 }],
            1000.0,
            100.0,
        );
        assert!(v0.slow_until > 1000.0);
        let p1 = v0.prog;
        step_racer(&mut v0, RaceInput { steer: 0.0, boost: true }, &[], &[], 1100.0, 1000.0);
        let mut free = RacerState { lane: 3.0, ..state() };
        step_racer(&mut free, RaceInput { steer: 0.0, boost: true }, &[], &[], 1100.0, 1000.0);
        assert!(v0.prog - p1 < free.prog);
    }

    #[test]
    fn lanes_clamp_steering_glides_no_teleport() {
        let mut s = RacerState { lane: 0.0, ..state() };
        step_racer(&mut s, RaceInput { steer: -1.0, boost: false }, &[], &[], 0.0, 50.0);
        assert_eq!(s.lane, 0.0);
        step_racer(&mut s, RaceInput { steer: 1.0, boost: false }, &[], &[], 0.0, 50.0);
        assert!(s.lane > 0.0 && s.lane < 1.0);
    }

        #[test]
    fn constants_match_the_typescript_authority() {
        assert_eq!(TRACK_LEN, 1200.0);
        assert_eq!(LANES, 4.0);
        assert_eq!(BASE_SPEED, 60.0);
        assert_eq!(BOOST_SPEED, 62.0);
        assert_eq!(BOOST_DRAIN, 40.0);
        assert_eq!(BOOST_REGEN, 8.0);
        assert_eq!(PAD_GAIN, 35.0);
        assert_eq!(BUMP_WINDOW, 6.0);
    }
}

// ---------------------------------------------------------------------------
// WASM boundary (NR-5: the import-only swap NR-4 promised).
//
// Zero dependencies preserved (no wasm-bindgen): flat f64 buffers, C ABI,
// static slots (rooms cap well under MAX_RACERS). The host writes states +
// inputs into wasm linear memory at the exported pointers, calls
// race_batch_step, reads states back — one call steps the whole grid.
//
// Split (documented in games/nitro-rift/phys-wasm.ts): the hot per-racer
// integrate (boost drain/regen, lane glide + clamp, prog advance, slow limp)
// lives here; branchy pads/bumps stay in TS. Op order mirrors step_racer
// exactly so outputs are bit-identical (proven by games/nitro-rift/test/
// wasm.test.ts, exact f64 equality per vector).
// ---------------------------------------------------------------------------

/// Max racers per batch call. Snapshots cap at 8; 16 is headroom.
pub const MAX_RACERS: usize = 16;

#[cfg(target_arch = "wasm32")]
static mut WASM_STATES: [f64; MAX_RACERS * 4] = [0.0; MAX_RACERS * 4];

#[cfg(target_arch = "wasm32")]
static mut WASM_INPUTS: [f64; MAX_RACERS * 2] = [0.0; MAX_RACERS * 2];

/// Byte-agnostic pointer to the states buffer: [prog, lane, boost,
/// slow_until] x MAX_RACERS, f64 each. The host wraps it as Float64Array.
#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub extern "C" fn race_states_ptr() -> *mut f64 {
    #[allow(static_mut_refs)]
    unsafe {
        WASM_STATES.as_mut_ptr()
    }
}

/// Pointer to the inputs buffer: [steer, boost_held(0.0/1.0)] x MAX_RACERS.
#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub extern "C" fn race_inputs_ptr() -> *mut f64 {
    #[allow(static_mut_refs)]
    unsafe {
        WASM_INPUTS.as_mut_ptr()
    }
}

/// Step the first `count` slots by dt_ms at sim-time `now`. Clamps count to
/// MAX_RACERS; count 0 is a no-op. Mirrors step_racer's hot section op-for-op.
#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub extern "C" fn race_batch_step(count: usize, now: f64, dt_ms: f64) {
    let n = count.min(MAX_RACERS);
    if n == 0 {
        return;
    }
    let dt = dt_ms / 1000.0;
    #[allow(static_mut_refs)]
    unsafe {
        for i in 0..n {
            let s = i * 4;
            let k = i * 2;
            let steer = WASM_INPUTS[k];
            let boost_held = WASM_INPUTS[k + 1] != 0.0;
            let mut prog = WASM_STATES[s];
            let mut lane = WASM_STATES[s + 1];
            let mut boost = WASM_STATES[s + 2];
            let slow_until = WASM_STATES[s + 3];
            let want_boost = boost_held && boost > 0.0;
            let mut v = BASE_SPEED + if want_boost { BOOST_SPEED } else { 0.0 };
            if now < slow_until {
                v *= 0.6;
            }
            if want_boost {
                boost = (boost - BOOST_DRAIN * dt).max(0.0);
            } else {
                boost = (boost + BOOST_REGEN * dt).min(100.0);
            }
            if steer != 0.0 {
                lane += steer.signum() * (1.0f64).min(dt * 6.0);
                lane = lane.clamp(0.0, LANES - 1.0);
            }
            prog += v * dt;
            WASM_STATES[s] = prog;
            WASM_STATES[s + 1] = lane;
            WASM_STATES[s + 2] = boost;
        }
    }
}
