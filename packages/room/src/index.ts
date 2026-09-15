// packages/room — registry, lifecycle, presence, reconnect grace, GC.
// Every game plugs in as a GamePlugin; networking never inspects game code.
export interface JoinInfo { id: string; name: string; isBot: boolean }

export interface GameCommand { kind: string; by: string; data: unknown; at: number }

export interface RoomDriver {
  readonly game: string;
  join(p: JoinInfo): void;
  leave(id: string): void;
  accept(cmd: GameCommand): void;
  step(dt: number): void;
  snapshot(playerId: string): unknown;
  createBot(slot: number): { name: string };
  playerCount(): number;
  dispose(): void;
}

export const RECONNECT_GRACE_MS = 60_000;
export const EMPTY_GC_MS = 90_000;

interface RoomRec {
  id: string;
  game: string;
  driver: RoomDriver;
  humans: Set<string>;
  createdAt: number;
  lastHumanAt: number;
}

export type { RoomRec };

const CODE = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function genCode(n = 4, rand: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < n; i++) s += CODE[Math.floor(rand() * CODE.length)];
  return s;
}

export class RoomRegistry {
  rooms = new Map<string, RoomRec>();
  factories = new Map<string, () => RoomDriver>();
  held = new Map<string, { roomId: string; playerId: string; until: number }>();

  register(game: string, factory: () => RoomDriver): void {
    this.factories.set(game, factory);
  }

  getOrCreate(game: string, code: string | undefined, now = Date.now()): RoomRec {
    if (code) {
      const key = `${game}:${code}`;
      const hit = this.rooms.get(key);
      if (hit) return hit;
      const factory = this.factories.get(game);
      if (!factory) throw new Error(`unknown game: ${game}`);
      const rec: RoomRec = { id: code, game, driver: factory(), humans: new Set(), createdAt: now, lastHumanAt: 0 };
      this.rooms.set(key, rec);
      return rec;
    }
    let best: RoomRec | null = null;
    for (const r of this.rooms.values()) {
      if (r.game !== game || r.humans.size >= 15) continue;
      if (!best || r.humans.size < best.humans.size) best = r;
    }
    if (best) return best;
    return this.getOrCreate(game, genCode(), now);
  }

  join(room: RoomRec, info: JoinInfo, now = Date.now()): void {
    room.driver.join(info);
    if (!info.isBot) {
      room.humans.add(info.id);
      room.lastHumanAt = now;
    }
  }

  leave(room: RoomRec, id: string): void {
    room.driver.leave(id);
    room.humans.delete(id);
  }

  /** Hold a party slot for a dropped player; returns a reclaim token.
   * Pass a previous token to refresh it under the same value (the client
   * only ever learns the token from its hello, so rotation is impossible). */
  holdSlot(room: RoomRec, playerId: string, now = Date.now(), token?: string): string | null {
    if (!room.humans.has(playerId)) return null;
    const tok = token ?? `${room.id}.${playerId}.${Math.floor(now / 1000).toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    if (token) this.held.delete(token);
    this.held.set(tok, { roomId: room.id, playerId, until: now + RECONNECT_GRACE_MS });
    return tok;
  }

  reclaim(token: string, now = Date.now()): { roomId: string; playerId: string } | null {
    const h = this.held.get(token);
    if (!h || h.until < now) {
      this.held.delete(token);
      return null;
    }
    this.held.delete(token);
    return { roomId: h.roomId, playerId: h.playerId };
  }

  /** GC empty rooms; returns disposed room keys. */
  tick(now = Date.now()): string[] {
    const dead: string[] = [];
    for (const [key, r] of this.rooms) {
      if (r.humans.size === 0 && now - r.createdAt > EMPTY_GC_MS) {
        try { r.driver.dispose(); } catch { /* dispose must never kill the registry */ }
        this.rooms.delete(key);
        dead.push(key);
      }
    }
    for (const [t, h] of this.held) if (h.until < now) this.held.delete(t);
    return dead;
  }

  presence(): { id: string; game: string; humans: number; players: number }[] {
    return [...this.rooms.values()].map(r => ({
      id: r.id, game: r.game, humans: r.humans.size, players: r.driver.playerCount(),
    }));
  }
}
