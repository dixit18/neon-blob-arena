// apps/web/src/sagas.ts — SG-1 story zoom. Two original serial sagas; every
// zoom band is a chapter (title + one beat + game portal). Chapters keep the
// World shape so both renderers (2D descent + 3D dive) consume them unchanged;
// `biome` points each chapter at the existing art builder it reuses until
// LZ-2 paints true motifs. Beats fit one canvas line (MAX_BEAT).
import type { World } from './descent.js';

export interface Chapter extends World {
  /** Existing art builder index this chapter reuses (0..5). */
  biome: number;
  /** LZ-2 motif key (e.g. 'ash dunes') — recorded now, painted then. */
  motif: string;
}

export interface Saga {
  id: string;
  name: string;
  sub: string;
  chapters: Chapter[];
  /** LZ-3 cliffhanger: fires when the reader finishes chapter 6. */
  finale: { title: string; teaser: string };
}

export const MAX_BEAT = 90;

const CINDER: Saga = {
  id: 'cinder-throne',
  name: 'THE CINDER THRONE',
  sub: 'Six courts. One empty throne. Zoom to turn the page.',
  finale: {
    title: 'THE ASH IS FALLING UPWARD NOW…',
    teaser: 'The Game of Crowns has a seventh player — and it just moved. Season 2 is being written. Challenge a friend to read it first.',
  },
  chapters: [
    { name: 'ASHFALL OVER THE SIX COURTS', sub: 'The sky burned nine days. The courts count the cost in embers.', game: 'blaze-squad', sky0: '#141114', sky1: '#3A2A33', accent: '#FF7A1A', biome: 1, motif: 'ash dunes' },
    { name: "THE HERALD'S RUN", sub: 'Six riders, one warning. The roads are lanes and mercy ran out.', game: 'nitro-rift', sky0: '#0A1420', sky1: '#1E3A4A', accent: '#46E0D4', biome: 3, motif: 'reef lanes' },
    { name: "THE ASSASSIN'S TEST", sub: 'The queen hires killers the way others hire cooks: fast, and often.', game: 'reflex-riot', sky0: '#0B0B16', sky1: '#2A0F2E', accent: '#FF3D8A', biome: 0, motif: 'trial rings' },
    { name: 'THE MASK BALL', sub: 'Everyone smiles. Someone lies. Read the room or lose your head.', game: 'read-the-room', sky0: '#101014', sky1: '#2E2340', accent: '#FFE9A8', biome: 2, motif: 'mask garden' },
    { name: 'THE PAINTED PROPHECY', sub: 'A mural appeared overnight — and everyone sees themselves in it.', game: 'doodle-duel', sky0: '#050510', sky1: '#1A1A3E', accent: '#7A5CFF', biome: 5, motif: 'star mural' },
    { name: 'THE GAME OF CROWNS', sub: 'Four heirs. One cup of fate. But the ash is falling upward now…', game: 'ludo-clash', sky0: '#160B08', sky1: '#3A1C08', accent: '#FFD93D', biome: 4, motif: 'crown forge' },
  ],
};

const SALT: Saga = {
  id: 'salt-starlight',
  name: 'SALT & STARLIGHT',
  sub: 'A debt-owed crew. A drowned star. Zoom to sail on.',
  finale: {
    title: 'SOMETHING DOWN THERE JUST OPENED ITS EYES…',
    teaser: 'The Drowned Star knows your name now. Season 2 is being charted. Challenge a friend to sail it first.',
  },
  chapters: [
    { name: 'THE DEBT OF TIDES', sub: 'The sea took their captain. It left a bill.', game: 'blaze-squad', sky0: '#0A0F14', sky1: '#2E2A33', accent: '#FF7A1A', biome: 4, motif: 'lantern cliffs' },
    { name: "THE SMUGGLER'S LANES", sub: 'Four currents through the reef. The fastest boat eats.', game: 'nitro-rift', sky0: '#031018', sky1: '#0A2E3A', accent: '#46E0D4', biome: 3, motif: 'reef lanes' },
    { name: 'STORM DRILLS', sub: "First mate's rule: react before the wave finishes thinking.", game: 'reflex-riot', sky0: '#080B18', sky1: '#1E2A4A', accent: '#9BF2EA', biome: 0, motif: 'whirlpool rings' },
    { name: 'THE PARLEY', sub: 'Pirates vote. The wrong read walks the plank.', game: 'read-the-room', sky0: '#0C0C18', sky1: '#2A2440', accent: '#FFE9A8', biome: 2, motif: 'parley cove' },
    { name: 'THE MAP ROOM', sub: 'The chart redraws itself nightly. Someone aboard helps it.', game: 'doodle-duel', sky0: '#050514', sky1: '#161638', accent: '#7A5CFF', biome: 5, motif: 'living chart' },
    { name: 'THE DROWNED STAR', sub: 'Whoever raises the star names the sea — and it just opened its eyes…', game: 'ludo-clash', sky0: '#020A12', sky1: '#0E2E4A', accent: '#FFD93D', biome: 4, motif: 'volcanic isle' },
  ],
};

export const SAGAS: Saga[] = [CINDER, SALT];

/** Clamped saga lookup — a bad ?saga= never breaks the landing. */
export function sagaAt(i: number): Saga {
  if (!Number.isInteger(i) || i < 0 || i >= SAGAS.length) return SAGAS[0]!;
  return SAGAS[i]!;
}

/** Clamped saga index — single source for links (?saga= roundtrips). */
export function sagaIndex(i: number): number {
  return SAGAS.indexOf(sagaAt(i));
}

/** Chapters in dive order (World-compatible — depth index = chapter). */
export function chaptersOf(i: number): Chapter[] {
  return sagaAt(i).chapters;
}

/** Deep link into a chapter: `/?saga=N&ch=M` boots the dive at that page. */
export function buildChapterUrl(origin: string, saga: number, ch: number): string {
  const s = sagaAt(saga);
  const idx = SAGAS.indexOf(s);
  const c = Math.min(5, Math.max(0, Math.floor(ch)));
  return `${origin.replace(/\/$/, '')}/?saga=${idx}&ch=${c}`;
}
