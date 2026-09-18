// games/ghostline/driver — LineSim adapted to the RoomDriver seam (GH-2).
// Ghost bots rehearse with the replay core: each plans its next flick by
// rolling out candidates against the live course from its real puck. Sharps
// search wide and hole out in few; casuals search narrow, cap power, and
// flub every fourth read — beatable lines, never demo gods (Rehan's bound).
// Solo humans get an instant table of 8, never a waiting screen.
// Transport: `input` {angle, power} = flick.
import type { RoomDriver, JoinInfo, GameCommand } from '../../packages/room/src/index.js';
import {
  LineSim, rollOut, MAX_SHOTS, GOAL, REST_EPS,
  type Course, type Flick,
} from './sim.js';
import { tag } from '../../packages/bots/src/index.js';

const BOT_NAMES = ['Wisp', 'Echo', 'Mira', 'Halo', 'Drift', 'Nyx', 'Pip'];
const TABLE = 8;
const SHARP_TRIES = 24;
const CASUAL_TRIES = 6;
const CASUAL_POWER_CAP = 0.8;
const CASUAL_FLUB = 0.25; // every ~fourth read takes the second-best line

export type Tier = 0 | 1; // 0 sharp, 1 casual

function dist(x: number, y: number): number {
  return Math.hypot(x - GOAL.x, y - GOAL.y);
}

/** Score a rollout: finishes sort by (shots, time), misses by distance. */
function score(r: { finished: boolean; timeMs: number; x: number; y: number }): [number, number] {
  return r.finished ? [0, r.timeMs] : [1, dist(r.x, r.y)];
}

function better(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
}

/** The bot brain, exported pure for tests: next flick from (x, y). */
export function planFlick(
  course: Course, x: number, y: number, tier: Tier, rand: () => number = Math.random,
): Flick {
  // Goal-directed search: spokes fan the full circle around the goal line so
  // the lane is always covered, powers sweep golden-ratio so some candidate
  // carries the right legs. Jitter keeps lines personal, not cloned.
  const tries = tier === 0 ? SHARP_TRIES : CASUAL_TRIES;
  const goalA = Math.atan2(GOAL.y - y, GOAL.x - x);
  const spread = tier === 0 ? 0.35 : 0.7;
  const consider = (f: Flick, st: { first: Flick; firstScore: [number, number]; second: Flick; secondScore: [number, number]; haveSecond: boolean }): void => {
    const s = score(rollOut(course, { x, y }, [f]));
    if (better(s, st.firstScore)) {
      st.second = st.first; st.secondScore = st.firstScore; st.haveSecond = true;
      st.first = f; st.firstScore = s;
    } else if (!st.haveSecond || better(s, st.secondScore)) {
      st.second = f; st.secondScore = s; st.haveSecond = true;
    }
  };
  const st = {
    first: { angle: goalA, power: 0.6 },
    firstScore: [1, dist(x, y)] as [number, number],
    second: { angle: goalA, power: 0.6 },
    secondScore: [1, Infinity] as [number, number],
    haveSecond: false,
  };
  consider(st.first, st); // the honest line is always in the running
  for (let i = 0; i < tries; i++) {
    const angle = goalA + ((i + 0.5) / tries - 0.5) * Math.PI * 2
      + (rand() - 0.5) * spread;
    const power = tier === 0
      ? 0.35 + 0.65 * (((i * 0.6180339887) % 1 + 1) % 1)
      : 0.3 + (CASUAL_POWER_CAP - 0.3) * (((i * 0.6180339887) % 1 + 1) % 1);
    consider({ angle, power }, st);
  }
  if (tier === 1 && st.haveSecond && rand() < CASUAL_FLUB) return st.second; // the flub
  return st.first;
}

function flickDelayMs(tier: Tier, rand: () => number): number {
  return tier === 0 ? 1500 + rand() * 1500 : 3000 + rand() * 3000;
}

export function createLineDriver(
  rand: () => number = Math.random,
): RoomDriver & { setBaseSeed(seed: number): boolean } {  const sim = new LineSim(rand);
  const bots = new Map<string, Tier>();
  let botSeq = 0;
  let seenRun = 0;
  const dueAt = new Map<string, number>();

  function ensureBots(): void {
    const humans = [...sim.players.values()].filter((p) => !p.isBot).length;
    if (humans === 0) {
      for (const b of bots.keys()) sim.leave(b);
      bots.clear();
      return;
    }
    while (sim.playerCount() < TABLE) {
      const slot = botSeq++;
      const id = `bot-${slot}`;
      sim.join(id, tag(BOT_NAMES[slot % BOT_NAMES.length]!), true);
      bots.set(id, (slot % 2) as Tier);
    }
  }

  function botAct(id: string): void {
    if (sim.phase !== 'run') return;
    const p = sim.players.get(id);
    if (!p || p.finished || p.exhausted) return;
    if (Math.hypot(p.vx, p.vy) >= REST_EPS) return; // plan only at rest
    if (p.shots >= MAX_SHOTS) return;
    if (sim.runNo !== seenRun) { seenRun = sim.runNo; dueAt.clear(); }
    let due = dueAt.get(id);
    if (due === undefined) {
      due = sim.time + flickDelayMs(bots.get(id) ?? 0, rand);
      dueAt.set(id, due);
    }
    if (sim.time < due) return; // still lining up — humans move first
    const f = planFlick(sim.course, p.x, p.y, bots.get(id) ?? 0, rand);
    sim.flick(id, f.angle, f.power);
    dueAt.delete(id);
  }

  return {
    game: 'ghostline',
    join(info: JoinInfo): void { sim.join(info.id, info.name, info.isBot); ensureBots(); },
    leave(id: string): void { sim.leave(id); bots.delete(id); dueAt.delete(id); ensureBots(); },
    accept(cmd: GameCommand): void {
      // Wire shape is the protocol's {dx, dy} vector (isInput-gated server-
      // side) — decoded back to angle/power here. Zero-vector dies in flick.
      if (cmd.kind === 'input' && typeof cmd.data === 'object' && cmd.data !== null) {
        const d = cmd.data as Record<string, unknown>;
        if (typeof d.dx === 'number' && typeof d.dy === 'number') {
          sim.flick(cmd.by, Math.atan2(d.dy, d.dx), Math.min(1, Math.hypot(d.dx, d.dy)));
        }
      }
    },
    step(dt: number): void {
      sim.step(dt * 1000);
      for (const b of bots.keys()) botAct(b);
    },
    snapshot: (pid: string) => sim.snapshot(pid),
    createBot: (slot: number) => ({ name: tag(BOT_NAMES[slot % BOT_NAMES.length]!) }),
    playerCount: () => sim.playerCount(),
    dispose: () => { bots.clear(); dueAt.clear(); },
    setBaseSeed: (seed: number) => sim.setBaseSeed(seed),
  };
}
