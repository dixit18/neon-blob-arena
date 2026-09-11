# Neon Blob Arena 🟣

Multiplayer physics arena — eat, dash, knock back rivals. Browser, no signup, `?room=` friend links. Scales to thousands via isolated room shards.

**Stack:** Client `Vite + TS + Canvas2D` · Server `Node 20 + TS + ws` authoritative 20Hz sim / 15Hz snapshot · Persist `Neon Postgres` (async only) · Stage-1 hosts (all free): GitHub Pages + Render free + Neon free.

## Quickstart (local, 2 terminals — ports 7749 server / 5377 client)

```powershell
# 1) server
cd neon-blob-arena/server
npm install
# set DB (optional — runs with in-memory leaderboard if missing)
$env:DATABASE_URL="postgresql://..."
$env:PORT="7749"
npm run dev

# 2) client
cd ../client
npm install
# 'VITE_SERVER=ws://localhost:7749' in .env (see .env.example), then:
npm run dev -- --port 5377 --strictPort
# open http://localhost:5377/?room=TEST
```

Open 2-3 tabs to play against yourself. Bots backfill when <8 humans.

## Deploy — stage 1, all free ($0, no Cloudflare / paid services)

| Piece | Where | Cost |
|---|---|---|
| Client (static) | GitHub Pages via `.github/workflows/pages.yml` | $0 |
| Server (Node WS) | Render free web service via `render.yaml` blueprint | $0 |
| Database | Neon free (connection verified ✅) | $0 |
| Keep-alive | UptimeRobot free ping `GET /health` every 10 min | $0 |
| Rooms/state | In-process memory (no Redis in stage 1) | $0 |

Steps:
1. `git init && git add -A && git commit -m "blob arena"`, push to GitHub.
2. Render Dashboard -> New -> Blueprint -> pick the repo (`render.yaml` is auto-detected).
3. In the service Environment tab set `DATABASE_URL` (Neon string) and `ORIGIN`
   (your Pages URL, e.g. `https://<you>.github.io/<repo>/`). Redeploy.
4. GitHub repo -> Settings -> Secrets and variables -> Actions -> Variables ->
   add `VITE_SERVER` = `wss://neon-blob-arena.onrender.com` (your Render host with `wss://`).
   Push to `main` — Pages serves the client wired to your server.
5. UptimeRobot -> Add Monitor (HTTP) on `https://<render-host>/health`, 10-min interval
   (free tier sleeps after ~15 min idle; the pinger keeps one game room warm).

Limits of free stage (by design — upgrade only when crowded):
single Render instance (~50–150 CCU comfortably, 25/room), cold start ~30–60s after long idle,
no cross-process rooms yet. Phase 1 when needed: 2+ instances + Upstash Redis free tier
for presence/matchmaking, then Fly.io multi-region (paid).

## How it scales beyond free (Phase 1+)

- 1 process = N rooms. Each room caps 25 humans (+bots to 35). 3–5 rooms fit per core.
- Tick touches RAM only. Neon writes fire-and-forget on death/leave. Redis later for cross-process matchmaking.
- Snapshots culled to viewport (AOI): ~7KB/s/client.
- Deploy: `fly launch` (server, sticky WS, min 2 machines) + static client. Set `VITE_SERVER=wss://<app>.fly.dev` at client build time.

## Production checklist

- [x] Authoritative sim, speed-clamp + rate-limit anti-cheat, origin check
- [x] `/health` `/rooms` `/leaderboard` endpoints
- [x] Neon schema auto-create (`players`, `sessions`), memory fallback
- [x] Bots, requeue, spectate-via-minimap, kill feed, daily best
- [x] Load test: `npm run loadtest -- --clients=50 --secs=15`
- [ ] Binary protocol (now JSON; migrate at >500 CCU/room-host)
- [ ] Redis presence + JWT guest tokens + per-IP token bucket (Phase 1)
- [ ] Sentry + tick histograms + Cloudflare in front (Phase 1)

## Controls

Mouse / WASD / touch-drag to move · Space / ⚡ to dash (2.5s cooldown, costs a little mass).
Eat pellets (+1) and blobs smaller than you ÷ 1.12. Big = strong but slow.
