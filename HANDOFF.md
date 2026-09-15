# HANDOFF — crash-proof session state. Any agent (or human) resumes from here.

If this session died, read in this order: `HANDOFF.md` → `AGENT_CHAT.md` (tail)
→ `ORG.md` rules → `QA.md` gate. Then continue from "Next up" below.

## Where we are (update every work unit)
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
- None. D10 turn complete; tree ready to commit (see Next up).

## Next up (priority order)
1. Trivia CLIENT (Leo): quiz panel + 4-option buttons + reveal + card +
   tutorial + score-card share object ("7/8 — beat it"), then WS play-test.
   Without this D10 is theater — nothing player-visible except the mood row.
2. USER: UptimeRobot on /health (BE-001) + hard-refresh prod after deploy.
3. Sprint 4 Doodle Duel (stroke-sync pattern done properly, not rushed).

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
