//! Prints dive-procgen outputs for the parity vectors (DV-2).
//! Compare against scripts/dive-vectors.mjs (same inputs, TypeScript side).
use dive_procgen::*;

fn main() {
    // 1: string hashes (ASCII parity bound)
    println!("{} {} {}", hash_seed("ash dunes"), hash_seed("RIFT-NKAP"), hash_seed(""));
    // 2: cell hashes
    println!("{} {} {}", hash2(3, -7, 42), hash2(0, 0, 0), hash2(-999, 999, 1));
    // 3: gradient noise (perm-table, seed 7)
    let perm = build_perm(7);
    println!("{} {}", value_noise(&perm, 1.7, -2.3), value_noise(&perm, -0.5, 4.25));
    // 4: fbm 4-octave
    println!("{} {}", fbm(&perm, 0.5, 0.25, 4), fbm(&perm, 3.1, -1.2, 4));
    // 5: warped bands
    println!("{}", warped_bands(&perm, 1.1, -0.4, 1.2, 1.6));
    // 6: voronoi f1/f2/edge
    let v = voronoi(2.3, 4.7, 99);
    println!("{} {} {}", v.f1, v.f2, v.edge);
    // 7: shard #5 of the 220-field, seed 7
    let s = layout_shard(5, 220, 7);
    println!("{} {} {} {} {} {} {}", s.angle, s.radius, s.z, s.spin, s.flow, s.color, s.size);
    // 8: motif scatter box
    let mut r = Rng::new(99);
    let mut out = [0.0; 12];
    scatter_points(&mut r, 4, 30.0, 20.0, 16.0, -6.0, &mut out);
    println!("{} {} {} {} {} {} {} {} {} {} {} {}", out[0], out[1], out[2], out[3], out[4], out[5], out[6], out[7], out[8], out[9], out[10], out[11]);
}
