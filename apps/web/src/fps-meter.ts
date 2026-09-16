// apps/web/src/fps-meter.ts — client perf truth (QA budgets, D3 telemetry).
//
// WHAT: rolling fps + p95 frame-ms, a HUD pill, and a lossy 15s beacon to
// POST /perf carrying {game,fps,p95,mode,caps}. Caps (browser family, webgl2/
// webgl, wasm, dpr) ride along so EVERY real browser reports its numbers —
// that is the cross-browser matrix: evidence, not device ownership.
//
// RULES: zero per-frame allocation (ring buffer + reused snapshot object),
// rAF-driven (hidden tabs pause themselves), any failure is silent (telemetry
// never blocks play). Core is clock-injectable → headless-tested.

export interface FpsSnapshot { fps: number; p95: number; frames: number }

export interface BrowserCaps {
  fam: 'edge' | 'chrome' | 'firefox' | 'safari' | 'other';
  webgl2: boolean;
  webgl: boolean;
  wasm: boolean;
  dpr: number;
}

/** Pure rolling tracker: push dtMs per frame, snapshot any time. */
export function createFpsTracker(size = 90): {
  push(dtMs: number): void;
  snapshot(out?: FpsSnapshot): FpsSnapshot;
} {
  const ring = new Float64Array(Math.max(8, size));
  let head = 0;
  let count = 0;
  return {
    push(dtMs: number): void {
      if (!Number.isFinite(dtMs) || dtMs <= 0 || dtMs > 250) return; // gaps aren't frames
      ring[head] = dtMs;
      head = (head + 1) % ring.length;
      if (count < ring.length) count++;
    },
    snapshot(out: FpsSnapshot = { fps: 0, p95: 0, frames: 0 }): FpsSnapshot {
      if (count === 0) { out.fps = 0; out.p95 = 0; out.frames = 0; return out; }
      let sum = 0;
      for (let i = 0; i < count; i++) sum += ring[i]!;
      const avg = sum / count;
      out.fps = avg > 0 ? Math.round(1000 / avg) : 0;
      // p95 over a snapshot-lifetime copy (1 per report, never per frame).
      const sorted = Array.from(ring.subarray(0, count)).sort((a, b) => a - b);
      out.p95 = Math.round(sorted[Math.min(count - 1, Math.floor(count * 0.95))]! * 10) / 10;
      out.frames = count;
      return out;
    },
  };
}

/** Best-effort capability probe on a throwaway canvas. Never throws. */
export function browserCaps(): BrowserCaps {
  let fam: BrowserCaps['fam'] = 'other';
  try {
    const ua = navigator.userAgent || '';
    if (/Edg\//.test(ua)) fam = 'edge';
    else if (/Firefox\//.test(ua)) fam = 'firefox';
    else if (/Chrome\//.test(ua)) fam = 'chrome';
    else if (/Safari\//.test(ua)) fam = 'safari';
  } catch { /* unknown agent: 'other' */ }
  let webgl2 = false;
  let webgl = false;
  try {
    const c = document.createElement('canvas');
    webgl2 = !!(c.getContext('webgl2') ?? null);
    if (!webgl2) webgl = !!((c.getContext('webgl') ?? c.getContext('experimental-webgl')) ?? null);
    else webgl = true;
  } catch { /* no canvas 3D */ }
  let wasm = false;
  try { wasm = typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function'; } catch { /* no */ }
  let dpr = 1;
  try { dpr = Math.min(4, window.devicePixelRatio || 1); } catch { /* 1 */ }
  return { fam, webgl2, webgl, wasm, dpr };
}

export interface MeterOpts {
  game: string;
  server: string; // ws base; beacon derives the http origin
  mode: () => string; // '2d' | '3d-threepipe' | '3d-three' — live value
}

/**
 * Attach to a HUD pill: rAF loop updates `60fps · p95 8ms` ~2Hz, beacons
 * /perf every 15s. Returns stop(). All errors swallowed by design.
 */
export function attachMeter(pill: HTMLElement, opts: MeterOpts): { stop: () => void; snapshot: () => FpsSnapshot } {
  const tracker = createFpsTracker(90);
  const snap: FpsSnapshot = { fps: 0, p95: 0, frames: 0 };
  const caps = browserCaps();
  const httpBase = opts.server.replace(/^ws/, 'http');
  let dead = false;
  let raf = 0;
  let last = -1;
  let frames = 0;
  let lastBeacon = 0;
  const snapshot = (): FpsSnapshot => tracker.snapshot(snap);
  function beacon(now: number): void {
    if (now - lastBeacon < 15_000) return;
    lastBeacon = now;
    try {
      const s = snapshot();
      const body = JSON.stringify({
        game: opts.game.slice(0, 32), fps: s.fps, p95: s.p95,
        mode: opts.mode().slice(0, 16), caps,
      });
      if (body.length > 1024) return;
      void fetch(`${httpBase}/perf`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body, keepalive: true,
      }).catch(() => {});
    } catch { /* telemetry never blocks play */ }
  }
  function frame(now: number): void {
    if (dead) return;
    raf = requestAnimationFrame(frame);
    try {
      if (last >= 0) tracker.push(now - last);
      last = now;
      if (++frames % 30 === 0) {
        const s = snapshot();
        pill.textContent = `${s.fps}fps · p95 ${s.p95}ms`;
        pill.style.color = s.fps >= 55 ? '#C6F135' : s.fps >= 45 ? '#FFD93D' : '#FF5D5D';
      }
      beacon(now);
    } catch { /* meter never breaks the game */ }
  }
  try { raf = requestAnimationFrame(frame); } catch { /* headless */ }
  return {
    stop: () => { dead = true; try { cancelAnimationFrame(raf); } catch { /* gone */ } },
    snapshot,
  };
}
