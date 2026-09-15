# SPRINTS — how this studio moves fast. One sprint = one shippable slice, each with
goal, tickets, definition of done, and demo receipts in AGENT_CHAT.md. Rule 9 and
Rule 12 apply inside every sprint. TICKETS.md feeds the board; MARKET.md feeds picks.

## Cadence
- Hourly ship loop for 85%+ reuse games (proven: polar, buffet, batch A).
- Bigger cycles (new physics/patterns: hooks, tanks, turns) get their own sprint.
- Sprint review = receipts (tests, smoke, soak, build sizes), never vibes.

## Sprint 1 — STEEL SWARM (tank arena) — PARKED (server sim green, NO menu card, D10)
Goal: tank sim kept as a parked anchor — client deprioritised on sameness verdict.
Tickets:
- [S1-1] Server sim `steel.ts` (move + turret aim + shells, no dash/chomp) — Zara — DONE
- [S1-2] Headless suite `steel.test.ts` (aim, shell ballistics, damage, cd, backfill) — Zara — DONE
- [S1-3] Transport: `aim` in validate + SnapPlayer `a` + index dispatch — Zara — DONE
- [S1-4] Client: turret meshes + mouse-to-ground aim + mode + card + tutorial — Leo — PARKED (D10)
- [S1-5] Verify: 5 suites green, steel smoke, mochi soak — Riya — DONE (server)
- [S1-6] Docs + commit + push + MARKET row flip to SHIPPED — Kai — PARKED (row stays sim-only)
Definition of done (server): `npm test` all green, smoke over WS, soak ≥12 snaps/s,
no menu card shipped, chat receipts.

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
- [S2-5b] Mood-first row + Surprise-me (D9/UX-018): Beat/Chaos/Chill/Think/
  Surprise-me above thumbnails, guest PLAY ≤2 taps preserved — Devika + Leo
- [S2-6] Verify: full alpha sequence on 2 tabs (join→A→return→B→resume→report
  stub), builds green, no sim regressions — Riya
Definition of done: alpha-gate sequence passes on video/manual, `/stats`
shows party-switch counters, all suites green, shell regressions zero.
Mood row taps preserved PLAY conversion (no regression vs baseline).

## Backlog (rebooted per D11 — one verb per slot, catalogue from 0)
- Sprint 3: TRIVIA BLITZ (D10 diversifier, MARKET #12) — server sim + answer
  transport + quiz channel (DONE, Zara) → client quiz panel + card +
  tutorial + score-card share object (THIS TURN, Leo) + verify (Riya). First
  non-arena verb: 8-question party quiz, 2–100 players, bots answer in tiers,
  one built-in 24-Q pack. DoD: suites green, 2-tab + bot quiz playable over
  WS, share card ships, client build ≤39KB (mood row + quiz face; rule <150KB holds).
  No-sit (D11): every tap shows visual feedback same-tick + WS send; no screen
  sits >1s without action or visible progress (receipt: smoke + DOM gate).
- Sprint 4: Doodle Duel (draw-guess relay, R&D-2 P0) + report/block/mute slice
  (UX-011) + prompt/content filters. Stroke-sync pattern, NOT arena reuse.
- Sprint 5: Ten Seconds (reaction ritual, docs' ritual loop) — cheapest
  different verb after trivia; daily board + score-card share object.
- Sprint 6: Ludo Clash (turn verb, India) + Hindi strings (UX-006).
- Sprint 7 candidates (D8/D11 playground shortlist): Slingshot Sprint
  (one-button physics + async ghosts), Signal Hunt (daily deduction — needs
  UX-019 owner before it moves), Chain Garden (Chill/Discover toy, solo
  first). All ship a share object or they don't ship.
- Parked (sameness risk, revisit after diversification signal): Steel client
  (sim green, link-joinable, no menu card), Rumble Race,
  Meteor/Team/Ghost batch B, Cricket Smash, Hook Havoc (spring physics).
- CUT until PMF + concurrency health (D9): crowd-machine homepage, MMO/Living
  World, 3D open world, shooter, open UGC level editor, fan-IP clones,
  Portal Rush / One-Minute Arcade as permanent homepage (campaign-only later).
- Queued (D2 solo): Zen Munch (endless mochi, best-mass persistence).
- Standing: UptimeRobot (BE-001, user), branch protection (user), UX-005 (user phone).
