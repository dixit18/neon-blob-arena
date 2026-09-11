# DECISION — why Neon Blob Arena

## R&D synthesis (real insights, Sept 2026)
- Doodle Duel (r/SideProject): removed signup 2%→35% conversion, 10k in 3 weeks. → **No signup.**
- FlashTankArena (r/IoGames): "150 players in 48h, biggest change? No empty lobbies. Bots keep action 24/7." → **Bots day 1.**
- r/gamedev: students on Chromebooks = core audience. Kour.io wins on low-end. Suroi.io wins ad-free + open source. → **Canvas2D, <150KB.**
- Messenger (viral via 1 tweet, Yoko Taro praise) + 67 CHAOS meme + Elderwood viral on r/2007scape (3000 accounts/24h). → **Clip + share link = reach.**
- growordie.io postmortem: 1000 snakes / 1 CPU core, 15Hz, 11 bytes/entity, grid buckets, shard arenas not threads. Old Light: server owns truth. → **Shard rooms, 15Hz, AOI.**
- Fail modes: lag >80ms without prediction kills, empty lobbies kill, trusting client kills (polyfight invited hackers), paywalls/installs kill.

## Winner: A) Neon Blob Arena (agar + dash + knockback)
- 25 humans + bots per room, 4000x4000 world, 3-min fun, infinite requeue.
- Physics meaningful: dash impulse + friction decay, elastic knockback conserves momentum, mass→inertia (big=tank, small=assassin).
- Netcode tiny: {x,y,vx,vy,r} only. 15Hz JSON now, binary later.
- Viral: `?room=` friend link + "Big Eat" kill feed + daily leaderboard.
- Runner-up: D) SpellBounce Arena (steal its clip hook, skip its bounce-sync risk).

## Stack (production, scale to 10k CCU)
- FE: Vite + TS + Canvas2D, custom prediction/interpolation, DPR cap 1.5, object pools.
- BE: Node 20 + TS + `ws`, authoritative 20Hz sim / 15Hz snapshot, spatial hash, per-room isolation.
- Persist: Neon Postgres (serverless driver) for players/sessions/leaderboard. Redis later for cross-process rooms. Async flush only.
- Host (stage 1, ALL FREE $0): FE on **GitHub Pages** (Actions workflow in `.github/workflows/pages.yml`),
  BE on **Render free web service** (`render.yaml` blueprint, single instance, in-memory rooms — no Redis yet),
  persist on **Neon free** (verified live), keep-alive via free UptimeRobot ping on `/health` every 10 min
  (free tier sleeps after ~15 min idle). No Cloudflare/paid edge in stage 1.
  Phase 1 (paid, when crowded): Fly.io multi-machine + Upstash Redis + Neon Launch.
- Scale math: 25p/room, 3-5 rooms/core → 4 cores ≈ 1000 CCU. Shard regions for 10k.

## RedTeam cuts (enforced)
1. CUT teams/clans → FFA only.
2. CUT skins/shop/auth → guest name + localStorage id.
3. CUT replays/global chat → 8 preset taunts, kill feed only.
4. CUT zone/powerups → one mechanic (dash+knockback) done well.
