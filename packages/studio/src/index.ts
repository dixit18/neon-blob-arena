// packages/studio — hidden owner observability (the /employees view).
// OpenMausBot-inspired, scoped to OUR studio: every employee in ORG.md owns a
// thread, threads live in channels, and the Boss (you) watches + replies.
// INVARIANT: this surface is NEVER linked from the player shell, NEVER in the
// catalog, and served with X-Robots-Tag: noindex. Players must not find it;
// the owner must always find it at /employees (or ?view=employees).
// Transport: plain JSON over the existing server (no new deps, no sockets).
// The feed is an in-memory bus (last 200) seeded on boot; agents append live
// thoughts/receipts/blockers while they work, exactly like AGENT_CHAT.md but
// queryable per employee + per channel.

export type ChannelId = 'build' | 'redteam' | 'growth' | 'studio';

export interface Employee {
  id: string;
  name: string;
  role: string;
  channel: ChannelId;
  color: string;
}

export type ThoughtKind = 'thought' | 'reply' | 'receipt' | 'blocker';

export interface Thought {
  id: number;
  by: string; // employee id, or 'boss'
  channel: ChannelId;
  kind: ThoughtKind;
  text: string;
  at: number;
}

export const CHANNELS: { id: ChannelId; label: string }[] = [
  { id: 'build', label: '#build — what is shipping' },
  { id: 'redteam', label: '#redteam — contradictions + cuts' },
  { id: 'growth', label: '#growth — why anyone comes' },
  { id: 'studio', label: '#studio — general' },
];

// Roster mirrors ORG.md. `boss` is the owner (you) — read/write, never a bot.
export const EMPLOYEES: Employee[] = [
  { id: 'aarav', name: 'Aarav "Vision" Mehta', role: 'PM — scope, ship/block', channel: 'studio', color: '#C6F135' },
  { id: 'zara', name: 'Zara "Forge" Khan', role: 'BE — authoritative rooms', channel: 'build', color: '#46E0D4' },
  { id: 'leo', name: 'Leo "Pixel" Das', role: 'FE — instant feel', channel: 'build', color: '#FF3D8A' },
  { id: 'kai', name: 'Kai "ShipIt" Rao', role: 'Integrator — FE+BE+deploy', channel: 'build', color: '#FFE9A8' },
  { id: 'nova', name: 'Dr. Nova "Lab" Iyer', role: 'R&D head — cited findings only', channel: 'growth', color: '#B388FF' },
  { id: 'kabir', name: 'Kabir "Cross" Rao', role: 'Research contrarian', channel: 'redteam', color: '#FF8A5B' },
  { id: 'vikram', name: 'Vikram "RedTeam" Malhotra', role: 'Devil\u2019s advocate — can block ship', channel: 'redteam', color: '#FF5D5D' },
  { id: 'rehan', name: 'Rehan "Why-Not" Qureshi', role: 'Decision RedTeam', channel: 'redteam', color: '#FF5D5D' },
  { id: 'riya', name: 'Riya "Breaker" Sharma', role: 'QA — can block any release', channel: 'redteam', color: '#7DF9FF' },
  { id: 'devika', name: 'Devika "Dot" Menon', role: 'PM/UX — owns the board', channel: 'build', color: '#95E06C' },
  { id: 'mira', name: 'Mira "Muse" Nair', role: 'Motion + illustration R&D', channel: 'build', color: '#FFC6E0' },
  { id: 'arjun', name: 'Arjun "Signal" Kapoor', role: 'Growth + PMF R&D', channel: 'growth', color: '#FFD93D' },
];

const KNOWN_BY = new Set([...EMPLOYEES.map((e) => e.id), 'boss', 'system']);
const KNOWN_CH = new Set<ChannelId>(['build', 'redteam', 'growth', 'studio']);
const KNOWN_KIND = new Set<ThoughtKind>(['thought', 'reply', 'receipt', 'blocker']);
const MAX_TEXT = 500;
const MAX_FEED = 200;

let seq = 0;

export class StudioFeed {
  private items: Thought[] = [];

  post(by: string, channel: ChannelId, kind: ThoughtKind, text: string, at = Date.now()): Thought {
    if (!KNOWN_BY.has(by)) throw new Error(`unknown author: ${by}`);
    if (!KNOWN_CH.has(channel)) throw new Error(`unknown channel: ${channel}`);
    if (!KNOWN_KIND.has(kind)) throw new Error(`unknown kind: ${kind}`);
    const clean = String(text ?? '').trim().slice(0, MAX_TEXT);
    if (clean.length === 0) throw new Error('empty thought');
    const t: Thought = { id: ++seq, by, channel, kind, text: clean, at };
    this.items.push(t);
    if (this.items.length > MAX_FEED) this.items.splice(0, this.items.length - MAX_FEED);
    return t;
  }

  list(opts: { channel?: ChannelId; by?: string; limit?: number } = {}): Thought[] {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), MAX_FEED);
    const out: Thought[] = [];
    for (let i = this.items.length - 1; i >= 0 && out.length < limit; i--) {
      const t = this.items[i]!;
      if (opts.channel && t.channel !== opts.channel) continue;
      if (opts.by && t.by !== opts.by) continue;
      out.push(t);
    }
    return out.reverse();
  }

  count(): number {
    return this.items.length;
  }

  lastSeenBy(by: string): number {
    for (let i = this.items.length - 1; i >= 0; i--) {
      if (this.items[i]!.by === by) return this.items[i]!.at;
    }
    return 0;
  }
}

/** Boot seed so the room is never an empty screen (Rule 3 applies to us too). */
export function seedFeed(feed: StudioFeed, now = Date.now()): void {
  if (feed.count() > 0) return;
  feed.post('system', 'studio', 'receipt', 'studio bus live — 12 employees, 4 channels. Boss, pick a thread on the left; nothing here is visible to players.', now);
  feed.post('aarav', 'studio', 'thought', 'Standing orders hold: finish → receipts to me → pull next ticket. I keep the queue non-empty; the user is escalation, not scheduling.', now);
  feed.post('riya', 'redteam', 'thought', 'Gates unchanged: p95 phone ≤25ms, tickAvg <5, zero per-frame alloc. New games prove it in smoke or they stay parked.', now);
  feed.post('nova', 'growth', 'thought', 'Watching party formats + regional portals for the next verb. Every finding ships with a source before Kabir gets to kill it.', now);
}
