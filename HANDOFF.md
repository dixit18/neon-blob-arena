# HANDOFF — crash-proof session state. Any agent (or human) resumes from here.

If this session died, read in this order: `HANDOFF.md` → `AGENT_CHAT.md` (tail)
→ `ORG.md` rules → `QA.md` gate. Then continue from "Next up" below.

## Where we are (update every work unit)
- LZ-4 SHIPPED (SG-1 gates green, SG-1 COMPLETE): web build green, shell
  31.63KB ≤60KB, dive 25.14KB ≤26KB, BROWSER GREEN on live stack (edge
  landing 7/7 incl. sagaTabs/sagaSub/play/diveCv + 226KB paint, nitro room
  3/3 + 450KB, 360px paint 216KB, firefox both pages non-blank; server
  genuinely up :7749 WASM ACTIVE, preview 200 — no theater). First gate run
  went RED on infra (Start-Process can't exec npx.ps1 → preview 000);
  root-caused, reran on node-direct boot. Reduced-motion off (CSS kill +
  3D refused + 2D frozen, unit-tested), PLAY primary (untouched flow,
  finale one-tap dismiss). Pushing. Next: Sprint 5 GHOSTLINE (Devika slices
  GH-1..GH-6; crew pulls on sight).
- LZ-3 SHIPPED (SG-1 story zoom): saga finales (title + Season-2 teaser card
  with challenge-link share) + ?saga=&ch= deep links (dive boots at that page,
  PLAY pre-named) + chapter 📸 share (title + saga/ch link). Verified: 30/30
  web tests (2 new), server tsc + web build green (shell 31.63KB ≤60KB, dive
  25.14KB ≤26KB). Pushing. Next: LZ-4 gates.
- PF-1 + BX-1 SHIPPED (user: track fps, no lag, browser-agent check every
  browser): fps/p95 pills in blaze + nitro (+3D mode), dive fps chip, 15s
  /perf beacon with browser caps, GET /perf aggregates; zero-dep Edge +
  Firefox headless gate. Verified: 240/240 tests (4 meter + 2 perf new),
  web build green (shell 19.19KB), BROWSER GREEN (edge 6/6 + 3/3, firefox
  paint both pages). Pushing.
- TP-1 + NR-5 SHIPPED (user: use free Threepipe properly for 3D, Rust+WASM to
  better it, nothing runs locally): Threepipe ThreeViewer via pinned CDN
  (Apache-2.0 free, 0 bundle bytes, 2D default) on blaze/nitro 3D toggles +
  race-phys.wasm (1KB, no bindgen) batch-stepping the authoritative nitro sim
  with bit-identical TS fallback. Verified: 238/238 tests (2 new parity),
  server tsc + web build green (shell 19.19KB), live boot ACTIVE, soak 30/30
  @390/s tickAvg 0.08/max 0.9ms SOAK GREEN. Pushing.
- RD-1 SHIPPED (user: share-worthy 3D, take the time): RIFT DIVE 3D — GLSL
  nebula sky, flowing energy rings, 6 biome dioramas, chase camera with vista
  slow-downs, 📸 photo share (PNG + rift link), portals for all 5 games. Lazy
  post-paint (2D first), 2D fallback forever. Verified: 7 layout tests, web
  build green (shell 19.19KB, dive chunk 15.10KB). Pushing.
- SLICE 1 SHIPPED (user: small parts only, keep shipping): hidden /employees
  studio live (`packages/studio` + 3 endpoints + lazy 7.58KB view — roster,
  threads, channels, Boss composer; never linked/indexed) + blaze-squad core
  (move/fire/zone/loot/bots/2D + ✨3D toggle) + nitro-rift core (lanes/boost/
  pads/bots/2D; 3D is NR-3) + WASM seam spec (physics.ts; crate is NR-4).
  Verified: 172/172 tests (48 new), server tsc + web build green (shell
  18.29KB, chunks ≤7.6KB), slice-1 e2e PASS (bots, zone, pads, ≤1.5KB).
  Fixed pre-existing red: ludo `scores` type. Next: slice-2 queue
  (ST-2/BZ-2/BZ-3/NR-2/NR-3/NR-4/G-0) — Devika owns the board. Skill installed:
  threejs-3d-generator (needs Tripo key; unused this turn).
- ST-2 SHIPPED (slice-2 queue): studio fails closed — STUDIO_KEY match or
  loopback-only on all /studio/* routes, 403/429 receipts, client prompts once
  for the key (sessionStorage) + pagehide kills the poll. Verified: 174/174
  tests (2 new), server tsc + web build green (shell still 18.29KB).
  Next: BZ-2 (blaze squads + loot tiers) — one slice per turn.
- BZ-2 SHIPPED: squads of 3 (round-robin deal, friendly-fire off,
  last-squad-standing + MVP feed) + tiered loot (green heal, gold full-heal +
  12s rapid) + crates in snapshot/client. Verified: 186/186 tests (12 new),
  server tsc + web build green (shell 18.29KB, blaze chunk 7.73KB).
  Next: BZ-3 (threepipe art pass) — one slice per turn.
- BZ-3 SHIPPED: pinned 3D CDN (threepipe 0.5.1 +esm verified, three 0.160.0),
  rapid HUD pill (rapidMs in snapshot), squad-colored 3D blobs, 2D default
  intact. Verified: targeted 28/28 + both builds green (shell 18.29KB).
  AUTONOMY LAW (user order): crew chains slices without waiting — finish →
  receipts → pull next, same turn. Only human-hands items stop the line
  (phone checks, Render dashboard, secrets, prod push).
  Next: NR-2 (nitro first-across + chase window + laps) — in progress.
- NR-2 SHIPPED: 2 laps/heat, first-across plants the flag, 10s chase for
  places, finishers outrank stragglers, lap in snapshot + HUD, ghost laps:2.
  Verified: 195/195 tests (8 new), both builds green (nitro chunk 4.99KB).
  Next: NR-3 (nitro ✨3D toggle) — chained, no waiting.
- NR-3 SHIPPED: nitro ✨3D toggle on the shared loader (track, lanes, cars,
  pads, lap line, version status), HUD live in both modes, 2D default.
  Verified: web build green (nitro chunk 6.64KB, shell 18.49KB).
  Next: NR-4 (Rust/WASM physics crate) — chained, no waiting.
- NR-4 SHIPPED: crates/race-phys (zero-dep Rust mirror, cargo test 4/4) +
  7 parity vectors bit-identical TS↔Rust (vectors.mjs vs examples/vectors.rs,
  zero diff). TS stays authoritative; WASM swap is import-only whenever.
  Next: G-0 (mixed-game soak) — chained, no waiting.
- G-0 SHIPPED: scripts/soak.ts — 30 clients across riot/doodle/blaze/nitro,
  30s live chatter. Receipt: 30/30 connected, 400 snaps/s, tickAvg 0.08ms /
  max 0.9ms, 0 errors, 0 unhandled. SOAK GREEN. Slice-2 queue EMPTY.
  Next: ludo LD-1..LD-6 (pre-existing board) — Devika slices LD-1 small
  before the crew pulls. Human-hands list unchanged: phone checks (/employees
  read, blaze sticks, nitro buttons, ✨ taps), Render STUDIO_KEY + push,
  UptimeRobot, Tripo key.
- LD-1 SHIPPED: ludo turn engine pinned by 24 headless tests (seats, dice,
  exact-finish, captures, safe cells, home-run sanctuary, extra turns, three
  6s forfeit, roll/pick timers, leaving, snapshots, determinism) + empty-room
  lobby-reset fix. Verified: 24/24 + server tsc clean.
- DEPLOY RED → FIX (user pasted Render log): origin/main still predates the
  ludo `scores` type fix, and Dockerfile floated `npm install` (unpinned
  compiler class). Fix: Dockerfile now `npm ci` (lock pins TS 5.9.3, the same
  compiler green locally) +   pushing fixed main. Next: LD-2 (ludo bots).
- LD-2 SHIPPED: tiered bot driver (sharp 10% / casual 30% mistake, preference
  capture > leave > finish > progress as pure scoreLudoPick), instant table
  of 4 with 🤖 labels, human roll/pick flow intact. Verified: 227/227 tests
  (8 new), server tsc clean. Pushing with LD-1 batch. Next: LD-3 (share).
- LD-3 SHIPPED: ResultGrid share (standings sorted by finished→score,
  crown title, re-entry URL, honest mid-game). Verified: 3/3 + tsc clean.
  Pushing. Next: LD-4 (canvas board client). Deploy: Render rebuilding from
  LD-2 push — /health watch stays open.
- LD-4 SHIPPED: canvas client (superellipse 52-loop, home lanes, corner
  bases, glowing tappable options, ROLL lock + Space/1-4 keys). Verified: web
  build green (ludo chunk 5.53KB, shell 18.58KB). NOTE: ludo still unregistered
   server-side (refuses) — LD-6 wires it. Next: LD-6 + LD-5 e2e.
- LD-6 SHIPPED: driver registered — ludo plays at `?game=ludo-clash&room=`.
- LD-5 SHIPPED (release unblocked): 6 e2e over real sockets (hello/token,
  instant table, roll edge, bad-input survival, p95 ≤2KB, reconnect).
  Flake caught + killed: stale-window roll race → fresh-window + repeat-send
  proof (green twice in a row).   Sprint 5 LUDO COMPLETE (LD-1..LD-6).
  Pushing. Next: prod /health watch.
- PROD WATCH: pushed fix, Render /health still 503 (rebuild queues behind 3
  rapid pushes, or free-tier sleep — BE-001 pinger still the user's action).
  Meanwhile G-1 SHIPPED: soak covers all 5 games (ludo roll/pick chatter) —
  30/30, 394 snaps/s, tickAvg 0.11ms/max 1.4ms, SOAK GREEN. Pushing (no
  rebuild triggered: scripts/ outside build filters).
- RIOT PLAYABLE (user: ship autonomously): Reflex Riot end-to-end live.
  `games/reflex-riot/sim.ts` (5 tasks, 8-task rounds, streak scoring, seeded
  rotation) + `driver.ts` (🤖-labelled tiered bots, 15% mistakes, solo gets
  7 instant opponents) registered in server (ghostline etc. still honestly
  refused) + `apps/web/src/games/reflex-riot.ts` client (task card, pads,
  scoreboard, feed, 1.5s reconnect). Verified: 78/78 tests (25 new),
  server tsc + web build green (riot lazy-chunk 4.88KB), live WS smoke PASS
  (hello+token, 161 snaps, 7 bots, human scored, refusal intact).
  Prod: Render rebuilds from push; server 503 was pre-existing (dashboard
  eyes still needed if it persists post-deploy). Next: Sprint 4 tickets
  (Doodle Duel) — Devika to write per Rule 14; crew pulls on sight.
- D12 PIVOT SHIPPED (user order + R&D report): legacy arena FE/BE DELETED
  (`neon-blob-arena/` gone; 24846af + 4861f62 in history). New monorepo live:
  apps/web (4.84KB shell) + apps/server (Node24-pinned CI/Docker, local v22
  recorded) + packages protocol/room/identity/catalog/bots/share/analytics.
  Verified: 53/53 tests, tsc clean both trees, 50-socket/60s soak PASS
  (50/50, 13.27 snaps/s/client, 0 unhandled, tickAvg 0.00ms). Next: Sprint 3
  Reflex Riot (first plugin). Old docs stand as history; SPRINTS rewritten.
- D10 SAMENESS VERDICT SHIPPED (user: "all games are the same, no doc
  inspiration"): Steel client PARKED (server sim green, no menu card);
  TRIVIA BLITZ server live (first non-arena verb: 8-Q party quiz, bots answer
  in tiers, 24-Q pack, quiz channel + answer transport, 1.1KB snapshots);
  UX-018 mood row on the menu (Beat/Chaos/Think/Surprise-me — Chill waits for
  a Chill game). Verified: 6/6 suites green (incl. new steel 31 + trivia 27),
  WS smoke 9/9 (steel hello/aim-channel, trivia quiz/answer/brota), client
  36.78KB/14.80gzip (cap ≤38KB), mochi soak 20/20 @14.2 snaps/s. Two sim bugs
  caught by receipts, not vibes (trivia mid-question bot plans; steel test AOI).
- D9 triple-report synthesis + live-site R&D SHIPPED (docs only, no sim change):
  three new reports converge on playground framing, share-OBJECT rule, mood-first
  discovery, daily ritual, async ghosts, discovery toys — all sharpen D5/D8.
  Live-site R&D 2026-09-15: prod FE live + aligned (guest-first, challenge,
  live strip, CSS tunnel, 35KB); BE 503 asleep (BE-001 still open); gaps =
  thumbnail-first menu, no daily seed, zero non-arena verbs. Adopted with
  bounds: order HOLDS (Steel → Party → Doodle → Ludo → Trivia → S6
  Slingshot/TenSec/SignalHunt); NEW Sprint 7 candidate Chain Garden (#16);
  Sprint 2 gains UX-018 mood row, UX-019 daily spec; CUTs locked (crowd-
  machine/MMO/3D/shooter/UGC/fan-IP/Portal-Rush-homepage). Files:
  DECISIONS D9, MARKET #16, SPRINTS S2-5b + S7 + CUTs, TICKETS UX-018/019.
- P0 CANT-PLAY FIXED + SHIPPED: root cause = Render free-tier BE asleep
  (probed fresh-boot rooms:0) + fire-and-forget PLAY with whisper-quiet failure.
  Fix: PLAY state machine (Loading / waking-retry x6 / error pill, buttons lock,
  silent onclose while joining). Plus: desktop full-bleed grid (UX-017),
  earn-the-share (challenge-a-friend gated on best, live hottest-room + king
  strip, pokable diorama — generic fwd killed per D7), Rule 13 + SCORECARD +
  CI boot-contract gate. Verified: client tsc+vite green 35.08KB/14.21gzip,
  headless DOM gate 9/9 incl. JS-ran proof, WS play-path 1.1s prod.
- D8 playground framing adopted (R&D-3): Sprint 6 candidates Slingshot/TenSec/
  SignalHunt with duel rows; cross-game rate joins UX-012; no Phaser/Colyseus
  rewrite; order holds (Steel → Party → Doodle → Ludo → Trivia).
- WOW-LANDING v1 shipped (D6): CSS-only infinite-zoom tunnel hero, marketer
  hierarchy (link-promise badges + shock line + 3 link-first steps), `?from=`
  personalized banner, Forward-the-fun button, crown-win share nudge, 360px
  overlap fix + 16px iOS inputs + 2-per-row cards. Verified: client tsc + vite
  green, initial 32.65KB/13.43KB gzip (DoD ≤35KB holds), UX-014/015 opened.
- R&D-2 REVIEWED + SPRINT UPDATED (docs only, no sim change): D5 adopts party-OS
  thesis with bounds — finish Steel (last arena), then Sprint 2 PARTY
  PERSISTENCE (cross-game room code + switch flow + host kick/lock + resume +
  party metrics), then Sprint 3 DOODLE DUEL (P0 draw-guess, promoted), Sprint 4
  Ludo, Sprint 5 Trivia Blitz (new); Rumble/batch-B/Cricket/Hooks parked;
  UX-011/012/013 opened; MARKET duel rows #11–12. Status: GREEN builds untouched.
- EFFECT-EDGE aim gate shipped: `validate.ts` Schema now accepts optional `aim`
  (radians, finite-checked). Verified: tsc + 4 suites green, aim=1.57 pass /
  NaN-null / legacy-undef.
- WEB-MARKETPLACE v1 shipped (physical-doc → web translation):
  server `GAMES` now carries duration/players/level/vibe + `GET /catalog`;
  client cards show `3-min · 1–25 · Easy` meta, ⚡ Quick Play joins fullest room,
  📅 THIS WEEK squad nights pre-pick games, 💛 conduct line live.
  Verified: server tsc + 4 suites green, client build 31.67KB/13.13KB gzip,
  probe :7759 health ok + catalog mochi=3-min/rush=90s.
- Shipped: v2 MOCHI PANIC (`13bbd68`) — light candy-pop full re-theme (landing+HUD+3D),
  feel fixes (damped reconcile, 2Hz DOM, loop guards, smooth shake, DPR governor),
  memory pass (pools, zero per-frame alloc, name-texture ownership).
- Probe hooks live: HUD shows `fps/p95ms`, `longtask` counter in client, DPR governor
  steps 1.5→1.25→1.0 on p95>22ms. USER: play 30s and report `fps/p95` from HUD.
- Verified: client build green (initial 20.42KB/8.9KB gzip), landing serves 200 with
  all new IDs, combat 23/23 PASS, soak 30/30 @14.2 snaps/s tickAvg 0.3/max 2.3.
- Deploy fix: Render docker build failed on floating latest-TS (5.9.3 narrowed a
  literal dev-TS 5.5 accepted in combat.test.ts) + unpinned deps. Fixed test to be
  narrowing-proof, Dockerfile now `npm ci` from lockfile (pinned, devDeps for
  compile, prune after). Proven: pinned install → tsc 0 → prune → boot → /health ok.
  ALSO verified fixed test compiles under floating 5.9.3 (belt + suspenders).
- Bounce closed: combat.test.ts 28/28 (wall bounce flips + budgets, spent orb dies,
  life expiry). Client FE build on Render now `npm ci` too (was floating install).
-Determinism war: root `workspaces` REMOVED (it made nested `npm ci` fail with EUSAGE
  everywhere while adding nothing — services build from their own dirs). Both services
  verified clean-room: `npm ci` → build → 28 tests green. Root note kept as `_note`
  (raw `//` comments break vite's parent-package.json parse — learned the hard way).
- CI gate live: `.github/workflows/ci.yml` (server build+test, client build, fire-spam
  soak + tickAvgMs<5 gate). Pages workflow hardened to bare `npm ci`.
- Anti-idle (`eb5842d`+): prod probe proved WS healthy but rooms start EMPTY and bots
  trickled 1-per-2s (14s of dead air). Backfill now bursts 3-per-1s (7 bots in ~3s,
  capped, tested 32/32). Menu shows connect/retry/waking status instead of silence.
- Soak re-run post-backfill: 30/30 @14.1 snaps/s, tickAvg 0.19/max 2.4. Green.
- MARKETPLACE: 6 GAMES LIVE (batch A shipped: rush/hill/tag via one VariantRoom).
  Kabir "Cross" Rao hired as Nova's RedTeam (Rule 10).
- INCIDENT 2026-09-14: prod BE 503 = free-tier sleep (no pinger — BE-001 open).
  Same pass caught a near-fatal local edit (sim loop commented out — restored +
  runtime-proven ticks 0→25). Shipped: crash-proof boot (DB guard + handlers),
  ping/pong RTT meter in HUD, how-to modal + objective pill per game.
- Next in MARKET queue: HOOK HAVOC (game #4, needs spring physics — bigger cycle).
- PLATFORM PROGRAM: `MARKETS.md` (region tables + buildable shortlist + phases),
  Devika "Dot" Menon hired as PM/UX (Rule 11, owns `TICKETS.md`), first audit done:
  live arcade counts, hang watchdog, short-screen menu, a11y labels. Board: 4 done,
  4 open (UX-005 needs human hands).
- Tree state: CLEAN, in sync with `origin/main`. Verify with `git status -sb`.
- Prod: client auto-deploys from main; server on Render; user runs local via `.\start-local.ps1 -Restart`.
- Ports: server 7749, client 5377. Never 3000/8080/8081. Probes use :7751+.

## Active work
- Sprint 5 GHOSTLINE: GH-1 SHIPPED (flick sim + replay core) + GH-2 SHIPPED
  (ghost driver: instant table of 8, rehearsal brain, sharp/casual tiers,
  idle nap; 307/307 suite, tsc clean). Pulling GH-3 (GhostChallenge share
  proof) same turn — small: trail payload + mid-game honesty tests.

## Next up (priority order — pull queue, Rule 14: finish → report to Aarav → pull next)
1. Sprint 5 GHOSTLINE (deterministic flick + replay + Ghost Challenge) —
   Devika to slice GH-1..GH-6; crew pulls on sight.
2. USER only for: UptimeRobot on /health (BE-001) + Render STUDIO_KEY + phone checks.

## Session-survival protocol (Rule 9, mandatory)
1. BEFORE coding: update "Active work" here with goal + files you will touch.
2. DURING: keep changes small; `tsc`/build after each file-level change.
3. AFTER each work unit: update "Where we are" + "Next up", append `AGENT_CHAT.md`,
   commit (WIP prefix if unverified: `WIP: <what + what's left>`).
4. NEVER end a turn with uncommitted code. A dead session must leave a clean tree
   or a WIP commit — never mystery diffs.
5. Verification receipts live in `AGENT_CHAT.md` (numbers, not vibes): build
   output, loadtest lines, bundle sizes.
6. One background-proc law: the runner reaps background jobs between steps, so
   verify servers/loadtests inside ONE shell step only (start → probe → kill).

## How to resume (new session checklist)
- [ ] `git log --oneline -5` — is HEAD where HANDOFF says?
- [ ] `git status --short` — empty? If not, last session died dirty: inspect diff first.
- [ ] Read `AGENT_CHAT.md` tail for the latest receipts + blockers.
- [ ] Run green checks: `npm run build` in `server/` and `client/`.
- [ ] Set "Active work" here, then code.
