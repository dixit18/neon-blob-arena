// games/reflex-riot/driver — RiotSim adapted to the RoomDriver seam (RR-2/RR-6).
// Bots are labelled (🤖 tag) + imperfect: reaction-delay tiers from
// packages/bots + a 15% mistake rate. Solo joiners get 3+ instant opponents,
// never a waiting screen.
import type { RoomDriver, JoinInfo, GameCommand } from '../../packages/room/src/index.js';
import { RiotSim, type TaskKind } from './sim.js';
import { wantedBots, reactionDelayMs, tag } from '../../packages/bots/src/index.js';

const BOT_NAMES = ['Mochi', 'Panko', 'Suki', 'Miso', 'Dango', 'Tofu', 'Udon', 'Soba'];
const MAX_TOTAL = 8; // room cap for riot: keeps snapshots small, game readable
const MISTAKE_RATE = 0.15;

interface BotBrain {
  id: string;
  tier: 0 | 1 | 2;
  planAt: number; // sim-time when this task's action fires
  planned: string; // task signature already planned (kind+startedAt)
  mistake: boolean;
  mashNext: number;
  copyNext: number;
  holdReleaseAt: number;
}

export function createRiotDriver(rand: () => number = Math.random): RoomDriver {
  const sim = new RiotSim();
  const bots = new Map<string, BotBrain>();
  let botSeq = 0;

  function taskSig(): string {
    const t = sim.task;
    return t ? `${t.kind}@${t.startedAt}` : '';
  }

  function ensureBots(): void {
    const humans = sim.humanCount();
    if (humans === 0) { // empty room: bots clock out, fresh table for next party
      for (const b of bots.keys()) sim.leave(b);
      bots.clear();
      return;
    }
    const want = Math.min(wantedBots(humans), MAX_TOTAL - humans);
    let have = 0;
    for (const p of sim.players.values()) if (p.isBot) have++;
    while (have < want) {
      const slot = botSeq++;
      const id = `bot-${slot}`;
      const name = tag(BOT_NAMES[slot % BOT_NAMES.length]!);
      sim.join(id, name, true);
      bots.set(id, { id, tier: (slot % 3) as 0 | 1 | 2, planAt: 0, planned: '', mistake: false, mashNext: 0, copyNext: 0, holdReleaseAt: 0 });
      have++;
    }
  }

  function planBot(b: BotBrain): void {
    const t = sim.task;
    if (!t || sim.phase !== 'task') return;
    const sig = taskSig();
    if (b.planned === sig) return;
    b.planned = sig;
    b.mistake = rand() < MISTAKE_RATE;
    const delay = reactionDelayMs(b.tier, rand);
    b.planAt = t.startedAt + delay;
    b.mashNext = t.startedAt + delay;
    b.copyNext = t.startedAt + 400 + delay;
    b.holdReleaseAt = b.mistake ? t.startedAt + delay + 600 : t.endsAt - 50;
  }

  function botAct(b: BotBrain, kind: TaskKind): void {
    const t = sim.task;
    if (!t) return;
    const now = sim.time;
    if (kind === 'tap') {
      if (now >= (b.mistake ? t.endsAt + 1 : b.planAt)) { sim.press(b.id, now); sim.release(b.id, now + 30); b.planned = `${taskSig()}#done`; }
    } else if (kind === 'hold') {
      if (now >= b.planAt && !sim.players.get(b.id)?.pressed) sim.press(b.id, now);
      if (now >= b.holdReleaseAt && sim.players.get(b.id)?.pressed) { sim.release(b.id, now); b.planned = `${taskSig()}#done`; }
    } else if (kind === 'avoid') {
      if (b.mistake && now >= b.planAt) { sim.press(b.id, now); sim.release(b.id, now + 30); b.planned = `${taskSig()}#done`; }
    } else if (kind === 'mash') {
      if (now >= b.mashNext && now < t.endsAt) {
        sim.press(b.id, now); sim.release(b.id, now + 10);
        b.mashNext = now + (b.mistake ? 700 : 220 + rand() * 120);
      }
    } else if (kind === 'copy') {
      const p = sim.players.get(b.id);
      if (p && now >= b.copyNext && now < t.endsAt && !p.acted) {
        const idx = b.mistake && p.copyIdx === t.seq.length - 1
          ? (t.seq[p.copyIdx]! + 1) % 4 // blow the last pad, on purpose-ish
          : t.seq[p.copyIdx]!;
        sim.answer(b.id, idx, now);
        b.copyNext = now + 350 + rand() * 300;
      }
    }
  }

  return {
    game: 'reflex-riot',
    join(p: JoinInfo): void { sim.join(p.id, p.name, p.isBot); ensureBots(); },
    leave(id: string): void { sim.leave(id); bots.delete(id); ensureBots(); },
    accept(cmd: GameCommand): void {
      if (cmd.kind === 'input' && typeof cmd.data === 'object' && cmd.data !== null) {
        const d = cmd.data as Record<string, unknown>;
        if (d.fire === true) sim.press(cmd.by, sim.time);
        else if (d.fire === false) sim.release(cmd.by, sim.time);
      } else if (cmd.kind === 'answer' && typeof cmd.data === 'object' && cmd.data !== null) {
        const i = (cmd.data as Record<string, unknown>).i;
        if (Number.isInteger(i)) sim.answer(cmd.by, i as number, sim.time);
      }
    },
    step(dt: number): void {
      sim.step(dt * 1000);
      if (sim.phase === 'task' && sim.task) {
        for (const b of bots.values()) { planBot(b); botAct(b, sim.task.kind); }
      }
    },
    snapshot: (pid: string) => sim.snapshot(pid),
    createBot: (slot: number) => ({ name: tag(BOT_NAMES[slot % BOT_NAMES.length]!) }),
    playerCount: () => sim.playerCount(),
    dispose: () => { bots.clear(); },
  };
}
