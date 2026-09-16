// apps/web/src/motifs.ts — LZ-2 2D motif painters. One distinctive procedural
// layer per saga motif, all seeded (same chapter → same bytes), all static
// geometry precomputed once per motif+seed and cached — per-frame work is
// draw-only with time offsets, zero allocation. Reduced motion freezes t.
import type { World } from './descent.js';
import { hashSeed, hash2, makeNoise2D, fbm, warpedBands, voronoi, lsystem } from './procgen.js';

interface Cache {
  stars: { x: number; y: number; r: number; tw: number }[];
  lanes: { y: number; sp: number; ln: number }[];
  vines: string[];
  embers: { x: number; y: number; s: number; v: number }[];
  links: [number, number][];
}
const cache = new Map<string, Cache>();

function getCache(motif: string, seed: number): Cache {
  const key = `${motif}:${seed}`;
  let c = cache.get(key);
  if (c) return c;
  c = { stars: [], lanes: [], vines: [], embers: [], links: [] };
  const rnd = (n: number): number => hash2(n, seed & 0xffff, seed);
  for (let i = 0; i < 60; i++) {
    c.stars.push({ x: rnd(i * 3 + 1), y: rnd(i * 3 + 2), r: 0.5 + rnd(i * 3 + 3) * 1.8, tw: rnd(i * 7 + 5) * 6.28 });
  }
  for (let i = 0; i < 26; i++) {
    c.lanes.push({ y: rnd(i * 5 + 11), sp: 0.3 + rnd(i * 5 + 12) * 1.2, ln: 0.2 + rnd(i * 5 + 13) * 0.6 });
  }
  const rules: Record<string, Record<string, string>> = {
    vine: { F: 'F[+F]F[-F]F' },
    root: { F: 'FF-[-F+F+F]+[+F-F-F]' },
  };
  c.vines.push(lsystem('F', rules.vine!, 3));
  c.vines.push(lsystem('F', rules.root!, 3));
  for (let i = 0; i < 40; i++) {
    c.embers.push({ x: rnd(i * 11 + 21), y: rnd(i * 11 + 22), s: 1 + rnd(i * 11 + 23) * 2.5, v: 0.2 + rnd(i * 11 + 24) * 0.8 });
  }
  // constellation links: near-neighbor pairs among first 22 stars
  for (let i = 0; i < 22; i++) {
    let best = -1;
    let bd = 0.08;
    for (let j = 0; j < 22; j++) {
      if (i === j) continue;
      const a = c.stars[i]!;
      const b = c.stars[j]!;
      const d = Math.hypot(a.x - b.x, (a.y - b.y) * 1.4);
      if (d < bd) { bd = d; best = j; }
    }
    if (best >= 0) c.links.push([i, best]);
  }
  if (cache.size > 24) cache.clear(); // two sagas × 12 chapters max, then recycle
  cache.set(key, c);
  return c;
}

/** Turtle-walk an L-string as branches. Zero alloc: walks, doesn't build. */
function walkVine(
  ctx: CanvasRenderingContext2D, s: string, x: number, y: number,
  angle: number, step: number, sway: number,
): void {
  const stack: number[] = [];
  let a = angle;
  let px = x;
  let py = y;
  ctx.beginPath();
  ctx.moveTo(px, py);
  for (const ch of s) {
    if (ch === 'F') {
      px += Math.cos(a) * step;
      py += Math.sin(a) * step;
      ctx.lineTo(px, py);
    } else if (ch === '+') { a += 0.42 + sway; } else if (ch === '-') { a -= 0.42 + sway; }
    else if (ch === '[') { stack.push(px, py, a); }
    else if (ch === ']') { a = stack.pop() ?? a; py = stack.pop() ?? py; px = stack.pop() ?? px; ctx.moveTo(px, py); }
  }
  ctx.stroke();
}

/** Hanging mask lantern: ellipse mask + slit eyes + tassel. Original faces. */
function maskLantern(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, swing: number, glow: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.sin(swing) * 0.12);
  ctx.strokeStyle = 'rgba(242,237,227,.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -r * 2.2);
  ctx.lineTo(0, -r);
  ctx.stroke();
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.72, r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(7,7,8,.85)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.26, -r * 0.1, r * 0.16, r * 0.1, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(r * 0.26, -r * 0.1, r * 0.16, r * 0.1, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(7,7,8,.85)';
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.beginPath();
  ctx.arc(0, r * 0.25, r * 0.28, 0.3, Math.PI - 0.3);
  ctx.stroke();
  ctx.restore();
}

