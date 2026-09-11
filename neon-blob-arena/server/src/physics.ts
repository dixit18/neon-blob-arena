// Deterministic circle physics — mirrored on client for prediction only.
// Server copy is authoritative.
import { TUNE, massToRadius } from './types.js';

export interface Body { x: number; y: number; vx: number; vy: number; mass: number; r: number }

export function integrate(b: Body, dt: number) {
  const damp = Math.exp(-TUNE.FRICTION * dt);
  b.vx *= damp;
  b.vy *= damp;
  // substep if very fast (dash) to avoid tunneling through small blobs
  const speed = Math.hypot(b.vx, b.vy);
  const steps = speed > 800 ? 2 : 1;
  const sdt = dt / steps;
  for (let i = 0; i < steps; i++) {
    b.x += b.vx * sdt;
    b.y += b.vy * sdt;
  }
  const W = TUNE.WORLD;
  // wall clamp + bounce (restitution 0.7)
  if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.7; }
  if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx) * 0.7; }
  if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy) * 0.7; }
  if (b.y > W - b.r) { b.y = W - b.r; b.vy = -Math.abs(b.vy) * 0.7; }
  // hard speed cap (anti-cheat + stability)
  const sp = Math.hypot(b.vx, b.vy);
  if (sp > TUNE.MAX_SPEED_CAP) {
    b.vx = (b.vx / sp) * TUNE.MAX_SPEED_CAP;
    b.vy = (b.vy / sp) * TUNE.MAX_SPEED_CAP;
  }
  b.r = massToRadius(b.mass);
}

// Elastic circle-circle separation with knockback impulse.
// Returns true if overlap was resolved.
export function resolveCollision(a: Body, b: Body): boolean {
  const dx = b.x - a.x, dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 0.001;
  const minDist = a.r + b.r;
  if (dist >= minDist) return false;
  const nx = dx / dist, ny = dy / dist;
  const overlap = minDist - dist;
  const total = a.mass + b.mass;
  // positional correction split by inverse mass (lighter moves more)
  a.x -= nx * overlap * (b.mass / total) * 0.9;
  a.y -= ny * overlap * (b.mass / total) * 0.9;
  b.x += nx * overlap * (a.mass / total) * 0.9;
  b.y += ny * overlap * (a.mass / total) * 0.9;
  // impulse: relative velocity along normal, restitution 0.55 + knockback bonus
  const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
  const velAlong = rvx * nx + rvy * ny;
  if (velAlong < 0) {
    const e = 0.55;
    const j = -(1 + e) * velAlong / (1 / a.mass + 1 / b.mass);
    const ix = j * nx, iy = j * ny;
    a.vx -= ix / a.mass; a.vy -= iy / a.mass;
    b.vx += ix / b.mass; b.vy += iy / b.mass;
    // extra shove so hits feel punchy (scales with overlap depth)
    const shove = 120 + Math.min(500, overlap * 22);
    a.vx -= nx * shove * (b.mass / total);
    a.vy -= ny * shove * (b.mass / total);
    b.vx += nx * shove * (a.mass / total);
    b.vy += ny * shove * (a.mass / total);
  }
  return true;
}
