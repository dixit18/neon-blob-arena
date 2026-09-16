//! Prints step_racer outputs for the parity vectors (NR-4).
//! Compare against scripts/vectors.mjs (same inputs, TypeScript side).
use race_phys::*;

fn show(s: &RacerState) {
    println!("{} {} {} {}", s.prog, s.lane, s.boost, s.slow_until);
}

fn main() {
    // 1: full boost, 1s
    let mut a = RacerState { prog: 0.0, lane: 1.0, boost: 100.0, slow_until: 0.0 };
    let t = step_racer(&mut a, RaceInput { steer: 0.0, boost: true }, &[], &[], 0.0, 1000.0);
    print!("{} ", t);
    show(&a);
    // 2: coast, 1s
    let mut b = RacerState { prog: 0.0, lane: 1.0, boost: 40.0, slow_until: 0.0 };
    let t = step_racer(&mut b, RaceInput { steer: 0.0, boost: false }, &[], &[], 0.0, 1000.0);
    print!("{} ", t);
    show(&b);
    // 3: pad take at 100ms
    let mut c = RacerState { prog: 0.0, lane: 1.0, boost: 10.0, slow_until: 0.0 };
    let t = step_racer(
        &mut c,
        RaceInput { steer: 0.0, boost: false },
        &[Pad { at: 3.0, lane: 1.0 }],
        &[],
        0.0,
        100.0,
    );
    print!("{} ", t);
    show(&c);
    // 4: bump then slowed second
    let mut d = RacerState { prog: 0.0, lane: 1.0, boost: 100.0, slow_until: 0.0 };
    let t = step_racer(
        &mut d,
        RaceInput { steer: 0.0, boost: true },
        &[],
        &[Other { prog: 12.0, lane: 1.0 }],
        1000.0,
        100.0,
    );
    print!("{} ", t);
    show(&d);
    let t = step_racer(&mut d, RaceInput { steer: 0.0, boost: true }, &[], &[], 1100.0, 1000.0);
    print!("{} ", t);
    show(&d);
    // 5: steer glide + clamp
    let mut e = RacerState { prog: 0.0, lane: 0.0, boost: 100.0, slow_until: 0.0 };
    let t = step_racer(&mut e, RaceInput { steer: -1.0, boost: false }, &[], &[], 0.0, 50.0);
    print!("{} ", t);
    show(&e);
    let t = step_racer(&mut e, RaceInput { steer: 1.0, boost: false }, &[], &[], 0.0, 50.0);
    print!("{} ", t);
    show(&e);
}
