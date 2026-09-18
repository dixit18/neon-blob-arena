// games/doodle-duel/sim — Doodle Duel engine (DD-1).
// Draw-guess relay with NO open chat (Rule 4): the drawer draws live via
// strokeBatch, guessers pick 1-of-4 titles via answer. Bots guess, never
// draw (D10 verdict). Pure deterministic sim like riot: ms clock, seeded
// options, headless-testable.
import { buildGameUrl, type ShareArtifact } from '../../packages/share/src/index.js';
export type DoodlePhase = 'lobby' | 'draw' | 'reveal' | 'final';

export interface Stroke { id: number; pts: { x: number; y: number }[]; done: boolean }
/** Wire form: points packed as fixed-width base-36 pairs (2 chars/pt, exact).
 * A maxed-out drawing (16 strokes × 32 pts) rides ~2.3KB, not ~7KB. */
export interface PackedStroke { id: number; d: string; done: boolean }

const B36 = (n: number): string => n.toString(36).padStart(2, '0');
export function packStrokes(strokes: Stroke[]): PackedStroke[] {
  return strokes.map((s) => ({
    id: s.id,
    d: s.pts.map((p) => B36(p.x) + B36(p.y)).join(''),
    done: s.done,
  }));
}
export function unpackStrokes(packed: PackedStroke[]): Stroke[] {
  return packed.map((s) => {
    const pts: { x: number; y: number }[] = [];
    for (let k = 0; k + 3 < s.d.length + 1; k += 4) {
      pts.push({ x: parseInt(s.d.slice(k, k + 2), 36), y: parseInt(s.d.slice(k + 2, k + 4), 36) });
    }
    return { id: s.id, pts, done: s.done };
  });
}
export interface DoodlePlayer {
  id: string; name: string; isBot: boolean;
  score: number; best: number; streak: number;
  picked: number; // option index guessed this drawing, -1 = none
  gain: number;
}

export interface DoodleSnapshot {
  t: 'doodle';
  phase: DoodlePhase;
  drawing: {
    n: number; total: number; drawer: string; drawerYou: boolean;
    endsInMs: number; prompt: string | null; options: string[];
    picked: number; strokes: PackedStroke[]; gotIt: number;
  } | null;
  scores: { n: string; s: number; you: boolean; bot: boolean }[];
  feed: string[];
  you: { score: number; streak: number; gain: number };
}

export const DRAW_MS = 40_000;
export const REVEAL_MS = 5000;
export const FINAL_MS = 6000;
export const LOBBY_COUNTDOWN_MS = 1000;
export const DRAWINGS_PER_GAME = 4;
export const MAX_STROKES = 16;
export const MAX_PTS = 32; // per stroke, stride-downsampled
export const GRID = 100; // integer canvas coords 0..100

