// games/doodle-duel/test/driver.test.ts — DD-2: bot audience + seam.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createDoodleDriver } from '../driver.js';

const TICK = 1 / 20;
function steps(d: ReturnType<typeof createDoodleDriver>, secs: number): void {
  const n = Math.round(secs / TICK);
  for (let i = 0; i < n; i++) d.step(TICK);
}
const pts = (n: number) => Array.from({ length: n }, (_, k) => ({ x: (k * 3) % 100, y: (k * 7) % 100 }));

describe('doodle driver', () => {
  it('solo drawer gets an instant labelled audience', () => {
    const d = createDoodleDriver(() => 0.99);
    d.join({ id: 'h1', name: 'Ria', isBot: false });
    assert.ok(d.playerCount() >= 4, `players=${d.playerCount()}`);
    steps(d, 2);
    const snap = d.snapshot('h1') as { phase: string; drawing: { drawerYou: boolean; prompt: string } };
    assert.equal(snap.phase, 'draw');
    assert.equal(snap.drawing.drawerYou, true);
    assert.ok(snap.drawing.prompt.length >= 2);
  });

  it('bots guess mid-drawing and someone scores', () => {
    const d = createDoodleDriver(() => 0.5); // above the 15% flub line, mid tiers
    d.join({ id: 'h1', name: 'Ria', isBot: false });
    steps(d, 46); // past the 40s whistle: guesses bank at reveal
    const snap = d.snapshot('h1') as { scores: { s: number; bot: boolean }[] };
    assert.ok(snap.scores.some((s) => s.bot && s.s > 0), 'a bot scored by guessing');
  });

  it('drawer strokes flow through strokeBatch', () => {
    const d = createDoodleDriver(() => 0.5);
    d.join({ id: 'h1', name: 'Ria', isBot: false });
    steps(d, 2);
    d.accept({ kind: 'strokeBatch', by: 'h1', data: { strokeId: 0, pts: pts(10), done: true }, at: Date.now() });
    const snap = d.snapshot('h1') as { drawing: { strokes: { id: number }[] } };
    assert.equal(snap.drawing.strokes.length, 1);
  });

  it('guesser answer flows; bots never hold the pen', () => {
    const d = createDoodleDriver(() => 0.5);
    d.join({ id: 'h1', name: 'Ria', isBot: false });
    d.join({ id: 'h2', name: 'Dev', isBot: false });
    const seen = new Set<string>();
    for (let r = 0; r < 4; r++) {
      steps(d, 2);
      const snap = d.snapshot('h1') as { phase: string; drawing: { drawer: string } | null };
      if (snap.phase === 'draw') seen.add(snap.drawing!.drawer);
      steps(d, 42);
    }
    assert.ok(seen.has('Ria') && seen.has('Dev'), `drawers: ${[...seen]}`);
    assert.ok(![...seen].some((n) => n.includes('🤖')), 'no bot drew');
  });

  it('snapshots stay ≤4KB with a full table', () => {
    const d = createDoodleDriver(() => 0.5);
    d.join({ id: 'h1', name: 'Ria', isBot: false });
    steps(d, 2);
    for (let i = 0; i < 16; i++) {
      d.accept({ kind: 'strokeBatch', by: 'h1', data: { strokeId: i, pts: pts(32), done: true }, at: Date.now() });
    }
    const bytes = Buffer.byteLength(JSON.stringify(d.snapshot('h1')));
    assert.ok(bytes <= 4096, `${bytes}B over budget`);
  });

  it('bots clock out when humans leave', () => {
    const d = createDoodleDriver(() => 0.5);
    d.join({ id: 'h1', name: 'Ria', isBot: false });
    assert.ok(d.playerCount() > 1);
    d.leave('h1');
    assert.equal(d.playerCount(), 0);
  });
});