export function paintMotif2D(
  ctx: CanvasRenderingContext2D, motif: string, w: World,
  cx: number, cy: number, R: number, t: number, alpha: number, W: number, H: number,
): void {
  const seed = hashSeed(`${w.name}|${w.game}|${motif}`);
  const c = getCache(motif, seed);
  const noise = makeNoise2D(seed);
  ctx.save();
  ctx.globalAlpha = alpha;

  if (motif === 'ash dunes' || motif === 'lantern cliffs' || motif === 'volcanic isle') {
    // wind-blown ash / rising embers on warped bands
    for (const e of c.embers) {
      const drift = (e.x * W + t * 24 * e.v) % W;
      const band = warpedBands(noise, e.x * 3, e.y * 3 + t * 0.05);
      const y = cy - R * 0.5 + e.y * R * 1.2 + band * R * 0.08;
      ctx.globalAlpha = alpha * (0.25 + 0.55 * Math.abs(band));
      ctx.fillStyle = motif === 'volcanic isle' ? '#FF7A1A' : w.accent;
      const s = e.s * (motif === 'ash dunes' ? 1.6 : 1);
      ctx.fillRect(drift, y, s * 2.4, s);
    }
    ctx.globalAlpha = alpha;
    if (motif === 'lantern cliffs' || motif === 'volcanic isle') {
      // basalt slabs / cliff silhouettes from cell hashes
      for (let i = 0; i < 9; i++) {
        const bx = (hash2(i, 3, seed) * W);
        const bh = R * (0.2 + hash2(i, 7, seed) * 0.5);
        ctx.fillStyle = motif === 'volcanic isle' ? '#160B08' : '#0A0A10';
        ctx.fillRect(bx, cy + R * 0.55 - bh, R * 0.07, bh);
        ctx.fillStyle = w.accent;
        ctx.fillRect(bx, cy + R * 0.55 - bh, R * 0.07, 2);
      }
    }
    if (motif === 'volcanic isle') {
      // cone ridgeline from fbm samples
      ctx.fillStyle = '#0D0605';
      ctx.beginPath();
      ctx.moveTo(cx - R * 0.55, cy + R * 0.55);
      for (let i = 0; i <= 40; i++) {
        const x = cx - R * 0.55 + (i / 40) * R * 1.1;
        const ridge = cy - R * 0.28 + fbm(noise, i * 0.3, 2.2, 3) * R * 0.1 - Math.abs(i / 40 - 0.5) * -R * 0.35;
        ctx.lineTo(x, ridge);
      }
      ctx.lineTo(cx + R * 0.55, cy + R * 0.55);
      ctx.closePath();
      ctx.fill();
    }
  } else if (motif === 'reef lanes' || motif === 'crown forge') {
    // voronoi glow-web: reef light / forge basalt cracks
    const step = Math.max(20, R * 0.035);
    ctx.lineWidth = 1.2;
    for (let gy = cy - R * 0.6; gy < cy + R * 0.6; gy += step) {
      for (let gx = cx - R * 0.7; gx < cx + R * 0.7; gx += step) {
        const v = voronoi(gx / step + t * 0.03, gy / step, seed);
        if (v.edge < 0.09) {
          ctx.globalAlpha = alpha * (0.5 - v.edge * 4);
          ctx.fillStyle = w.accent;
          ctx.fillRect(gx, gy, 2, 2);
        }
      }
    }
    ctx.globalAlpha = alpha;
    for (const l of c.lanes) {
      const y = cy - R * 0.5 + l.y * R;
      const xoff = (t * 40 * l.sp) % (W * 0.5);
      ctx.strokeStyle = w.accent;
      ctx.globalAlpha = alpha * 0.3;
      ctx.beginPath();
      ctx.moveTo(cx - W * 0.25 + xoff, y);
      ctx.lineTo(cx - W * 0.25 + xoff + W * l.ln * 0.4, y);
      ctx.stroke();
    }
    ctx.globalAlpha = alpha;
  } else if (motif === 'trial rings' || motif === 'whirlpool rings') {
    // rotating orbit rings / fbm-wobbled spiral arms
    const arms = motif === 'whirlpool rings' ? 3 : 0;
    if (arms === 0) {
      for (let i = 0; i < 5; i++) {
        const rr = R * (0.16 + i * 0.11);
        ctx.globalAlpha = alpha * (0.7 - i * 0.1);
        ctx.strokeStyle = i % 2 ? w.accent : '#F2EDE3';
        ctx.lineWidth = Math.max(1, R * 0.004);
        ctx.setLineDash([R * 0.06, R * 0.045]);
        ctx.lineDashOffset = -t * (12 + i * 7);
        ctx.beginPath();
        ctx.ellipse(cx, cy, rr, rr * 0.96, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    } else {
      for (let a = 0; a < arms; a++) {
        ctx.globalAlpha = alpha * 0.6;
        ctx.strokeStyle = w.accent;
        ctx.lineWidth = Math.max(1.5, R * 0.006);
        ctx.beginPath();
        for (let i = 0; i <= 60; i++) {
          const th = (i / 60) * Math.PI * 3.2 + a * 2.09 + t * 0.25;
          const rr = R * 0.08 + (i / 60) * R * 0.5 + fbm(noise, i * 0.2, a * 9, 3) * R * 0.03;
          const x = cx + Math.cos(th) * rr;
          const y = cy + Math.sin(th) * rr * 0.9;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
    ctx.globalAlpha = alpha;
  } else if (motif === 'mask garden' || motif === 'parley cove' || motif === 'living chart') {
    // L-system vines + mask lanterns (garden), roots + water (cove), chart below
    const vine = c.vines[motif === 'parley cove' ? 1 : 0]!;
    ctx.strokeStyle = motif === 'living chart' ? '#7A5CFF' : '#2E5E4E';
    ctx.lineWidth = Math.max(1.5, R * 0.005);
    ctx.globalAlpha = alpha * 0.85;
    const sway = Math.sin(t * 0.7) * 0.05;
    for (let k = 0; k < 3; k++) {
      const bx = cx - R * 0.4 + k * R * 0.4;
      walkVine(ctx, vine, bx, cy + R * 0.6, -Math.PI / 2 + (k - 1) * 0.2, R * 0.035, sway);
    }
    ctx.globalAlpha = alpha;
    if (motif !== 'living chart') {
      const n = motif === 'mask garden' ? 3 : 2;
      for (let k = 0; k < n; k++) {
        const mx = cx - R * 0.3 + k * R * 0.3 + Math.sin(t * 0.5 + k * 2) * R * 0.02;
        maskLantern(ctx, mx, cy - R * 0.1 + (k % 2) * R * 0.18, R * 0.055, t * 0.8 + k * 2.1, w.accent);
      }
    }
  }

  // star-chart overlay shared by chart + mural + star finale chapters
  if (motif === 'living chart' || motif === 'star mural' || motif === 'crown forge') {
    ctx.strokeStyle = w.accent;
    ctx.globalAlpha = alpha * 0.5;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const [i, j] of c.links) {
      const a = c.stars[i]!;
      const b = c.stars[j]!;
      ctx.moveTo(cx - R * 0.45 + a.x * R * 0.9, cy - R * 0.45 + a.y * R * 0.9);
      ctx.lineTo(cx - R * 0.45 + b.x * R * 0.9, cy - R * 0.45 + b.y * R * 0.9);
    }
    ctx.stroke();
    for (let i = 0; i < 22; i++) {
      const s = c.stars[i]!;
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.4 + s.tw));
      ctx.globalAlpha = alpha * tw;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(cx - R * 0.45 + s.x * R * 0.9, cy - R * 0.45 + s.y * R * 0.9, s.r, s.r);
    }
    ctx.globalAlpha = alpha;
    if (motif === 'living chart') {
      // the route draws itself: marching-ants dashed path through 5 waypoints
      ctx.strokeStyle = '#FFE9A8';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 7]);
      ctx.lineDashOffset = -t * 22;
      ctx.beginPath();
      for (let k = 0; k < 5; k++) {
        const s = c.stars[k * 4]!;
        const x = cx - R * 0.45 + s.x * R * 0.9;
        const y = cy - R * 0.45 + s.y * R * 0.9;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      const xe = c.stars[20]!;
      const xx = cx - R * 0.45 + xe.x * R * 0.9;
      const xy = cy - R * 0.45 + xe.y * R * 0.9;
      const pulse = 1 + 0.2 * Math.sin(t * 3);
      ctx.strokeStyle = '#FF3D8A';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(xx, xy, 9 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(xx - 5, xy - 5);
      ctx.lineTo(xx + 5, xy + 5);
      ctx.moveTo(xx + 5, xy - 5);
      ctx.lineTo(xx - 5, xy + 5);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Every recorded motif key must have a painter — the coverage oath. */
export const MOTIF_KEYS = [
  'ash dunes', 'reef lanes', 'trial rings', 'mask garden', 'star mural',
  'crown forge', 'lantern cliffs', 'whirlpool rings', 'parley cove',
  'living chart', 'volcanic isle',
];
