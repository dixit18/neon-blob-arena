// games/ludo-clash/test/driver.test.ts — LD-2 acceptance: instant full
// table, labelled bots, preference order, human flow, budgets.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createLudoDriver, scoreLudoPick } from '../driver.js';

const TICK = 1 / 20;
const seq = (...rs: number[]): (() => number) => {
  let i = 0;
  return () => rs[i++ % rs.length]!;
};

describe('ludo driver', () => {
  it('solo human gets an instant labelled table of 4', () => {
    const d = createLudoDriver(seq(0.5));
    d.join({ id: 'h1', name: 'Dev', isBot: false });
    assert.equal(d.playerCount(), 4);
    const snap = d.snapshot('h1') as unknown as {
      board: { seats: { n: string; you: boolean }[] } | null;
    };
    assert.equal(snap.board, null); // lobby: no board yet
    for (let i = 0; i < 30; i++) d.step(TICK);
    const live = d.snapshot('h1') as unknown as {
      board: { seats: { n: string; you: boolean }[] };
    };
    assert.equal(live.board.seats.length, 4);
    const bots = live.board.seats.filter((s) => !s.you);
    assert.equal(bots.length, 3);
    assert.ok(bots.every((s) => s.n.includes('🤖')));
  });

  it('rank order: capture > leave-base > finish > progress', () => {
    // seat 0, dice 1: k0 captures on cell 1, k1 plain progress
    const foes = [{ seat: 1, tokens: [40, -1, -1, -1] }]; // cell (13+40)%52 = 1
    const cap = scoreLudoPick(0, [0, 10, -1, -1], 0, 1, foes);
    const prog = scoreLudoPick(0, [0, 10, -1, -1], 1, 1, foes);
    assert.equal(cap, 3);
    assert.ok(prog < 1.5);
    assert.ok(scoreLudoPick(0, [-1, -1, -1, -1], 0, 6, []) === 2); // leave
    assert.ok(scoreLudoPick(0, [56, -1, -1, -1], 0, 1, []) === 1.5); // finish
    assert.ok(3 > 2 && 2 > 1.5 && 1.5 > prog);
  });

  it('safe cells score no capture premium', () => {
    // victim on cell 8 (safe): landing there ranks as plain progress
    const foes = [{ seat: 0, tokens: [8, -1, -1, -1] }];
    const s = scoreLudoPick(1, [46, -1, -1, -1], 0, 1, foes); // (13+47)%52 = 8
    assert.ok(s < 1.5 && s > 0);
  });

  it('bots play: a full game progresses without stuck turns', () => {
    const d = createLudoDriver(seq(0.1, 0.5, 0.9, 0.3));
    d.join({ id: 'h1', name: 'Dev', isBot: false });
    let moved = false;
    for (let i = 0; i < 20 * 120 && !moved; i++) {
      d.step(TICK);
      const snap = d.snapshot('h1') as unknown as {
        board: { seats: { tokens: number[] }[] } | null;
      };
      if (snap.board && snap.board.seats.some((s) => s.tokens.some((t) => t >= 0))) moved = true;
    }
    assert.ok(moved, 'some token left base within 2 minutes of bot play');
  });

  it('human roll + pick flow via accept', () => {
    const d = createLudoDriver(seq(0.99)); // always 6
    d.join({ id: 'h1', name: 'Dev', isBot: false });
    for (let i = 0; i < 30; i++) d.step(TICK); // past lobby, h1 turn (seat 0)
    d.accept({ kind: 'input', by: 'h1', data: { dx: 0, dy: 0, fire: true }, at: 0 });
    d.accept({ kind: 'answer', by: 'h1', data: { i: 0 }, at: 0 });
    const snap = d.snapshot('h1') as unknown as {
      board: { seats: { you: boolean; tokens: number[] }[] };
    };
    assert.equal(snap.board.seats.find((s) => s.you)!.tokens[0], 0);
  });

  it('bad input never throws, strangers cannot move', () => {
    const d = createLudoDriver(seq(0.5));
    d.join({ id: 'h1', name: 'Dev', isBot: false });
    d.accept({ kind: 'input', by: 'ghost', data: {}, at: 0 });
    d.accept({ kind: 'answer', by: 'h1', data: { i: 99 }, at: 0 });
    d.accept({ kind: 'nope', by: 'h1', data: {}, at: 0 });
    d.step(TICK);
    assert.equal(d.playerCount(), 4);
  });

  it('bots clock out when the room empties', () => {
    const d = createLudoDriver(seq(0.5));
    d.join({ id: 'h1', name: 'Dev', isBot: false });
    assert.equal(d.playerCount(), 4);
    d.leave('h1');
    assert.equal(d.playerCount(), 0);
  });

  it('snapshots stay ≤2KB with a full table mid-game', () => {
    const d = createLudoDriver(seq(0.5));
    d.join({ id: 'h1', name: 'Dev', isBot: false });
    d.join({ id: 'h2', name: 'Ria', isBot: false });
    for (let i = 0; i < 60; i++) d.step(TICK);
    for (const pid of ['h1', 'h2']) {
      const bytes = Buffer.byteLength(JSON.stringify(d.snapshot(pid)));
      assert.ok(bytes <= 2048, `${bytes}B > 2KB`);
    }
  });
});
