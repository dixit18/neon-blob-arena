# TICKETS — Devika "Dot" Menon owns this board. Rule 11: no release with an open
UX-BLOCKER. Every ticket: owner agent + acceptance + re-test receipt.

> PIVOT NOTE (D12): tickets below tracked the legacy arena UI (deleted). They
> stand CLOSED as superseded — history, not backlog. Fresh tickets open per
> new deliverable starting with Foundation.

## Doing (this cycle)
- RD-1 RIFT DIVE 3D flagship — Owner: Leo + Mira + Riya. Accept: lazy
  post-paint upgrade, 2D fallback intact, shell ≤60KB, own chunk ≤25KB,
  vista share, portals for all 5 games. Status: SHIPPED (D13, build green
  + 7 layout tests).
- Sprint 4 READ THE ROOM — Owner: Zara (sim/bots) + Leo (share/client) +
  Riya (e2e) + Kai (wire-up). Status: SHIPPED (8/8 e2e, 279/279 suite,
  6-game soak GREEN, web build green, room chunk 5.45KB).

## Open (prioritized) — Sprint 4 READ THE ROOM (SHIPPED — see Done section)
- [RT-1] Sim — DONE (24/24 green).
- [RT-2] Bots — DONE (7/7 green).
- [RT-3] Share — DONE (asserts green mid-game + crowned).
- [RT-4] Client — DONE (build green, 5.45KB).
- [RT-5] E2E — DONE (8/8 green, release unblocked).
- [RT-6] Wire-up — DONE (driver registered).

## Open (prioritized) — SLICE-2 QUEUE (small parts only, Rule: one slice per turn)
- [ST-2] Studio hardening — Owner: Zara + Leo. Accept: STUDIO_KEY enforced
  outside localhost, 400/403/429 receipts in chat, poll stays menu-only.
- [BZ-2] Blaze slice 2: squads (3-3-3) + loot tiers — Owner: Zara. Accept:
  friendly-fire off, squad feed, ≥10 new headless tests, snapshot ≤1.5KB.
- [BZ-3] Blaze slice 3: threepipe art pass — Owner: Leo + Mira. Accept: pinned
  CDN versions, offline 2D intact, chunk ≤250KB, 360px clean.
- [NR-2] Nitro slice 2: first-across + chase window, then laps — Owner: Zara.
  Accept: winner stops the clock, stragglers ranked by distance, ≥8 tests.
- [NR-3] Nitro slice 3: ✨ 3D toggle — Owner: Leo. Accept: same lazy loader
  as blaze, 2D default, no shell-byte growth.
- [NR-4] Nitro slice 4: Rust/WASM physics behind the seam — Owner: Zara.
  Accept: crates/race-phys lands, vectors match physics.ts, swap is import-only.
- [G-0] Mixed-game soak: 30 clients across riot/doodle/blaze/nitro — Owner:
  Riya. Accept: tickAvg <5, 0 unhandled, receipts in chat. Blocks slice-2 release.

## Open (prioritized) — Sprint 5 LUDO CLASH (pull in order, Rule 14)
- [LD-1] Sim — DONE (see Done section; 24/24 green).
- [LD-2] Bots — DONE (see Done section; 8/8 green).
- [LD-3] Share — DONE (see Done section; 3/3 green).
- [LD-4] Client — DONE (see Done section; build green, 5.53KB).
- [LD-5] E2E — DONE (see Done section; 6/6 green, release unblocked).
- [LD-6] Wire-up — DONE (see Done section; driver registered).
- [LD-2] Bots: roll + pick with tiers — Owner: Zara. Accept: bots prefer
  capture > leave-base > finish, 20% casual picks; instant fill to 4;
  labelled.
- [LD-3] Share: crowning ResultGrid — Owner: Leo + Zara. Accept: final board
  + winner + re-entry URL validates via `packages/share` asserts.
