# MARKET — R&D ledger for the gaming marketplace. Rule 10: every concept needs
Nova's sourced finding AND Cross's counter-memo. Scores are 0-10: clipability
(TikTok 2-second read), novelty (doesn't exist yet), reuse (% of our engine),
fit (3-min, no-signup, bots, 60fps Chromebook).

## Sources (Sept 2026 sweep)
- .io formula + history (agar 2015 4chan→millions, slither 2016 most-Googled game):
  doodoo.love analysis, virlan.co 2026 guide, eathealthy365 ranking.
- Retention mechanics (near-miss dopamine 30-60s, physical growth, leaderboard
  micro-tournaments, instant restart): bouncemediagroup TikTok-attention study.
- 2026 market: $8B browser games, WebGPU near-native, larger shards, live-ops
  cadence beats maintenance mode (slither intel report).
- Fresh mechanics 2026: growordie (REMOVE the food loop — survival IS score,
  proximity-punishment, kill broadcasts), Grapplenauts (grappling-hook spring
  locomotion, Phaser+Colyseus), Rivok (browser RTS, 3 bot difficulties),
  MagStrike (typing combat), Larss (deterministic 1v1), Terix.io (territory+shoot),
  nodecontrol.gg (AI-built 60Hz 4-region).
- Magnet lane: only game-jam toys (magnet.io 2022, "code is very bad", base-hauling
  variant). NO serious 3D magnet-polarity arena exists. Lane OPEN.

## Scored concepts (Nova proposes, Cross disposes)
| # | Concept | Clip | Nov | Reuse | Fit | Σ | Verdict |
|---|---|---|---|---|---|---|---|
| 1 | POLAR PANIC — flip your charge; opposites attract, same repels; vacuum pellets | 9 | 9 | 85% | 10 | 33 | **SHIPPED (game #2)** |
| 2 | BLACK-HOLE BUFFET — slingshot around devouring wells (prior Mode-2 winner) | 9 | 6 | 90% | 8 | 31 | **SHIPPED (game #3)** |
| 3 | HOOK HAVOC — grappling-hook locomotion arena (Grapplenauts is 2D-only) | 10 | 7 | 40% | 7 | 30 | NEXT (game #4, needs spring physics) |
| 4 | GROWORDIE-like survival snake | 7 | 4 | 50% | 8 | 27 | CUT (clone lane) |
| 5 | Typing-combat duel (MagStrike exists) | 6 | 3 | 20% | 5 | 23 | CUT (exists + desktop-only) |
| 6 | Territory trace (Paper/Terix lane) | 7 | 3 | 55% | 8 | 25 | CUT (crowded) |

## Cross's counter-memos (why the winner survives)
- vs #1 "magnets are confusing": polarity is binary (+/−) with ink-blue/raspberry
  rings — readable in 1 second, simpler than dash physics we already shipped.
  Evidence: magnet.io jam players got it with zero tutorial.
- vs #1 "attract = griefing magnet": same-charge repel is the built-in escape
  (flip to shake chasers), plus spawn shields carry over. Griefing needs contact;
  contact needs opposite charge; victim chooses their charge. Self-balancing.
- vs #2-first "reuse is higher": true (90 vs 85) but novelty 6 vs 9 — buffet reads
  as "agar with holes" in a 2-second clip; polarity reads as a NEW verb (flip).
  Clip wins the marketplace slot.
- vs #3-first "clip 10": hook traversal needs spring physics + rope rendering +
  new netcode (velocity discontinuities) — 40% reuse breaks the one-turn ship rule.
  Queued behind a proven audience.

## Marketplace rules (locked)
1. One mascot universe (mochi critters), one shell: `?game=<id>&room=<code>`.
2. Every game: 3D (shared World3D), 3-min rounds, no signup, bots, <150KB first paint.
3. New games reuse snapshot transport shape + QA gates (combat suite pattern, soak).
4. Research duel never ends: each new game needs a MARKET row + Cross memo first.

## 10-GAME DAY roster (portal + FPS R&D applied, Cross-scored)
Portal law (Poki/Yandex/CrazyGames data): instant load (<4s or lose half the clicks),
action centered immediately, big touch UI, categories + social proof (live counts),
short sessions, trial-friendly. FPS law (three.js 2026 guides): draw calls <100,
DPR capped, zero-alloc loops, dispose discipline, `renderer.info` overlay in dev.
Our standing: initial 24KB (~1s), 1 draw call per entity class, DPR governor,
pooled everything — portal-ready. Gap closed this cycle: `?debug=1` perf overlay.

| # | Game | Verb | Reuse | Phase | Status |
|---|---|---|---|---|---|
| 1 | Mochi Panic 🍩 | munch/dash/splat | — | P0 | LIVE |
| 2 | Polar Panic 🧲 | flip charge | 85% | P0 | LIVE |
| 3 | Black-Hole Buffet 🕳️ | slingshot wells | 90% | P0 | LIVE |
| 4 | Sugar Rush 🍬 | speed + 90s rounds | 97% | A | **SHIPPED (batch A)** |
| 5 | King Hill ⛰️ | hold center zone | 88% | A | **SHIPPED (batch A)** |
| 6 | Tag Frenzy 🏃 | pass the IT | 88% | A | **SHIPPED (batch A)** |
| 7 | Meteor Shower ☄️ | dodge telegraphed blasts | 85% | B | QUEUED |
| 8 | Team Splash 🎨 | 2-team mochi | 80% | B | QUEUED |
| 9 | Ghost Hunt 👻 | hunt the fading | 82% | B | QUEUED |
| 10 | Steel Swarm 🛡️ | tank shells (RU/EU/US/IN) | 90% | C | QUEUED |

Per-game phase plan (every game, no exceptions): duel row → sim + headless suite →
client mode (palette/rings/tutorial/card) → smoke over WS → soak if sim touched →
arcade card + hero → ship. Batch A shares one VariantRoom; Steel Swarm gets its own
sim (shells ballistics) like polar/buffet did.

## R&D-2 diversifiers (party-OS thesis, D5 — duel rows for the next NEW verbs)
Rule 10 applies: Nova finding + Cross counter each. Scores reuse clip/nov/reuse/fit.
| # | Concept | Clip | Nov | Reuse | Fit | Σ | Verdict |
|---|---|---|---|---|---|---|---|
| 11 | DOODLE DUEL — draw & guess relay, 4–12+, prompts + voting | 9 | 7 | 50% | 9 | 32 | **NEXT NEW GAME (Sprint 3)** |
| 12 | TRIVIA/WORD BLITZ — team buzzer quiz, 2–100, playlists | 8 | 5 | 65% | 9 | 29 | SHORTLIST (Sprint 5) |
Cross memos: vs #11 "stroke sync is netcode risk": strokes are sparse,
rate-limited polylines with server rebroadcast + prompt seed — far cheaper than
60Hz physics; drawing abuse handled by UX-011 report + prompt filters, no free
text at launch. Vs #12 "trivia is content treadmill": start with one shipped
question pack + host custom packs later; latency handled by lockout-buzzer with
server timestamp authority, not client claims. Vs "why not more arenas": 6
shipped arenas already cover the competitive anchor; sameness is the measured
risk (D4), and R&D-2 P0 ranks draw/trivia above a 7th arena verb.
