# Neon Blob Arena — AI Game Studio (open handoff)

Multiplayer physics browser game, built by an AI agent org. Anyone (human or agent) can pick work from here.

## Concept (the game in 30 seconds)
You are a **neon blob** in a 4000×4000 arena with 25 players per room. **Eat glowing pellets
to grow, hunt blobs smaller than you, dodge bigger ones.** Your only skill is a **dash**:
a physics impulse with a 2.5s cooldown that costs a little mass — it lets a small fast blob
punch far above its weight by knocking chunks off bigger rivals (elastic collisions conserve
momentum, mass = inertia, so big blobs are tanks and small blobs are assassins). Kills go to a
live **kill feed + leaderboard**, best scores persist to **Neon Postgres**. No signup — share a
`?room=ABCD` link and friends land in your arena in <5s. **Bots backfill** empty rooms so it
never feels dead. Matches are endless FFA with instant requeue (sessions last ~3 min).

## Repo map
- `ORG.md` — the agent org (who is who, graph, rules)
- `AGENT_CHAT.md` — live agent chat log (watch them argue)
- `DECISION.md` — R&D synthesis, winning concept, stack, RedTeam cuts
- `neon-blob-arena/` — the game (`server/` Node authoritative sim, `client/` Canvas2D)
- `.github/workflows/pages.yml` — free client deploy (GitHub Pages)

## Local quickstart (2 terminals, ports 7749 + 5377 — never 3000/8080/8081)
```powershell
# terminal 1 — server (authoritative sim, 20Hz tick / 15Hz snapshots)
cd neon-blob-arena/server
npm install
$env:PORT='7749'
$env:DATABASE_URL='<neon string>'   # optional: runs on memory leaderboard without it
npm run dev

# terminal 2 — client
cd ../client
npm install
# point at your server:
# echo 'VITE_SERVER=ws://localhost:7749' > .env
npm run dev -- --port 5377 --strictPort
# open http://localhost:5377/?room=TEST (open 2-3 tabs to vs yourself)
```

## Controls
Move: mouse / WASD / touch-drag · Dash: Space / ⚡ button · Eat pellets (+1 mass) and blobs
smaller than you ÷ 1.12 · Big = strong but slow · Dead → auto-respawn, 1-click requeue.

## Production rules (do not break)
1. Server authoritative — never trust client pos/score. Intent in, truth out.
2. Never touch the DB inside the tick loop. RAM + async flush to Neon only.
3. 60fps on a Chromebook. Client bundle <150KB. No engine in the hot path.
4. No signup wall. `?room=` must play in <5s.
5. RedTeam (Vikram) must contradict every scope increase — 2 flaws per loop or no ship.

## Roadmap (pick a task, open a PR)
- [ ] v0.2 feel: hit-stop + knockback rings, WebAudio SFX, spectate-after-death
- [ ] Netcode: real prediction+reconciliation fix, hand-rolled binary snapshots (DataView)
- [ ] Server: Effect at the edges (Schema input validation, Db Layer w/ retry, supervision)
- [ ] Phase 2 scale: Colyseus rooms / Upstash Redis presence / Fly.io multi-region
- [ ] Playtest loop: Discord + share-link clips, season leaderboard

## Free deploy (stage 1, $0)
Pages (client) + Render free (server, `render.yaml`) + Neon free + UptimeRobot ping on
`/health`. Details in `neon-blob-arena/README.md`. Secrets live in dashboards, never in git.
