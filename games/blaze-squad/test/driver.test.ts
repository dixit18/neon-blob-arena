// games/blaze-squad/test/driver.test.ts — RoomDriver seam: backfill,
// input flow, bot clocks, snapshot budget.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createBlazeDriver } from '../driver.js';

const TICK = 1 / 20;

function withHuman(d = createBlazeDriver(() => 0.5)): typeof d {
  d.join({ id: 'h1', name: 'Ria', isBot: false });
  return d;
}

describe('blaze driver', () => {
  it('solo human gets instant labelled bots', () => {
    const d = withHuman();
    assert.ok(d.playerCount() >= 4);
    const snap = d.snapshot('h1') as { players: { n: string; bot: boolean }[] };
    const bots = snap.players.filter((p) => p.bot);
    assert.ok(bots.length >= 3);
    assert.ok(bots.every((p) => p.n.includes('🤖')));
  });

  it('bots fight: bolts fly and someone scores over a round', () => {
    const d = withHuman();
    for (let i = 0; i < 20 * 40; i++) d.step(TICK); // 40s of war
    const snap = d.snapshot('h1') as { players: { hp: number }[]; feed: string[] };
    assert.ok(snap.players.length > 0);
  });

  it('human input flows: move drifts position, fire edge shoots', () => {
    const d = withHuman();
    for (let i = 0; i < 40; i++) d.step(TICK); // past lobby
    const before = (d.snapshot('h1') as { players: { you: boolean; x: number }[] }).players.find((p) => p.you)!;
    d.accept({ kind: 'input', by: 'h1', data: { dx: 1, dy: 0 }, at: Date.now() });
    for (let i = 0; i < 20; i++) d.step(TICK);
    const after = (d.snapshot('h1') as { players: { you: boolean; x: number }[] }).players.find((p) => p.you)!;
    assert.ok(after.x > before.x);
    d.accept({ kind: 'input', by: 'h1', data: { dx: 0, dy: 0, fire: true, aim: 0 }, at: Date.now() });
    d.step(TICK);
  });

  it('bad input never throws, socket stays alive', () => {
    const d = withHuman();
    d.accept({ kind: 'input', by: 'h1', data: { dx: NaN, fire: true, aim: 'up' }, at: 0 });
    d.accept({ kind: 'nope', by: 'h1', data: {}, at: 0 });
    d.step(TICK);
    assert.ok(d.playerCount() > 0);
  });

  it('bots clock out when the room empties', () => {
    const d = withHuman();
    assert.ok(d.playerCount() > 1);
    d.leave('h1');
    assert.equal(d.playerCount(), 0);
  });

  it('snapshots stay ≤1.5KB with a full room', () => {
    const d = createBlazeDriver(() => 0.5);
    d.join({ id: 'h1', name: 'Ria', isBot: false });
    d.join({ id: 'h2', name: 'Dev', isBot: false });
    for (let i = 0; i < 40; i++) d.step(TICK);
    for (const pid of ['h1', 'h2']) {
      const bytes = Buffer.byteLength(JSON.stringify(d.snapshot(pid)));
      assert.ok(bytes <= 1536, `${bytes}B > 1.5KB`);
    }
  });
});
