# SPRINTS — how this studio moves fast. One sprint = one shippable slice, each with
goal, tickets, definition of done, and demo receipts in AGENT_CHAT.md. Rule 9 and
Rule 12 apply inside every sprint. TICKETS.md feeds the board; MARKET.md feeds picks.

## Cadence
- Hourly ship loop for 85%+ reuse games (proven: polar, buffet, batch A).
- Bigger cycles (new physics/patterns: hooks, tanks, turns) get their own sprint.
- Sprint review = receipts (tests, smoke, soak, build sizes), never vibes.

## Sprint 1 — STEEL SWARM (tank arena) — IN PROGRESS (last arena for a while, D5)
Goal: 7th game live, production-ready, RU/EU/US/IN signal per MARKETS.md.
Tickets:
- [S1-1] Server sim `steel.ts` (move + turret aim + shells, no dash/chomp) — Zara
- [S1-2] Headless suite `steel.test.ts` (aim, shell ballistics, damage, cd, backfill) — Zara
- [S1-3] Transport: `aim` in validate + SnapPlayer `a` + index dispatch — Zara (aim gate SHIPPED)
- [S1-4] Client: turret meshes + mouse-to-ground aim + mode + card + tutorial — Leo
- [S1-5] Verify: build both, 4 suites + steel green, steel smoke, mochi soak — Riya
- [S1-6] Docs + commit + push + MARKET row flip to SHIPPED — Kai
Definition of done: `npm test` all green, smoke over WS, soak ≥12 snaps/s, client
build ≤30KB initial, no per-frame alloc in new render code, chat receipts.

## Sprint 2 — PARTY PERSISTENCE (platform, R&D-2 alpha gate) — NEXT, per D5
Goal: prove "one room, many games" — a party joins once, plays A, returns,
starts B with same membership, survives a disconnect, can report somebody.
Tickets:
- [S2-1] Cross-game room code: one `room` maps to a party across `game`s
  (replaces per-game `game:room` namespace; switch-game keeps membership) — Zara
- [S2-2] Switch-game flow: return-to-party → pick game → launch, same members,
  share link/QR stays valid across switches — Leo
- [S2-3] Host controls: kick + lock + (later) teams; host = room creator — Zara/Leo
- [S2-4] Reconnect hardening: session resume keeps party slot on short drop
  (watchdog exists; add resume token/slot hold) — Zara
- [S2-5] Party metrics in `/stats`: second-game starts, party reuse, host
  reproduction (guests→hosts); menu reframe (Start night / Join code first) — Zara/Leo
- [S2-6] Verify: full alpha sequence on 2 tabs (join→A→return→B→resume→report
  stub), builds green, no sim regressions — Riya
Definition of done: alpha-gate sequence passes on video/manual, `/stats`
shows party-switch counters, all suites green, shell regressions zero.

## Backlog (reordered per D5 — diversify verbs, demote sameness)
- Sprint 3: Doodle Duel (draw-guess relay, R&D-2 P0) + report/block/mute slice
  (UX-011) + prompt/content filters. Stroke-sync pattern, NOT arena reuse.
- Sprint 4: Ludo Clash (turn pattern, India) + Hindi strings (UX-006).
- Sprint 5: Trivia/Word Blitz (NEW, R&D-2 P0 large-group 2–100, low-medium
  build) + SEO/social (UX-008).
- Parked (sameness risk, revisit after diversification signal): Rumble Race,
  Meteor/Team/Ghost batch B, Cricket Smash, Hook Havoc (spring physics).
- Sprint 6 candidates (D8 playground shortlist, duel rows first): Slingshot
  Sprint (one-button physics + async ghosts), Ten Seconds (reaction microgames),
  Signal Hunt (daily deduction ritual). All cheap on our engine, all ship a
  share object or they don't ship.
- Queued (D2 solo): Zen Munch (endless mochi, best-mass persistence).
- Standing: UptimeRobot (BE-001, user), branch protection (user), UX-005 (user phone).
