import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GAMES, getGame, validateManifest } from '../src/index.js';

describe('catalog', () => {
  it('ships six manifests, one verb each', () => {
    assert.equal(GAMES.length, 6);
    assert.equal(new Set(GAMES.map(g => g.verb)).size, 6);
    assert.equal(new Set(GAMES.map(g => g.id)).size, 6);
  });
  it('every manifest validates clean', () => {
    for (const g of GAMES) assert.deepEqual(validateManifest(g), [], g.id);
  });
  it('every game owns a share artefact kind', () => {
    for (const g of GAMES) assert.ok(g.shareKind);
  });
  it('party cap never exceeds 15', () => {
    for (const g of GAMES) assert.ok(g.maxPlayers <= 15, g.id);
  });
  it('rejects bad manifests with field names', () => {
    assert.ok(validateManifest({}).length > 3);
    assert.deepEqual(validateManifest({ ...GAMES[0], minPlayers: 9, maxPlayers: 2 }), ['players']);
    assert.deepEqual(validateManifest({ ...GAMES[0], shareKind: 'LikeButton' }), ['shareKind']);
    assert.deepEqual(validateManifest({ ...GAMES[0], moods: [] }), ['moods']);
  });
  it('getGame resolves + misses', () => {
    assert.equal(getGame('ghostline')?.verb, 'FLICK');
    assert.equal(getGame('nope'), null);
  });
});
