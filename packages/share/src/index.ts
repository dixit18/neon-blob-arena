// packages/share — ShareArtifact is a typed object, never a button.
// Each kind carries everything needed to render + re-enter play.
export type ShareKind = 'ResultGrid' | 'GhostChallenge' | 'ReplayMoment' | 'PartyFingerprint' | 'DailyGrid';

export interface ShareArtifact {
  kind: ShareKind;
  game: string;
  room?: string;
  title: string;
  /** Playable re-entry URL (challenge/room/rift). Never a bare homepage link. */
  url: string;
  /** Compact replay payload (seed, grid, trail). GhostChallenge runs ≤20KB. */
  data: Record<string, unknown>;
}

export function buildGameUrl(origin: string, game: string, room?: string, extra?: Record<string, string>): string {
  const q = new URLSearchParams({ game });
  if (room) q.set('room', room);
  for (const [k, v] of Object.entries(extra ?? {})) q.set(k, v);
  return `${origin.replace(/\/$/, '')}/?${q.toString()}`;
}

export function buildRiftUrl(origin: string, seed: string): string {
  return `${origin.replace(/\/$/, '')}/?rift=${encodeURIComponent(seed)}`;
}

const MAX_GHOST_BYTES = 20 * 1024;

export function assertArtifact(a: unknown): string[] {
  const errs: string[] = [];
  if (typeof a !== 'object' || a === null) return ['not an object'];
  const v = a as Record<string, unknown>;
  const kinds: ShareKind[] = ['ResultGrid', 'GhostChallenge', 'ReplayMoment', 'PartyFingerprint', 'DailyGrid'];
  if (!kinds.includes(v.kind as ShareKind)) errs.push('kind');
  if (typeof v.game !== 'string' || (v.game as string).length < 2) errs.push('game');
  if (typeof v.title !== 'string' || (v.title as string).length === 0) errs.push('title');
  if (typeof v.url !== 'string' || !(v.url as string).includes('?')) errs.push('url');
  if (typeof v.data !== 'object' || v.data === null) errs.push('data');
  if (v.kind === 'DailyGrid' && JSON.stringify(v.data).includes((v as { solution?: string }).solution ?? '\u0000none\u0000')) errs.push('daily-leaks-solution');
  if (v.kind === 'GhostChallenge' && new TextEncoder().encode(JSON.stringify(v.data)).length > MAX_GHOST_BYTES) errs.push('ghost-too-big');
  return errs;
}
