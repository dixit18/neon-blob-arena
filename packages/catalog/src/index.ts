// packages/catalog — game manifests. `?game=x&room=y` must be executable
// from the manifest alone, without inspecting game code.
export type Mood = 'BEAT' | 'CHAOS' | 'THINK' | 'SURPRISE';
export type ShareKind = 'ResultGrid' | 'GhostChallenge' | 'ReplayMoment' | 'PartyFingerprint' | 'DailyGrid';
export type JoinMode = 'instant' | 'party';
export type DeviceTier = 'base' | 'enhanced';
export type BotPolicy = 'vote' | 'react' | 'ghost' | 'solo' | 'place' | 'aim';

export interface GameManifest {
  id: string;
  verb: string;
  hook: string;
  moods: Mood[];
  minPlayers: number;
  maxPlayers: number;
  joinMode: JoinMode;
  deviceTier: DeviceTier;
  locales: string[];
  clientChunk: string;
  shareKind: ShareKind;
  botPolicy: BotPolicy;
}

const MOODS: Mood[] = ['BEAT', 'CHAOS', 'THINK', 'SURPRISE'];
const SHARES: ShareKind[] = ['ResultGrid', 'GhostChallenge', 'ReplayMoment', 'PartyFingerprint', 'DailyGrid'];
const BOTS: BotPolicy[] = ['vote', 'react', 'ghost', 'solo', 'place', 'aim'];

export const GAMES: GameManifest[] = [
  { id: 'reflex-riot', verb: 'REACT', hook: 'Every few seconds the screen invents a new rule.', moods: ['CHAOS', 'BEAT'], minPlayers: 1, maxPlayers: 15, joinMode: 'instant', deviceTier: 'base', locales: ['en'], clientChunk: 'reflex-riot', shareKind: 'ReplayMoment', botPolicy: 'react' },
  { id: 'read-the-room', verb: 'PREDICT', hook: 'Predict your friends better than they predict you.', moods: ['THINK', 'CHAOS'], minPlayers: 3, maxPlayers: 15, joinMode: 'party', deviceTier: 'base', locales: ['en'], clientChunk: 'read-the-room', shareKind: 'PartyFingerprint', botPolicy: 'vote' },
  { id: 'ghostline', verb: 'FLICK', hook: 'Beat a friend\u2019s translucent recorded run.', moods: ['BEAT', 'SURPRISE'], minPlayers: 1, maxPlayers: 8, joinMode: 'instant', deviceTier: 'base', locales: ['en'], clientChunk: 'ghostline', shareKind: 'GhostChallenge', botPolicy: 'ghost' },
  { id: 'signal-seven', verb: 'DEDUCE', hook: 'Seven clues, one hidden symbol — today\u2019s mystery.', moods: ['THINK', 'SURPRISE'], minPlayers: 1, maxPlayers: 8, joinMode: 'instant', deviceTier: 'base', locales: ['en'], clientChunk: 'signal-seven', shareKind: 'DailyGrid', botPolicy: 'solo' },
  { id: 'totem-panic', verb: 'DROP', hook: 'Build a tower together that survives three seconds.', moods: ['CHAOS', 'SURPRISE'], minPlayers: 2, maxPlayers: 10, joinMode: 'party', deviceTier: 'base', locales: ['en'], clientChunk: 'totem-panic', shareKind: 'ReplayMoment', botPolicy: 'place' },
  { id: 'ricochet-siege', verb: 'AIM', hook: 'All shots fire at once — the map becomes pinball.', moods: ['BEAT', 'CHAOS'], minPlayers: 2, maxPlayers: 8, joinMode: 'party', deviceTier: 'enhanced', locales: ['en'], clientChunk: 'ricochet-siege', shareKind: 'ReplayMoment', botPolicy: 'aim' },
  { id: 'doodle-duel', verb: 'DRAW', hook: 'Draw it live, friends pick the title. No chat, just guts.', moods: ['CHAOS', 'SURPRISE'], minPlayers: 2, maxPlayers: 10, joinMode: 'party', deviceTier: 'base', locales: ['en'], clientChunk: 'doodle-duel', shareKind: 'ReplayMoment', botPolicy: 'vote' },
];

export function getGame(id: string): GameManifest | null {
  return GAMES.find(g => g.id === id) ?? null;
}

export function validateManifest(m: unknown): string[] {
  const errs: string[] = [];
  if (typeof m !== 'object' || m === null) return ['not an object'];
  const g = m as Record<string, unknown>;
  if (typeof g.id !== 'string' || g.id.length < 2) errs.push('id');
  if (typeof g.verb !== 'string' || g.verb.length === 0) errs.push('verb');
  if (typeof g.hook !== 'string' || g.hook.length === 0) errs.push('hook');
  if (!Array.isArray(g.moods) || g.moods.length === 0 || !(g.moods as unknown[]).every(x => MOODS.includes(x as Mood))) errs.push('moods');
  if (!Number.isInteger(g.minPlayers) || !Number.isInteger(g.maxPlayers) || (g.minPlayers as number) < 1 || (g.maxPlayers as number) < (g.minPlayers as number) || (g.maxPlayers as number) > 15) errs.push('players');
  if (g.joinMode !== 'instant' && g.joinMode !== 'party') errs.push('joinMode');
  if (g.deviceTier !== 'base' && g.deviceTier !== 'enhanced') errs.push('deviceTier');
  if (!Array.isArray(g.locales) || (g.locales as unknown[]).length === 0) errs.push('locales');
  if (typeof g.clientChunk !== 'string' || g.clientChunk.length === 0) errs.push('clientChunk');
  if (!SHARES.includes(g.shareKind as ShareKind)) errs.push('shareKind');
  if (!BOTS.includes(g.botPolicy as BotPolicy)) errs.push('botPolicy');
  return errs;
}
