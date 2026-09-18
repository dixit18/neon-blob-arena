// apps/web/src/journey.ts — DDV-2: the zoom finally has a goal.
// Seals: one per chapter, earned by FACING it (depth reached, not taps).
// Stored per saga, restored across visits — the reason to go deep and to
// come back. Pure + headless-tested; main.ts owns the localStorage shell.
export const CHAPTERS = 6;

export type SealStore = Record<string, number>; // `saga{N}` → max chapter faced

export function sealKey(saga: number): string {
  return `saga${saga}`;
}

/** Record facing chapter ch of saga. Unknown chapters never poison the row. */
export function recordVisit(store: SealStore, saga: number, ch: number): SealStore {
  if (!Number.isInteger(ch) || ch < 0 || ch >= CHAPTERS) return store;
  if (!Number.isInteger(saga) || saga < 0) return store;
  const k = sealKey(saga);
  const next: SealStore = { ...store };
  next[k] = Math.max(next[k] ?? -1, ch);
  return next;
}

/** Six seals, sealed up to the deepest chapter faced. */
export function sealsOf(store: SealStore, saga: number): boolean[] {
  const max = store[sealKey(saga)] ?? -1;
  return Array.from({ length: CHAPTERS }, (_, i) => i <= max);
}

export function sealedCount(store: SealStore, saga: number): number {
  return sealsOf(store, saga).filter(Boolean).length;
}

/** Parse a stored row — garbage in, empty row out (never a crash). */
export function loadSeals(raw: string | null): SealStore {
  if (!raw) return {};
  try {
    const p = JSON.parse(raw) as unknown;
    if (typeof p !== 'object' || p === null) return {};
    const out: SealStore = {};
    for (const [k, v] of Object.entries(p)) {
      if (/^saga\d+$/.test(k) && Number.isInteger(v) && (v as number) >= 0 && (v as number) < CHAPTERS) {
        out[k] = v as number;
      }
    }
    return out;
  } catch {
    return {};
  }
}
