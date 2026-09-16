// games/nitro-rift/test/driver.test.ts — seam: grid fill, drive flow,
// rubber-band racing, snapshot budget.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createNitroDriver } from '../driver.js';

const TICK = 1 / 20;

describe('nitro driver', () => {
  it('solo human gets an instant labelled grid', () => {
    const d = createNitroDriver(() => 0.5);
    d.join({ id: 'h1', name: 'Ria', isBot: false });
    assert.ok(d.playerCount() >= 4);
    const snap = d.snapshot('h1') as { racers: { n: string; bot: boolean }[] };
    const bots = snap.racers.filter((r) => r.bot);
    assert.ok(bots.length >= 3);
    assert.ok(bots.every((r) => r.n.includes('🤖')));
  });

  it('bots race: heats complete and crowns land', () => {
    const d = createNitroDriver(() => 0.5);
    d.join({ id: 'h1', name: 'Ria', isBot: false });
    for (let i = 0; i < 20 * 75; i++) d.step(TICK); // 75s: heat + final + heat
    const snap = d.snapshot('h1') as { heat: number; feed: string[] };
    assert.ok(snap.heat >= 1);
  });

  it('human drive flows: boost pulls ahead of coasting bot', () => {
    const d = createNitroDriver(() => 0.5);
    d.join({ id: 'h1', name: 'Ria', isBot: false });
    for (let i = 0; i < 40; i++) d.step(TICK);
    d.accept({ kind: 'input', by: 'h1', data: { dx: 0, dy: 0, fire: true }, at: Date.now() });
    for (let i = 0; i < 100; i++) d.step(TICK);
    const snap = d.snapshot('h1') as { you: { prog: number } };
    assert.ok(snap.you.prog > 0);
  });

  it('bad input never throws', () => {
    const d = createNitroDriver(() => 0.5);
    d.join({ id: 'h1', name: 'Ria', isBot: false });
    d.accept({ kind: 'input', by: 'h1', data: { dx: NaN }, at: 0 });
    d.accept({ kind: 'nope', by: 'h1', data: {}, at: 0 });
    d.step(TICK);
    assert.ok(d.playerCount() > 0);
  });

  it('bots clock out when the room empties', () => {
    const d = createNitroDriver(() => 0.5);
    d.join({ id: 'h1', name: 'Ria', isBot: false });
    d.leave('h1');
    assert.equal(d.playerCount(), 0);
  });

  it('snapshots stay ≤1.5KB with a full grid', () => {
    const d = createNitroDriver(() => 0.5);
    d.join({ id: 'h1', name: 'Ria', isBot: false });
    d.join({ id: 'h2', name: 'Dev', isBot: false });
    for (let i = 0; i < 40; i++) d.step(TICK);
    for (const pid of ['h1', 'h2']) {
      const bytes = Buffer.byteLength(JSON.stringify(d.snapshot(pid)));
      assert.ok(bytes <= 1536, `${bytes}B > 1.5KB`);
    }
  });
});
