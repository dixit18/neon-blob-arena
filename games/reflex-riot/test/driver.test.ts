// games/reflex-riot/test/driver.test.ts — driver seam + bot behaviour.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRiotDriver } from '../driver.js';

const TICK = 1 / 20;
function steps(d: ReturnType<typeof createRiotDriver>, secs: number): void {
  const n = Math.round(secs / TICK);
  for (let i = 0; i < n; i++) d.step(TICK);
}
function input(d: ReturnType<typeof createRiotDriver>, by: string, fire: boolean): void {
  d.accept({ kind: 'input', by, data: { dx: 0, dy: 0, fire }, at: Date.now() });
}

describe('riot driver', () => {
  it('solo human gets instant bots and a live task', () => {
    const d = createRiotDriver(() => 0.99); // deterministic: slow-ish, no mistakes
    d.join({ id: 'h1', name: 'Ria', isBot: false });
    assert.ok(d.playerCount() >= 4, `players=${d.playerCount()}`);
    steps(d, 2);
    const snap = d.snapshot('h1') as { phase: string; task: unknown };
    assert.equal(snap.phase, 'task');
    assert.ok(snap.task);
  });

  it('bots are labelled and score over a full round', () => {
    const d = createRiotDriver(() => 0.5);
    d.join({ id: 'h1', name: 'Ria', isBot: false });
    steps(d, 90); // a full 8-task round + change
    const snap = d.snapshot('h1') as { scores: { n: string; s: number; bot: boolean }[]; feed: string[] };
    assert.ok(snap.scores.some((s) => s.bot && s.n.includes('🤖')), 'bot tag labelled');
    assert.ok(snap.scores.some((s) => s.s > 0), 'someone scored');
  });

  it('human input flows: fire edge taps the task', () => {
    const d = createRiotDriver(() => 0.99);
    d.join({ id: 'h1', name: 'Ria', isBot: false });
    steps(d, 1.2);
    // wait for a tap task, then poke it
    let tapped = false;
    for (let i = 0; i < 200 && !tapped; i++) {
      const snap = d.snapshot('h1') as { phase: string; task: { kind: string } | null; you: { gain: number } };
      if (snap.phase === 'task' && snap.task?.kind === 'tap') {
        input(d, 'h1', true);
        input(d, 'h1', false);
        tapped = true;
      }
      d.step(TICK);
    }
    assert.ok(tapped, 'saw a tap task');
    const after = d.snapshot('h1') as { you: { score: number; gain: number } };
    assert.ok(after.you.score > 0 || after.you.gain > 0, 'human scored');
  });

  it('answer channel drives copy pads', () => {
    const d = createRiotDriver(() => 0.99);
    d.join({ id: 'h1', name: 'Ria', isBot: false });
    let done = false;
    for (let i = 0; i < 400 && !done; i++) {
      const snap = d.snapshot('h1') as { phase: string; task: { kind: string; seq: number[] } | null };
      if (snap.phase === 'task' && snap.task?.kind === 'copy') {
        for (const pad of snap.task.seq) d.accept({ kind: 'answer', by: 'h1', data: { i: pad }, at: Date.now() });
        done = true;
      }
      d.step(TICK);
    }
    assert.ok(done, 'saw a copy task');
    const after = d.snapshot('h1') as { you: { gain: number } };
    assert.equal(after.you.gain, 750);
  });

  it('bots clock out when the room empties', () => {
    const d = createRiotDriver(() => 0.5);
    d.join({ id: 'h1', name: 'Ria', isBot: false });
    assert.ok(d.playerCount() > 1);
    d.leave('h1');
    assert.equal(d.playerCount(), 0);
  });

  it('snapshots stay small with a full room', () => {
    const d = createRiotDriver(() => 0.5);
    d.join({ id: 'h1', name: 'Ria', isBot: false });
    d.join({ id: 'h2', name: 'Dev', isBot: false });
    steps(d, 2);
    const bytes = Buffer.byteLength(JSON.stringify(d.snapshot('h1')));
    assert.ok(bytes <= 700, `${bytes}B over budget`);
  });
});
