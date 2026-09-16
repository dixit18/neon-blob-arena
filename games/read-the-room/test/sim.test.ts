// games/read-the-room/test/sim.test.ts — RT-1 acceptance: seats, votes,
// dedup, scoring, reveal, rotation, timers, leaving, snapshots, determinism.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RoomSim, PROMPTS, ROUNDS, MIN_START,
  LOBBY_COUNTDOWN_MS, VOTE_MS, REVEAL_MS, FINAL_MS,
} from '../sim.js';
import { assertArtifact } from '../../../packages/share/src/index.js';

const seq = (...rs: number[]): (() => number) => {
  let i = 0;
  return () => rs[i++ % rs.length]!;
};

function trio(rand?: () => number): RoomSim {
  const s = new RoomSim(rand ?? seq(0.1, 0.7, 0.3, 0.9, 0.5));
  s.join('a', 'Asha', false);
  s.join('b', 'Bheem', false);
  s.join('c', 'Chiku', false);
  s.step(LOBBY_COUNTDOWN_MS);
  return s;
}

describe('read-the-room sim', () => {
  it('lobby waits below MIN_START', () => {
    const s = new RoomSim(seq(0.5));
    s.join('a', 'Asha', false);
    s.join('b', 'Bheem', false);
    s.step(LOBBY_COUNTDOWN_MS * 3);
    assert.equal(s.phase, 'lobby');
    assert.equal(MIN_START, 3);
  });

  it('third seat starts the countdown into a vote round', () => {
    const s = trio();
    assert.equal(s.phase, 'vote');
    assert.ok(PROMPTS.includes(s.question()));
    const snap = s.snapshot('a');
    assert.equal(snap.round?.no, 1);
    assert.equal(snap.round?.of, ROUNDS);
    assert.equal(snap.round?.options.length, 3);
  });

  it('full house of votes reveals immediately (no timeout wait)', () => {
    const s = trio();
    s.vote('a', 1);
    assert.equal(s.phase, 'vote');
    s.vote('b', 2);
    s.vote('c', 1);
    assert.equal(s.phase, 'reveal'); // all voted → instant reveal
  });

  it('self-votes are rejected', () => {
    const s = trio();
    s.vote('a', 0); // Asha is seat 0
    assert.equal(s.votes.has('a'), false);
    assert.equal(s.phase, 'vote');
  });

  it('second ballot is ignored — no double-score', () => {
    const s = trio();
    s.vote('a', 1);
    s.vote('a', 2); // dupe: dies here
    s.vote('b', 2);
    s.vote('c', 1);
    assert.equal(s.phase, 'reveal');
    const tally = s.snapshot('a').reveal!.tally;
    assert.equal(tally.find((t) => t.n === 'Bheem')!.v, 2);
    assert.equal(tally.find((t) => t.n === 'Chiku')!.v, 1);
  });

  it('out-of-range + stranger + wrong-phase votes die quietly', () => {
    const s = trio();
    s.vote('a', 9);
    s.vote('ghost', 1);
    s.vote('a', -1);
    assert.equal(s.votes.size, 0);
    s.vote('a', 1); s.vote('b', 2); s.vote('c', 1);
    assert.equal(s.phase, 'reveal');
    s.vote('a', 2); // reveal phase: not a vote round
    assert.equal(s.phase, 'reveal');
  });

  it('scoring: +1 per vote received, +2 for reading the crowd', () => {
    const s = trio();
    s.vote('a', 1); // Asha → Bheem
    s.vote('b', 2); // Bheem → Chiku
    s.vote('c', 1); // Chiku → Bheem (crown, 2 votes)
    const sc = s.snapshot('a').scores;
    const got = (n: string): number => sc.find((x) => x.n === n)!.s;
    assert.equal(got('Bheem'), 2); // 2 received, picked Chiku (wrong): +0
    assert.equal(got('Chiku'), 1 + 2); // 1 received + read the crowd right
    assert.equal(got('Asha'), 0 + 2); // picked the crown
  });

  it('crown goes to the most-picked; ties break to lowest seat', () => {
    const s = trio();
    s.vote('a', 1); s.vote('b', 2); s.vote('c', 0); // 1-1-1 tie
    const r = s.snapshot('a').reveal!;
    assert.deepEqual(r.crowns, ['Asha']); // seat 0 wins ties
  });

  it('reveal shows tally + your read, never live ballots', () => {
    const s = trio();
    s.vote('a', 1);
    const mid = s.snapshot('b');
    assert.equal(mid.round?.voted, false); // Bheem hasn't voted
    assert.equal(mid.round?.myPick, null);
    assert.equal(mid.reveal, null); // no tally leaks mid-vote
    assert.equal(s.snapshot('a').round?.myPick, 1); // only YOUR ballot visible
    s.vote('b', 2); s.vote('c', 1);
    const r = s.snapshot('a').reveal!;
    assert.equal(r.tally.length, 3);
    assert.equal(r.youPickedCrown, true);
    assert.equal(r.youGot, 0);
    assert.equal(s.snapshot('b').reveal!.youGot, 2);
  });

  it('nappers get auto-votes at timeout — the party never stalls', () => {
    const s = trio();
    s.vote('a', 1);
    s.step(VOTE_MS);
    assert.equal(s.phase, 'reveal');
    assert.equal(s.votes.size, 3);
  });

  it('reveal rolls into the next round with a fresh question', () => {
    const s = trio();
    const q1 = s.question();
    s.vote('a', 1); s.vote('b', 2); s.vote('c', 1);
    s.step(REVEAL_MS);
    assert.equal(s.phase, 'vote');
    assert.equal(s.snapshot('a').round?.no, 2);
  });

  it('no question repeats within a game', () => {
    const s = trio();
    const seen = new Set<string>([s.question()]);
    for (let r = 0; r < ROUNDS - 1; r++) {
      for (const id of [...s.order]) {
        const mine = s.order.indexOf(id);
        s.vote(id, (mine + 1) % s.order.length);
      }
      assert.equal(s.phase, 'reveal');
      s.step(REVEAL_MS);
      if (s.phase === 'vote') seen.add(s.question());
    }
    assert.equal(seen.size, ROUNDS);
  });

  it('five rounds crown the room reader, then final', () => {
    const s = trio();
    for (let r = 0; r < ROUNDS; r++) {
      for (const id of [...s.order]) {
        const mine = s.order.indexOf(id);
        s.vote(id, (mine + 1) % s.order.length);
      }
      assert.equal(s.phase, 'reveal');
      if (r < ROUNDS - 1) s.step(REVEAL_MS);
    }
    assert.equal(s.phase, 'reveal');
    s.step(REVEAL_MS);
    assert.equal(s.phase, 'final');
    assert.ok(s.feed.some((f) => f.includes('read the room best')));
  });

  it('final rolls a fresh game: scores reset, bests kept', () => {
    const s = trio();
    for (let r = 0; r < ROUNDS; r++) {
      for (const id of [...s.order]) {
        const mine = s.order.indexOf(id);
        s.vote(id, (mine + 1) % s.order.length);
      }
      s.step(REVEAL_MS);
    }
    assert.equal(s.phase, 'final');
    const bests = new Map([...s.players.values()].map((p) => [p.id, p.best]));
    assert.ok([...bests.values()].some((b) => b > 0));
    s.step(FINAL_MS);
    assert.equal(s.phase, 'vote');
    assert.equal(s.gameNo, 2);
    for (const p of s.players.values()) assert.equal(p.score, 0);
    for (const [id, b] of bests) assert.equal(s.players.get(id)!.best, b);
  });

  it('leaver ballots die; votes for leavers void at tally', () => {
    const s = trio();
    s.vote('a', 1); // Asha → Bheem
    s.leave('b'); // Bheem walks out mid-vote
    assert.equal(s.votes.has('a'), true); // Asha's ballot stands...
    s.vote('c', 0); // Chiku → Asha: all remaining voted
    assert.equal(s.phase, 'reveal');
    const tally = s.snapshot('a').reveal!.tally;
    assert.equal(tally.length, 2); // Bheem gone from the tally
    assert.equal(tally.find((t) => t.n === 'Asha')!.v, 1);
  });

  it('last one at the party takes the crown', () => {
    const s = trio();
    s.leave('b');
    s.leave('c');
    assert.equal(s.phase, 'final');
    assert.ok(s.feed.some((f) => f.includes('Asha') && f.includes('last one')));
  });

  it('empty room always resets to lobby', () => {
    const s = trio();
    s.leave('a'); s.leave('b'); s.leave('c');
    assert.equal(s.phase, 'lobby');
    assert.equal(s.phaseUntil, 0);
  });

  it('reconnect keeps the question (stateless snapshots)', () => {
    const s = trio();
    const q = s.snapshot('a').round!.question;
    s.leave('a'); // dropped connection
    assert.equal(s.snapshot('b').round!.question, q); // party unaffected
    s.join('a', 'Asha', false); // rejoin
    assert.equal(s.phase, 'vote');
    assert.equal(s.snapshot('a').round!.question, q); // same question waiting
  });

  it('same seed → same questions (deterministic)', () => {
    const mk = (): RoomSim => trio(seq(0.42, 0.7, 0.13));
    const a = mk();
    const b = mk();
    assert.deepEqual(a.qOrder, b.qOrder);
    assert.equal(a.question(), b.question());
  });

  it('Party Fingerprint validates mid-game and crowned', () => {
    const s = trio();
    const mid = s.fingerprint('ABCD', 'https://play.example');
    assert.deepEqual(assertArtifact(mid), []);
    assert.equal(mid.kind, 'PartyFingerprint');
    assert.ok(mid.url.includes('?') && mid.url.includes('read-the-room'));
    for (let r = 0; r < ROUNDS; r++) {
      for (const id of [...s.order]) {
        const mine = s.order.indexOf(id);
        s.vote(id, (mine + 1) % s.order.length);
      }
      if (r < ROUNDS - 1) s.step(REVEAL_MS);
    }
    s.step(REVEAL_MS);
    const fin = s.fingerprint('ABCD', 'https://play.example');
    assert.deepEqual(assertArtifact(fin), []);
    assert.ok(fin.title.includes('read the room best'));
    assert.equal((fin.data.rounds as unknown[]).length, ROUNDS);
  });

  it('feed never grows past 3 lines', () => {
    const s = trio();
    for (let r = 0; r < ROUNDS; r++) {
      for (const id of [...s.order]) {
        const mine = s.order.indexOf(id);
        s.vote(id, (mine + 1) % s.order.length);
      }
      if (r < ROUNDS - 1) s.step(REVEAL_MS);
    }
    assert.ok(s.feed.length <= 3);
  });

  it('snapshot budget: 15-player vote fits p95 ≤2KB', () => {
    const s = new RoomSim(seq(0.3));
    for (let i = 0; i < 15; i++) s.join(`p${i}`, `Player${i}`, i > 2);
    s.step(LOBBY_COUNTDOWN_MS);
    assert.equal(s.phase, 'vote');
    let max = 0;
    for (let i = 0; i < 15; i++) {
      max = Math.max(max, JSON.stringify(s.snapshot(`p${i}`)).length);
    }
    assert.ok(max <= 2048, `snapshot ${max}B exceeds 2KB`);
  });

  it('scores carry bot flags + you markers for the client', () => {
    const s = new RoomSim(seq(0.3));
    s.join('h', 'Human', false);
    s.join('x', 'Xeno', true);
    s.join('y', 'Yara', true);
    s.step(LOBBY_COUNTDOWN_MS);
    const sc = s.snapshot('h').scores;
    assert.equal(sc.find((x) => x.n === 'Human')!.you, true);
    assert.equal(sc.filter((x) => x.bot).length, 2);
  });

  it('duplicate joins are ignored', () => {
    const s = trio();
    s.join('a', 'Asha-again', false);
    assert.equal(s.playerCount(), 3);
    assert.equal(s.snapshot('a').round?.options.length, 3);
  });
});
