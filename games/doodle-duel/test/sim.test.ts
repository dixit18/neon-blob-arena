// games/doodle-duel/test/sim.test.ts — DD-1 acceptance (≥20 checks).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DoodleSim, PROMPTS, DRAWINGS_PER_GAME, MAX_STROKES, MAX_PTS, unpackStrokes,
} from '../sim.js';

const TICK = 50;
function withHumans(n = 2): DoodleSim {
  const s = new DoodleSim();
  for (let i = 0; i < n; i++) s.join(`h${i}`, `P${i}`, false);
  return s;
}
function untilDraw(s: DoodleSim, capMs = 10_000): void {
  let t = 0;
  while (s.phase !== 'draw' && t < capMs) { s.step(TICK); t += TICK; }
  assert.equal(s.phase, 'draw');
}
function endDraw(s: DoodleSim): void {
  let t = 0;
  while (s.phase === 'draw' && t < 60_000) { s.step(TICK); t += TICK; }
  assert.equal(s.phase, 'reveal');
}
function drainReveal(s: DoodleSim): void {
  let t = 0;
  while (s.phase === 'reveal' && t < 15_000) { s.step(TICK); t += TICK; }
}
const line = (n: number) => Array.from({ length: n }, (_, k) => ({ x: k, y: k % 100 }));

