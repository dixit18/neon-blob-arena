# TICKETS — Devika "Dot" Menon owns this board. Rule 11: no release with an open
UX-BLOCKER. Every ticket: owner agent + acceptance + re-test receipt.

## Doing (this cycle)
- (clear — everything below re-tested green)

## Open (prioritized)

## Open (prioritized)
- [UX-005] roundPill/feed overlap on 360px wide — Owner: Leo. Accept: screenshot-proof
  or device check, no overlap. NEEDS: human hands.
- [UX-006] Hindi-ready strings for India launch — Owner: Devika. Accept: all menu/HUD
  copy in one strings table. Phase 2.
- [UX-007] PWA installability audit (icon/maskable/shortcuts per game) — Owner: Riya.
- [UX-008] SEO + social cards per game (title/desc/OG image) — Owner: Arjun. Phase 1.
- [UX-011] Report/block/mute from inside the match (R&D-2 MVP safety) — Owner:
  Leo (client button + local block-mutes-taunts) + Zara (server `/report` log
  with match_id/reporter/reported/reason). Accept: report posts without leaving
  the game; block hides that player's taunts. Sprint 3 with Doodle.
- [UX-012] Party metrics in `/stats` (WSPS proxy: second-game starts, party
  reuse, host reproduction) — Owner: Zara. Accept: `/stats` exposes
  partySwitches + secondGameStarts + hostsCreated. Sprint 2.
- [UX-013] Menu reframe: Start-a-game-night / Join-with-code / Continue-with-party
  above thumbnails (R&D-2: organise people, not games) — Owner: Devika + Leo.
  Accept: guest reaches PLAY in ≤2 taps, thumbnails stay below fold-first CTA.
  Sprint 2.

## Done
- [UX-009] How-to-play modal per game — Done: 📖 buttons (HUD + menu), rules table
  (goal/controls/win) for all 6 games, click-outside close. Receipt: build green.
- [UX-010] Objective pill — Done: live goal line under round timer (tag IT warning
  pulses red, hill in/out state, polar charge state). 2Hz change-only. Receipt: build.
- [UX-001] Live counts on arcade cards — Done: `/rooms` poll 5s (menu-only), per-game
  badges (`🟢 N live` / `quiet — be the first!`). Receipt: client build green.
- [UX-002] Hang watchdog — Done: open socket + 5s no-snap while playing → one coach
  warning + close→auto-reconnect; re-arms on snap. Receipt: tsc green.
- [UX-003] Short-screen menu — Done: ≤700px height hides diorama/howto/ticker,
  compacts card. Receipt: build green (visual check needs human phone).
- [UX-004] A11y labels — Done: dialog role + label, aria-hidden canvases, labeled
  buttons/input. Receipt: build green.
