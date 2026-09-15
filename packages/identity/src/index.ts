// packages/identity — guest IDs + generated names + custom-name filter.
// Guests never type before joining: opaque ID persists locally, display name
// defaults to a safe combination and is editable in one tap.
// NOTE: browser-safe (globalThis.crypto) — imported by apps/web directly.
export function genGuestId(): string { return globalThis.crypto.randomUUID(); }

const ADJ = ['Neon', 'Cosmic', 'Pickled', 'Thunder', 'Sleepy', 'Turbo', 'Mellow', 'Electric', 'Brave', 'Sneaky', 'Golden', 'Frozen', 'Peppy', 'Quiet', 'Lucky', 'Dizzy', 'Clever', 'Jolly', 'Swift', 'Misty', 'Bold', 'Calm', 'Zesty', 'Fuzzy'];
const ANIMAL = ['Otter', 'Blob', 'Fox', 'Penguin', 'Tiger', 'Mochi', 'Raven', 'Crab', 'Falcon', 'Badger', 'Koala', 'Newt', 'Panda', 'Quokka', 'Rabbit', 'Sloth', 'Toad', 'Urchin', 'Vole', 'Wombat', 'Yak', 'Zebra', 'Gecko', 'Heron'];

const BLOCKED = ['admin', 'mod', 'owner', 'fuck', 'shit', 'nazi', 'hitler', 'porn', 'sex', 'kill', 'nigger', 'faggot'];

export function genName(rand: () => number = Math.random): string {
  return `${ADJ[Math.floor(rand() * ADJ.length)]} ${ANIMAL[Math.floor(rand() * ANIMAL.length)]}`;
}

export function filterName(raw: unknown): string {
  if (typeof raw !== 'string') return 'Blob';
  const clean = raw.replace(/[^\w \-]/gu, '').trim().slice(0, 14);
  if (clean.length === 0) return 'Blob';
  if (BLOCKED.some(w => clean.toLowerCase().includes(w))) return 'Blob';
  return clean;
}
