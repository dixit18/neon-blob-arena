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
  // ART-3 color scripts (cited: color follows feeling — Romano/Eggleston).
  // The eye lives in sky0: luminous eras go BRIGHT there, dread stays dark
  // for contrast. Accents stand apart from their OWN sky (silhouette logic).
  // CINDER: ash-dawn grey → steel-morning glare → blood-night dread →
  // candle blaze → indigo mystery → ember climax.
  chapters: [
    { name: 'ASHFALL OVER THE SIX COURTS', sub: 'The sky burned nine days. The courts count the cost in embers.', game: 'blaze-squad', sky0: '#4A4238', sky1: '#6E5C44', accent: '#E4DED2', biome: 1, motif: 'ash dunes' },
    { name: "THE HERALD'S RUN", sub: 'Six riders, one warning. The roads are lanes and mercy ran out.', game: 'nitro-rift', sky0: '#3D6078', sky1: '#8FB4C8', accent: '#0B2E3B', biome: 3, motif: 'reef lanes' },
    { name: "THE ASSASSIN'S TEST", sub: 'The queen hires killers the way others hire cooks: fast, and often.', game: 'reflex-riot', sky0: '#120608', sky1: '#4A0E18', accent: '#E63946', biome: 0, motif: 'trial rings' },
    { name: 'THE MASK BALL', sub: 'Everyone smiles. Someone lies. Read the room or lose your head.', game: 'read-the-room', sky0: '#4A2E12', sky1: '#A06A2E', accent: '#FFC46B', biome: 2, motif: 'mask garden' },
    { name: 'THE PAINTED PROPHECY', sub: 'A mural appeared overnight — and everyone sees themselves in it.', game: 'doodle-duel', sky0: '#1A1A5C', sky1: '#3A3AA8', accent: '#B4BEFF', biome: 5, motif: 'star mural' },
    { name: 'THE GAME OF CROWNS', sub: 'Four heirs. One cup of fate. But the ash is falling upward now…', game: 'ludo-clash', sky0: '#40200C', sky1: '#A85E1E', accent: '#FFB52E', biome: 4, motif: 'crown forge' },
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
  // SALT: murky debt → lagoon-noon glare → slate dread → lantern warmth →
  // ink mystery → abyssal starlight.
  chapters: [
    { name: 'THE DEBT OF TIDES', sub: 'The sea took their captain. It left a bill.', game: 'blaze-squad', sky0: '#16302A', sky1: '#3A6A5C', accent: '#C8F2D8', biome: 4, motif: 'lantern cliffs' },
    { name: "THE SMUGGLER'S LANES", sub: 'Four currents through the reef. The fastest boat eats.', game: 'nitro-rift', sky0: '#2A7A8E', sky1: '#7AD4DE', accent: '#08333C', biome: 3, motif: 'reef lanes' },
    { name: 'STORM DRILLS', sub: "First mate's rule: react before the wave finishes thinking.", game: 'reflex-riot', sky0: '#1C222E', sky1: '#4A5878', accent: '#C8D4F2', biome: 0, motif: 'whirlpool rings' },
    { name: 'THE PARLEY', sub: 'Pirates vote. The wrong read walks the plank.', game: 'read-the-room', sky0: '#40260E', sky1: '#96622A', accent: '#FF9E4A', biome: 2, motif: 'parley cove' },
    { name: 'THE MAP ROOM', sub: 'The chart redraws itself nightly. Someone aboard helps it.', game: 'doodle-duel', sky0: '#221A3E', sky1: '#4A3E8E', accent: '#E8D88A', biome: 5, motif: 'living chart' },
    { name: 'THE DROWNED STAR', sub: 'Whoever raises the star names the sea — and it just opened its eyes…', game: 'ludo-clash', sky0: '#0A2A44', sky1: '#1E6A9E', accent: '#B8F2FF', biome: 4, motif: 'volcanic isle' },
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
