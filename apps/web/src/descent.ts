// apps/web/src/descent.ts — THE DIVE. An endless zoom through six
// procedural worlds, one per game family. Scroll / drag / auto-drift to
// descend; each world's heart is a portal that jumps you into play.
// Zero assets. DPR-capped, reduced-motion safe, pauses offscreen.
import { rng, BONE, LIME, MAG, CYAN, GOLD, INK } from './art.js';
import { chaptersOf } from './sagas.js';
import { paintMotif2D } from './motifs.js';

export interface World {
  name: string;
  sub: string;
  game: string;
  sky0: string;
  sky1: string;
  accent: string;
  /** SG-1: chapters point at the art builder they reuse (LZ-2 paints motifs). */
  biome?: number;
  motif?: string;
}

export const WORLDS: World[] = [
  { name: 'ORBIT RINGS', sub: 'reflex-riot lives here — react!', game: 'reflex-riot', sky0: '#0B0B16', sky1: '#1E1033', accent: MAG },
  { name: 'CANDY DUNES', sub: 'blaze-squad lives here — survive!', game: 'blaze-squad', sky0: '#2B1030', sky1: '#4A1545', accent: LIME },
  { name: 'INK GARDEN', sub: 'doodle-duel lives here — draw!', game: 'doodle-duel', sky0: '#101014', sky1: '#23232E', accent: BONE },
  { name: 'NEON REEF', sub: 'nitro-rift lives here — race!', game: 'nitro-rift', sky0: '#04141A', sky1: '#0A2E3A', accent: CYAN },
  { name: 'EMBER DEEP', sub: 'ludo-clash lives here — race home!', game: 'ludo-clash', sky0: '#160B08', sky1: '#3A1408', accent: GOLD },
  { name: 'STAR NURSERY', sub: 'everything loops — dive again', game: 'reflex-riot', sky0: '#050510', sky1: '#141433', accent: LIME },
];

interface Speck { x: number; y: number; z: number; tw: number }