describe('doodle sim', () => {
  it('drawing starts within seconds of humans arriving', () => {
    const s = withHumans();
    untilDraw(s, 3000);
    assert.ok(s.drawerId.startsWith('h'));
  });

  it('lobby waits with no humans', () => {
    const s = new DoodleSim();
    s.join('b0', 'Bot 🤖', true);
    for (let i = 0; i < 200; i++) s.step(TICK);
    assert.equal(s.phase, 'lobby');
  });

  it('drawer rotates among humans, bots never draw', () => {
    const s = withHumans(3);
    s.join('b0', 'Bot 🤖', true);
    const drawers = new Set<string>();
    for (let i = 0; i < DRAWINGS_PER_GAME; i++) {
      untilDraw(s);
      drawers.add(s.drawerId);
      assert.ok(!s.players.get(s.drawerId)!.isBot);
      endDraw(s);
      drainReveal(s);
    }
    assert.ok(drawers.size >= 2, `rotation: ${[...drawers]}`);
  });

  it('options carry the prompt + 3 unique decoys', () => {
    const s = withHumans();
    untilDraw(s);
    assert.equal(s.options.length, 4);
    assert.ok(s.options.includes(s.prompt));
    assert.equal(new Set(s.options).size, 4);
  });

  it('prompt hidden from guessers, visible to drawer + reveal', () => {
    const s = withHumans();
    untilDraw(s);
    const drawer = s.drawerId;
    const guesser = drawer === 'h0' ? 'h1' : 'h0';
    assert.equal(s.snapshot(drawer).drawing!.prompt, s.prompt);
    assert.equal(s.snapshot(guesser).drawing!.prompt, null);
    endDraw(s);
    assert.equal(s.snapshot(guesser).drawing!.prompt, s.prompt);
  });

  it('correct guess scores speed + streak; drawer takes a cut', () => {
    const s = withHumans();
    untilDraw(s);
    const drawer = s.drawerId;
    const g = drawer === 'h0' ? 'h1' : 'h0';
    const ix = s.options.indexOf(s.prompt);
    const start = s.phaseUntil - 40_000;
    s.answer(g, ix, start + 2000);
    const gp = s.players.get(g)!;
    assert.equal(gp.gain, 1000 - 50); // 2000ms/40
    assert.equal(gp.streak, 1);
    assert.equal(s.players.get(drawer)!.gain, 150);
  });

  it('wrong pick locks you out and kills streak', () => {
    const s = withHumans();
    untilDraw(s);
    const drawer = s.drawerId;
    const g = drawer === 'h0' ? 'h1' : 'h0';
    s.players.get(g)!.streak = 2;
    const wrong = (s.options.indexOf(s.prompt) + 1) % 4;
    s.answer(g, wrong);
    s.answer(g, s.options.indexOf(s.prompt)); // locked: ignored
    endDraw(s);
    const gp = s.players.get(g)!;
    assert.equal(gp.gain, 0);
    assert.equal(gp.streak, 0);
  });

  it('drawer cannot guess their own drawing', () => {
    const s = withHumans();
    untilDraw(s);
    s.answer(s.drawerId, 0);
    assert.equal(s.players.get(s.drawerId)!.picked, -1);
  });

  it('invalid option indexes are ignored', () => {
    const s = withHumans();
    untilDraw(s);
    const g = s.drawerId === 'h0' ? 'h1' : 'h0';
    s.answer(g, 9);
    s.answer(g, -1);
    assert.equal(s.players.get(g)!.picked, -1);
  });

  it('drawer strokes land; non-drawer strokes ignored', () => {
    const s = withHumans();
    untilDraw(s);
    const g = s.drawerId === 'h0' ? 'h1' : 'h0';
    s.stroke(s.drawerId, 0, line(10), false);
    s.stroke(g, 1, line(10), true); // vandalism: dropped
    assert.equal(s.strokes.length, 1);
    assert.equal(s.strokes[0]!.pts.length, 10);
  });

  it('stroke table caps at 16 per drawing', () => {
    const s = withHumans();
    untilDraw(s);
    for (let i = 0; i < 30; i++) s.stroke(s.drawerId, i, line(5), true);
    assert.equal(s.strokes.length, MAX_STROKES);
  });

  it('long strokes stride-downsample to 32 points', () => {
    const s = withHumans();
    untilDraw(s);
    s.stroke(s.drawerId, 0, line(200), true);
    const pts = s.strokes[0]!.pts;
    assert.ok(pts.length <= MAX_PTS, `${pts.length}`);
    assert.deepEqual(pts[0], { x: 0, y: 0 });
  });

  it('coords clamp to the 100-grid, non-integers dropped', () => {
    const s = withHumans();
    untilDraw(s);
    s.stroke(s.drawerId, 0, [{ x: -5, y: 500 }, { x: 1.5, y: 2 }, { x: 50, y: 50 }], true);
    assert.deepEqual(s.strokes[0]!.pts, [{ x: 0, y: 100 }, { x: 50, y: 50 }]);
  });

  it('same strokeId appends (live drawing), done sticks', () => {
    const s = withHumans();
    untilDraw(s);
    s.stroke(s.drawerId, 3, line(5), false);
    s.stroke(s.drawerId, 3, line(5), true);
    assert.equal(s.strokes.length, 1);
    assert.equal(s.strokes[0]!.pts.length, 10);
    assert.equal(s.strokes[0]!.done, true);
  });

  it('timer expiry ends the drawing, feed names the prompt', () => {
    const s = withHumans();
    untilDraw(s);
    endDraw(s);
    assert.ok(s.feed.some((f) => f.includes(s.prompt)), `feed: ${s.feed}`);
  });

  it('drawer leaving mid-draw aborts to reveal', () => {
    const s = withHumans();
    untilDraw(s);
    s.leave(s.drawerId);
    assert.equal(s.phase, 'reveal');
    assert.ok(s.feed.some((f) => f.includes('bailed')));
  });

  it('game: 4 drawings then final with a crown, then fresh game', () => {
    const s = withHumans(2);
    for (let i = 0; i < DRAWINGS_PER_GAME; i++) {
      untilDraw(s);
      const g = s.drawerId === 'h0' ? 'h1' : 'h0';
      s.answer(g, s.options.indexOf(s.prompt), s.phaseUntil - 39_000);
      endDraw(s);
      drainReveal(s);
    }
    assert.equal(s.phase, 'final');
    assert.ok(s.feed.some((f) => f.includes('takes the duel')), `feed: ${s.feed}`);
    const best = s.players.get('h0')!.best + s.players.get('h1')!.best;
    assert.ok(best > 0);
    let t = 0;
    while (s.phase === 'final' && t < 15_000) { s.step(TICK); t += TICK; }
    assert.equal(s.gameNo, 2);
    assert.equal(s.players.get('h0')!.score, 0);
  });

  it('prompt pack is curated: 24 unique non-empty words', () => {
    assert.equal(PROMPTS.length, 24);
    assert.equal(new Set(PROMPTS).size, 24);
    assert.ok(PROMPTS.every((w) => /^[a-z]{2,12}$/.test(w)));
  });

  it('snapshot carries strokes for late joiners, stays ≤4KB', () => {
    const s = withHumans();
    untilDraw(s);
    for (let i = 0; i < MAX_STROKES; i++) s.stroke(s.drawerId, i, line(32), true);
    s.join('late', 'Late', false);
    const snap = s.snapshot('late');
    const strokes = unpackStrokes(snap.drawing!.strokes);
    assert.equal(strokes.length, MAX_STROKES);
    assert.equal(strokes[0]!.pts.length, 32); // nothing lost in packing
    const bytes = Buffer.byteLength(JSON.stringify(snap));
    assert.ok(bytes <= 4096, `${bytes}B over budget`);
  });

  it('pack/unpack round-trips every grid corner', () => {
    const s = withHumans();
    untilDraw(s);
    s.stroke(s.drawerId, 0, [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 7, y: 93 }], true);
    const back = unpackStrokes(s.snapshot('h0').drawing!.strokes);
    assert.deepEqual(back[0]!.pts, [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 7, y: 93 }]);
  });

  it('silent guessers lose streak at reveal', () => {
    const s = withHumans();
    untilDraw(s);
    const g = s.drawerId === 'h0' ? 'h1' : 'h0';
    s.players.get(g)!.streak = 3;
    endDraw(s);
    assert.equal(s.players.get(g)!.streak, 0);
  });
});
