# TICKETS — Devika "Dot" Menon owns this board. Rule 11: no release with an open
UX-BLOCKER. Every ticket: owner agent + acceptance + re-test receipt.

> PIVOT NOTE (D12): tickets below tracked the legacy arena UI (deleted). They
> stand CLOSED as superseded — history, not backlog. Fresh tickets open per
> new deliverable starting with Foundation.

## Doing (this cycle)
- [DDV-2] Zoom goal + era framing + corner dock — DONE (6 depth-earned
  seals persisted per saga + journey row, ERA n/6 captions both engines,
  2D onFace, sealed dots, #float bottom-docked PLAY-primary; 5/5 journey
  tests, 43/43 web, build green — dive 26,012B, shell 57,433B; headless
  seal-fill proven zero-interaction). Owner: Leo.
- Sprint 9 GLOBAL HARDENING — Owner: Riya (gates) + all. Status: SHIPPED
  (GB-1..GB-6: soak, audit, budgets, Hindi shell, report path, gates;
  431/431 suite, BROWSER GREEN, bundles hold). Open follow-ups: GB-4b
  (per-game Hindi), GB-5b (per-client mutes).
- [G-2] 7-game soak — DONE (soak covers all live games incl. ghostline
  flick vectors; 30/30, 408/s, tickAvg 0.13ms/max 16.9ms, 0 unhandled.
  SOAK GREEN). Owner: Riya.
- RD-1 RIFT DIVE 3D flagship — Owner: Leo + Mira + Riya. Accept: lazy
  post-paint upgrade, 2D fallback intact, shell ≤60KB, own chunk ≤25KB,
  vista share, portals for all 5 games. Status: SHIPPED (D13, build green
  + 7 layout tests).
- Sprint 4 READ THE ROOM — Owner: Zara (sim/bots) + Leo (share/client) +
  Riya (e2e) + Kai (wire-up). Status: SHIPPED (8/8 e2e, 279/279 suite,
  6-game soak GREEN, web build green, room chunk 5.45KB).

## Open (prioritized) — Landing SAGA ZOOM (SG-1, outlines approved)
- [LZ-1] Saga data + engine rebind — DONE (sagas.ts 2×6, both engines read
  chapters, saga tabs + ?saga=, 16/16 tests, build green shell 21.81KB).
  Owner: Leo + Zara.
- [LZ-2] Chapter motifs — DONE (procgen core + 2D motif weather + 3D overlays
  + fog/shafts/fronds; 28/28 web tests, BROWSER GREEN, dive 24.98KB ≤25KB,
  shell 28.84KB ≤60KB). Owner: Mira + Leo.
- [LZ-3] Cliffhanger + chapter share — DONE (finale card + challenge link,
  ?saga=&ch= deep links boot the dive at that page with PLAY pre-named,
  📸 photo shares chapter title + saga/ch link; 30/30 web tests, build green
  shell 31.63KB / dive 25.14KB). Owner: Leo + Zara.
- [LZ-4] Saga gates — DONE (web build green, shell 31.63KB ≤60KB, dive
  25.14KB ≤26KB, BROWSER GREEN edge 7/7 + nitro 3/3 + 360px paint + firefox
  both pages, reduced-motion off, PLAY primary). Owner: Riya.

## Open (prioritized) — Sprint 9 GLOBAL HARDENING (pull in order, Rule 14)
- [GB-1] 10-game soak — DONE (all 10 games chatter; 30/30 @405/s, tickAvg
  0.15ms, 0 unhandled. SOAK GREEN). Owner: Riya.
- [GB-2] Share-artifact audit — DONE (doodle `moment()` added with
  mid-draw prompt gating; 12/12 audit gate: all 10 titles resolve to
  drivers + own valid catalog-kind artifacts). Owner: Leo + Zara.
- [GB-3] Snapshot budget sweep — DONE (all 10 assert worst-case caps
  in-suite; per-verb table recorded in QA.md — doodle 4KB by stroke-
  freight, all others ≤2KB, totem/riot tighter; e2e wire checks mirror).
  Owner: Riya.
- [GB-4] Hindi strings table — DONE (strings.ts en+hi, full shell chrome
  painted + toggle + ?lang= deep link, dive hints; 4/4 parity tests, live
  Hindi DOM proven; shell 37.92KB ≤60KB; game clients stay English —
  follow-up ticketed). Owner: Devika + Leo.
- [GB-4b] Per-game Hindi clients — Owner: Leo. Accept: all 10 game clients
  read the strings table; parity tests per client; no copy change in
  English. Phase 2 with UX-006.
- [GB-5] Report path — DONE (POST /report validated + throttled + logged;
  one shared roomview bar across all 10 games with localized dialog +
  local mute list; bar mounts live, POST 201 live; 3/3 endpoint tests).
  Owner: Leo + Zara.
- [GB-5b] Per-client mute enforcement — Owner: Leo. Accept: all 10 game
  clients honor isMuted() in feeds/taunts; headless test per client.
  Follow-up (bar + list ship in GB-5).
- [GB-6] Release gates rollup — DONE (BROWSER GREEN on hardened stack:
  edge 7/7 + nitro 3/3 + 360px + firefox ×2; shell 40.9KB ≤60KB, dive
  24.5KB ≤26KB, games ≤9.5KB, report lazy 4.2KB; 431/431 suite).
  Owner: Riya.

## Open (prioritized) — Sprint 8 RICOCHET SIEGE (SHIPPED — see Done section)
- [RS-1] Sim — DONE (sealed commits, fixed-step ricochet, HP/elimination,
  rounds + siege, auto-fire, join-next-round, ghost reclaim; 1,000 seeded
  volleys identical, p95 1.45ms; snapshot ≤2KB; 18/18). Owner: Zara.
