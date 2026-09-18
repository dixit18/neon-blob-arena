//! dive-procgen — Rift Dive procedural core (DV-2).
//!
//! Rust mirror of `apps/web/src/procgen.ts` (hash/noise/fBm/warp/Voronoi/
//! scatter) plus the dive layout math it feeds (`layoutShards`). Every
//! function mirrors the TypeScript op-for-op over f64/u32 so outputs are
//! bit-identical (proven by `examples/vectors.rs` vs `scripts/dive-
//! vectors.mjs`, and by the WASM-vs-mirror suite). Zero dependencies —
//! `cargo test` runs offline.
//!
//! Parity bounds (stated, not hidden):
//! - `hash_seed` matches for ASCII input (motif keys, rift codes). TS
//!   `charCodeAt` is UTF-16; Rust bytes are UTF-8 — identical on ASCII.
//! - Coordinate casts (`as i32`) saturate in Rust but wrap in TS: parity
//!   holds for |x|,|y| < 2^31. Every dive use stays under a few thousand.
//! - `sqrt` is correctly rounded on both sides (IEEE-754); the vectors
//!   would catch any platform that disagrees.

/// FNV-1a over bytes. Mirrors `hashSeed` (ASCII-identical).
pub fn hash_seed(s: &str) -> u32 {
    let mut h: u32 = 2166136261;
    for b in s.bytes() {
        h ^= b as u32;
        h = h.wrapping_mul(16777619);
    }
    h
}

/// Deterministic 2D cell hash → [0,1). Mirrors `hash2`.
pub fn hash2(x: i32, y: i32, seed: u32) -> f64 {
    let h: u32 = (x as u32)
        .wrapping_mul(374761393)
        .wrapping_add((y as u32).wrapping_mul(668265263))
        .wrapping_add(seed.wrapping_mul(974634211));
    let h = (h ^ (h >> 13)).wrapping_mul(1274126177);
    let h = h ^ (h >> 16);
    (h as f64) / 4294967295.0
}

/// Seeded PRNG. Mirrors `rng`/`mulberry32` (art.ts, dive3d-layout.ts).
#[derive(Debug, Clone)]
pub struct Rng(u32);

impl Rng {
    pub fn new(seed: u32) -> Self {
        Rng(seed)
    }

    pub fn next_f64(&mut self) -> f64 {
        self.0 = self.0.wrapping_add(0x6D2B79F5);
        let mut t = (self.0 ^ (self.0 >> 15)).wrapping_mul(1 | self.0);
        t = t
            .wrapping_add((t ^ (t >> 7)).wrapping_mul(61 | t))
            ^ t;
        ((t ^ (t >> 14)) as f64) / 4294967296.0
    }
}

fn lerp(a: f64, b: f64, t: f64) -> f64 {
    a + (b - a) * t
}

fn fade(t: f64) -> f64 {
    t * t * (3.0 - 2.0 * t)
}

/// 256-entry permutation table from a seed. Mirrors `makeNoise2D` setup.
pub fn build_perm(seed: u32) -> [u8; 512] {
    let mut rand = Rng::new(seed);
    let mut p = [0u8; 256];
    for (i, v) in p.iter_mut().enumerate() {
        *v = i as u8;
    }
    for i in (1..256usize).rev() {
        let j = (rand.next_f64() * ((i + 1) as f64)) as usize;
        p.swap(i, j);
    }
    let mut perm = [0u8; 512];
    for (i, v) in perm.iter_mut().enumerate() {
        *v = p[i & 255];
    }
    perm
}

fn grad(h: u8, x: f64, y: f64) -> f64 {
    match h & 3 {
        0 => x + y,
        1 => -x + y,
        2 => x - y,
        _ => -x - y,
    }
}

