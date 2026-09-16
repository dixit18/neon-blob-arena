// apps/web/src/three-lazy.ts — budget-safe 3D upgrade path.
// RULE: the shell and every game client must be playable WITHOUT this file
// ever loading. Threepipe (https://threepipe.org) and three.js load ONLY on
// the player's explicit "3D" tap, from CDN, at runtime — zero bytes in the
// shell bundle, zero bytes in the base game chunk, zero build dependency.
// If the CDN is unreachable (offline / blocked), the caller keeps Canvas2D.
// BZ-3 pins exact versions (verified against the registry 2026-09-16):
// threepipe 0.5.1 ESM is dist/index.mjs, but it carries bare `three` imports,
// so browsers load it via jsdelivr +esm (deps pre-bundled). three 0.160.0's
// build/three.module.js is self-contained and imports directly.
const THREEPIPE_URLS = [
  'https://cdn.jsdelivr.net/npm/threepipe@0.5.1/+esm',
];
export const THREEPIPE_VERSION = '0.5.1';
const THREE_URLS = [
  'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js',
];
const THREE_VERSION = '0.160.0';

/** Pinned raw-three ESM for bespoke scenes (dive). Pre-bundled, no deps. */
export const THREE_PIN = THREE_URLS[0]!;

async function tryImport(urls: string[]): Promise<{ mod: unknown; url: string } | null> {
  for (const url of urls) {
    try {
      const mod = await import(/* @vite-ignore */ url);
      return { mod, url };
    } catch { /* next candidate, 2D stays */ }
  }
  return null;
}

export type ThreeKit =
  | { kind: 'threepipe'; api: unknown; url: string; version: string }
  | { kind: 'three'; api: unknown; url: string; version: string };

/** Threepipe first (toolkit: renderer + tone mapping + plugins), three.js fallback. Null = stay 2D. */
export async function loadThree(): Promise<ThreeKit | null> {
  const pipe = await tryImport(THREEPIPE_URLS);
  if (pipe) return { kind: 'threepipe', api: pipe.mod, url: pipe.url, version: THREEPIPE_VERSION };
  const three = await tryImport(THREE_URLS);
  if (three) return { kind: 'three', api: three.mod, url: three.url, version: THREE_VERSION };
  return null;
}
