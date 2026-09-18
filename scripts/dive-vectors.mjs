// scripts/dive-vectors.mjs — TypeScript side of the DV-2 parity vectors.
// Same inputs as crates/dive-procgen/examples/vectors.rs. Run:
//   npx tsx scripts/dive-vectors.mjs
//   cargo run --manifest-path crates/dive-procgen/Cargo.toml --example vectors
// Lines must match (exact f64 parity).
import { hashSeed, hash2, makeNoise2D, fbm, warpedBands, voronoi, scatterPoints } from '../apps/web/src/procgen.js';
import { layoutShards } from '../apps/web/src/dive3d-layout.js';
import { rng } from '../apps/web/src/art.js';

// 1: string hashes
console.log(`${hashSeed('ash dunes')} ${hashSeed('RIFT-NKAP')} ${hashSeed('')}`);
// 2: cell hashes
console.log(`${hash2(3, -7, 42)} ${hash2(0, 0, 0)} ${hash2(-999, 999, 1)}`);
// 3: gradient noise (perm-table, seed 7)
const noise = makeNoise2D(7);
console.log(`${noise(1.7, -2.3)} ${noise(-0.5, 4.25)}`);
// 4: fbm 4-octave
console.log(`${fbm(noise, 0.5, 0.25, 4)} ${fbm(noise, 3.1, -1.2, 4)}`);
// 5: warped bands
console.log(`${warpedBands(noise, 1.1, -0.4, 1.2, 1.6)}`);
// 6: voronoi f1/f2/edge
const v = voronoi(2.3, 4.7, 99);
console.log(`${v.f1} ${v.f2} ${v.edge}`);
// 7: shard #5 of the 220-field, seed 7
const shards = layoutShards(220, 7);
const s = shards[5];
console.log(`${s.angle} ${s.radius} ${s.z} ${s.spin} ${s.flow} ${s.color} ${s.size}`);
// 8: motif scatter box
const out = scatterPoints(rng(99), 4, 30.0, 20.0, 16.0, -6.0);
console.log(out.join(' '));
