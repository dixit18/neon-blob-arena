// apps/web/src/strings.test.ts — GB-4 acceptance: full Hindi parity,
// no empties, placeholder sets match, fallback is English, templates fill.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
// NOTE: importing strings.ts reads localStorage once (guarded) — node has
// none, so the suite runs in English. Hindi rows are asserted as data.
import { t, enKeys, placeholders, EN_TABLE, HI_TABLE } from './strings.js';

describe('strings', () => {
  it('every English key has a Hindi row, none empty', () => {
    assert.ok(enKeys().length >= 40, `shell table thin: ${enKeys().length}`);
    for (const k of enKeys()) {
      assert.ok(k in EN_TABLE, `en missing ${k}`);
      assert.ok(k in HI_TABLE, `hi missing ${k}`);
      assert.ok(EN_TABLE[k]!.length > 0 && HI_TABLE[k]!.length > 0, `empty ${k}`);
    }
  });

  it('placeholder sets match across languages', () => {
    for (const k of enKeys()) {
      assert.deepEqual(placeholders(HI_TABLE[k]!), placeholders(EN_TABLE[k]!), `{vars} diverge: ${k}`);
    }
  });

  it('t() fills templates and falls back honestly', () => {
    assert.equal(t('play.entering', { id: 'ludo-clash' }), 'entering ludo-clash…');
    assert.equal(t('no.such.key'), 'no.such.key'); // loud in tests
    assert.ok(t('play.label').length > 0);
  });

  it('no game content hides in the chrome table', () => {
    const low = JSON.stringify(EN_TABLE).toLowerCase();
    for (const b of ['cinder', 'salt & starlight', 'signal-seven reads']) {
      assert.ok(!low.includes(b), `content leak: ${b}`);
    }
  });
});
