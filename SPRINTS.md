# SPRINTS — playground pivot (D12). One sprint = one shippable slice with goal,
tickets, definition of done, and demo receipts in AGENT_CHAT.md. Rules 9/11/12
apply inside every sprint. Source plan: user-passed R&D report (Sections D–E);
reuse %s are planning estimates ±10pp until code exists. Gates stop the line.

## Cadence
- Hour-sized, independently mergeable PRs (work-size constraint, not a delivery promise).
- No agent alters `packages/protocol/` without contract tests (report agent rule).
- Sprint review = receipts (tests, smoke, soak, build sizes), never vibes.

## Sprint 1 — FOUNDATION (this turn)
Goal: monorepo + wire contract + room lifecycle + guest identity + catalog +
analytics vocab + bots/backfill — no game yet (stub driver proves the seam).
Tickets:
- [F-1] Root layout + TS configs + scripts (build/test/dev) — Kai
- [F-2] `packages/protocol`: versioned envelope `{v,type,room,seq,serverTime?,payload}`,
  first-class messages (input/answer/strokeBatch/roomPresence/snapshot/event/
  roundState/emote/reconnect), strict guards — Zara
- [F-3] `packages/room`: registry, lifecycle, presence, 60s reconnect grace,
  90s empty-GC, GamePlugin seam — Zara
- [F-4] `packages/identity`: opaque guest IDs, generated names (Neon Otter),
  custom-name filter — Leo
- [F-5] `packages/catalog`: 6 manifests (id/verb/moods/players/joinMode/
  deviceTier/locales/clientChunk/shareKind/botPolicy) — Aarav
- [F-6] `packages/bots`: labelled-bot interface + backfill controller — Zara
- [F-7] `packages/share`: ShareArtifact contract
  (ResultGrid|GhostChallenge|ReplayMoment|PartyFingerprint|DailyGrid) + URL helpers — Leo
- [F-8] `packages/analytics`: event vocabulary + bounded buffered writer — Zara
- [F-9] `apps/server`: Node 24 + ws, registry wiring, HTTP
  (/health/rooms/catalog), Effect Schema at ingress, plain-TS sims — Zara
- [F-10] `apps/web`: HTML-first shell, guest boot, catalog render, room entry
  (`?game=&room=` bypasses world bundle) — Leo
Definition of done: ≥50 unit tests green; WS integration smoke (join→snapshot→
leave→GC proof); 60s/50-socket mini-soak clean; 0 unhandled exceptions; Node 24
pinned in CI + Docker (local toolchain v22 recorded). Full 200-socket/30-min
soak + 12 browser integration tests ride with Global hardening per report.

## Sprint 2 — IMPOSSIBLE PLAYGROUND
DOM shell → lazy Three world → four mood portals (BEAT/CHAOS/THINK/SURPRISE ME)
→ Rift Seed (`?rift=`) sharing. DoD: HTML shell ≤60KB Brotli; first wow ≤1MB;
360px clean; press feedback <100ms; direct game link loads 0 bytes of landing
Three bundle. Gate: share/copy AND game-start +≥20% vs lite control or simplify.

## Sprint 3 — REFLEX RIOT (BUILD FIRST game)
Timing channel, bot backfill, tiny replay + Chaos Strip artefact. DoD: ≥24 sim
tests + 8 E2E; 15-player room; snapshot p95 ≤700B; first task ≤3s after first
human; no empty-lobby screen.

## Sprint 4 — READ THE ROOM
Answer channel, scoring, party persistence, authored prompts + Party Fingerprint.
DoD: ≥20 scoring/dedup tests + 8 E2E; 15 players; reconnect keeps question;
no double-score; artefact exports.

## Sprint 5 — GHOSTLINE
Deterministic physics, replay encoding, async Ghost Challenge links. DoD: 100
fixed seeds reproduce in tolerance; payload ≤20KB/run; solo-playable; link
starts exact seed.

## Sprint 6 — SIGNAL SEVEN
UTC daily seed, solver/generator, spoiler-safe Signal Grid. DoD: 365 daily
cases pass solvability/uniqueness; leaks no solution; solo-safe.

## Sprint 7 — TOTEM PANIC
Shared drop order, reconnect/spectate, 2s collapse replay. DoD: ≥500 seeded
cases in CI; 10 players; snapshot p95 ≤1.5KB; late join next legal slot.

## Sprint 8 — RICOCHET SIEGE
Simultaneous commit, terrain/ricochet, combat validation. DoD: ≥1,000 seeded
cases; 8 players; zero client authority; p95 step <8ms multi-room.

## Sprint 9 — GLOBAL HARDENING
Hindi, tiering, disconnects, telemetry, safety, bundle gates. DoD: 2h/300-client
soak; zero unhandled; no heap growth post-GC; every title passes 360px +
2GB smoke; every title owns a unique ShareArtifact.

## Sprint 10 — ARENA EXPANSION (slice discipline: one small part per turn)
Big games ship in slices, never whole. Slice 1 (SHIPPED): hidden /employees
studio + blaze-squad core (move/fire/zone/loot/bots/2D) + nitro-rift core
(drive/boost/pads/bots/2D) + WASM seam spec. Next slices ride TICKETS.md
(ST-2/BZ-2/BZ-3/NR-2/NR-3/NR-4/G-0). DoD per slice: headless suite + e2E +
snapshot budget + no shell-byte growth.

## North star
WAPS (Weekly Activated Party Starts): unique rooms where ≥3 humans arrive
within 120s and ≥1 round finishes. Never optimise raw time-on-site.

## Standing
- UptimeRobot (BE-001, user), branch protection (user), UX-005-class device truth (human hands).
- NOT-NOW (report, binding): Rust services, Effect RC migration, accounts,
  progression/battle-pass, open chat/voice, open UGC, creator marketplace,
  ranks/clans/friends, native apps, WebGPU-only, real-money, AI gameplay gen.