- [LD-4] Client: canvas board + dice — Owner: Leo. Accept: track + tokens
  render, ROLL same-tick, token options tappable, 360px clean, chunk
  ≤250KB; mounts at `apps/web/src/games/ludo-clash.ts`.
- [LD-5] E2E x6 + snapshot budget — Owner: Riya. Accept: 6 end-to-end checks
  green; snapshot p95 ≤2KB; receipts in chat. Blocks release if red.
- [LD-6] Wire-up: manifest + register — Owner: Kai. Accept: `ludo-clash`
  in `/catalog`; `?game=ludo-clash&room=` plays.

## Superseded by D12 pivot (history, not backlog)
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
- [UX-018] Mood-first menu row + Surprise-me (D9, shipped D10) — Owner: Devika + Leo.
  Shipped: Beat/Chaos/Think/Surprise-me row ABOVE thumbnails (Chill joins with
  the first Chill game — no fake mapping); Surprise-me = random-arena Quick
  Play; guest PLAY ≤2 taps preserved (no PLAY-path change). Receipt: client
  build green 36.78KB/14.80gzip (cap ≤39KB, rule <150KB holds).
- [UX-019] Daily-seed spec + spoiler-safe card (D9, spec only) — Owner: Aarav
  to assign before Sprint 6 (content owner TBD). Accept: daily seed format +
  spoiler-safe share-card mock + content-pipeline owner named in MARKET row.
  NO code until Signal Hunt sprint.

## Done
- [RT-1..RT-6] READ THE ROOM playable end-to-end — Done: vote engine (14
  prompts, seeded rotation, dedup, +1 received / +2 crowd-read, leaver voids,
  last-one crown, empty reset) + tiered 🤖 bots (sharps read the leader,
  human-paced 2-9s delays) + Party Fingerprint + question/vote/reveal client
  (render-key + HUD caches, zero 15Hz DOM churn) + driver registered. Two
  product bugs caught by receipts: instant-bot reveals (humans unplayable) +
  stale-close evicting fresh reclaims (server guard). Receipt: 279/279 suite
  (39 new), 8/8 e2e, 6-game soak 30/30 @389/s tickAvg 0.07ms SOAK GREEN,
  web build green (room chunk 5.45KB, shell 18.96KB), server tsc clean.
- [PF-1] Perf truth: fps + p95 pills live — Done: shared fps-meter (rolling
  fps/p95, 0 per-frame alloc, headless-tested core 4/4) in blaze + nitro HUD
  (+3D mode tracking) and dive fps chip; lossy 15s beacon to POST /perf with
  browser caps; GET /perf aggregates per-game avg + mode/browser splits
  (2/2 endpoint tests). Receipt: 240/240 suite green, web build green
  (meter own 1.81KB lazy chunk, shell still 19.19KB).
- [BX-1] Real-browser agent gate — Done: scripts/browser-check.ts (zero new
  deps, isolated profiles, IPv4-bound stack) on local Edge + Firefox.
  Receipt: BROWSER GREEN — edge landing 6/6 + 724KB paint, nitro room 3/3 +
  454KB, 360px paint, firefox both pages non-blank. Bonus find: dive auto-
  upgraded to three.js r160 + vista caption even under headless SwiftShader.
- [TP-1] Threepipe proper use — Done: ThreeViewer via pinned CDN (free
  Apache-2.0, zero bundle/local deps) for blaze + nitro 3D toggles, raw-three
  fallback, 2D-canvas swap fix (WebGL can never start on a 2D canvas).
  Receipt: web build green (shell 19.19KB, blaze 9.41KB, nitro 8.34KB).
- [NR-5] Rust/WASM live on the authoritative path — Done: race_batch_step
  (1KB binary, static slots, C ABI, no wasm-bindgen) + phys-wasm.ts loader
  (WASM-if-ready, bit-identical TS mirror otherwise) + sim batch stepping +
  server boot init with TS fallback. Receipt: 238/238 tests (2 new parity:
  7 vectors exact f64 + 8-racer grid), live boot ACTIVE, soak 30/30 @390/s
  tickAvg 0.08/max 0.9ms SOAK GREEN.
