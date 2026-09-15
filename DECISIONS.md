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

## D4 — per-game verdicts (review all 6 before more ships)
- Mochi/Polar/Buffet/Rush/Hill/Tag: KEEP, conditional on D3 telemetry staying green.
  Rehan's why-not per game (sameness risk, novelty-6 buffet, tag ping-pong edge) is
  answered by: distinct verbs per card, tests pinning the edges, telemetry watching.
- Next ships: Steel Swarm (tanks, RU/EU signal) then Zen Munch (first solo, D2).
- Status: CONCLUDED. Owner: Aarav. Signed: Rehan.
