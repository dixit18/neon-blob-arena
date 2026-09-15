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
  reuse, host reproduction + D8 cross-game rate) — Owner: Zara. Accept:
  `/stats` exposes partySwitches + secondGameStarts + hostsCreated +
  crossGameRate (sessions followed by a different game). Sprint 2.
- [UX-013] Menu reframe: Start-a-game-night / Join-with-code / Continue-with-party
  above thumbnails (R&D-2: organise people, not games) — Owner: Devika + Leo.
  Accept: guest reaches PLAY in ≤2 taps, thumbnails stay below fold-first CTA.
  Sprint 2.
- [UX-014] WOW landing v1 (D6) — Owner: Leo (build) + Mira (art check) + Riya
  (gates). Accept: CSS-only zoom tunnel (no new deps, initial chunk ≤36KB —
  actual 35.08KB, rule <150KB holds), link-promise badge + shock line + 3
  link-first steps, `?from=` banner, challenge button (D7 replaced generic
  forward), crown-win nudge, reduced-motion off, short-screen hides hero.
  Receipt: client build green + headless DOM gate 9/9 + 360px read check.
- [UX-015] Responsive audit per game (D6) — Owner: Riya + Leo. Accept: 360px
  HUD overlap fixed (roundPill/objPill/leaders/feed), 16px mobile inputs,
  2-per-row cards at ≤400px, landscape-short keeps PLAY in fold, touch targets
  ≥46px. Device truth (UX-005) stays human-hands. Receipt: build green.
- [UX-016] Earn-the-share (D7) — Owner: Leo + Devika. Accept: NO generic
  forward button; challenge-a-friend gated on best>0 with dare fallback; live
  strip shows hottest room + today's king from real endpoints with quiet-state
  copy; diorama pokable menu-only; all expression original. Receipt: build
  green + tap walkthrough.
- [UX-017] Desktop full-bleed landing (user screenshot verdict) — Owner: Mira
  (design) + Leo (build) + Devika (acceptance). Accept: 1440px + 1280px wide,
  zero dead gutters (card ≥1000px), NO page scroll on load at ≥800px height
  (right column internal scroll only), PLAY + challenge visible first viewport.
  Receipt: headless 1280×900 screenshot + DOM gate, pasted in chat.
- [UX-018] Mood-first menu row + Surprise-me (D9) — Owner: Devika + Leo.
  Accept: Beat / Chaos / Chill / Think / Surprise-me row ABOVE thumbnails
  (maps to existing games; Surprise-me = random-game Quick Play); guest
  reaches PLAY in ≤2 taps preserved; PLAY conversion not regressed vs
  baseline. Sprint 2.
- [UX-019] Daily-seed spec + spoiler-safe card (D9, spec only) — Owner: Aarav
  to assign before Sprint 6 (content owner TBD). Accept: daily seed format +
  spoiler-safe share-card mock + content-pipeline owner named in MARKET row.
  NO code until Signal Hunt sprint.

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