- [G-1] Soak covers ludo — Done: 30 clients × 5 games, 394 snaps/s,
  tickAvg 0.11ms/max 1.4ms, 0 errors. SOAK GREEN.
- [LD-5] Ludo E2E — Done: hello/token/room, instant table, roll edge,
  bad-input survival, p95 ≤2KB, reconnect. Release UNBLOCKED. Receipt: 6/6.
- [LD-6] Ludo wire-up — Done: createLudoDriver registered; `?game=ludo-clash
  &room=` plays; catalog already listed it.
- [LD-4] Ludo client — Done: parametric canvas board (52-loop + home lanes
  + bases + crown), same-tick ROLL, tappable options + 1-4 keys, 360px-first.
  Receipt: web build green, ludo chunk 5.53KB (≤250KB).
- [LD-3] Ludo share — Done: ResultGrid (final board + winner + re-entry URL,
  honest mid-game, last-one-racing crown). Receipt: 3/3 + tsc clean.
- [LD-2] Ludo bots — Done: tiered driver (sharp/casual, capture >
  leave-base > finish > progress via pure scoreLudoPick), instant table of 4,
  labelled, human flow intact. Receipt: 227/227 green.
- [LD-1] Ludo sim engine — Done: 24 headless tests (seats/dice/exact-finish/
  captures/safe/home-run/extra-turns/three-6s/timers/leaving/snapshots),
  empty-room lobby reset fix. Receipt: 24/24 + tsc clean.
- [G-0] Mixed-game soak — Done: scripts/soak.ts (30 clients × 4 games,
  30s, valid chatter). Receipt: 30/30 connected, 400 snaps/s, tickAvg
  0.08ms/max 0.9ms, 0 msg errors, 0 unhandled. SOAK GREEN.
- [NR-4] Nitro slice 4: Rust/WASM physics — Done: crates/race-phys lands
  (zero-dep, cargo test 4/4), 7 parity vectors bit-identical TS↔Rust,
  swap stays import-only. Receipt below.
- [NR-3] Nitro slice 3: ✨ 3D toggle — Done: same lazy loader (threepipe
  0.5.1 → three 0.160.0 → 2D), track + lanes + cars + pads + lap line,
  engine version in status, HUD updates in both modes. Receipt: build green.
- [NR-2] Nitro slice 2: first-across + chase + laps — Done: 2 laps/heat,
  flag + 10s chase window, finishers outrank stragglers, lap in snapshot/HUD,
  ghost carries laps:2. Receipt: 195/195 green.
- [BZ-3] Blaze slice 3: threepipe art pass — Done: pinned CDN (threepipe
  0.5.1 +esm, three 0.160.0 module), rapid HUD pill, squad-colored 3D blobs,
  version in status line, 2D default intact. Receipt: builds green.
- [BZ-2] Blaze slice 2: squads + loot tiers — Done: squads of 3 round-robin,
  friendly-fire off, last-squad-standing + MVP feed, green/gold crates
  (gold = full-heal + 12s rapid), crates in snapshot. Receipt: 186/186 green.
- [ST-2] Studio hardening — Done: fail-closed gate on all /studio/* routes
  (STUDIO_KEY match, else loopback-only), 403/429 receipts, client key prompt
  (sessionStorage) + pagehide poll kill. Receipt: 174/174 tests green.
- [DD-1..DD-6] DOODLE DUEL live drawing rooms — Done: draw/guess sim (packed
  snapshots ≤4KB, curated prompts, bail path) + guessing bots + canvas
  client + 6 E2E. Receipt: 124/124 tests green.
- [RR-1..RR-6] REFLEX RIOT playable end-to-end — Done: sim (5 rules, rounds,
  streaks) + tiered 🤖 bots + replay log + ReplayMoment + client + 8 E2E
  incl. 15-player room. Receipt: 91/91 tests green, WS smoke PASS.
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
