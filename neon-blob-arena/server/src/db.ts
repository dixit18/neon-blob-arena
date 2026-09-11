// Neon Postgres persistence — async only, never in tick.
// Falls back to in-memory if DATABASE_URL missing/unreachable.
import { neon } from '@neondatabase/serverless';

type SqlFn = ((strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>) & { unsafe?: unknown };

let sql: SqlFn | null = null;
let dbOk = false;

const memBest = new Map<string, { name: string; score: number; at: string }>();

export async function initDb(url?: string) {
  if (!url) { console.log('[db] no DATABASE_URL — memory leaderboard'); return; }
  try {
    const s = neon(url) as unknown as SqlFn;
    sql = s;
    await s`create table if not exists players (
      id text primary key, name text not null, best_score int default 0,
      games int default 0, kills int default 0, updated_at timestamptz default now()
    )`;
    await s`create table if not exists sessions (
      id text primary key, player_id text references players(id),
      room_id text not null, region text default 'local',
      score int default 0, kills int default 0, survived_sec int default 0,
      started_at timestamptz default now(), ended_at timestamptz
    )`;
    dbOk = true;
    console.log('[db] neon connected, schema ready');
  } catch (e) {
    console.warn('[db] neon unreachable, memory fallback:', (e as Error).message);
    sql = null; dbOk = false;
  }
}

export function dbReady() { return dbOk; }

// fire-and-forget from game loop; batches naturally via microtask
export function persistScore(p: { id: string; name: string; score: number; kills: number; room: string; survivedSec: number }) {
  if (!sql || !dbOk) {
    const cur = memBest.get(p.id);
    if (!cur || p.score > cur.score) memBest.set(p.id, { name: p.name, score: p.score, at: new Date().toISOString() });
    return;
  }
  const s = sql;
  const sid = `${p.id}-${Date.now()}`;
  void (async () => {
    try {
      await s`insert into players (id, name, best_score, games, kills)
        values (${p.id}, ${p.name}, ${p.score}, 1, ${p.kills})
        on conflict (id) do update set
          best_score = greatest(players.best_score, ${p.score}),
          games = players.games + 1, kills = players.kills + ${p.kills},
          name = excluded.name, updated_at = now()`;
      await s`insert into sessions (id, player_id, room_id, score, kills, survived_sec, ended_at)
        values (${sid}, ${p.id}, ${p.room}, ${p.score}, ${p.kills}, ${p.survivedSec}, now())`;
    } catch (e) { console.warn('[db] persist failed', (e as Error).message); }
  })();
}

export async function topScores(limit = 10): Promise<{ n: string; s: number }[]> {
  if (!sql || !dbOk) {
    return [...memBest.values()].sort((a, b) => b.score - a.score).slice(0, limit).map(m => ({ n: m.name, s: m.score }));
  }
  try {
    const rows = await sql`select name as n, best_score as s from players order by best_score desc limit ${limit}` as { n: string; s: number }[];
    return rows.map(r => ({ n: String(r.n), s: Number(r.s) }));
  } catch { return []; }
}
