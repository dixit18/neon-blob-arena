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
