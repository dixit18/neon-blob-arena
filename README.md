# Playground — the URL you send when the group chat says "what should we do?"

Browser-only instant multiplayer rooms. Open a link → guest identity → playing
in seconds. No signup, no download. Every game ships a shareable artefact, not
a share button. North star: **WAPS** (rooms where ≥3 humans arrive in 120s and
≥1 round finishes).

## Repo map (D12 pivot — legacy arena game deleted, history in git)
- `apps/web/` — Vite shell: HTML-first landing, mood portals, catalog, room entry
- `apps/server/` — Node 24 + ws authoritative rooms (Docker: `apps/server/Dockerfile`)
- `packages/protocol/` — versioned wire contract (change needs contract tests)
- `packages/room/` — registry, lifecycle, 60s reconnect grace, 90s empty-GC, plugin seam
- `packages/identity/` — opaque guest IDs, generated names, name filter
- `packages/catalog/` — 6 manifests (verb/moods/players/shareKind/botPolicy)
- `packages/bots/` — labelled bots + backfill controller
- `packages/share/` — ShareArtifact contract + deep-link helpers
- `packages/analytics/` — event vocabulary + lossy buffered writer
- `games/` — game plugins (Reflex Riot first, Sprint 3)
- Studio docs: `ORG.md` (agents) · `AGENT_CHAT.md` (live log) · `DECISIONS.md` (D-gates)
  `SPRINTS.md` (backlog) · `TICKETS.md` (board) · `HANDOFF.md` (resume) · `QA.md` (gates)

## Local quickstart (ports 7749 + 5377 — never 3000/8080/8081)
```powershell
npm install
npm test                    # all unit + integration suites
.\start-local.ps1           # server :7749 + web :5377
# open http://localhost:5377/ — pick a mood, tap PLAY
```

## Production rules (do not break)
1. Server authoritative — intent in, truth out. No client position/hit claims.
2. Effect at ingress/egress/boot only — never inside `step()`.
3. No idle second: every tap paints same-tick; every screen shows action or progress.
4. Bots labelled + imperfect. Names generated/filtered. No open chat/UGC at launch.
5. Budgets: HTML shell ≤60KB Brotli; direct game links load 0 bytes of world bundle.
6. No agent alters `packages/protocol/` without contract tests. No silent fixes.

## Free deploy (stage 1, $0)
Pages (web) + Render free (server, `render.yaml`) + UptimeRobot ping on `/health`.
Node 24 pinned in CI + Docker (report gate — Node 20 is EOL).
