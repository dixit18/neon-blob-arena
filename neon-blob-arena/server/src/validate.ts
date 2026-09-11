// Effect Schema gate for every client message.
// Server sim stays raw imperative; this validates UNTRUSTED input at the door.
import { Schema } from 'effect';

const InputSchema = Schema.Struct({
  t: Schema.Literal('input'),
  seq: Schema.optional(Schema.Number),
  dx: Schema.Number,
  dy: Schema.Number,
  dash: Schema.optional(Schema.Boolean),
});

export interface CleanInput {
  seq: number | undefined;
  dx: number;
  dy: number;
  dash: boolean;
}

const decode = Schema.decodeUnknownEither(InputSchema);

export function validateInput(raw: unknown): CleanInput | null {
  const r = decode(raw);
  if (r._tag === 'Left') return null;
  const v = r.right;
  if (!Number.isFinite(v.dx) || !Number.isFinite(v.dy)) return null;
  return { seq: v.seq, dx: v.dx, dy: v.dy, dash: v.dash === true };
}
