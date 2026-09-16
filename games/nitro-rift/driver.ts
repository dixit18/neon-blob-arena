// games/nitro-rift/driver — NitroSim adapted to the RoomDriver seam.
// Bots are labelled (🤖) + imperfect: lane wobble, late boost, rubber-band
// pacing (leaders ease off, trailers push) so humans always race someone.
// Solo joiners get an instant grid, never a waiting screen.
import type { RoomDriver, JoinInfo, GameCommand } from '../../packages/room/src/index.js';
import { NitroSim } from './sim.js';
import { wantedBots, tag } from '../../packages/bots/src/index.js';

const BOT_NAMES = ['Turbo', 'Drift', 'Nitro', 'Vex', 'Zoom', 'Apex', 'Rally'];
const MAX_TOTAL = 8;

export function createNitroDriver(rand: () => number = Math.random): RoomDriver {
  const sim = new NitroSim();
  const bots = new Set<string>();
  let botSeq = 0;

  function ensureBots(): void {
    const humans = sim.humanCount();
    if (humans === 0) {
      for (const b of bots) sim.leave(b);
      bots.clear();
      return;
    }
    const want = Math.min(wantedBots(humans), MAX_TOTAL - humans);
    let have = 0;
    for (const r of sim.racers.values()) if (r.isBot) have++;
    while (have < want) {
      const slot = botSeq++;
      const id = `bot-${slot}`;
      sim.join(id, tag(BOT_NAMES[slot % BOT_NAMES.length]!), true);
      bots.add(id);
      have++;
    }
  }

  function botThink(id: string): void {
    const me = sim.racers.get(id);
    if (!me || sim.phase !== 'race') return;
    // chase the nearest pad in our lane band, else hold center-ish
    let targetLane = 1.5;
    let best = Infinity;
    for (const p of sim.pads) {
      if (p.at < me.st.prog) continue;
      const d = p.at - me.st.prog;
      if (d < best) { best = d; targetLane = p.lane; }
    }
    const laneErr = targetLane - me.st.lane;
    const wobble = (rand() - 0.5) * 0.6; // imperfect lines
    const steer = Math.abs(laneErr) < 0.15 ? 0 : Math.sign(laneErr + wobble);
    // rubber-band: push when behind, ease when ahead
    const order = sim.places();
    const place = order.indexOf(me);
    const leaderProg = order[0]?.st.prog ?? me.st.prog;
    const behind = leaderProg - me.st.prog;
    let boost = me.st.boost > 25;
    if (place <= 1 && behind < 40) boost = me.st.boost > 70; // leader saves it
    if (behind > 150) boost = me.st.boost > 5; // trailer sends it
    if (rand() < 0.05) boost = false; // late on the button sometimes
    sim.drive(id, steer, boost);
  }

  return {
    game: 'nitro-rift',
    join(p: JoinInfo): void { sim.join(p.id, p.name, p.isBot); ensureBots(); },
    leave(id: string): void { sim.leave(id); bots.delete(id); ensureBots(); },
    accept(cmd: GameCommand): void {
      if (cmd.kind !== 'input' || typeof cmd.data !== 'object' || cmd.data === null) return;
      const d = cmd.data as Record<string, unknown>;
      const steer = typeof d.dx === 'number' ? Math.sign(d.dx) : 0;
      const boost = d.fire === true || d.dash === true;
      sim.drive(cmd.by, steer, boost);
    },
    step(dt: number): void {
      sim.step(dt * 1000);
      if (sim.phase === 'race') for (const b of bots) botThink(b);
    },
    snapshot: (pid: string) => sim.snapshot(pid),
    createBot: (slot: number) => ({ name: tag(BOT_NAMES[slot % BOT_NAMES.length]!) }),
    playerCount: () => sim.playerCount(),
    dispose: () => { bots.clear(); },
  };
}
