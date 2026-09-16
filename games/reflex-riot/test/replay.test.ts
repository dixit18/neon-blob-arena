// games/reflex-riot/test/replay.test.ts — RR-3: event log regenerates the
// end state; ReplayMoment artefact validates via packages/share asserts.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RiotSim, REPLAY_FRAMES, type TaskKind } from '../sim.js';
import { assertArtifact } from '../../../packages/share/src/index.js';

const TICK = 50;

/** Scripted match: two humans play every task with comfortable margins. */
function scripted(): RiotSim {
  const s = new RiotSim();
  s.join('h1', 'Ria', false);
  s.join('h2', 'Dev', false);
  let guard = 0;
  let done = ''; // act exactly once per rule, like a real room log
  while (s.phase !== 'final' && guard++ < 5000) {
    if (s.phase === 'task' && s.task) {
      const t = s.task;
      const sig = `${t.kind}@${t.startedAt}`;
      if (sig !== done) {
        done = sig;
        const kind: TaskKind = t.kind;
      // act mid-window, far from transitions
      if (kind === 'tap') {
        for (const id of ['h1', 'h2']) { s.press(id, t.startedAt + 300); s.release(id, t.startedAt + 350); }
      } else if (kind === 'hold') {
        for (const id of ['h1', 'h2']) { s.press(id, t.startedAt + 100); s.release(id, t.endsAt - 100); }
      } else if (kind === 'avoid') {
        s.press('h2', t.startedAt + 500); s.release('h2', t.startedAt + 550); // h2 eats lava
      } else if (kind === 'mash') {
        for (let k = 0; k < 8; k++) {
          const at = t.startedAt + 200 + k * 250;
          for (const id of ['h1', 'h2']) { s.press(id, at); s.release(id, at + 20); }
        }
      } else if (kind === 'copy') {
        for (const pad of t.seq) { s.answer('h1', pad); s.answer('h2', pad); }
      }
      }
    }
    s.step(TICK);
  }
  assert.equal(s.phase, 'final');
  return s;
}

describe('riot replay', () => {
  it('log regenerates the end state exactly', () => {
    const a = scripted();
    const b = RiotSim.replay(a.log);
    assert.deepEqual(
      [...b.players.values()].map((p) => [p.id, p.score, p.best, p.streak]),
      [...a.players.values()].map((p) => [p.id, p.score, p.best, p.streak]),
    );
    assert.equal(b.roundNo, a.roundNo);
    assert.deepEqual(b.snapshot('h1'), a.snapshot('h1'));
  });

  it('log records every input op', () => {
    const s = scripted();
    const ops = s.log.map((e) => e.op);
    assert.ok(ops.includes('join'));
    assert.ok(ops.filter((o) => o === 'press').length >= 10);
    assert.ok(ops.includes('release'));
    assert.ok(ops.includes('answer'));
  });

  it('ReplayMoment validates via share asserts and re-enters play', () => {
    const s = scripted();
    const m = s.moment('WTQ7', 'https://playground-web.onrender.com');
    assert.deepEqual(assertArtifact(m), []);
    assert.equal(m.kind, 'ReplayMoment');
    assert.equal(m.game, 'reflex-riot');
    assert.ok(m.url.includes('?game=reflex-riot&room=WTQ7'), m.url);
    assert.ok((m.title as string).length > 0);
    const frames = (m.data as { frames: unknown[] }).frames;
    assert.ok(frames.length > 0 && frames.length <= REPLAY_FRAMES);
  });

  it('frames cap at nine, ending in the round winner', () => {
    const s = scripted();
    // play a second round to overflow the strip
    s.step(7000);
    assert.ok(s.frames.length <= REPLAY_FRAMES);
    const m = s.moment('AB12', 'https://x.test');
    assert.deepEqual(assertArtifact(m), []);
    assert.ok(m.title.includes('takes round') || m.title.includes('still wild'));
  });

  it('empty-room moment is honest, not a fake crown', () => {
    const s = new RiotSim();
    const m = s.moment('ZZ99', 'https://x.test');
    assert.deepEqual(assertArtifact(m), []);
    assert.ok(m.title.includes('still wild'));
  });
});
