// scripts/vectors.mjs — TypeScript side of the NR-4 parity vectors.
// Same inputs as crates/race-phys/examples/vectors.rs. Run:
//   npx tsx scripts/vectors.mjs
//   cargo run --manifest-path crates/race-phys/Cargo.toml --example vectors
// Lines must match (exact f64 parity).
import { stepRacer } from '../games/nitro-rift/physics.js';

const show = (s) => console.log(`${s.prog} ${s.lane} ${s.boost} ${s.slowUntil}`);
const taken = (r) => r.padTaken;

let a = { prog: 0, lane: 1, boost: 100, slowUntil: 0 };
let t = stepRacer(a, { steer: 0, boost: true }, [], [], 0, 1000);
process.stdout.write(`${taken(t)} `); show(a);

let b = { prog: 0, lane: 1, boost: 40, slowUntil: 0 };
t = stepRacer(b, { steer: 0, boost: false }, [], [], 0, 1000);
process.stdout.write(`${taken(t)} `); show(b);

let c = { prog: 0, lane: 1, boost: 10, slowUntil: 0 };
t = stepRacer(c, { steer: 0, boost: false }, [{ at: 3, lane: 1 }], [], 0, 100);
process.stdout.write(`${taken(t)} `); show(c);

let d = { prog: 0, lane: 1, boost: 100, slowUntil: 0 };
t = stepRacer(d, { steer: 0, boost: true }, [], [{ prog: 12, lane: 1 }], 1000, 100);
process.stdout.write(`${taken(t)} `); show(d);
t = stepRacer(d, { steer: 0, boost: true }, [], [], 1100, 1000);
process.stdout.write(`${taken(t)} `); show(d);

let e = { prog: 0, lane: 0, boost: 100, slowUntil: 0 };
t = stepRacer(e, { steer: -1, boost: false }, [], [], 0, 50);
process.stdout.write(`${taken(t)} `); show(e);
t = stepRacer(e, { steer: 1, boost: false }, [], [], 0, 50);
process.stdout.write(`${taken(t)} `); show(e);