- [RS-2] Bots + driver — DONE (nearest-hull gunners, whisper/shout error
  gap, 1-4s pacing, instant war of 6; 8/8 driver tests, 26/26 siege).
  Owner: Zara.
- [RS-3] Share — DONE (logged round re-simulates hit-for-hit, re-entry URL,
  asserts clean, honest mid-round). Owner: Leo + Zara.
- [RS-4] Client — DONE (canvas arena + drag-aim + COMMIT, sealed-aim
  secrecy, HP pips, tracers; build green, 6.61KB chunk; live proof rides
  RS-5). Owner: Leo.
- [RS-5] E2E — DONE (6/6 over real sockets: hello/stream, instant war +
  sealed aims proven on the wire, vector lock, garbage+reclaim survival,
  p95 ≤2KB, full 5-round match crowns; release UNBLOCKED). Owner: Riya.
- [RS-6] Wire-up — DONE (`ricochet-siege` registered, refusal dead).
  Owner: Kai.

## Open (prioritized) — Sprint 7 TOTEM PANIC (SHIPPED — see Done section)
- [TP-1] Sim — DONE (seeded co-op tower, slip + lean topple, 10-level hold
  win, auto-place turns, spectate + ghost reclaim, exact re-sim; 500 seeded
  cases green, snapshot ≤1.5KB; 17/17). Owner: Zara.
- [TP-2] Bots + driver — DONE (steady tiered hands, legal-window clamp so
  bots never slip, 2-5s human pacing, instant party of 4; 8/8 driver tests,
  25/25 totem). Owner: Zara.
- [TP-3] Share — DONE (ReplayMoment re-enters via URL and re-simulates the
  live tower exactly; honest mid-run state). Owner: Leo + Zara.
- [TP-4] Client — DONE (canvas tower + tap/arrow placement, aim ghost,
  lean meter, queue preview, spectate banner; build green, 5.48KB chunk;
  live proof rides TP-5). Owner: Leo.
- [TP-5] E2E — DONE (6/6 over real sockets: hello/stream, instant crew,
  drop lands, garbage+reclaim survival, p95 ≤1.5KB, steady raise crowns;
  release UNBLOCKED). Owner: Riya.
- [TP-6] Wire-up — DONE (`totem-panic` registered, refusal dead). Owner: Kai.

## Open (prioritized) — Sprint 6 SIGNAL SEVEN (SHIPPED — see Done section)
- [SI-1] Sim — DONE (UTC-day mystery engine + brute-force solver; all 365
  days of 2026 proven uniquely solvable; pip guesses, solo start, ≤2KB
  snapshots, spoiler-free grid core; 17/17 green). Owner: Zara.
- [SI-2] Bots + driver — DONE (solver-driven rival tablets, sharp/casual
  tiers, instant table of 4, triple-over-input transport, 60s idle close;
  8/8 driver tests). Owner: Zara.
- [SI-3] Share — DONE (DailyGrid re-enters via URL, renders pip counts;
  package-level leak gate proven live; no seed/code in payload).
  Owner: Leo + Zara.
- [SI-4] Client — DONE (clue tablet + rune keyboard + pip grid, triple-
  over-input submit, same-tick lock, 360px-first keys; build green, 6.19KB
  chunk; live proof rides SI-5). Owner: Leo.
- [SI-5] E2E — DONE (6/6 over real sockets: hello/stream, instant table,
  triple-guess landing, garbage+reclaim survival, p95 ≤2KB, one-UTC-day +
  white-box solve crowns; release UNBLOCKED). Owner: Riya.
- [SI-6] Wire-up — DONE (`signal-seven` registered, refusal dead; no seed
  concept — the UTC day is the seed). Owner: Kai.

## Open (prioritized) — Sprint 5 GHOSTLINE (SHIPPED — see Done section)
- [GH-1] Sim — DONE (seeded course + fixed-step flick physics + replay core;
  19/19 green incl. 100-seed bit-identical reproduce, snapshot ≤2KB).
  Owner: Zara.
- [GH-2] Bots + driver — DONE (instant table of 8 labelled ghosts, goal-
  directed rehearsal brain with sharp/casual tiers + flubs, human `input`
  transport, 30s idle nap; 8/8 driver tests, 307/307 suite). Owner: Zara.
- [GH-3] Share — DONE (GhostChallenge with seeded re-entry URL; trail +
  replay payload ≤20KB proven, mid-game honesty, link replays the hole;
  23/23 sim tests). Owner: Leo + Zara.
- [GH-4] Client — DONE (canvas course + drag-flick + keyboard aim, rival
  ghosts with fading trails, snapshot-gated paint, 360px-fluid; build green,
  6.14KB chunk; live proof rides GH-5). Owner: Leo.
- [GH-5] E2E x6 + snapshot budget — Owner: Riya. Accept: 6 end-to-end checks
  green over real sockets (incl. client-mount snapshot + flick flow + seed
  re-entry); snapshot p95 ≤2KB; receipts in chat. Blocks release if red.
- [GH-5] E2E — DONE (6/6 over real sockets: hello/stream, instant table,
  vector-flick spend, garbage+reclaim survival, p95 ≤2KB, seed-link course
  match; release UNBLOCKED). Owner: Riya.
- [GH-6] Wire-up — DONE (`ghostline` registered, refusal dead; `?seed=`
  adopts on fresh rooms, live rooms never reseed; protocol-gate catch:
  flicks ride `input` {dx,dy}, zero contract change). Owner: Kai.

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