/// Seeded Perlin-style gradient noise → roughly [-1,1]. Mirrors the
/// closure `makeNoise2D` returns (same table build, same lattice walk).
pub fn value_noise(perm: &[u8; 512], x: f64, y: f64) -> f64 {
    let xi = (x.floor() as i32) & 255;
    let yi = (y.floor() as i32) & 255;
    let xf = x - x.floor();
    let yf = y - y.floor();
    let u = fade(xf);
    let v = fade(yf);
    let x = xi as usize;
    let y = yi as usize;
    let aa = perm[(perm[x] as usize) + y];
    let ab = perm[(perm[x] as usize) + y + 1];
    let ba = perm[(perm[x + 1] as usize) + y];
    let bb = perm[(perm[x + 1] as usize) + y + 1];
    lerp(
        lerp(
            grad(aa, xf, yf),
            grad(ba, xf - 1.0, yf),
            u,
        ),
        lerp(
            grad(ab, xf, yf - 1.0),
            grad(bb, xf - 1.0, yf - 1.0),
            u,
        ),
        v,
    ) * 0.7071
}

/// Fractal Brownian motion. Mirrors `fbm` (same defaults).
pub fn fbm(perm: &[u8; 512], x: f64, y: f64, octaves: i32) -> f64 {
    fbm_lac(perm, x, y, octaves, 2.0, 0.5)
}

fn fbm_lac(perm: &[u8; 512], x: f64, y: f64, octaves: i32, lacunarity: f64, gain: f64) -> f64 {
    let mut amp = 0.5;
    let mut freq = 1.0;
    let mut sum = 0.0;
    let mut norm = 0.0;
    for _ in 0..octaves.max(0) {
        sum += amp * value_noise(perm, x * freq, y * freq);
        norm += amp;
        amp *= gain;
        freq *= lacunarity;
    }
    if norm > 0.0 {
        sum / norm
    } else {
        0.0
    }
}

