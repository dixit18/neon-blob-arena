// games/ludo-clash/test/sim.test.ts — LD-1 acceptance: seats, dice,
// exact-finish, captures, safe cells, extra turns, timers, leaving,
// snapshots. Deterministic dice via injected rand, no sockets.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LudoSim, MAX_SEATS } from '../sim.js';

const TICK = 50;
// rand fractions → dice: 0.0→1, 0.2→2, 0.4→3, 0.5→4, 0.7→5, 0.99→6
const seq = (...rs: number[]): (() => number) => {
  let i = 0;
  return () => rs[i++ % rs.length]!;
};
const D1 = 0.0, D2 = 0.2, D6 = 0.99;

function withPlay(n = 2, ...rs: number[]): LudoSim {
  const s = new LudoSim(seq(...rs, D1));
  for (let i = 0; i < n; i++) s.join(`h${i}`, `P${i}`, false);
  s.step(1100);
  assert.equal(s.phase, 'play');
  return s;
}

function turnName(s: LudoSim, pid: string): string {
  return (s.snapshot(pid).board!.turn!.name);
}

describe('ludo sim', () => {
  it('lobby waits for a second player, then deals in seat order', () => {
    const s = new LudoSim(seq(D1));
    s.join('h0', 'P0', false);
    s.step(5000);
    assert.equal(s.phase, 'lobby');
    s.join('h1', 'P1', false);
    s.step(1100);
    assert.equal(s.phase, 'play');
    assert.equal(s.players.get('h0')!.seat, 0);
    assert.equal(s.players.get('h1')!.seat, 1);
  });

  it('caps at 4 seats, 5th join refused', () => {
    const s = withPlay(2);
    s.join('h2', 'P2', false);
    s.join('h3', 'P3', false);
    s.join('h4', 'P4', false);
    assert.equal(s.playerCount(), MAX_SEATS);
    assert.ok(!s.players.has('h4'));
  });

  it('dice stay in 1..6 across many rolls', () => {
    const s = withPlay(2, 0.1, 0.3, 0.5, 0.7, 0.9);
    for (let i = 0; i < 20; i++) {
      const before = s.dice;
      s.roll(s.order[s.turnPos]!);
      if (s.stage === 'roll' && s.dice !== 0) assert.ok(s.dice >= 1 && s.dice <= 6);
      void before;
      if (s.stage === 'pick') s.pick(s.order[s.turnPos]!, s.options[0]!);
    }
  });

  it('only the turn player can roll, only in roll stage', () => {
    const s = withPlay(2, D6);
    s.roll('h1'); // not your turn
    assert.equal(s.dice, 0);
    s.roll('h0');
    assert.equal(s.dice, 6);
    s.roll('h0'); // now pick stage: ignored
    assert.equal(s.stage, 'pick');
  });

  it('a 6 leaves base; non-6 with full base passes silently', () => {
    const s = withPlay(2, D6);
    s.roll('h0');
    assert.equal(s.stage, 'pick'); // 4 tokens can leave
    s.pick('h0', 2);
    assert.equal(s.players.get('h0')!.tokens[2], 0);
    // h0 rolled 6 → rolls again; force a 1 with full base elsewhere is covered below
    const t2 = withPlay(2, 0.0);
    t2.roll('h0'); // dice 1, all in base → nothing moves
    assert.equal(turnName(t2, 'h0'), 'P1');
    assert.deepEqual(t2.players.get('h0')!.tokens, [-1, -1, -1, -1]);
  });

  it('exact roll finishes; overshoot is not an option', () => {
    const s = withPlay(2);
    const p = s.players.get('h0')!;
    p.tokens = [56, -1, -1, -1];
    s.dice = 2;
    assert.deepEqual(s.legalMoves('h0'), []);
    s.dice = 1;
    assert.deepEqual(s.legalMoves('h0'), [0]);
  });

  it('finishing one token grants another roll', () => {
    const s = withPlay(2, 0.0);
    const p = s.players.get('h0')!;
    p.tokens = [56, -1, -1, -1];
    s.roll('h0'); // dice 1 → 57, single option auto-applies
    assert.equal(p.tokens[0], 57);
    assert.equal(s.stage, 'roll');
    assert.equal(turnName(s, 'h0'), 'P0'); // still your turn
  });

  it('all four home ends the game with a crown', () => {
    const s = withPlay(2, 0.0);
    const p = s.players.get('h0')!;
    p.tokens = [57, 57, 57, 56];
    s.roll('h0');
    assert.equal(s.phase, 'final');
    assert.ok(s.feed.some((f) => f.includes('🏆') && f.includes('P0')));
  });

  it('capture on unsafe cells sends the victim home + re-rolls', () => {
    const s = withPlay(2, 0.0);
    const a = s.players.get('h0')!;
    const b = s.players.get('h1')!;
    a.tokens = [0, -1, -1, -1]; // cell 0... use rel 0→1 (cell 1, unsafe)
    b.tokens = [40, -1, -1, -1]; // seat1: (13+40)%52 = cell 1
    s.roll('h0'); // dice 1 → cell 1, single option
    assert.equal(b.tokens[0], -1);
    assert.ok(s.feed.some((f) => f.includes('💥') && f.includes('P0')));
    assert.equal(turnName(s, 'h0'), 'P0'); // capture earns another roll
  });

  it('safe cells protect: landings on 0, 8, 13 bounce off', () => {
    // [attackerSeat, attackerFrom, victimSeat, victimAt] — dice is always 1
    const cases = [
      [1, 38, 0, 0], // cell 0
      [1, 46, 0, 8], // cell 8
      [0, 12, 1, 0], // cell 13
    ] as const;
    for (const [seatA, fromA, seatB, atB] of cases) {
      const s = new LudoSim(seq(D1));
      s.join('h0', 'P0', false);
      if (seatA === 1 || seatB === 1) s.join('h1', 'P1', false);
      s.join('h2', 'P2', false); // seats: h0=0, h1=1, h2=2
      s.step(1100);
      const aid = seatA === 0 ? 'h0' : seatA === 1 ? 'h1' : 'h2';
      const bid = seatB === 0 ? 'h0' : seatB === 1 ? 'h1' : 'h2';
      // force the turn to the attacker: pass others with full-base dice-1s
      let guard = 0;
      while (s.order[s.turnPos] !== aid && guard++ < 10) s.roll(s.order[s.turnPos]!);
      s.players.get(aid)!.tokens = [fromA, -1, -1, -1];
      s.players.get(bid)!.tokens = [atB, -1, -1, -1];
      s.roll(aid); // dice 1 → lands exactly on the victim
      assert.equal(s.players.get(bid)!.tokens[0], atB, `safe cell failed: ${cases}`);
    }
  });

  it('home-run tokens (51+) cannot be captured', () => {
    const s = withPlay(2, 0.0);
    const v = s.players.get('h0')!; // seat 0
    const a = s.players.get('h1')!; // seat 1: rel 37 → 38 = absolute cell 51
    v.tokens = [57, -1, -1, -1]; // finished → h0 passes on dice 1
    s.roll('h0');
    assert.equal(s.order[s.turnPos], 'h1');
    v.tokens = [51, -1, -1, -1]; // now parked in the home run
    a.tokens = [37, -1, -1, -1];
    s.roll('h1'); // dice 1 → rel 38, same absolute cell 51
    assert.equal(a.tokens[0], 38);
    assert.equal(v.tokens[0], 51); // untouched: home run is sanctuary
    assert.ok(!s.feed.some((f) => f.includes('💥')));
  });

  it('rolling 6 earns another roll with the same player', () => {
    const s = withPlay(2, D6);
    s.roll('h0');
    s.pick('h0', 0);
    assert.equal(s.stage, 'roll');
    assert.equal(turnName(s, 'h0'), 'P0');
  });

  it('three 6s forfeit the turn', () => {
    const s = withPlay(2, D6, D6, D6);
    const p = s.players.get('h0')!;
    p.tokens = [0, 57, 57, 57]; // single movable token → auto-applies
    s.roll('h0'); // 6 → 6
    s.roll('h0'); // 6 → 12
    s.roll('h0'); // 6 → forfeit
    assert.equal(turnName(s, 'h0'), 'P1');
    assert.ok(s.feed.some((f) => f.includes('three 6s')));
  });

  it('roll timeout auto-rolls for nappers', () => {
    const s = withPlay(2, D6);
    s.step(15_000);
    assert.ok(s.dice >= 1 && s.dice <= 6);
  });

  it('pick timeout auto-plays the first option', () => {
    const s = withPlay(2, D6);
    s.roll('h0');
    assert.equal(s.stage, 'pick');
    const first = s.options[0]!;
    s.step(10_000);
    assert.equal(s.players.get('h0')!.tokens[first], 0); // left base
  });

  it('invalid and foreign picks are ignored', () => {
    const s = withPlay(2, D6);
    s.roll('h0');
    s.pick('h0', 9);
    assert.equal(s.stage, 'pick');
    s.pick('h1', s.options[0]!); // not your turn
    assert.equal(s.stage, 'pick');
    assert.deepEqual(s.players.get('h0')!.tokens, [-1, -1, -1, -1]);
  });

  it('leaving mid-game crowns the last one racing', () => {
    const s = withPlay(2);
    s.leave('h1');
    assert.equal(s.phase, 'final');
    assert.ok(s.feed.some((f) => f.includes('last one racing')));
  });

  it('everyone leaving resets to lobby', () => {
    const s = withPlay(2);
    s.leave('h0');
    s.leave('h1');
    assert.equal(s.phase, 'lobby');
    assert.equal(s.phaseUntil, 0);
  });

  it('final rolls into a fresh game with scores kept as best', () => {
    const s = withPlay(2, 0.0);
    const p = s.players.get('h0')!;
    p.tokens = [57, 57, 57, 56];
    s.roll('h0');
    assert.equal(s.phase, 'final');
    const best = p.best;
    assert.ok(best > 0);
    s.step(6000);
    assert.equal(s.gameNo, 2);
    assert.deepEqual(p.tokens, [-1, -1, -1, -1]);
    assert.equal(p.score, 0);
    assert.equal(p.best, best);
  });

  it('snapshot hides options from watchers, shows the turn', () => {
    const s = withPlay(2, D6);
    s.roll('h0');
    const me = s.snapshot('h0');
    const watcher = s.snapshot('h1');
    assert.equal(me.board!.turn!.you, true);
    assert.equal(me.board!.turn!.options.length, 4);
    assert.equal(me.board!.turn!.canRoll, false);
    assert.equal(watcher.board!.turn!.you, false);
    assert.deepEqual(watcher.board!.turn!.options, []);
    assert.equal(me.board!.seats.length, 2);
  });

  it('scores track progress; snapshot stays small', () => {
    const s = withPlay(2, D6);
    s.roll('h0');
    s.pick('h0', 0);
    const snap = s.snapshot('h0');
    assert.ok(snap.scores.length === 2);
    assert.ok(snap.you.score >= 0);
    assert.ok(Buffer.byteLength(JSON.stringify(snap)) <= 2048);
  });

  it('deterministic: same dice, same board', () => {
    const run = (): string => {
      const s = new LudoSim(seq(D6, 0.0, 0.4));
      s.join('h0', 'A', false);
      s.join('h1', 'B', false);
      s.step(1100);
      for (let i = 0; i < 6; i++) {
        const id = s.order[s.turnPos]!;
        if (s.stage === 'roll') s.roll(id);
        else s.pick(id, s.options[0]!);
        s.step(TICK);
      }
      return JSON.stringify(s.snapshot('h0'));
    };
    assert.equal(run(), run());
  });

  it('turn order rotates seats and survives a full round of passes', () => {
    const s = withPlay(3, 0.0);
    const seen: string[] = [];
    for (let i = 0; i < 3; i++) {
      seen.push(turnName(s, 'h0'));
      s.roll(s.order[s.turnPos]!); // dice 1, full base → pass
    }
    assert.deepEqual(seen, ['P0', 'P1', 'P2']);
  });

  it('joining mid-game queues for the next game, capped at 4', () => {
    const s = withPlay(2);
    s.join('h2', 'P2', false);
    assert.equal(s.playerCount(), 3);
    assert.equal(s.order.length, 3);
  });

  it('LD-3: ResultGrid validates, crowns the winner, re-enters play', async () => {
    const { assertArtifact } = await import('../../../packages/share/src/index.js');
    const s = withPlay(2, 0.0);
    s.players.get('h0')!.tokens = [57, 57, 57, 56];
    s.roll('h0');
    assert.equal(s.phase, 'final');
    const g = s.grid('ABCD', 'https://x.test');
    assert.deepEqual(assertArtifact(g), []);
    assert.equal(g.kind, 'ResultGrid');
    assert.ok(g.title.includes('🏆') && g.title.includes('P0'));
    assert.ok((g.url as string).includes('ludo-clash') && (g.url as string).includes('ABCD'));
    const rows = (g.data as { rows: { n: string; finished: number }[] }).rows;
    assert.equal(rows[0]!.n, 'P0');
    assert.equal(rows[0]!.finished, 4);
  });

  it('LD-3: mid-game grid is honest — no fake crown, still re-enters', async () => {
    const { assertArtifact } = await import('../../../packages/share/src/index.js');
    const s = withPlay(2, 0.0);
    s.roll('h0');
    const g = s.grid('WXYZ', 'https://x.test');
    assert.deepEqual(assertArtifact(g), []);
    assert.ok(!g.title.includes('🏆'));
    assert.ok((g.url as string).includes('game=ludo-clash'));
  });

  it('LD-3: last-one-racing crown carries the grid too', async () => {
    const { assertArtifact } = await import('../../../packages/share/src/index.js');
    const s = withPlay(2);
    s.leave('h1');
    const g = s.grid('QRST', 'https://x.test');
    assert.deepEqual(assertArtifact(g), []);
    assert.ok(g.title.includes('🏆') && g.title.includes('P0'));
  });
});
