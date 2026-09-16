// apps/web/src/three-lazy.ts — budget-safe 3D upgrade path.
// RULE: the shell and every game client must be playable WITHOUT this file
// ever loading. Threepipe (https://threepipe.org) and three.js load ONLY on
// the player's explicit "3D" tap, from CDN, at runtime — zero bytes in the
// shell bundle, zero bytes in the base game chunk, zero build dependency.
// If the CDN is unreachable (offline / blocked), the caller keeps Canvas2D.
const THREEPIPE_URLS = [
  'https://cdn.jsdelivr.net/npm/threepipe/dist/index.js',
];
const THREE_URLS = [
  'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js',
];

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
  | { kind: 'threepipe'; api: unknown; url: string }
  | { kind: 'three'; api: unknown; url: string };

/** Threepipe first (toolkit: renderer + tone mapping + plugins), three.js fallback. Null = stay 2D. */
export async function loadThree(): Promise<ThreeKit | null> {
  const pipe = await tryImport(THREEPIPE_URLS);
  if (pipe) return { kind: 'threepipe', api: pipe.mod, url: pipe.url };
  const three = await tryImport(THREE_URLS);
  if (three) return { kind: 'three', api: three.mod, url: three.url };
  return null;
}
