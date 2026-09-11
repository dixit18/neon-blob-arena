// Neon Postgres persistence as an Effect service.
// - Typed service (Db tag) built by an infallible Layer (lazy connect)
// - Bounded retries (Schedule.recurs: 3 attempts) on every DB op
// - Memory-leaderboard fallback so the game NEVER dies with the DB
// - Fire-and-forget from the game loop: tick code never awaits.
// Hot sim (game.ts / physics.ts) stays raw imperative on purpose.
import { neon } from '@neondatabase/serverless';
import { Context, Effect, Layer, ManagedRuntime, Schedule } from 'effect';

export interface ScoreEvent {
  id: string; name: string; score: number; kills: number; room: string; survivedSec: number;
}
export interface TopRow { n: string; s: number }

type SqlFn = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>;

// Shared memory fallback (module-level so it survives layer rebuilds)
const memBest = new Map<string, { name: string; score: number; at: string }>();
function memSave(p: ScoreEvent) {
  const cur = memBest.get(p.id);
  if (!cur || p.score > cur.score) memBest.set(p.id, { name: p.name, score: p.score, at: new Date().toISOString() });
}
function memTop(limit: number): TopRow[] {
  return [...memBest.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((m) => ({ n: m.name, s: m.score }));
}

let dbOk = false;
export function dbReady() { return dbOk; }

const RETRY = Schedule.recurs(2); // 3 attempts total, then fallback

interface DbShape {
  init: Effect.Effect<void>;
  persist: (p: ScoreEvent) => Effect.Effect<void>;
  top: (limit: number) => Effect.Effect<TopRow[]>;
}

class Db extends Context.Tag('Db')<Db, DbShape>() {}

const DbLive = Layer.effect(
  Db,
  Effect.gen(function* () {
    // Infallible layer: env read via Effect.sync so a missing/invalid
    // DATABASE_URL degrades to memory mode instead of crashing boot.
    const url = yield* Effect.sync(() => process.env.DATABASE_URL);
    if (!url) {
      console.log('[db] no DATABASE_URL — memory leaderboard');
      return Db.of({
        init: Effect.void,
        persist: (p) => Effect.sync(() => memSave(p)),
        top: (limit) => Effect.succeed(memTop(limit)),
      });
    }
    const sql = neon(url) as unknown as SqlFn;
    const init: Effect.Effect<void> = Effect.gen(function* () {
      yield* Effect.tryPromise({
        try: () =>
          (async () => {
            await sql`create table if not exists players (
              id text primary key, name text not null, best_score int default 0,
              games int default 0, kills int default 0, updated_at timestamptz default now()
            )`;
            await sql`create table if not exists sessions (
              id text primary key, player_id text references players(id),
              room_id text not null, region text default 'local',
              score int default 0, kills int default 0, survived_sec int default 0,
              started_at timestamptz default now(), ended_at timestamptz
            )`;
          })(),
        catch: (cause) => ({ _tag: 'DbDown', cause }) as const,
      }).pipe(Effect.retry(RETRY));
      yield* Effect.sync(() => { dbOk = true; });
      console.log('[db] neon connected, schema ready');
    }).pipe(
      Effect.catchAll(() =>
        Effect.sync(() => {
          dbOk = false;
          console.warn('[db] neon unreachable, memory fallback');
        }),
      ),
    );
    return Db.of({
      init,
      persist: (p: ScoreEvent) =>
        Effect.tryPromise({
          try: () =>
            (async () => {
              const sid = `${p.id}-${Date.now()}`;
              await sql`insert into players (id, name, best_score, games, kills)
                values (${p.id}, ${p.name}, ${p.score}, 1, ${p.kills})
                on conflict (id) do update set
                  best_score = greatest(players.best_score, ${p.score}),
                  games = players.games + 1, kills = players.kills + ${p.kills},
                  name = excluded.name, updated_at = now()`;
              await sql`insert into sessions (id, player_id, room_id, score, kills, survived_sec, ended_at)
                values (${sid}, ${p.id}, ${p.room}, ${p.score}, ${p.kills}, ${p.survivedSec}, now())`;
            })(),
          catch: (cause) => ({ _tag: 'DbDown', cause }) as const,
        }).pipe(
          Effect.retry(RETRY),
          Effect.catchAll(() => Effect.sync(() => memSave(p))),
          Effect.asVoid,
        ),
      top: (limit: number) =>
        Effect.tryPromise({
          try: () => sql`select name as n, best_score as s from players order by best_score desc limit ${limit}` as Promise<TopRow[]>,
          catch: (cause) => ({ _tag: 'DbDown', cause }) as const,
        }).pipe(
          Effect.retry(RETRY),
          Effect.map((rows) => rows.map((r) => ({ n: String(r.n), s: Number(r.s) }))),
          Effect.catchAll(() => Effect.succeed(memTop(limit))),
        ),
    });
  }),
);

let runtime: ManagedRuntime.ManagedRuntime<Db, never> | null = null;

export async function initDb(url?: string) {
  if (url) process.env.DATABASE_URL = url;
  const rt = (runtime = ManagedRuntime.make(DbLive));
  await rt.runPromise(Effect.flatMap(Db, (db) => db.init));
}

// Fire-and-forget: safe to call from the tick loop, never throws.
export function persistScore(p: ScoreEvent) {
  if (!runtime) { memSave(p); return; }
  void runtime.runPromise(Effect.flatMap(Db, (db) => db.persist(p)));
}

export async function topScores(limit = 10): Promise<TopRow[]> {
  if (!runtime) return memTop(limit);
  try {
    return await runtime.runPromise(Effect.flatMap(Db, (db) => db.top(limit)));
  } catch {
    return memTop(limit);
  }
}
