# QA Bible — owned by Riya "Breaker" Sharma. Nothing ships while red.

## Lag budgets (numbers, not feelings)

| Signal | Where to read | Green | Red (block release) |
|---|---|---|---|
| Sim tick avg | `GET /health` → `tickAvgMs` | < 5ms | > 12ms sustained |
| Sim tick max | `GET /health` → `tickMaxMs` | < 50ms | > 100ms (hitch = teleport) |
| Client fps | HUD `#me` → `60fps` | ≥ 55 | < 45 on target hw |
| Snapshot bytes | DevTools → WS frames | ≤ 12KB | > 20KB (backpressure kicks) |
| Feel (input→move) | play it | < 150ms | visible rubber-band |

### Per-game snapshot budgets (GB-3 sweep, CI-enforced in each game's suite)

| Game | Cap | Why |
|---|---|---|
| reflex-riot | 700B | task card + pads, tiny by design |
| blaze-squad | 1.5KB | 12 blobs + zone + loot |
| nitro-rift | 1.5KB | 8 racers + pads + lap |
| totem-panic | 1.5KB | 10 hands + 10-block tower (Sprint 7 DoD) |
| ludo-clash | 2KB | 4 seats × tokens + options |
| read-the-room | 2KB | 15 ballots + tally |
| ghostline | 2KB | course + 8 dots + leaders |
| signal-seven | 2KB | 7 clues + pip rows + leaders |
| ricochet-siege | 2KB | 8 hulls + capped tracers + locks |
| doodle-duel | 4KB | packed strokes ARE the game (16×32 base-36 ≈ 2.3KB worst + envelope); stride-downsampled, never raw |

E2E wire p95 checks mirror these caps (riot 700B; room/ludo/ghost/signal/totem/siege at their caps).

Slow-tick server log (`[tick] slow XXms`) is an automatic investigate.

## Lag triage runbook (in order — stop at first red)

1. **HUD fps < 50?** Client-side. Open DevTools Performance 5s: look for long `drawImage`/layout. Suspects: DPR>1.5, minimap/DOM churn (see throttles in `main.ts`), background tabs.
2. **Rubber-banding but fps 60?** Prediction mismatch. Check reconcile: big frequent hard-snaps (>220px) mean server/client steering diverged — see prediction block in `main.ts` (must mirror `handleInput` in `game.ts`).
3. **Everyone freezes together?** Server. Check `/health` `tickAvgMs` + server log slow-tick lines. Suspects: room entity count, pellet brute force, JSON stringify fan-out.
4. **One player lags, rest fine?** Their network (bufferedAmount skips in `index.ts` will show as dropped frames — by design, sim never waits).
5. **Local dev feels slow but prod fine?** Vite dev is unminified + sourcemaps. Verify with `npm run build && npx vite preview --port 5377` before filing.

## Device matrix (per release)

- Desktop Edge/Chrome (target: 60fps): `npx tsx scripts/browser-check.ts`
  must print BROWSER GREEN — 6/6 landing DOM markers, 3/3 room markers,
  non-blank paint at 1280×900 + 360×640. Headless runs isolated profiles,
  never the owner's live browser.
- Firefox (target: boot + non-blank paint both pages): same script, paint
  checks (FF headless has no dump-dom; DOM proof rides on Edge + shared code).
- Safari (no local binary): covered by runtime gates, not runs — every
  session beacons caps+fps to /perf, so Safari numbers arrive from real
  devices. Code rules that keep Safari safe: dynamic-import CDN with 2D
  fallback, `typeof WebAssembly` guard, no Chrome-only APIs (longtask etc.
  behind feature checks), guarded deviceMemory/requestIdleCallback.
- Small phone 360px wide (HUD readable, 46px+ targets, no overlap).
- Live evidence: `GET /perf` aggregates per-game avgFps/avgP95 + mode and
  browser splits. Red lines: avgFps < 45 or avgP95 > 25ms on any game with
  ≥20 samples → investigate before next ship.

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
- [ ] `/perf` telemetry flowing from real sessions (D3 evidence, not lab numbers)
- [ ] No console errors; no secret in logs/git (`git log -p | grep -i token` empty)

## Filing a bug (paste into AGENT_CHAT.md)

`[QA-BLOCKER|QA-WARN] what / where (URL+room) / numbers (tick/fps/bytes) / repro steps / expected`
Blockers stop the release. Warns go to next loop.

