import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EVENTS, BufferedWriter, type GameEvent } from '../src/index.js';

describe('analytics', () => {
  it('vocabulary covers the WAPS funnel', () => {
    for (const e of ['landing_view', 'first_input', 'room_join', 'round_end', 'share_create', 'challenge_join'] as const) {
      assert.ok((EVENTS as readonly string[]).includes(e), e);
    }
  });
  it('flushes in order through the sink', async () => {
    const seen: GameEvent[][] = [];
    const w = new BufferedWriter(async (b) => { seen.push(b); });
    w.push('room_join', { game: 'g', room: 'R' });
    w.push('round_end', { game: 'g' });
    const r = await w.flush();
    assert.equal(r.sent, 2);
    assert.equal(seen[0]![0]!.name, 'room_join');
    assert.equal((await w.flush()).sent, 0);
  });
  it('overflows lossy, never throws', async () => {
    const w = new BufferedWriter(async () => {});
    for (let i = 0; i < 600; i++) w.push('perf_sample');
    assert.equal(w.pending.length, 500);
    assert.equal(w.dropped, 100);
    const r = await w.flush();
    assert.equal(r.sent, 500);
  });
  it('sink failure becomes drops, not crashes', async () => {
    const w = new BufferedWriter(async () => { throw new Error('down'); });
    w.push('room_join');
    const r = await w.flush();
    assert.equal(r.dropped, 1);
  });
});
