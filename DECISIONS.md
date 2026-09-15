# DECISIONS — every game/rule/scope call, with WHY, WHY-NOT, and a conclusion.
Rule 12: Rehan must sign the counter. No conclusion, no build. Re-opened when new
evidence (telemetry at `/perf`, playtests, market shifts) arrives.

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
