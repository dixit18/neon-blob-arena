# DECISIONS — every game/rule/scope call, with WHY, WHY-NOT, and a conclusion.
Rule 12: Rehan must sign the counter. No conclusion, no build. Re-opened when new
evidence (telemetry at `/perf`, playtests, market shifts) arrives.

## D7 — earn-the-share, kill the beg-button (user: "forward button is worst thinking")
- WHY (Aarav, Nova cited): R&D on intrinsically-forwarded web hits. (1) WORDLE:
  one shared daily puzzle (synchronous ritual, everyone compares the same game);
  spoiler-safe brag grid (emoji squares leak nothing yet invite "I got it in
  three — you?"; every grid is a free ad carrying the game's name); zero
  friction (URL → playing in ~10s); purity (no ads/IAP at peak — recommending
  felt safe); scarcity-as-ritual (can't binge, so it becomes habit + streaks).
  90 users → 300k → 1M daily in ~10 weeks. (2) NEAL.FUN (~2M monthly, solo dev,
  Infinite Craft 21M impressions): "internet TOYS, not games" — quirky,
  2-minute, unique-every-visit curiosities; "asks nothing except attention and
  generously rewards it"; viral via clips + search, not buttons. Steal the
  mechanics, never the assets: brag-that-invites-comparison, live shared
  context, toy-in-2-seconds, zero friction, purity. Our equivalents: challenge
  text carrying YOUR best ("I hit 240 — beat it"), live "happening NOW" strip
  from real /rooms + /leaderboard (curiosity a non-player forwards), pokable
  diorama toy, existing score PNG (our Wordle grid), crown streaks (our ritual).
- WHY-NOT (Rehan): live strip on an empty server reads "quiet everywhere" —
  anti-wow that advertises deadness; challenge needs a best score new users
  don't have (gate or dead button); toy taps risk accidental PLAY rage; three
  new landing widgets re-add the choice-paralysis D6 just removed; copying
  Wordle's grid shape or neal's toys invites clone smell + IP shadow.
- CONCLUSION: SHIP with bounds. KILL generic fwdBtn (banner-blindness begging).
  Ship: (1) ⚔️ Challenge-a-friend (needs best>0, else coach-dare to play first;
  text = my best + game + from-link; share→clipboard). (2) Live strip: hottest
  room (tap = Quick Play crash it) + today's king (tap = dethrone run), quiet
  fallback brags about bots ("bots hold the arena — come bully them"). (3) Pokable
  diorama (squish-pop + rotating dare, menu-only, never starts a game). KEEP:
  from-banner, crown nudge, score PNG (all prompt-after-delight). NO Wordle-grid
  clone, NO neal toy copies, NO new deps, NO server change (/rooms + /leaderboard
  already exist). Measure: challenge taps, live-strip taps, from-joins.
- Status: CONCLUDED. Owner: Aarav + Leo. Signed: Rehan. Cross memo: inspiration
  only — all expression original mochi; Vikram flaws in chat.

## D1 — the 3-minute rule (user verdict: "don't like 3 min things")
- WHY keep (Aarav): rounds create urgency, crown moments make clips, seasons give
  comeback loops; every shipped game was tuned around a timer.
- WHY-NOT (Rehan): a platform law forcing ALL games into 3 minutes strangles variety
  — zen/solo/party formats die on the drawing board; users smell sameness across
  the arcade ("game separation"). Evidence FOR kill: Poki's winners span 1-min
  puzzles to endless builders; our own rush (90s) already breaks the law happily.
- CONCLUSION: rule DEMOTED to default, not law. Competitive arenas keep timers
  (tuned per game, already parameterized); solo/party modes ship timeless with
  personal-best persistence. No code purge — timers stay where designed.
- Status: CONCLUDED. Owner: Aarav. Signed: Rehan.

## D2 — solo games allowed (user: "not every game needs multiplayer")
- WHY (Nova, cited): Poki's top tier is overwhelmingly solo (puzzles, runners,
  builders); solo fills dead hours, zero lobby risk, kids-safe; CrazyGames itself
  runs daily-seed + puzzle modes beside multiplayer.
- WHY-NOT (Rehan): splits focus; solo retention needs progression systems we don't
  have; bots already fake company well. Why not just improve bots instead?
- CONCLUSION: PASSED with bounds. Solo = same engine, score-chase + personal bests
  (no new progression systems until PMF). First solo candidate: ZEN MUNCH (endless
  mochi, no timer, best-mass persistence) — queued, not started.
- Status: CONCLUDED. Owner: Aarav. Signed: Rehan.

## D3 — lag-first ship policy (user: "should not go with lagging games")
- WHY (Riya): nothing kills a platform faster than jank; portals (Poki case:
  40MB→6MB load = 50%→72% conversion) prove feel IS distribution.
- WHY-NOT (Rehan): perfect is the enemy of shipped; lab numbers ≠ user networks
  (India→US-East latency no code can fix); gating on feel can stall the hourly loop.
- CONCLUSION: PASSED with teeth. Gates: p95 ≤20ms desktop / ≤25ms phone, tickAvg <5,
  zero per-frame alloc; evidence = `/perf` telemetry from REAL sessions, not lab.
  Region answer documented: Singapore room when paid tier lands (until then the HUD
  📶 meter tells users the truth). Hourly loop continues — gates are the Definition
  of Done, not a freeze.
- Status: CONCLUDED. Owners: Riya + Zara. Signed: Rehan.

## D6 — wow landing + responsive-first (user: "market the first page, shock + forward, all games responsive, RedTeam on everything")
- WHY (Aarav, Nova cited): first page is the product for non-players — R&D
  finds: (1) infinite-canvas/scroll heroes are a recognised Awwwards wow
  pattern (Andrew Reff infinite-canvas hero; CIAO ENERGY infinite-scroll hero;
  Nike Infinite Space endless WebGL; Lusion Infinite Passerella infinite show
  + sharable postcards; Codrops Oct-2025 layered-zoom-scroll recipe with GSAP
  ScrollTrigger/Smoother + CSS --progress + trailing blur layers). (2) Virality
  that works is outside-network link invites into instant browser play with no
  account (Jest: 25% share rate, 1:2 referral, +50% D7 for invited; generic
  share buttons suffer banner blindness and don't move the needle). (3) Prompt
  AFTER delight converts 2–3x (ExperimentFlow K-factor chain); personalized
  landing ("X invited you") beats generic; one-click pre-populated share for
  WhatsApp/Discord/SMS + copy link wins (ReferralEarl checklist: reward above
  the fold, 3 steps, no signup gate, mobile-first, whitespace).
- WHY-NOT (Rehan): landing revamp risks the converting core (1-tap PLAY);
  zoom motion can jank the 2GB-RAM India phones our markets plan depends on;
  more buttons = choice paralysis; responsive claims without devices are
  guessing (UX-005 still needs human hands); share incentives can't be currency
  (no economy exists) so "reward" must be intrinsic (squad needs you, defend
  the crown). Scroll-driven zoom fights our fixed-dialog menu + short-screen
  rule — wrong pattern ported blindly.
- CONCLUSION: SHIP with bounds. Menu-only CSS zoom tunnel (3 transform-only
  rings, compositor-cheap, reduced-motion off, hidden on short screens, zero
  paint when menu hidden); marketer hierarchy (link-promise badge + shock line
  + 3 link-first steps + live social proof); `?from=` personalized banner
  (URL-only, never stored/logged); Forward-the-fun button (native share →
  clipboard fallback, pre-populated squad text); crown-win share nudge
  (prompt-after-delight); 360px HUD-overlap CSS fix + 16px mobile inputs
  (iOS anti-zoom) + 2-per-row cards. NO ScrollTrigger plugin, NO three.js on
  landing, NO new deps, initial chunk budget holds. Measure: fwd taps,
  from-joins (UX-012), K-factor later. Responsive device truth stays human.
- Status: CONCLUDED. Owner: Aarav (messaging) + Leo (build) + Riya (gates).
  Signed: Rehan. RedTeam (Vikram) flaws filed in chat; Cross memo: wow must
  not cost first paint — CSS-only accepted, plugin path rejected.

## D5 — party-OS thesis from R&D-2 (user: "update our sprint accordingly")
- WHY adopt (Aarav, Nova cited): R&D-2 community evidence is consistent —
  organisers need 8–15 players with one link, no download, phone-friendly;
  guests praise no-login/no-friction starts; empty lobbies kill. Our shell
  already proves guest-first + private rooms + bots + emotes-only safety.
  The missing piece is exactly the thesis: "Open a room. Send one link.
  Play anything together." Today rooms are namespaced per game
  (`game:room` in `index.ts`), so switching games abandons the party.
  Fixing that is differentiation vs Poki/CrazyGames catalogue-first.
  Portfolio side: R&D-2 P0 archetypes (draw-guess 9.4, microgame cup 9.2,
  trivia 9.0, social deduction 8.8) are all DIFFERENT verbs; our 6 live
  games are one verb (arena eat/dash). D4 already flagged sameness risk.
  Doodle Duel (draw & guess, stroke sync) is already in our backlog and
  is the cheapest P0-aligned diversifier. Trivia/word blitz is low-medium
  build, 2–100 players, phone-friendly — ideal second diversifier.
- WHY-NOT (Rehan): party persistence touches the WORKING shell
  (routing, room lifecycle, matchmaking, share links) — the highest-risk
  surface for regressions with zero new games to show. Diversity splits
  focus: Steel Swarm is mid-flight (S1-3 aim gate shipped) and Ludo Clash
  serves India volume; pausing arenas for party plumbing + a drawing game
  delays both. Metrics (WSPS, host reproduction) without volume is theater
  — our /stats has joins/rounds/taunts but few real parties yet. Iframe
  isolation + SDK + voice + UGC (all in R&D-2) would sink the free-tier
  hourly loop; R&D-2 itself says modular monolith first, defer those.
- CONCLUSION: ADOPT with bounds. (1) Finish Steel Swarm as the last arena
  for a while (competitive anchor, P1 7.8 in R&D-2 terms, S1-3 already
  done — sunk-cost finish, not a new bet). (2) Next platform sprint is
  PARTY PERSISTENCE: one room code across games + switch-game flow +
  host kick/lock + reconnect hardening + party metrics (second-game
  starts, host reproduction). (3) Next NEW GAME is Doodle Duel (draw-guess
  relay, P0) — promoted ahead of Rumble/Meteor/Team/Ghost sameness batch.
  (4) Trivia/word blitz enters the shortlist as the low-cost large-group
  game after Doodle. (5) DEFERRED explicitly: iframe/SDK isolation, native
  voice, open UGC, payments/host-sub, tournaments/esports layer — until
  party-switch + host-repeat signal exists. No sim changes in D5 itself.
- Status: CONCLUDED. Owner: Aarav. Signed: Rehan.

## D4 — per-game verdicts (review all 6 before more ships)
- Mochi/Polar/Buffet/Rush/Hill/Tag: KEEP, conditional on D3 telemetry staying green.
  Rehan's why-not per game (sameness risk, novelty-6 buffet, tag ping-pong edge) is
  answered by: distinct verbs per card, tests pinning the edges, telemetry watching.
- Next ships: Steel Swarm (tanks, RU/EU signal) then Zen Munch (first solo, D2).
  Superseded in part by D5: Steel still next (finish in-flight), then Doodle
  Duel (P0 draw-guess) jumps ahead of Zen/Rumble; Zen stays queued.
- Status: CONCLUDED. Owner: Aarav. Signed: Rehan.

## D8 — playground-not-marketplace framing, R&D-3 (user: "go through this, update sprint")
- WHY adopt (Aarav, Nova cited): R&D-3 sharpens D5 rather than replacing it.
  (1) Player framing = playground ("most interesting place to start playing
  immediately"), marketplace architecture underneath — matches our shell
  (catalogue infrastructure + party thesis). (2) 6 DIFFERENTIATED games, every
  game ships a share object (score image, ghost, drawing chain, challenge) —
  our 6 live are one verb (D4 sameness risk stands); our score PNG + new
  challenge link already follow the rule; future picks must pass it.
  (3) Daily/social/discovery loops with distinct games per loop; cross-game
  rate as THE platform metric (joins UX-012). (4) Progressive wow + permanent
  fast lane (our zoom is menu-only, PLAY primary — validated). (5) Budgets:
  Poki ~5MB initial vs our 35KB — validated, keep. (6) Export HITS not
  infrastructure (Discord Activity / Devvit later) — Phase 4+. (7) Staged
  supply (Basic→Full launch on measured response) — adopt when SDK exists.
  New cheap fits for OUR engine: Slingshot Sprint (one-button physics, ghosts
  = async competition without concurrency), Ten Seconds (reaction microgames,
  trivial build), Signal Hunt (daily deduction, solo-friendly ritual).
- WHY-NOT (Rehan): third portfolio pivot in 24h (arenas → party → playground)
  risks whiplash with 2 platform sprints still unfinished; a daily game needs
  a content pipeline nobody owns; crowd-machine spectacle = cold-start +
  backend-load trap (One Million Checkboxes crashed repeatedly); Phaser/Colyseus
  defaults would rewrite a proven 35KB/60fps stack for zero player gain.
- CONCLUSION: ADOPT framing + metrics + shortlist, HOLD order. Sprint order
  unchanged (Steel → Party → Doodle → Ludo → Trivia). Sprint 6 candidates:
  Slingshot Sprint, Ten Seconds, Signal Hunt (duel rows #13–15 in MARKET).
  Cross-game rate joins UX-012 acceptance. DIVERGENCES locked: no Phaser
  rewrite, no Colyseus migration before paid scale, no crowd-machine homepage
  before concurrency health, no UGC/SDK before PMF. No code in D8 itself.
## D9 — triple-report synthesis + live-site R&D (user: "go through this, update sprint")
- WHY adopt (Aarav, Nova cited): three new reports converge INDEPENDENTLY on
  five claims that sharpen D5/D8 rather than replacing them. (1) Playground
  framing, marketplace architecture underneath — matches our shell; all three
  warn "marketplace" to players reads as transactions, not play. (2) Share
  OBJECT > share button (score image, ghost, drawing chain, result grid,
  garden replay) — our best-gated challenge + score PNG already follow the
  rule; future picks must pass it or they don't ship. (3) Six differentiated
  verbs, not catalogue size (Poki ~1500/100M, CrazyGames ~4500/60M — size war
  unwinnable); our 6 live are still one verb (D4 sameness stands). (4) Daily /
  social / discovery loops as distinct games, cross-game rate as THE platform
  metric — joins UX-012. (5) Progressive wow + permanent fast lane — our
  menu-only CSS tunnel + PLAY-primary validated, 35KB vs Poki ~5MB guidance.
  Live-site R&D (prod FE `neon-blob-arena-fe.onrender.com` fetched 2026-09-15;
  BE 503 = free-tier sleep, BE-001 still open): landing already ships guest-
  first badge, link-first 3 steps, Quick Play fullest-room, THIS WEEK rows,
  challenge-a-friend, live hottest+king strip — all report-aligned. Gaps the
  reports expose: menu still says CHOOSE-YOUR-ARENA + 6 thumbnails (catalogue-
  first, not mood-first); zero daily ritual (THIS WEEK rows, no daily seed /
  spoiler-safe card); zero non-arena verbs live; UX-013 mood reframe still open.
- WHY-NOT (Rehan): fourth portfolio review in 48h risks whiplash with Steel
  mid-flight + Party unbuilt; daily game needs a content owner nobody has
  named; crowd-machine / living-world spectacle = cold-start + backend-load
  trap (Checkbox postmortem crashed repeatedly); Portal Rush / One-Minute
  Arcade campaign risks the marketing page becoming more fun than the
  catalogue; Phaser/Colyseus/Unity defaults would rewrite a proven 35KB/60fps
  stack for zero player gain; mood rows + surprise-me without volume is theater.
- CONCLUSION: ADOPT synthesis, HOLD order. Order unchanged (Steel → Party →
  Doodle → Ludo → Trivia → Sprint 6 Slingshot/TenSec/SignalHunt). NEW: Sprint 7
  candidate CHAIN GARDEN (discovery/Chill toy, duel row #16); ghost-challenge
  links ride inside Slingshot (no separate sprint). Sprint 2 DoD gains two
  report-backed gates: mood-first row + Surprise-me above thumbnails (UX-018),
  daily-seed spec + card format with named owner before Sprint 6 (UX-019).
  CUT until PMF + concurrency health: crowd-machine homepage, MMO/Living
  World, 3D open world, shooter, open UGC editor, fan-IP clones, Portal Rush
  as permanent homepage. No code in D9 itself.
## D10 — sameness verdict: park Steel client, ship a different verb NOW (user: "all games are the same, no doc inspiration")
- WHY (user verdict, Aarav): the player opened the menu and saw 6 thumbnails of
  one verb with a 7th (Steel tanks) in flight — still drive-around-and-shoot.
  All three user-provided reports independently demand DIFFERENT verbs, and
  draw-guess appears in all three while word/trivia party + reaction games
  appear in two. The docs also demand mood-first discovery (UX-018, still
  open). Shipping the Steel client now makes 7 same-feel games and proves the
  user right. Steel server sim stays committed + green as a parked anchor —
  sunk cost kept, sameness not shipped.
- WHY trivia first, not Doodle (Nova): Doodle needs a brand-new stroke-sync
  pattern + prompt-moderation plan, and bots cannot draw (cold-start risk the
  docs explicitly warn about). Trivia reuses rooms/snapshots/feed/rounds/
  backfill whole-cloth; bots ANSWER in skill tiers so there is zero cold-start;
  2–100 players matches the docs' large-party demand; phone-friendly; one
  built-in 24-question pack kills the content-treadmill objection (MARKET #12
  memo already covers lockout/latency answers). Doodle follows with its pattern
  done properly, not rushed into a weak launch.
- WHY-NOT (Rehan): third reorder in 48h; trivia adds a second snapshot channel
  (`quiz`) + an `answer` message — new pattern surface to maintain; question-
  pack quality IS the game (24 weak questions = a weak game, curation owner =
  Aarav for v1); nothing player-visible ships this turn except the mood row —
  the trivia client + card + tutorial must land next turn or this is theater.
  Bounds: Steel gets NO menu card (link-joinable only, `/catalog` lists it);
  trivia ships a score-card share object ("7/8 — beat it") or it doesn't ship;
  Doodle is next, not dropped.
- CONCLUSION: Steel client PARKED (S1-4/S1-6 cancelled). New Sprint 3 TRIVIA
  BLITZ: server + transport this turn, client next turn. Doodle → Sprint 4,
  Ludo → Sprint 5. UX-018 mood row ships this turn so the menu visibly changes.
## D11 — reboot from 0: catalogue + menu rebuilt, shell contract kept (user: "remove everything if required, start from 0")
- WHY reboot (user verdict, Aarav): three reports + one R&D agent + weeks of
  work still showed one verb on the menu. Another same-verb arena would keep
  the disease. So the PLAYER-FACING product restarts from 0: menu rebuilt
  mood-first with new verbs featured and arenas demoted to Classics, catalogue
  plan rewritten so every slot is a different verb with a share object, and a
  no-sit instant standard imposed (no screen sits >1s without action or
  visible progress).
- WHY keep the shell (Nova): the reports THEMSELVES prescribe "standardised
  metadata + flexible runtime" and "SDK contract before marketplace" — our
  rooms/snapshots/bots/backfill/transport IS that contract, proven green
  across 6 suites in prod. Nuking it burns weeks to re-earn identical
  guarantees. Removed from zero: thumbnail-first menu hierarchy (rebuilt),
  arena-first positioning (demoted to Classics), and any future same-verb pick
  (banned until every loop — daily/social/discovery — owns a game).
- New catalogue from 0 (one verb each, share object or it doesn't ship):
  Trivia Blitz (quiz/party — server done, client this turn) → Doodle Duel
  (draw/guess + moderation) → Ten Seconds (reaction ritual) → Ludo Clash
  (turn verb, India) → Slingshot Sprint (physics + async ghosts) → Signal Hunt
  (daily deduction, owner UX-019) → Chain Garden (discovery toy). Arenas stay
  live under Classics (kept, never featured, no new arenas). Steel sim parked.
- WHY-NOT (Rehan): reboot theater risk — renaming sections is not new games;
  scoreboard reads 1 new verb this turn, everything else is plan. Menu
  reshuffle can confuse existing players (bounds: Classics one tap away, PLAY
  path untouched, no URL breaks). A "1s" rule without measurement is vibes
  (bounds: Riya's gate = tap→same-tick visual + WS send, receipted in smoke +
  DOM checks — progress states count, dead sitting doesn't).
- CONCLUSION: menu rebuilt + trivia featured + no-sit DoD this turn; catalogue
  slots locked above; arenas kept live (deleting working games with live
  players/scores buys nothing — removal applied to positioning, not to games).
## D12 — full pivot: delete legacy arena FE/BE, rebuild from R&D report (user: "remove fe and be, start from scratch")
- WHY (user verdict, Aarav): two explicit orders to remove everything if required; incremental fixes kept one verb alive. The passed-in report is a complete from-scratch plan (6 new verbs, plugin architecture, WAPS north star, falsifiable gates). Prior work is safe in history (24846af + 4861f62 salvage) — deletion loses nothing recoverable.
- WHAT GOES: `neon-blob-arena/client` + `neon-blob-arena/server` (entire legacy game) + stale workflow/paths pointing at them. WHAT STAYS: studio docs as history + accountability, re-pointed at the new tree.
- WHAT GETS BUILT (report §D, honored): monorepo `apps/web` + `apps/server` + `packages/{protocol,room,identity,catalog,bots,share,analytics}` + `games/` plugins; Node 24 Docker-pinned (local toolchain runs v22 — recorded, not hidden); stable Effect at ingress/egress/boot only, never `step()`; raw `ws` with reversible-Colyseus protocol; catalogue Reflex Riot → Read the Room → Ghostline → Signal Seven → Totem Panic → Ricochet Siege; NOT-NOW list adopted incl. zero Rust, no open drawing/chat at launch.
- WHY-NOT (Rehan): deleting a green tree on a report's authority re-opens earned guarantees (backfill feel, 35KB discipline, wake-retry UX) that must be re-earned under new names; report reuse %s are admitted ±10pp guesses; the Playground can become the loading screen it was meant to kill (report Risk #1 — gated by ≤1MB first-wow + 0-bytes-for-direct-links, no exceptions); moods unvalidated (A/B gate kept). Bounds: Foundation DoD numbers adopted as-is; first failing gate stops the line. No arena code ported — patterns re-derived under contract tests.
- CONCLUSION: pivot APPROVED. Delete legacy FE/BE, scaffold Foundation this turn, Reflex Riot next.
- Status: CONCLUDED. Owner: Aarav. Signed: Rehan. Cross memo: the engine is
  infrastructure, the catalogue was the product — we rebooted the right one.

## D13 — Rift Dive 3D flagship: the landing becomes the shareable (user: "nobody wants to share this, build what others can't fast")
- WHY (user verdict, Aarav): the live screenshot proved it — a handsome but
  static menu nobody photographs. Sharing needs a VISTA: a real-time moment
  worth capturing. So the dive becomes true 3D: GLSL nebula sky, flowing
  energy rings, six procedural biome dioramas (one per game portal), chase
  camera with vista slow-downs, and a 📸 photo mode that exports PNG + rift
  invite link via native share (clipboard fallback). Raw three.js 0.160.0,
  pinned CDN, lazy post-paint — NOT threepipe (a viewer framework is the
  wrong tool for a bespoke scene; custom shaders are the point). Portals
  remapped so all 5 playable games own a world.
- WHY-NOT (Rehan): a 3D landing risks first-paint (bounds: 2D paints first,
  3D upgrades on idle; shell 19.19KB ≤ 60KB holds); CDN three.js can flop
  (bounds: any failure stays 2D silently — proven by construction, no code
  path assumes 3D); low-end phones jank (bounds: gate is WebGL + motion OK +
  >2GB RAM, DPR governor, hidden-tab + offscreen pause, pooled math);
  screenshot-share is a new viral surface (bounds: file+link carry game+room,
  same trust as player names; no PII in frame).
- CONCLUSION: SHIP with bounds above. 2D descent.ts stays forever as the
  fallback. Measure: 📸 taps, vista shares, dive→PLAY conversion.
- Status: CONCLUDED. Owner: Aarav (call) + Leo (build) + Mira (art check) +
  Riya (gates). Signed: Rehan.

## D14 — unorthodox-first: the rift IS the site, everything rethought (user: "full website should be 3D", "think outside the AI box", standing order = Rule 15)
- WHY (user verdict, Aarav): the screenshots settled it — the Star Nursery
  spiral is what people feel; the menu column is what they skip. Orthodox
  we refuse: hero + card grid + PLAY (every game portal + every AI mockup
  ships it). So there is NO menu: the fullscreen steerable rift is the whole
  site, steering is choosing, flying into a ring is entering. Name field dies
  too (auto-guest already exists — you are Golden Falcon until you care).
  Rethink-everything verdicts, same lens: lobbies-that-wait → drop-in-live
  (humans join rounds in progress, bots hold the shape) — QUEUED RD-2;
  how-to modal → in-world coach marks — QUEUED; share-button-after-win →
  invite-as-place (rift link drops friends INTO your live room) — QUEUED;
  global leaderboard page → in-world king beacon at the portal — QUEUED;
  lobby browser → NEVER (links + Quick Play already cover it, ban recorded);
  HUD numbers/buttons → diegetic signals + gestures — TICKETED after
  playtest, not before (confusion vetoes novelty: controls change only with
  device-hands proof). Game skins (user: "as real as possible") ride the same
  doctrine: procedural skins inside existing scenes, zero new deps.
- WHY-NOT (Rehan): the old "don't get the concept" wound — a world with no
  menu can mystify worse than a boring menu bores. Bounds SHIPPED this turn:
  passive users still arrive (auto-drift never stops), faced-world PLAY bar
  always shows the zero-ambiguity exit ("01 · ORBIT RINGS — PLAY"), tap =
  the old click-entry (flight is additive, never the only door), coach hint
  chip on first flight, deep links bypass everything as before, 2D fallback
  keeps the identical concept flat. If dive→PLAY conversion drops vs the
  menu era (measured, not felt), the bar becomes a louder door — novelty
  never overrules comprehension. Signed: Rehan.
- CONCLUSION: SHIP full-viewport steerable rift + fly-in entry + face-follow
  PLAY + shard spiral + menu/name-field deletion. Measure: dive→PLAY,
  fly-in share, faced PLAY taps.
- Status: CONCLUDED. Owner: Aarav (call) + Leo (build) + Mira (art check) +
  Riya (gates). Signed: Rehan.
