// packages/analytics — event vocabulary + bounded buffered writer.
// Live sims never await the sink: push() is sync, flush() is async + lossy.
export const EVENTS = [
  'landing_view', 'first_input', 'room_join', 'room_leave',
  'round_start', 'round_end', 'second_round', 'game_switch',
  'share_create', 'share_open', 'challenge_open', 'challenge_join',
  'perf_sample', 'room_crash', 'studio_thought',
] as const;
export type EventName = (typeof EVENTS)[number];

export interface GameEvent {
  name: EventName;
  at: number;
  game?: string;
  room?: string;
  data?: Record<string, unknown>;
}

export type Sink = (batch: GameEvent[]) => Promise<void>;
const CAP = 500;

export class BufferedWriter {
  pending: GameEvent[] = [];
  dropped = 0;
  constructor(private sink: Sink) {}

  push(name: EventName, opts: { game?: string; room?: string; data?: Record<string, unknown> } = {}): void {
    if (this.pending.length >= CAP) {
      this.pending.shift();
      this.dropped++;
    }
    this.pending.push({ name, at: Date.now(), ...opts });
  }

  async flush(): Promise<{ sent: number; dropped: number }> {
    if (this.pending.length === 0) return { sent: 0, dropped: this.dropped };
    const batch = this.pending;
    this.pending = [];
    try {
      await this.sink(batch);
    } catch {
      this.dropped += batch.length; // lossy by design: telemetry never blocks play
    }
    return { sent: batch.length, dropped: this.dropped };
  }
}