export function startDescent(
  cv: HTMLCanvasElement,
  opts: { onPortal?: (game: string) => void; saga?: number; startDepth?: number; onFinale?: () => void } = {},
): { stop: () => void } {
  // SG-1: the dive reads saga chapters, not random worlds — depth turns pages.
  const WORLDS = chaptersOf(opts.saga ?? 0);
  const clampDepth = (d: number): number => Math.min(WORLDS.length - 0.001, Math.max(0, d));
  const ctx = cv.getContext('2d')!;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rand = rng(4242);
  const specks: Speck[] = Array.from({ length: 90 }, () => ({
    x: rand(), y: rand(), z: 0.3 + rand() * 0.7, tw: rand() * Math.PI * 2,
  }));
  const petals: { a: number; r: number; s: number; w: number }[] = Array.from({ length: 26 }, () => ({
    a: rand() * Math.PI * 2, r: rand(), s: 0.2 + rand() * 0.8, w: rand(),
  }));

  let depth = clampDepth(opts.startDepth ?? 0); // float world index, endless
  let target = depth;
  let dragging = false;
  let lastY = 0;
  let dead = false;
  let raf = 0;
  let lastFrame = performance.now();
  let frameAvg = 16;
  let calmFrames = 0;
  let detail = 1; // 1 full motifs, 0 shed load (governor above)
  const t0 = performance.now();

  const clampTarget = (): void => {
    if (target < 0) target = 0;
    if (target > WORLDS.length - 0.001) target = WORLDS.length - 0.001;
  };
  cv.style.touchAction = 'pan-y';
  cv.addEventListener('wheel', (e) => { e.preventDefault(); target += e.deltaY * 0.0016; clampTarget(); }, { passive: false });
  cv.addEventListener('pointerdown', (e) => { dragging = true; lastY = e.clientY; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    target += (lastY - e.clientY) * 0.004;
    lastY = e.clientY;
    clampTarget();
  });
  const endDrag = (): void => { dragging = false; };
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  // tap the heart = portal
  cv.addEventListener('click', () => {
    const w = WORLDS[Math.floor(depth) % WORLDS.length]!;
    opts.onPortal?.(w.game);
  });

  function hex(h: string): [number, number, number] {
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  }
  function mix(a: string, b: string, k: number): string {
    const A = hex(a);
    const B = hex(b);
    return `rgb(${Math.round(A[0] + (B[0] - A[0]) * k)},${Math.round(A[1] + (B[1] - A[1]) * k)},${Math.round(A[2] + (B[2] - A[2]) * k)})`;
  }

  function drawWorld(w: World, wi: number, cx: number, cy: number, R: number, t: number, alpha: number): void {
    ctx.save();
    ctx.globalAlpha = alpha;
    if (wi === 0) {
      // ORBIT RINGS — concentric morphing ellipses + circling moons
      for (let i = 0; i < 9; i++) {
        const p = i / 9;
        const r = R * (0.12 + p * 0.5);
        ctx.globalAlpha = alpha * (0.75 - p * 0.55);
        ctx.lineWidth = Math.max(1, R * 0.004 * (1 - p * 0.5));
        ctx.strokeStyle = i % 3 === 0 ? w.accent : BONE;
        ctx.beginPath();
        ctx.ellipse(cx, cy, r * (1 + 0.04 * Math.sin(t * 0.6 + i)), r * (1 - 0.04 * Math.sin(t * 0.6 + i)), 0, 0, Math.PI * 2);
        ctx.stroke();
        const a = t * (0.3 + p * 0.5) + i * 2.1;
        ctx.fillStyle = w.accent;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.98, Math.max(2, R * 0.008), 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (wi === 1) {
      // CANDY DUNES — layered dune arcs + sprinkle rain
      for (let i = 0; i < 7; i++) {
        const y = cy - R * 0.45 + (i / 7) * R * 1.1;
        ctx.globalAlpha = alpha * (0.25 + (i / 7) * 0.6);
        ctx.fillStyle = i % 2 ? '#5B2D5E' : '#7A3B6E';
        ctx.beginPath();
        ctx.moveTo(0, cy + R);
        for (let x = 0; x <= cv.width; x += 24) {
          ctx.lineTo(x, y + Math.sin(x * 0.008 + t * (0.4 + i * 0.12) + i * 2) * R * 0.05);
        }
        ctx.lineTo(cv.width, cy + R);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = alpha;
      for (let i = 0; i < 26; i++) {
        const sx = ((i * 197.3) % cv.width + t * 30 * ((i % 3) + 1)) % cv.width;
        const sy = (cy - R * 0.5 + ((i * 331.7) % (R * 1.1)) + t * 60) % (R * 1.2);
        ctx.fillStyle = [LIME, MAG, CYAN, GOLD][i % 4]!;
        ctx.save();
        ctx.translate(sx, (sy % (cy + R * 0.6)) + R * 0.1);
        ctx.rotate(i + t);
        ctx.fillRect(-4, -1.5, 8, 3);
        ctx.restore();
      }
    } else if (wi === 2) {
      // INK GARDEN — sumi strokes + drifting petals
      ctx.globalAlpha = alpha * 0.9;
      ctx.strokeStyle = '#3A3A48';
      ctx.lineWidth = Math.max(2, R * 0.008);
      ctx.beginPath();
      ctx.moveTo(cx - R * 0.4, cy + R * 0.55);
      ctx.quadraticCurveTo(cx + R * 0.1, cy - R * 0.2, cx + R * 0.32, cy - R * 0.42);
      ctx.stroke();
      ctx.lineWidth = Math.max(1, R * 0.004);
      for (let i = 0; i < 5; i++) {
        const bx = cx - R * 0.25 + i * R * 0.12;
        const by = cy + R * 0.28 - i * R * 0.13;
        ctx.beginPath();
        ctx.ellipse(bx, by, R * 0.07, R * 0.028, -0.5 + 0.1 * Math.sin(t + i), 0, Math.PI * 2);
        ctx.stroke();
      }
      for (const p of petals) {
        const a = p.a + t * 0.12 * p.s;
        const rr = R * (0.1 + p.r * 0.5);
        ctx.globalAlpha = alpha * (0.35 + p.w * 0.4);
        ctx.fillStyle = p.w < 0.3 ? MAG : BONE;
        ctx.beginPath();
        ctx.ellipse(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.8 - R * 0.05, R * 0.016, R * 0.01, a, 0, Math.PI * 2);
        ctx.fill();
      }
      // moon
      ctx.globalAlpha = alpha * 0.9;
      ctx.fillStyle = '#E8E2D2';
      ctx.beginPath();
      ctx.arc(cx + R * 0.34, cy - R * 0.4, R * 0.07, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = w.sky1;
      ctx.beginPath();
      ctx.arc(cx + R * 0.365, cy - R * 0.415, R * 0.06, 0, Math.PI * 2);
      ctx.fill();
    } else if (wi === 3) {
      // NEON REEF — synthwave sun + perspective grid + jellyfish
      const horizon = cy + R * 0.18;
      const sg = ctx.createLinearGradient(0, cy - R * 0.4, 0, horizon);
      sg.addColorStop(0, GOLD);
      sg.addColorStop(1, MAG);
      ctx.globalAlpha = alpha * 0.95;
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(cx, horizon, R * 0.22, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = w.sky1;
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(cx - R * 0.24, horizon - R * 0.2 + i * R * 0.05 + ((t * R * 0.02) % (R * 0.05)), R * 0.48, R * 0.012);
      }
      ctx.globalAlpha = alpha * 0.8;
      ctx.strokeStyle = CYAN;
      ctx.lineWidth = 1;
      for (let i = -8; i <= 8; i++) {
        ctx.beginPath();
        ctx.moveTo(cx + i * R * 0.03, horizon);
        ctx.lineTo(cx + i * R * 0.14, horizon + R * 0.5);
        ctx.stroke();
      }
      for (let i = 0; i < 4; i++) {
        const jx = cx - R * 0.4 + ((i * 0.27 + t * 0.02 * (1 + i * 0.3)) % 0.9) * R;
        const jy = cy - R * 0.25 + Math.sin(t * 0.9 + i * 2.4) * R * 0.05 + i * R * 0.1;
        ctx.globalAlpha = alpha * (0.5 + 0.2 * Math.sin(t * 2 + i));
        ctx.fillStyle = i % 2 ? MAG : CYAN;
        ctx.beginPath();
        ctx.arc(jx, jy, R * 0.035, Math.PI, 0);
        ctx.fill();
        ctx.strokeStyle = ctx.fillStyle;
        for (let k = -2; k <= 2; k++) {
          ctx.beginPath();
          ctx.moveTo(jx + k * R * 0.012, jy);
          ctx.quadraticCurveTo(jx + k * R * 0.016, jy + R * 0.05, jx + k * R * 0.008 + Math.sin(t * 3 + k) * R * 0.008, jy + R * 0.09);
          ctx.stroke();
        }
      }
    } else if (wi === 4) {
      // EMBER DEEP — rising embers + basalt pillars
      for (let i = 0; i < 6; i++) {
        const bx = ((i * 0.19 + 0.05) * cv.width);
        const bh = R * (0.25 + ((i * 37) % 30) / 100);
        ctx.globalAlpha = alpha * 0.85;
        ctx.fillStyle = '#1E0F0C';
        ctx.fillRect(bx, cy + R * 0.55 - bh, R * 0.09, bh);
        ctx.fillStyle = '#FF7A1A';
        ctx.fillRect(bx, cy + R * 0.55 - bh, R * 0.09, 2);
      }
      for (let i = 0; i < 34; i++) {
        const ex = (i * 173.3) % cv.width;
        const ey = cy + R * 0.55 - ((t * (20 + (i % 5) * 14) + i * 97) % (R * 1.2));
        ctx.globalAlpha = alpha * (0.25 + ((i % 4) / 4) * 0.6);
        ctx.fillStyle = i % 3 ? '#FF7A1A' : GOLD;
        const es = 1 + (i % 3);
        ctx.fillRect(ex, ey, es, es * 2);
      }
    } else {
      // STAR NURSERY — nebula blobs + starfield + bright heart
      for (let i = 0; i < 7; i++) {
        const nx = cx + Math.sin(i * 2.4 + t * 0.1) * R * 0.3;
        const ny = cy + Math.cos(i * 1.7 + t * 0.13) * R * 0.28;
        const nr = R * (0.1 + (i % 3) * 0.05);
        const ng = ctx.createRadialGradient(nx, ny, 0, nx, ny, nr);
        const col = [MAG, CYAN, '#7A5CFF'][i % 3]!;
        ng.addColorStop(0, col);
        ng.addColorStop(1, 'transparent');
        ctx.globalAlpha = alpha * 0.35;
        ctx.fillStyle = ng;
        ctx.beginPath();
        ctx.arc(nx, ny, nr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = alpha;
      for (const sp of specks) {
        const tw = 0.3 + 0.7 * Math.abs(Math.sin(t * 1.5 + sp.tw));
        ctx.globalAlpha = alpha * tw;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(sp.x * cv.width, sp.y * (cy + R * 0.6), sp.z * 2.4, sp.z * 2.4);
      }
      ctx.globalAlpha = alpha;
      const pulse = 1 + 0.08 * Math.sin(t * 2.2);
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.045 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = LIME;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.075 * pulse, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function frame(now: number): void {
    if (dead) return;
    raf = requestAnimationFrame(frame);
    if (document.hidden) return;
    // No-hang governor: sustained slow frames shed motif detail (first the
    // crossfade layer, then voronoi grids); recovery needs a long clean run.
    const dtms = now - lastFrame;
    lastFrame = now;
    frameAvg = frameAvg * 0.95 + Math.min(100, dtms) * 0.05;
    if (detail === 1 && frameAvg > 26) { detail = 0; calmFrames = 0; }
    else if (detail === 0) {
      if (frameAvg < 15) { if (++calmFrames > 240) detail = 1; }
      else calmFrames = 0;
    }
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const w = Math.floor(cv.clientWidth * dpr);
    const h = Math.floor(cv.clientHeight * dpr);
    if (w === 0 || h === 0) return;
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    if (!reduced && !dragging) target += 0.00045; // slow auto-dive
    if (!reduced) depth += (target - depth) * 0.06;
    else depth = target;
    if (target >= WORLDS.length - 0.001 && depth >= WORLDS.length - 0.01) {
      try { opts.onFinale?.(); } catch { /* story never blocks play */ }
      target = 0; // endless loop — the saga re-reads from chapter 1
      if (!reduced) depth = 0;
    }
    const t = (now - t0) / 1000;
    const wi = Math.floor(depth) % WORLDS.length;
    const frac = depth - Math.floor(depth);
    const wA = WORLDS[wi]!;
    const wB = WORLDS[(wi + 1) % WORLDS.length]!;
    const W = cv.width;
    const H = cv.height;
    const cx = W / 2;
    const cy = H * 0.44;
    const R = Math.max(W, H) * 0.5;

    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, mix(wA.sky0, wB.sky0, frac));
    sky.addColorStop(1, mix(wA.sky1, wB.sky1, frac));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    const zoom = 1 + frac * 1.6;
    drawWorld(wA, wA.biome ?? wi, cx, cy, R * zoom, reduced ? 0 : t, 1 - frac * 0.85);
    if (frac > 0.02) drawWorld(wB, wB.biome ?? ((wi + 1) % WORLDS.length), cx, cy, R * (zoom - 1.6), reduced ? 0 : t, Math.min(1, frac * 1.4));
    // LZ-2: procedural motif layer — the chapter's own weather, seeded + cached.
    const mt = reduced ? 0 : t;
    if (wA.motif) paintMotif2D(ctx, wA.motif, wA, cx, cy, R * zoom, mt, 1 - frac * 0.85, W, H, detail);
    if (frac > 0.02 && detail === 1 && wB.motif) paintMotif2D(ctx, wB.motif, wB, cx, cy, R * (zoom - 1.6), mt, Math.min(1, frac * 1.4), W, H, detail);

    // portal heart + label
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(7,7,8,.55)';
    const lw = Math.min(W * 0.86, 560 * dpr);
    ctx.fillRect(cx - lw / 2, H - 118 * dpr, lw, 92 * dpr);
    ctx.fillStyle = wA.accent;
    ctx.font = `900 ${Math.round(15 * dpr)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.fillText(`${String(wi + 1).padStart(2, '0')} · ${wA.name}`, cx, H - 82 * dpr);
    ctx.fillStyle = BONE;
    ctx.font = `${Math.round(12.5 * dpr)}px system-ui`;
    ctx.fillText(wA.sub, cx, H - 58 * dpr);
    ctx.fillStyle = 'rgba(242,237,227,.6)';
    ctx.font = `${Math.round(11 * dpr)}px system-ui`;
    ctx.fillText(reduced ? 'tap to enter' : 'scroll / drag to dive · tap to enter', cx, H - 38 * dpr);

    // depth dots
    for (let i = 0; i < WORLDS.length; i++) {
      ctx.fillStyle = i === wi ? wA.accent : 'rgba(242,237,227,.25)';
      ctx.beginPath();
      ctx.arc(cx - (WORLDS.length - 1) * 9 * dpr + i * 18 * dpr, 16 * dpr, (i === wi ? 4 : 2.5) * dpr, 0, Math.PI * 2);
      ctx.fill();
    }
    void INK;
  }
  raf = requestAnimationFrame(frame);
  return { stop: () => { dead = true; cancelAnimationFrame(raf); } };
}