/** Curated prompt pack. ONLY these can ever be drawn — no UGC at launch. */
export const PROMPTS = [
  'cat', 'rocket', 'pizza', 'tree', 'car', 'fish', 'house', 'sun',
  'bicycle', 'ghost', 'cake', 'dog', 'mountain', 'boat', 'key', 'apple',
  'robot', 'umbrella', 'guitar', 'elephant', 'bridge', 'crown', 'dragon', 'cup',
];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class DoodleSim {
  time = 0;
  phase: DoodlePhase = 'lobby';
  drawingIdx = 0;
  gameNo = 1;
  phaseUntil = 0;
  players = new Map<string, DoodlePlayer>();
  drawerId = '';
  prompt = '';
  options: string[] = [];
  strokes: Stroke[] = [];
  feed: string[] = [];
  private rand: () => number = mulberry32(7);
  private order: string[] = []; // drawer rotation (human ids)

  humanCount(): number { let n = 0; for (const p of this.players.values()) if (!p.isBot) n++; return n; }
  playerCount(): number { return this.players.size; }

  join(id: string, name: string, isBot: boolean): void {
    if (this.players.has(id)) return;
    this.players.set(id, { id, name, isBot, score: 0, best: 0, streak: 0, picked: -1, gain: 0 });
    if (!isBot) this.order.push(id);
    if (!isBot && this.phase === 'lobby' && this.phaseUntil === 0 && this.humanCount() >= 1) {
      this.phaseUntil = this.time + LOBBY_COUNTDOWN_MS;
    }
  }

  leave(id: string): void {
    this.players.delete(id);
    this.order = this.order.filter((x) => x !== id);
    if (id === this.drawerId && this.phase === 'draw') this.endDrawing(true); // drawer bailed: abort
  }

  /** Drawer appends a stroke batch. Only the drawer, only while drawing. */
  stroke(by: string, strokeId: number, pts: { x: number; y: number }[], done: boolean): void {
    if (this.phase !== 'draw' || by !== this.drawerId) return;
    if (!Number.isInteger(strokeId) || strokeId < 0 || !Array.isArray(pts) || pts.length === 0) return;
    const clean = pts
      .filter((p) => Number.isInteger(p.x) && Number.isInteger(p.y))
      .map((p) => ({ x: Math.max(0, Math.min(GRID, p.x)), y: Math.max(0, Math.min(GRID, p.y)) }));
    if (clean.length === 0) return;
    // Stride-downsample so snapshots stay small no matter the device.
    const step = Math.max(1, Math.ceil(clean.length / MAX_PTS));
    const sampled = clean.filter((_, k) => k % step === 0).slice(0, MAX_PTS);
    const ix = this.strokes.findIndex((s) => s.id === strokeId);
    if (ix >= 0) {
      const cur = this.strokes[ix]!;
      cur.pts = [...cur.pts, ...sampled].slice(0, MAX_PTS);
      cur.done = cur.done || done;
    } else {
      if (this.strokes.length >= MAX_STROKES) return; // table full: ignore
      this.strokes.push({ id: strokeId, pts: sampled, done });
    }
  }

  /** Guesser picks a title (0-3). Drawer cannot guess; one pick per drawing. */
  answer(id: string, i: number, at: number = this.time): void {
    const p = this.players.get(id);
    if (!p || this.phase !== 'draw' || id === this.drawerId || p.picked !== -1) return;
    if (!Number.isInteger(i) || i < 0 || i > 3) return;
    p.picked = i;
    if (this.options[i] === this.prompt) {
      const elapsed = at - (this.phaseUntil - DRAW_MS);
      p.gain = Math.max(150, 1000 - Math.round(elapsed / 40)) + p.streak * 50;
      p.streak++;
      const drawer = this.players.get(this.drawerId);
      if (drawer) { drawer.gain += 150; } // drawer eats with every reader
    } else {
      p.streak = 0;
    }
  }

  step(dtMs: number): void {
    this.time += dtMs;
    if (this.phase === 'lobby') {
      if (this.phaseUntil !== 0 && this.time >= this.phaseUntil && this.humanCount() >= 1) this.startDrawing();
    } else if (this.phase === 'draw') {
      if (this.time >= this.phaseUntil) this.endDrawing(false);
    } else if (this.phase === 'reveal') {
      if (this.time >= this.phaseUntil) this.nextAfterReveal();
    } else if (this.phase === 'final') {
      if (this.time >= this.phaseUntil) this.nextGame();
    }
  }

  private pickDrawer(): string {
    // Humans only, round-robin. Bots never hold the pen.
    for (let k = 0; k < this.order.length; k++) {
      const cand = this.order[(this.drawingIdx + k) % Math.max(1, this.order.length)]!;
      if (this.players.has(cand)) return cand;
    }
    return '';
  }

  private startDrawing(): void {
    const drawer = this.pickDrawer();
    if (!drawer) { this.phaseUntil = this.time + LOBBY_COUNTDOWN_MS; return; } // nobody to draw: wait
    this.drawerId = drawer;
    this.prompt = PROMPTS[Math.floor(this.rand() * PROMPTS.length)]!;
    const decoys = new Set<string>();
    while (decoys.size < 3) {
      const w = PROMPTS[Math.floor(this.rand() * PROMPTS.length)]!;
      if (w !== this.prompt) decoys.add(w);
    }
    this.options = [...decoys, this.prompt];
    for (let k = this.options.length - 1; k > 0; k--) {
      const j = Math.floor(this.rand() * (k + 1));
      [this.options[k], this.options[j]] = [this.options[j]!, this.options[k]!];
    }
    this.strokes = [];
    for (const p of this.players.values()) { p.picked = -1; p.gain = 0; }
    this.phase = 'draw';
    this.phaseUntil = this.time + DRAW_MS;
  }

  private endDrawing(aborted: boolean): void {
    for (const p of this.players.values()) {
      if (p.gain > 0) { p.score += p.gain; if (p.score > p.best) p.best = p.score; }
      else if (!p.isBot && p.id !== this.drawerId && p.picked === -1) p.streak = 0; // silent all drawing
    }
    if (!aborted) {
      const got = [...this.players.values()].filter((p) => p.id !== this.drawerId && this.options[p.picked] === this.prompt).length;
      const d = this.players.get(this.drawerId);
      this.pushFeed(got > 0
        ? `🎨 ${d?.name ?? '?'} drew “${this.prompt}” — ${got} got it!`
        : `🎨 “${this.prompt}” stumped everyone.`);
    } else {
      this.pushFeed('🎨 the drawer bailed — next!');
    }
    this.phase = 'reveal';
    this.phaseUntil = this.time + REVEAL_MS;
  }

  private nextAfterReveal(): void {
    this.drawingIdx++;
    if (this.drawingIdx >= DRAWINGS_PER_GAME) {
      let win: DoodlePlayer | null = null;
      for (const p of this.players.values()) if (!win || p.score > win.score) win = p;
      if (win && win.score > 0) this.pushFeed(`🏆 ${win.name} takes the duel with ${win.score}!`);
      else this.pushFeed('duel ends quiet — no scores.');
      this.phase = 'final';
      this.phaseUntil = this.time + FINAL_MS;
    } else {
      this.startDrawing();
    }
  }

  private nextGame(): void {
    this.gameNo++;
    this.drawingIdx = 0;
    this.rand = mulberry32(this.gameNo * 2654435761 + 7);
    for (const p of this.players.values()) { p.score = 0; p.streak = 0; p.gain = 0; p.picked = -1; }
    this.phase = 'lobby';
    this.phaseUntil = this.humanCount() >= 1 ? this.time + LOBBY_COUNTDOWN_MS : 0;
  }

  private pushFeed(s: string): void {
    this.feed.push(s);
    if (this.feed.length > 3) this.feed.splice(0, this.feed.length - 3);
  }

  /** GB-2: ReplayMoment — the drawing + (revealed-only) prompt + top table.
   * Mid-draw shares NEVER carry the prompt: guessers must read the lines,
   * not the link (same gating as the snapshot). */
  moment(room: string, origin: string): ShareArtifact {
    const revealed = this.phase === 'reveal' || this.phase === 'final';
    let win: DoodlePlayer | null = null;
    for (const p of this.players.values()) if (!win || p.score > win.score) win = p;
    const title = this.phase === 'final' && win && win.score > 0
      ? `🏆 ${win.name} takes the duel with ${win.score}!`
      : revealed
        ? `🎨 “${this.prompt}” — could you read it?`
        : `🎨 ${this.players.get(this.drawerId)?.name ?? '?'} is drawing — guess the title!`;
    return {
      kind: 'ReplayMoment',
      game: 'doodle-duel',
      room,
      title,
      url: buildGameUrl(origin, 'doodle-duel', room),
      data: {
        drawing: Math.min(this.drawingIdx + 1, DRAWINGS_PER_GAME),
        drawer: this.players.get(this.drawerId)?.name ?? null,
        strokes: packStrokes(this.strokes),
        prompt: revealed ? this.prompt : null,
        top: [...this.players.values()]
          .sort((a, b) => b.score - a.score).slice(0, 3)
          .map((p) => ({ n: p.name, s: p.score })),
      },
    };
  }

  snapshot(pid: string): DoodleSnapshot {
    const me = this.players.get(pid);
    const isDrawer = pid === this.drawerId;
    const scores = [...this.players.values()]
      .sort((a, b) => b.score - a.score).slice(0, 10)
      .map((p) => ({ n: p.name, s: p.score, you: p.id === pid, bot: p.isBot }));
    return {
      t: 'doodle',
      phase: this.phase,
      drawing: this.phase === 'draw' || this.phase === 'reveal' ? {
        n: Math.min(this.drawingIdx + 1, DRAWINGS_PER_GAME),
        total: DRAWINGS_PER_GAME,
        drawer: this.players.get(this.drawerId)?.name ?? '?',
        drawerYou: isDrawer,
        endsInMs: this.phase === 'draw' ? Math.max(0, this.phaseUntil - this.time) : 0,
        prompt: isDrawer || this.phase === 'reveal' ? this.prompt : null, // guessers never see it early
        options: this.phase === 'draw' && !isDrawer ? this.options : [],
        picked: me?.picked ?? -1,
        strokes: packStrokes(this.strokes),
        gotIt: this.players.size === 0 ? 0 :
          [...this.players.values()].filter((p) => p.id !== this.drawerId && this.options[p.picked] === this.prompt).length,
      } : null,
      scores,
      feed: [...this.feed],
      you: { score: me?.score ?? 0, streak: me?.streak ?? 0, gain: me?.gain ?? 0 },
    };
  }
}
