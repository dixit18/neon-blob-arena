// games/reflex-riot/test/sim.test.ts — RR-1 acceptance: rotation, windows,
// scoring, round flow, first-task budget. Deterministic clock, no sockets.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RiotSim, TASKS_PER_ROUND, LOBBY_COUNTDOWN_MS, FIRST_TASK_BUDGET_MS,
  type TaskKind,
} from '../sim.js';

const TICK = 50; // 20Hz like the server

function withHuman(s = new RiotSim()): RiotSim {
  s.join('h1', 'Ria', false);
  return s;
}

/** Step until a task is active (or throw after cap). Returns task kind. */
function untilTask(s: RiotSim, capMs = 10_000): TaskKind {
  let t = 0;
  while (s.phase !== 'task' && t < capMs) { s.step(TICK); t += TICK; }
  assert.equal(s.phase, 'task');
  return s.task!.kind;
}

function finishTask(s: RiotSim): void {
  let t = 0;
  while (s.phase === 'task' && t < 15_000) { s.step(TICK); t += TICK; }
  assert.equal(s.phase, 'reveal');
}

function drainReveal(s: RiotSim): void {
  let t = 0;
  while (s.phase === 'reveal' && t < 10_000) { s.step(TICK); t += TICK; }
}

describe('riot task engine', () => {
  it('first task begins within 3s of first human arrival', () => {
    const s = withHuman();
    const kind = untilTask(s, FIRST_TASK_BUDGET_MS);
    assert.ok(['tap', 'hold', 'avoid', 'mash', 'copy'].includes(kind));
  });

  it('lobby waits when nobody is around', () => {
    const s = new RiotSim();
    for (let i = 0; i < 200; i++) s.step(TICK);
    assert.equal(s.phase, 'lobby');
    assert.equal(s.task, null);
  });

  it('tasks rotate every 3-6s and never repeat twice', () => {
    const s = withHuman();
    const kinds: TaskKind[] = [];
    const windows: number[] = [];
    for (let i = 0; i < 6; i++) {
      untilTask(s);
      kinds.push(s.task!.kind);
      windows.push(s.task!.endsAt - s.task!.startedAt);
      finishTask(s);
      drainReveal(s);
    }
    for (const w of windows) assert.ok(w >= 2000 && w <= 6000, `window ${w}`);
    for (let i = 1; i < kinds.length; i++) assert.notEqual(kinds[i], kinds[i - 1]);
  });

  it('tap: fast press scores speed points + streak', () => {
    const s = withHuman();
    while (untilTask(s) !== 'tap') { finishTask(s); drainReveal(s); }
    const start = s.task!.startedAt;
    s.players.get('h1')!.streak = 0; // search may have survived an avoid task
    s.press('h1', start + 212);
    s.release('h1', start + 260);
    finishTask(s);
    const me = s.players.get('h1')!;
    assert.equal(me.gain, 1000 - 212); // 788, streak 0 → no bonus
    assert.equal(me.streak, 1);
    assert.equal(me.score, 788);
  });

  it('tap: slow press still pays the 100 floor', () => {
    const s = withHuman();
    while (untilTask(s) !== 'tap') { finishTask(s); drainReveal(s); }
    const start = s.task!.startedAt;
    s.press('h1', start + 2000);
    s.release('h1', start + 2050);
    finishTask(s);
    assert.equal(s.players.get('h1')!.gain, 100);
  });

  it('tap: no press = miss, streak resets', () => {
    const s = withHuman();
    while (untilTask(s) !== 'tap') { finishTask(s); drainReveal(s); }
    s.players.get('h1')!.streak = 2;
    finishTask(s);
    const me = s.players.get('h1')!;
    assert.equal(me.gain, 0);
    assert.equal(me.streak, 0);
  });

  it('hold: full hold pays 800 + streak bonus', () => {
    const s = withHuman();
    while (untilTask(s) !== 'hold') { finishTask(s); drainReveal(s); }
    const t = s.task!;
    s.press('h1', t.startedAt + 100);
    s.release('h1', t.startedAt + 100 + t.need + 200);
    finishTask(s);
    const me = s.players.get('h1')!;
    assert.equal(me.gain, 800);
    assert.equal(me.streak, 1);
  });

  it('hold: still holding at the whistle counts as full', () => {
    const s = withHuman();
    while (untilTask(s) !== 'hold') { finishTask(s); drainReveal(s); }
    s.press('h1', s.task!.startedAt + 50);
    finishTask(s); // never released
    assert.equal(s.players.get('h1')!.gain, 800);
  });

  it('hold: early release pays partial, keeps streak', () => {
    const s = withHuman();
    while (untilTask(s) !== 'hold') { finishTask(s); drainReveal(s); }
    const t = s.task!;
    s.players.get('h1')!.streak = 3;
    s.press('h1', t.startedAt + 100);
    s.release('h1', t.startedAt + 100 + t.need / 2);
    finishTask(s);
    const me = s.players.get('h1')!;
    assert.equal(me.gain, 400);
    assert.equal(me.streak, 3);
  });

  it('hold: pressing after the 1s grace fails', () => {
    const s = withHuman();
    while (untilTask(s) !== 'hold') { finishTask(s); drainReveal(s); }
    const t = s.task!;
    s.press('h1', t.startedAt + 1500);
    s.release('h1', t.endsAt - 10);
    finishTask(s);
    const me = s.players.get('h1')!;
    assert.equal(me.gain, 0);
    assert.equal(me.streak, 0);
  });

  it('avoid: survivor gets 400, toucher blows streak', () => {
    const s = withHuman();
    s.join('h2', 'Dev', false);
    while (untilTask(s) !== 'avoid') { finishTask(s); drainReveal(s); }
    const t = s.task!;
    s.players.get('h1')!.streak = 2;
    s.press('h2', t.startedAt + 500); // touched the lava
    s.release('h2', t.startedAt + 550);
    finishTask(s);
    assert.equal(s.players.get('h1')!.gain, 400 + 2 * 25);
    assert.equal(s.players.get('h1')!.streak, 3);
    assert.equal(s.players.get('h2')!.gain, 0);
    assert.equal(s.players.get('h2')!.streak, 0);
  });

  it('mash: 8 presses earn per-press + bonus + streak', () => {
    const s = withHuman();
    while (untilTask(s) !== 'mash') { finishTask(s); drainReveal(s); }
    const t = s.task!;
    for (let i = 0; i < 10; i++) {
      const at = t.startedAt + 100 + i * 200;
      s.press('h1', at);
      s.release('h1', at + 20);
    }
    finishTask(s);
    const me = s.players.get('h1')!;
    assert.equal(me.gain, 10 * 60 + 300);
    assert.equal(me.streak, 1);
  });

  it('mash: idle player keeps zero, loses streak', () => {
    const s = withHuman();
    while (untilTask(s) !== 'mash') { finishTask(s); drainReveal(s); }
    s.players.get('h1')!.streak = 4;
    finishTask(s);
    assert.equal(s.players.get('h1')!.gain, 0);
    assert.equal(s.players.get('h1')!.streak, 0);
  });

  it('copy: full sequence pays 750 + streak', () => {
    const s = withHuman();
    while (untilTask(s) !== 'copy') { finishTask(s); drainReveal(s); }
    s.players.get('h1')!.streak = 0; // search may have survived an avoid task
    for (const pad of s.task!.seq) s.answer('h1', pad);
    finishTask(s);
    const me = s.players.get('h1')!;
    assert.equal(me.gain, 3 * 150 + 300);
    assert.equal(me.streak, 1);
  });

  it('copy: wrong pad ends attempt, streak dies, partial kept', () => {
    const s = withHuman();
    while (untilTask(s) !== 'copy') { finishTask(s); drainReveal(s); }
    const seq = s.task!.seq;
    s.answer('h1', seq[0]!);
    s.answer('h1', (seq[1]! + 1) % 4); // wrong
    s.answer('h1', seq[2]!); // too late, attempt over
    finishTask(s);
    const me = s.players.get('h1')!;
    assert.equal(me.gain, 150);
    assert.equal(me.streak, 0);
  });

  it('round: 8 tasks then final with a crown, then fresh round', () => {
    const s = withHuman();
    for (let i = 0; i < TASKS_PER_ROUND; i++) {
      untilTask(s);
      // h1 taps everything touchable so it wins something
      if (s.task!.kind === 'tap' || s.task!.kind === 'mash') {
        for (let k = 0; k < 10; k++) {
          const at = s.task!.startedAt + 100 + k * 150;
          s.press('h1', at); s.release('h1', at + 20);
          if (s.phase !== 'task') break;
        }
      }
      if (s.phase === 'task') finishTask(s);
      drainReveal(s);
    }
    assert.equal(s.phase, 'final');
    assert.ok(s.feed.some((f) => f.includes('takes round 1')), `feed: ${s.feed}`);
    const before = s.players.get('h1')!.best;
    assert.ok(before > 0);
    let t = 0;
    while (s.phase === 'final' && t < 15_000) { s.step(TICK); t += TICK; }
    assert.equal(s.roundNo, 2);
    assert.equal(s.players.get('h1')!.score, 0); // fresh table, best kept
    assert.equal(s.players.get('h1')!.best, before);
  });

  it('snapshot is small and carries everything the client needs', () => {
    const s = withHuman();
    s.join('h2', 'Dev', false);
    untilTask(s);
    const snap = s.snapshot('h1');
    const bytes = Buffer.byteLength(JSON.stringify(snap));
    assert.ok(bytes <= 700, `${bytes}B over budget`);
    assert.equal(snap.t, 'riot');
    assert.ok(snap.task && snap.task.endsInMs > 0);
    assert.equal(snap.scores.length, 2);
    assert.equal(snap.you.score, 0);
    assert.equal(snap.round.total, TASKS_PER_ROUND);
  });

  it('leave removes the player; best survives rounds', () => {
    const s = withHuman();
    s.join('h2', 'Dev', false);
    s.leave('h2');
    assert.equal(s.playerCount(), 1);
    assert.equal(s.snapshot('h2').you.score, 0);
  });

  it('double press without release counts once (no inflation)', () => {
    const s = withHuman();
    while (untilTask(s) !== 'mash') { finishTask(s); drainReveal(s); }
    const t = s.task!;
    s.press('h1', t.startedAt + 100);
    s.press('h1', t.startedAt + 150); // stuck finger: ignored
    s.release('h1', t.startedAt + 200);
    finishTask(s);
    assert.equal(s.players.get('h1')!.gain, 60); // exactly one edge paid
  });
});
