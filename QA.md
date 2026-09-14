# QA Bible — owned by Riya "Breaker" Sharma. Nothing ships while red.

## Lag budgets (numbers, not feelings)

| Signal | Where to read | Green | Red (block release) |
|---|---|---|---|
| Sim tick avg | `GET /health` → `tickAvgMs` | < 5ms | > 12ms sustained |
| Sim tick max | `GET /health` → `tickMaxMs` | < 50ms | > 100ms (hitch = teleport) |
| Client fps | HUD `#me` → `60fps` | ≥ 55 | < 45 on target hw |
| Snapshot bytes | DevTools → WS frames | ≤ 12KB | > 20KB (backpressure kicks) |
| Feel (input→move) | play it | < 150ms | visible rubber-band |

Slow-tick server log (`[tick] slow XXms`) is an automatic investigate.

## Lag triage runbook (in order — stop at first red)

1. **HUD fps < 50?** Client-side. Open DevTools Performance 5s: look for long `drawImage`/layout. Suspects: DPR>1.5, minimap/DOM churn (see throttles in `main.ts`), background tabs.
2. **Rubber-banding but fps 60?** Prediction mismatch. Check reconcile: big frequent hard-snaps (>220px) mean server/client steering diverged — see prediction block in `main.ts` (must mirror `handleInput` in `game.ts`).
3. **Everyone freezes together?** Server. Check `/health` `tickAvgMs` + server log slow-tick lines. Suspects: room entity count, pellet brute force, JSON stringify fan-out.
4. **One player lags, rest fine?** Their network (bufferedAmount skips in `index.ts` will show as dropped frames — by design, sim never waits).
5. **Local dev feels slow but prod fine?** Vite dev is unminified + sourcemaps. Verify with `npm run build && npx vite preview --port 5377` before filing.

## Device matrix (per release)

- Desktop Chrome (target: 60fps, 25/room stress via `npm run loadtest -- --clients=50`)
- Android Chrome mid-tier (target: ≥50fps, DPR capped, minimap throttled)
- Small phone 360px wide (HUD readable, 46px+ targets, no overlap)

## Regression checklist (every version)

- [ ] Boot with + without `DATABASE_URL` (memory fallback works, `/leaderboard` 200)
- [ ] 2 tabs same room: movement, dash, eat, death→spectate→respawn, taunts appear
- [ ] Round rolls at 0:00 → crown banner, masses compress, dead revive
- [ ] First-timer tutorial toasts fire once; level-up toast at Chonk
- [ ] 30-client loadtest: ≥28/30 connected, ≥12 snaps/s/client
- [ ] Fire-spam soak (`--fire=0.3`): orbSnaps > 0, tickAvgMs < 5 after load
- [ ] `npm test` (combat suite) green in `neon-blob-arena/server`
- [ ] Deploy repro on Dockerfile/dependency change: clean-room `npm ci` → `tsc` → boot → `/health`
- [ ] CI workflow green (build + test + soak jobs)
- [ ] Client feel: HUD `fps/p95ms` — p95 ≤ 20ms desktop, ≤ 25ms mid-tier phone
- [ ] No console errors; no secret in logs/git (`git log -p | grep -i token` empty)

## Filing a bug (paste into AGENT_CHAT.md)

`[QA-BLOCKER|QA-WARN] what / where (URL+room) / numbers (tick/fps/bytes) / repro steps / expected`
Blockers stop the release. Warns go to next loop.