/// Domain-warped bands. Mirrors `warpedBands` (same offsets + octaves).
pub fn warped_bands(perm: &[u8; 512], x: f64, y: f64, warp: f64, freq: f64) -> f64 {
    let qx = fbm_lac(perm, x + 5.2, y + 1.3, 3, 2.0, 0.5);
    let qy = fbm_lac(perm, x + 1.7, y + 9.2, 3, 2.0, 0.5);
    fbm_lac(perm, x * freq + warp * qx, y * freq + warp * qy, 4, 2.0, 0.5)
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Voronoi {
    pub f1: f64,
    pub f2: f64,
    pub edge: f64,
}

/// Jittered-grid Voronoi. Mirrors `voronoi` (same 3×3 walk, same hashes).
pub fn voronoi(x: f64, y: f64, seed: u32) -> Voronoi {
    let cx = x.floor() as i32;
    let cy = y.floor() as i32;
    let mut f1 = 8.0;
    let mut f2 = 8.0;
    for j in (cy - 1)..=(cy + 1) {
        for i in (cx - 1)..=(cx + 1) {
            let px = (i as f64) + hash2(i, j, seed);
            let py = (j as f64) + hash2(j, i, seed ^ 0x9e3779b9);
            let dx = px - x;
            let dy = py - y;
            let d = (dx * dx + dy * dy).sqrt();
            if d < f1 {
                f2 = f1;
                f1 = d;
            } else if d < f2 {
                f2 = d;
            }
        }
    }
    Voronoi { f1, f2, edge: f2 - f1 }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Shard {
    pub angle: f64,
    pub radius: f64,
    pub z: f64,
    pub spin: f64,
    pub flow: f64,
    pub color: usize,
    pub size: f64,
}

pub const SHARD_COLORS_LEN: usize = 8;
pub const TAU: f64 = std::f64::consts::PI * 2.0;
/// Full-lap z spread of the shard helix (LAP_LEN 6 × WORLD_GAP 90).
pub const TUNNEL_SPAN: f64 = 540.0;

/// One shard of the dive helix. Mirrors `layoutShards` element `i`
/// (golden-angle steps, full-lap z spread, 7 draws per shard).
/// `count` is unused for placement (kept for signature honesty).
pub fn layout_shard(i: usize, _count: usize, seed: u32) -> Shard {
    let mut rand = Rng::new(seed);
    for _ in 0..i {
        for _ in 0..7 {
            rand.next_f64();
        }
    }
    let angle = ((i as f64) * 2.39996 + rand.next_f64() * 0.6) % TAU;
    let radius = 14.0 + rand.next_f64() * 16.0;
    let z = -rand.next_f64() * TUNNEL_SPAN;
    let spin = 0.05 + rand.next_f64() * 0.25;
    let flow = 18.0 + rand.next_f64() * 22.0;
    let color = (rand.next_f64() * (SHARD_COLORS_LEN as f64)) as usize;
    let size = 0.7 + rand.next_f64() * 0.9;
    Shard { angle, radius, z, spin, flow, color, size }
}

/// Motif scatter points. Mirrors `scatterPoints` (x,y,z draw order).
pub fn scatter_points(rand: &mut Rng, n: usize, sx: f64, sy: f64, sz: f64, y0: f64, out: &mut [f64]) {
    for i in 0..n {
        out[i * 3] = (rand.next_f64() - 0.5) * sx;
        out[i * 3 + 1] = y0 + rand.next_f64() * sy;
        out[i * 3 + 2] = (rand.next_f64() - 0.5) * sz;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fnv1a_matches_ascii_vectors() {
        assert_eq!(hash_seed(""), 2166136261);
        assert_eq!(hash_seed("ash dunes"), hash_seed("ash dunes"));
        assert_ne!(hash_seed("ash dunes"), hash_seed("ash dune"));
    }

    #[test]
    fn hash2_stays_unit_shaped() {
        for (x, y, s) in [(0, 0, 0), (3, -7, 42), (-999, 999, 1), (12345, -6789, 99)] {
            let v = hash2(x, y, s);
            assert!((0.0..=1.0).contains(&v), "hash2({x},{y},{s}) = {v}");
        }
        assert_eq!(hash2(3, -7, 42), hash2(3, -7, 42));
    }

    #[test]
    fn noise_and_fbm_deterministic_bounded() {
        let perm = build_perm(7);
        let a = value_noise(&perm, 1.7, -2.3);
        assert_eq!(a, value_noise(&perm, 1.7, -2.3));
        assert!((-1.01..=1.01).contains(&a));
        let f = fbm(&perm, 0.5, 0.25, 4);
        assert!((-1.01..=1.01).contains(&f));
        let w = warped_bands(&perm, 1.1, -0.4, 1.2, 1.6);
        assert!((-1.01..=1.01).contains(&w));
    }

    #[test]
    fn voronoi_edge_nonnegative_ordered() {
        let v = voronoi(2.3, 4.7, 99);
        assert!(v.f1 <= v.f2);
        assert!(v.edge >= 0.0);
        assert_eq!(v, voronoi(2.3, 4.7, 99));
    }

    #[test]
    fn shards_span_one_lap_colors_bounded() {
        for i in [0usize, 5, 219] {
            let s = layout_shard(i, 220, 7);
            assert!((14.0..=30.0).contains(&s.radius));
            assert!(s.z <= 0.0 && s.z >= -540.0);
            assert!(s.color < SHARD_COLORS_LEN);
            assert!((0.7..=1.6).contains(&s.size));
        }
        assert_eq!(layout_shard(5, 220, 7), layout_shard(5, 220, 7));
    }

    #[test]
    fn scatter_fills_boxes_deterministically() {        let mut a = vec![0.0; 12];
        let mut r = Rng::new(99);
        scatter_points(&mut r, 4, 30.0, 20.0, 16.0, -6.0, &mut a);
        let mut b = vec![0.0; 12];
        let mut r2 = Rng::new(99);
        scatter_points(&mut r2, 4, 30.0, 20.0, 16.0, -6.0, &mut b);
        assert_eq!(a, b);
        for i in 0..4 {
            assert!((-15.0..=15.0).contains(&a[i * 3]));
            assert!((-6.0..=14.0).contains(&a[i * 3 + 1]));
        }
    }
}

// ---------------------------------------------------------------------------
// WASM boundary (DV-2: the import-only swap DV-3 will pull).
//
// Zero dependencies preserved (no wasm-bindgen): scalars cross as f64/i32,
// vector results land in a static scratch buffer the host reads as
// Float64Array. TS stays the authority: WASM is a speedup, never a behavior
// change (proven by apps/server/test/dive-wasm.test.ts, exact f64 equality).
// ---------------------------------------------------------------------------

/// Scratch slots for vector results (voronoi 3, shard 7, scatter batches).
pub const SCRATCH_LEN: usize = 2048;

#[cfg(target_arch = "wasm32")]
static mut SCRATCH: [f64; SCRATCH_LEN] = [0.0; SCRATCH_LEN];

/// Pointer to the scratch buffer. The host wraps it as Float64Array.
#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub extern "C" fn dive_scratch_ptr() -> *mut f64 {
    #[allow(static_mut_refs)]
    unsafe {
        SCRATCH.as_mut_ptr()
    }
}

/// Cell hash. Mirrors `hash2`.
#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub extern "C" fn dive_hash2(x: i32, y: i32, seed: u32) -> f64 {
    hash2(x, y, seed)
}

/// Gradient noise. Mirrors `makeNoise2D(seed)` sampled once (the table
/// rebuild is part of the call — batch in the caller for hot loops).
#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub extern "C" fn dive_noise(x: f64, y: f64, seed: u32) -> f64 {
    value_noise(&build_perm(seed), x, y)
}

