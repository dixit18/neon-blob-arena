import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildGameUrl, buildRiftUrl, assertArtifact } from '../src/index.js';

describe('share', () => {
  it('builds playable deep links, never bare homepages', () => {
    const u = buildGameUrl('https://play.example', 'ghostline', 'X7Q2', { seed: 'abc' });
    assert.ok(u.includes('game=ghostline') && u.includes('room=X7Q2') && u.includes('seed=abc'));
    assert.equal(buildGameUrl('https://play.example/', 'reflex-riot').includes('game=reflex-riot'), true);
  });
  it('builds rift links', () => {
    assert.equal(buildRiftUrl('https://play.example', 'X7Q2'), 'https://play.example/?rift=X7Q2');
  });
  it('accepts a valid ghost challenge', () => {
    assert.deepEqual(assertArtifact({
      kind: 'GhostChallenge', game: 'ghostline', title: 'beat 7.42s',
      url: 'https://p/?game=ghostline&seed=abc', data: { seed: 'abc', trail: [1, 2, 3] },
    }), []);
  });
  it('rejects button-shaped artefacts', () => {
    assert.ok(assertArtifact({ kind: 'LikeButton', game: 'x', title: 't', url: 'https://p/', data: {} }).includes('kind'));
    assert.ok(assertArtifact({ kind: 'ResultGrid', game: 'x', title: 't', url: 'https://p/', data: {} }).includes('url'));
  });
  it('daily grids must not leak the solution', () => {
    const bad = { kind: 'DailyGrid', game: 'signal-seven', title: '3/7', url: 'https://p/?game=s', data: { grid: '🟩⬛', solution: 'ORBIT' }, solution: 'ORBIT' };
    assert.ok(assertArtifact(bad).includes('daily-leaks-solution'));
  });
  it('ghost payloads stay ≤20KB', () => {
    const big = { kind: 'GhostChallenge', game: 'ghostline', title: 't', url: 'https://p/?game=g', data: { trail: 'x'.repeat(25_000) } };
    assert.ok(assertArtifact(big).includes('ghost-too-big'));
  });
});
