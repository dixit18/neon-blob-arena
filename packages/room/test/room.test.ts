import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RoomRegistry, EMPTY_GC_MS, type RoomDriver } from '../src/index.js';

function stub(game = 'test'): RoomDriver {
  const players = new Map<string, { name: string; isBot: boolean }>();
  const cmds: unknown[] = [];
  return {
    game,
    join: (p) => { players.set(p.id, p); },
    leave: (id) => { players.delete(id); },
    accept: (c) => { cmds.push(c); },
    step: () => {},
    snapshot: (pid) => ({ you: pid, n: players.size, cmds: cmds.length }),
    createBot: (slot) => ({ name: `Bot-${slot}` }),
    playerCount: () => players.size,
    dispose: () => { players.clear(); },
  };
}

describe('registry', () => {
  it('creates and reuses rooms by code', () => {
    const r = new RoomRegistry();
    r.register('test', () => stub());
    const a = r.getOrCreate('test', 'ABCD', 1000);
    const b = r.getOrCreate('test', 'ABCD', 2000);
    assert.equal(a, b);
  });
  it('throws on unknown game', () => {
    const r = new RoomRegistry();
    assert.throws(() => r.getOrCreate('nope', 'ABCD', 0), /unknown game/);
  });
  it('matchmakes into the least-loaded room', () => {
    const r = new RoomRegistry();
    r.register('test', () => stub());
    const a = r.getOrCreate('test', 'AAAA', 0);
    r.getOrCreate('test', 'BBBB', 0);
    r.join(a, { id: 'h1', name: 'H', isBot: false }, 10);
    const m = r.getOrCreate('test', undefined, 20);
    assert.equal(m.id, 'BBBB');
  });
  it('holds and reclaims slots inside grace, expires after', () => {
    const r = new RoomRegistry();
    r.register('test', () => stub());
    const room = r.getOrCreate('test', 'ABCD', 0);
    r.join(room, { id: 'p1', name: 'P', isBot: false }, 100);
    const tok = r.holdSlot(room, 'p1', 200);
    assert.ok(tok);
    assert.deepEqual(r.reclaim(tok!, 300), { roomId: 'ABCD', playerId: 'p1' });
    assert.equal(r.reclaim(tok!, 400), null); // single-use
    const tok2 = r.holdSlot(room, 'p1', 500);
    assert.equal(r.reclaim(tok2!, 500 + 61_000), null); // expired
    assert.equal(r.holdSlot(room, 'ghost', 600), null); // never joined
  });
  it('refreshes a hold under the same token value', () => {
    const r = new RoomRegistry();
    r.register('test', () => stub());
    const room = r.getOrCreate('test', 'ABCD', 0);
    r.join(room, { id: 'p1', name: 'P', isBot: false }, 100);
    const tok = r.holdSlot(room, 'p1', 200);
    const same = r.holdSlot(room, 'p1', 50_000, tok!);
    assert.equal(same, tok);
    assert.equal(r.reclaim(tok!, 50_000 + 61_000), null); // expiry runs from refresh
    const tok3 = r.holdSlot(room, 'p1', 60_000, tok!);
    assert.deepEqual(r.reclaim(tok3!, 61_000), { roomId: 'ABCD', playerId: 'p1' });
  });
  it('GCs rooms empty for 90s, keeps warm ones', () => {
    const r = new RoomRegistry();
    r.register('test', () => stub());
    const room = r.getOrCreate('test', 'GONE', 0);
    r.join(room, { id: 'h', name: 'H', isBot: false }, 10);
    r.leave(room, 'h');
    assert.deepEqual(r.tick(EMPTY_GC_MS - 1), []);
    assert.deepEqual(r.tick(EMPTY_GC_MS + 1), ['test:GONE']);
    const warm = r.getOrCreate('test', 'WARM', 0);
    r.join(warm, { id: 'h2', name: 'H', isBot: false }, EMPTY_GC_MS + 2);
    assert.deepEqual(r.tick(EMPTY_GC_MS * 10), []);
  });
  it('presence reports humans + totals', () => {
    const r = new RoomRegistry();
    r.register('test', () => stub());
    const room = r.getOrCreate('test', 'ABCD', 0);
    r.join(room, { id: 'h', name: 'H', isBot: false }, 1);
    r.join(room, { id: 'b', name: 'B', isBot: true }, 1);
    assert.deepEqual(r.presence(), [{ id: 'ABCD', game: 'test', humans: 1, players: 2 }]);
  });
  it('driver accept path records commands', () => {
    const r = new RoomRegistry();
    r.register('test', () => stub());
    const room = r.getOrCreate('test', 'ABCD', 0);
    room.driver.accept({ kind: 'answer', by: 'x', data: { i: 2 }, at: 5 });
    assert.equal((room.driver.snapshot('x') as { cmds: number }).cmds, 1);
  });
});
