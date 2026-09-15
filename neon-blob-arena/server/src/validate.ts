// Effect Schema gate for every client message.
// Server sim stays raw imperative; this validates UNTRUSTED input at the door.
// Steel Swarm ready: optional `aim` (turret angle, radians) rides the same gate
// so S1-3 transport needs no new validation path — sim reads it when it exists.
import { Schema } from 'effect';

const InputSchema = Schema.Struct({
  t: Schema.Literal('input'),
  seq: Schema.optional(Schema.Number),
  dx: Schema.Number,
  dy: Schema.Number,
  dash: Schema.optional(Schema.Boolean),
  fire: Schema.optional(Schema.Boolean),
  flip: Schema.optional(Schema.Boolean), // polar: charge flip (ignored by mochi)
  aim: Schema.optional(Schema.Number), // steel: turret angle in radians
});

export interface CleanInput {
  seq: number | undefined;
  dx: number;
  dy: number;
  dash: boolean;
  fire: boolean;
  flip: boolean;
  aim: number | undefined;
}

const decode = Schema.decodeUnknownEither(InputSchema);

export function validateInput(raw: unknown): CleanInput | null {
  const r = decode(raw);
  if (r._tag === 'Left') return null;
  const v = r.right;
  if (!Number.isFinite(v.dx) || !Number.isFinite(v.dy)) return null;
  if (v.aim !== undefined && !Number.isFinite(v.aim)) return null;
  return { seq: v.seq, dx: v.dx, dy: v.dy, dash: v.dash === true, fire: v.fire === true, flip: v.flip === true, aim: v.aim };
}
