// apps/web/src/art.ts — the craft layer. Zero assets: every pixel is
// procedural, every sound synthesized. The RIFT: an endless descent through
// morphing rings, tinted by mood. Respects reduced-motion + hidden tabs,
// DPR-capped, pauses offscreen. This is what makes it ours.
export const INK = '#0B0B10';
export const BONE = '#F2EDE3';
export const LIME = '#C6F135';
export const MAG = '#FF3D8A';
export const CYAN = '#46E0D4';
export const PLUM = '#1E1033';
export const GOLD = '#FFE9A8';

export const MOOD_TINT: Record<string, string> = {
  BEAT: MAG,
  CHAOS: LIME,
  THINK: CYAN,
  SURPRISE: GOLD,
};

export const easeOutBack = (t: number): number => {
  const c = 1.70158;
  const u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
};
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mulberry(seed: number): () => number { return rng(seed); }

export interface RiftOpts { tint?: string; density?: number }

/** Endless procedural descent. Owns its rAF; call stop() to kill it. */
export function startRiftBackdrop(cv: HTMLCanvasElement, opts: RiftOpts = {}): { stop: () => void; setTint: (c: string) => void } {
  const ctx = cv.getContext('2d')!;
  let tint = opts.tint ?? PLUM;
  let dead = false;
  let raf = 0;
  const rand = mulberry(1337);
  const rings = 14;
  const seeds = Array.from({ length: rings }, () => ({
    wob: rand() * Math.PI * 2,
    spd: 0.3 + rand() * 0.9,
    hue: rand(),
    dash: rand() < 0.4,
  }));
  const specks = Array.from({ length: opts.density ?? 70 }, () => ({
    x: rand(), y: rand(), z: 0.3 + rand() * 0.7, tw: rand() * Math.PI * 2,
  }));
  let px = 0.5;
  let py = 0.45;
  const onMove = (e: PointerEvent): void => {
    px = e.clientX / window.innerWidth;
    py = e.clientY / window.innerHeight;
  };
  window.addEventListener('pointermove', onMove, { passive: true });
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function size(): void {
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const w = Math.floor(cv.clientWidth * dpr);
    const h = Math.floor(cv.clientHeight * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  }

  const t0 = performance.now();
  function frame(now: number): void {
    if (dead) return;
    raf = requestAnimationFrame(frame);
    if (document.hidden) return;
    size();
    const t = (now - t0) / 1000;
    const W = cv.width;
    const H = cv.height;
    const cx = W * (0.5 + (px - 0.5) * 0.06);
    const cy = H * (0.42 + (py - 0.45) * 0.06);
    const R = Math.max(W, H);

    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.75);
    g.addColorStop(0, '#000000');
    g.addColorStop(0.55, tint + '55');
    g.addColorStop(1, '#070708');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const drift = reduced ? 0 : t;
    for (let i = 0; i < rings; i++) {
      const s = seeds[i]!;
      const prog = ((i / rings) + drift * 0.07 * s.spd) % 1;
      const r = R * 0.06 * Math.pow(2.6, prog * 2.4);
      const alpha = Math.max(0, 0.5 * (1 - prog));
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.sin(drift * 0.2 + s.wob) * 0.12);
      ctx.globalAlpha = alpha;
      ctx.lineWidth = Math.max(1, R * 0.002 * (0.5 + prog));
      ctx.strokeStyle = s.hue < 0.25 ? LIME : s.hue < 0.5 ? CYAN : s.hue < 0.75 ? MAG : BONE;
      if (s.dash) ctx.setLineDash([R * 0.02, R * 0.014]);
      ctx.beginPath();
      const wob = 1 + 0.05 * Math.sin(drift * s.spd + s.wob + i);
      ctx.ellipse(0, 0, r * wob, r / wob, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
    for (const sp of specks) {
      const yy = ((sp.y - drift * 0.03 * sp.z) % 1 + 1) % 1;
      const tw = reduced ? 0.7 : 0.35 + 0.35 * Math.sin(drift * 2 + sp.tw);
      ctx.globalAlpha = tw * sp.z;
      ctx.fillStyle = BONE;
      const sz = Math.max(1, sp.z * (W / 400));
      ctx.fillRect((sp.x * W + (px - 0.5) * 20 * sp.z) % W, yy * H, sz, sz);
    }
    ctx.globalAlpha = 1;
  }
  raf = requestAnimationFrame(frame);
  return {
    stop: () => { dead = true; cancelAnimationFrame(raf); window.removeEventListener('pointermove', onMove); },
    setTint: (c: string) => { tint = c; },
  };
}

/** Pooled confetti burst for score moments. Zero per-frame allocation. */
export class Bursts {
  private parts: { x: number; y: number; vx: number; vy: number; life: number; max: number; c: string }[] = [];
  constructor(private ctx: CanvasRenderingContext2D) {}
  fire(x: number, y: number, color: string, n = 26): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 220;
      this.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: 0, max: 0.7 + Math.random() * 0.5, c: color });
    }
    if (this.parts.length > 400) this.parts.splice(0, this.parts.length - 400);
  }
  tick(dt: number): void {
    const { ctx } = this;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]!;
      p.life += dt;
      if (p.life >= p.max) { this.parts.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 420 * dt;
      ctx.globalAlpha = 1 - p.life / p.max;
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x, p.y, 4, 4);
    }
    ctx.globalAlpha = 1;
  }
}

/** Tiny synth: pop / win / tick / guess / reveal. Lazy context, gesture-gated. */
let ac: AudioContext | null = null;
function ctx_(): AudioContext | null {
  try {
    if (!ac) ac = new AudioContext();
    if (ac.state === 'suspended') void ac.resume();
    return ac;
  } catch { return null; }
}
function blip(freq: number, dur: number, type: OscillatorType, vol = 0.08, slide = 0): void {
  const a = ctx_();
  if (!a) return;
  try {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, a.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), a.currentTime + dur);
    g.gain.setValueAtTime(vol, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
    o.connect(g).connect(a.destination);
    o.start();
    o.stop(a.currentTime + dur + 0.02);
  } catch { /* silent */ }
}
export const sfx = {
  unlock(): void { ctx_(); },
  tap: () => blip(520, 0.09, 'square', 0.05, 260),
  pop: () => blip(660, 0.12, 'sine', 0.09, 440),
  win: () => { blip(523, 0.14, 'triangle', 0.09); setTimeout(() => blip(784, 0.2, 'triangle', 0.09), 110); },
  bad: () => blip(160, 0.18, 'sawtooth', 0.05, -60),
  tick: () => blip(880, 0.05, 'sine', 0.04),
  guess: () => blip(740, 0.1, 'sine', 0.07, 180),
  reveal: () => { blip(392, 0.16, 'triangle', 0.08); setTimeout(() => blip(587, 0.24, 'triangle', 0.08), 140); },
};
