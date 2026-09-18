// apps/server/test/share-audit.test.ts — GB-2: every catalog title owns a
// ShareArtifact. Each game resolves to a registered driver AND its sim's
// share output passes assertArtifact with the catalog's kind. A new game
// with no share method fails here — the share is part of the definition
// of done, not a follow-up.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GAMES, getGame } from '../../../packages/catalog/src/index.js';
import { assertArtifact, type ShareArtifact } from '../../../packages/share/src/index.js';
import { createApp } from '../src/app.js';
import { RiotSim } from '../../../games/reflex-riot/sim.js';
import { DoodleSim } from '../../../games/doodle-duel/sim.js';
import { BlazeSim } from '../../../games/blaze-squad/sim.js';
import { NitroSim } from '../../../games/nitro-rift/sim.js';
import { LudoSim } from '../../../games/ludo-clash/sim.js';
import { RoomSim } from '../../../games/read-the-room/sim.js';
import { LineSim } from '../../../games/ghostline/sim.js';
import { SignalSim } from '../../../games/signal-seven/sim.js';
import { TotemSim } from '../../../games/totem-panic/sim.js';
import { SiegeSim } from '../../../games/ricochet-siege/sim.js';

const app = createApp({ region: 'test' });

function live<T>(make: () => T, join: (s: T) => void): T {
  const s = make();
  join(s);
  return s;
}

const join2 = (s: { join(id: string, name: string, isBot: boolean): void }): void => {
  s.join('audit-a', 'Audit Asha', false);
  s.join('audit-b', 'Audit Bheem', false);
};

// One shareable artifact per game, mid-game honest states included.
const CASES: { id: string; make: () => ShareArtifact }[] = [
  { id: 'reflex-riot', make: () => live(() => new RiotSim(), join2).moment('ROOM', 'https://x.test') },
  { id: 'doodle-duel', make: () => live(() => new DoodleSim(), join2).moment('ROOM', 'https://x.test') },
  { id: 'blaze-squad', make: () => live(() => new BlazeSim(), join2).moment('ROOM', 'https://x.test') },
  { id: 'nitro-rift', make: () => live(() => new NitroSim(), join2).ghost('ROOM', 'https://x.test') },
  { id: 'ludo-clash', make: () => live(() => new LudoSim(), join2).grid('ROOM', 'https://x.test') },
  { id: 'read-the-room', make: () => live(() => new RoomSim(), join2).fingerprint('ROOM', 'https://x.test') },
  { id: 'ghostline', make: () => live(() => new LineSim(), join2).ghost('ROOM', 'https://x.test') },
  { id: 'signal-seven', make: () => live(() => new SignalSim(), join2).grid('ROOM', 'https://x.test') },
  { id: 'totem-panic', make: () => live(() => new TotemSim(), join2).replay('ROOM', 'https://x.test') },
  { id: 'ricochet-siege', make: () => live(() => new SiegeSim(), join2).replay('ROOM', 'https://x.test') },
];

describe('share audit (GB-2)', () => {
  it('catalog lists exactly the 10 live games', () => {
    assert.equal(GAMES.length, 10);
    assert.deepEqual(CASES.map((c) => c.id).sort(), GAMES.map((g) => g.id).sort());
  });

  it('every title resolves to a registered driver', () => {
    for (const g of GAMES) {
      assert.ok(app.registry.factories.has(g.id), `${g.id} has no driver (refusal live)`);
    }
    app.shutdown();
  });

  for (const c of CASES) {
    it(`${c.id} owns a valid ${getGame(c.id)!.shareKind}`, () => {
      const a = c.make();
      assert.deepEqual(assertArtifact(a), [], `${c.id} artifact invalid`);
      assert.equal(a.game, c.id);
      assert.equal(a.kind, getGame(c.id)!.shareKind);
      assert.ok(a.url.includes(`game=${c.id}`), 're-entry URL names the game');
      assert.ok(a.title.length > 0);
    });
  }
});
