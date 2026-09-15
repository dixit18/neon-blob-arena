// Contract tests: packages/protocol. Every guard change must update these.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PROTOCOL_V, isEnvelope, isInput, isAnswer, isStrokeBatch, isEmote, isReconnect, makeEnvelope } from '../src/index.js';

const env = (o: object) => ({ v: PROTOCOL_V, type: 'input', room: 'ABCD', seq: 1, payload: {}, ...o });

describe('envelope', () => {
  it('accepts a valid envelope', () => assert.equal(isEnvelope(env({})), true));
  it('rejects wrong version', () => assert.equal(isEnvelope(env({ v: 999 })), false));
  it('rejects unknown type', () => assert.equal(isEnvelope(env({ type: 'nuke' })), false));
  it('rejects bad room codes', () => {
    for (const room of ['', 'ab', 'TOOLONGCODE99', 'AB-CD', 'ab12']) assert.equal(isEnvelope(env({ room })), false, room);
    assert.equal(isEnvelope(env({ room: 'X7Q2' })), true);
  });
  it('rejects negative/float seq', () => {
    assert.equal(isEnvelope(env({ seq: -1 })), false);
    assert.equal(isEnvelope(env({ seq: 1.5 })), false);
  });
  it('rejects missing payload', () => assert.equal(isEnvelope({ v: 1, type: 'input', room: 'AB12', seq: 0 }), false));
  it('makeEnvelope stamps version', () => {
    const e = makeEnvelope('answer', 'ROOM1', 7, { i: 2 });
    assert.equal(e.v, PROTOCOL_V);
    assert.equal(isEnvelope(e), true);
  });
});

describe('input', () => {
  it('accepts minimal dx/dy', () => assert.equal(isInput({ dx: 0.5, dy: -1 }), true));
  it('accepts full controller payload', () => assert.equal(isInput({ dx: 1, dy: 0, dash: true, fire: false, aim: 1.57 }), true));
  it('rejects NaN/Infinity and wrong flag types', () => {
    assert.equal(isInput({ dx: NaN, dy: 0 }), false);
    assert.equal(isInput({ dx: 0, dy: Infinity }), false);
    assert.equal(isInput({ dx: 0, dy: 0, dash: 1 }), false);
    assert.equal(isInput({ dx: 0, dy: 0, aim: NaN }), false);
  });
});

describe('answer', () => {
  it('accepts 0-3', () => { for (let i = 0; i <= 3; i++) assert.equal(isAnswer({ i }), true); });
  it('rejects out-of-range/float/string', () => {
    assert.equal(isAnswer({ i: 4 }), false);
    assert.equal(isAnswer({ i: -1 }), false);
    assert.equal(isAnswer({ i: 1.5 }), false);
    assert.equal(isAnswer({ i: '2' }), false);
  });
});

describe('strokeBatch', () => {
  const pts = [{ x: 1, y: 2 }, { x: 3, y: 4 }];
  it('accepts a valid batch', () => assert.equal(isStrokeBatch({ strokeId: 9, pts, done: false }), true));
  it('rejects empty/oversize/non-integer points', () => {
    assert.equal(isStrokeBatch({ strokeId: 1, pts: [], done: true }), false);
    assert.equal(isStrokeBatch({ strokeId: 1, pts: new Array(65).fill({ x: 1, y: 1 }), done: false }), false);
    assert.equal(isStrokeBatch({ strokeId: 1, pts: [{ x: 1.5, y: 2 }], done: false }), false);
    assert.equal(isStrokeBatch({ strokeId: -1, pts, done: false }), false);
  });
});

describe('emote + reconnect', () => {
  it('emotes are fixed-set 0-4', () => {
    assert.equal(isEmote({ i: 0 }), true);
    assert.equal(isEmote({ i: 5 }), false);
  });
  it('reconnect needs a real token', () => {
    assert.equal(isReconnect({ token: 'short' }), false);
    assert.equal(isReconnect({ token: 'a'.repeat(32) }), true);
  });
});