/// fBm. Mirrors `fbm` (lacunarity 2, gain 0.5).
#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub extern "C" fn dive_fbm(x: f64, y: f64, seed: u32, octaves: i32) -> f64 {
    fbm(&build_perm(seed), x, y, octaves)
}

/// Warped bands. Mirrors `warpedBands`.
#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub extern "C" fn dive_warped(x: f64, y: f64, seed: u32, warp: f64, freq: f64) -> f64 {
    warped_bands(&build_perm(seed), x, y, warp, freq)
}

/// Voronoi. Writes [f1, f2, edge] to scratch, returns edge.
#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub extern "C" fn dive_voronoi(x: f64, y: f64, seed: u32) -> f64 {
    let v = voronoi(x, y, seed);
    #[allow(static_mut_refs)]
    unsafe {
        SCRATCH[0] = v.f1;
        SCRATCH[1] = v.f2;
        SCRATCH[2] = v.edge;
    }
    v.edge
}

/// One helix shard. Writes [angle, radius, z, spin, flow, color, size].
#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub extern "C" fn dive_shard(i: i32, count: i32, seed: u32) {
    let s = layout_shard(i.max(0) as usize, count.max(0) as usize, seed);
    #[allow(static_mut_refs)]
    unsafe {
        SCRATCH[0] = s.angle;
        SCRATCH[1] = s.radius;
        SCRATCH[2] = s.z;
        SCRATCH[3] = s.spin;
        SCRATCH[4] = s.flow;
        SCRATCH[5] = s.color as f64;
        SCRATCH[6] = s.size;
    }
}

/// Scatter box. Writes 3*n f64s, returns points written (clamped to fit).
#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub extern "C" fn dive_scatter(n: i32, seed: u32, sx: f64, sy: f64, sz: f64, y0: f64) -> i32 {
    let n = (n.max(0) as usize).min(SCRATCH_LEN / 3);
    let mut rand = Rng::new(seed);
    #[allow(static_mut_refs)]
    unsafe {
        scatter_points(&mut rand, n, sx, sy, sz, y0, &mut SCRATCH[..n * 3]);
    }
    n as i32
}
