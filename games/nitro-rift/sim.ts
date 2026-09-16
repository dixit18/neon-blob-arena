// games/nitro-rift/sim — multi-heat arcade racing (alpha-gaming-like).
// 4 lanes, boost meter, boost pads, bump slowdowns, rubber-band bots.
// Heats: first across TRACK_LEN (or furthest at 60s) takes the crown, then a
// fresh heat with a re-seeded pad layout. Pure deterministic sim: step(dtMs)
// only, seeded PRNG, headless-testable. Server-authoritative.
import { buildGameUrl, type ShareArtifact } from '../../packages/share/src/index.js';
import { TRACK_LEN, LANES, stepRacer, type Pad, type RacerState } from './physics.js';

export type NitroPhase = 'lobby' | 'race' | 'final';

export interface NitroRacer {
  id: string;
  name: string;
  isBot: boolean;
  st: RacerState;
  steer: number;
  boostHeld: boolean;
  finishedAt: number;
  wins: number;
}

export interface NitroSnapshot {
  t: 'nitro';
  phase: NitroPhase;
  heat: number;
  endsInMs: number;
  pads: { at: number; lane: number }[];
  you: { prog: number; lane: number; boost: number; place: number };
  racers: { n: string; prog: number; lane: number; you: boolean; bot: boolean; fin: boolean }[];
  feed: string[];
}

export const LOBBY_MS = 1500;
export const HEAT_MS = 60_000;
export const FINAL_MS = 5000;
export const PADS = 6;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class NitroSim {
  time = 0;
  phase: NitroPhase = 'lobby';
  phaseUntil = 0;
  heatNo = 1;
  racers = new Map<string, NitroRacer>();
  pads: Pad[] = [];
  feed: string[] = [];
  private rand: () => number = mulberry32(21);
  private raceStart = 0;

  humanCount(): number { let n = 0; for (const r of this.racers.values()) if (!r.isBot) n++; return n; }
  playerCount(): number { return this.racers.size; }

  join(id: string, name: string, isBot: boolean): void {
    if (this.racers.has(id)) return;
    const lane = Math.floor(this.rand() * LANES);
    this.racers.set(id, {
      id, name, isBot,
      st: { prog: 0, lane, boost: 60, slowUntil: 0 },
      steer: 0, boostHeld: false, finishedAt: 0, wins: 0,
    });
    if (!isBot && this.phase === 'lobby' && this.phaseUntil === 0) {
      this.phaseUntil = this.time + LOBBY_MS;
    }
  }

  leave(id: string): void {
    this.racers.delete(id);
  }

  /** Drive intent: steer -1/0/+1 lane glide, boost held. */
  drive(id: string, steer: number, boost: boolean): void {
    const r = this.racers.get(id);
    if (!r || this.phase !== 'race' || r.finishedAt !== 0) return;
    r.steer = Number.isFinite(steer) ? Math.sign(steer) : 0;
    r.boostHeld = boost === true;
  }

  places(): NitroRacer[] {
    return [...this.racers.values()].sort((a, b) => {
      if ((a.finishedAt !== 0) !== (b.finishedAt !== 0)) return a.finishedAt !== 0 ? -1 : 1;
      if (a.finishedAt && b.finishedAt) return a.finishedAt - b.finishedAt;
      return b.st.prog - a.st.prog;
    });
  }

  step(dtMs: number): void {
    this.time += dtMs;
    if (this.phase === 'lobby') {
      if (this.phaseUntil !== 0 && this.time >= this.phaseUntil && this.humanCount() > 0) this.startHeat();
      return;
    }
    if (this.phase === 'race') {
      const all = [...this.racers.values()];
      for (const r of all) {
        if (r.finishedAt !== 0) continue;
        const others = all.filter((o) => o.id !== r.id).map((o) => ({ prog: o.st.prog, lane: o.st.lane }));
        stepRacer(r.st, { steer: r.steer, boost: r.boostHeld }, this.pads, others, this.time, dtMs);
        if (r.st.prog >= TRACK_LEN && r.finishedAt === 0) r.finishedAt = this.time;
      }
      const everyFin = all.length > 0 && all.every((r) => r.finishedAt !== 0);
      if (everyFin || this.time - this.raceStart >= HEAT_MS) this.endHeat();
      return;
    }
    if (this.phase === 'final') {
      if (this.time >= this.phaseUntil) this.nextHeat();
    }
  }

  private startHeat(): void {
    this.phase = 'race';
    this.raceStart = this.time;
    const r = this.rand;
    this.pads = [];
    for (let i = 0; i < PADS; i++) {
      this.pads.push({ at: 150 + r() * (TRACK_LEN - 300), lane: Math.floor(r() * LANES) });
    }
    this.pushFeed(`🏁 heat ${this.heatNo} — pedal down, pads are +boost!`);
  }

  private endHeat(): void {
    const order = this.places();
    const win = order[0] ?? null;
    if (win) {
      win.wins++;
      this.pushFeed(`🏆 ${win.name} takes heat ${this.heatNo}!`);
    }
    this.phase = 'final';
    this.phaseUntil = this.time + FINAL_MS;
  }

  private nextHeat(): void {
    this.heatNo++;
    this.rand = mulberry32(this.heatNo * 40503 + 11);
    for (const r of this.racers.values()) {
      r.st = { prog: 0, lane: Math.floor(this.rand() * LANES), boost: 60, slowUntil: 0 };
      r.steer = 0; r.boostHeld = false; r.finishedAt = 0;
    }
    this.phase = 'lobby';
    this.phaseUntil = this.humanCount() > 0 ? this.time + LOBBY_MS : 0;
  }

  private pushFeed(s: string): void {
    this.feed.push(s);
    if (this.feed.length > 3) this.feed.splice(0, this.feed.length - 3);
  }

  ghost(room: string, origin: string): ShareArtifact {
    const order = this.places();
    const win = order[0];
    return {
      kind: 'GhostChallenge',
      game: 'nitro-rift',
      room,
      title: win ? `👻 ${win.name} set the pace in heat ${this.heatNo} — chase it!` : '👻 no pace set yet — be the ghost!',
      url: buildGameUrl(origin, 'nitro-rift', room),
      data: { heat: this.heatNo, seed: this.heatNo * 40503 + 11, laps: 1 },
    };
  }

  snapshot(pid: string): NitroSnapshot {
    const me = this.racers.get(pid);
    const order = this.places();
    const place = me ? order.indexOf(me) + 1 : 0;
    return {
      t: 'nitro',
      phase: this.phase,
      heat: this.heatNo,
      endsInMs: this.phase === 'race' ? Math.max(0, HEAT_MS - (this.time - this.raceStart)) : 0,
      pads: this.pads.map((p) => ({ at: Math.round(p.at), lane: p.lane })),
      you: {
        prog: Math.round(me?.st.prog ?? 0),
        lane: Math.round((me?.st.lane ?? 0) * 10) / 10,
        boost: Math.round(me?.st.boost ?? 0),
        place,
      },
      racers: order.slice(0, 8).map((r) => ({
        n: r.name, prog: Math.round(r.st.prog), lane: Math.round(r.st.lane),
        you: r.id === pid, bot: r.isBot, fin: r.finishedAt !== 0,
      })),
      feed: [...this.feed],
    };
  }
}
