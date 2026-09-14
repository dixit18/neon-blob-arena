# HANDOFF — crash-proof session state. Any agent (or human) resumes from here.

If this session died, read in this order: `HANDOFF.md` → `AGENT_CHAT.md` (tail)
→ `ORG.md` rules → `QA.md` gate. Then continue from "Next up" below.

## Where we are (update every work unit)
- Shipped: v1.0 full-3D arena + orb combat + hunters (commit `be2be05`).
- Soak-verified: fire-spam loadtest (`--fire=0.3`, 30 clients) → 30/30, 14.1 snaps/s,
  orbSnaps=3407, tickAvgMs 0.13 / tickMaxMs 1.5. Orb path holds under load.
- Tree state: CLEAN (everything committed). Verify with `git status --short` (must be empty).
- Prod: client auto-deploys from main; server on Render; user runs local via `.\start-local.ps1 -Restart`.
- Ports: server 7749, client 5377. Never 3000/8080/8081. Probes use :7751+.

## Active work
- None. Pick from "Next up".

## Next up (priority order)
1. Manual 2-tab checklist per `QA.md`: eat/dash/fire/death→spectate, hunter feed
   sighting, 360px portrait targets.
2. Binary snapshots (DataView) — profile JSON bytes first, only if >12KB signal.
3. Playtest: 3 friends + `?room=` link, collect PMF numbers (`/stats`).

## Session-survival protocol (Rule 9, mandatory)
1. BEFORE coding: update "Active work" here with goal + files you will touch.
2. DURING: keep changes small; `tsc`/build after each file-level change.
3. AFTER each work unit: update "Where we are" + "Next up", append `AGENT_CHAT.md`,
   commit (WIP prefix if unverified: `WIP: <what + what's left>`).
4. NEVER end a turn with uncommitted code. A dead session must leave a clean tree
   or a WIP commit — never mystery diffs.
5. Verification receipts live in `AGENT_CHAT.md` (numbers, not vibes): build
   output, loadtest lines, bundle sizes.
6. One background-proc law: the runner reaps background jobs between steps, so
   verify servers/loadtests inside ONE shell step only (start → probe → kill).

## How to resume (new session checklist)
- [ ] `git log --oneline -5` — is HEAD where HANDOFF says?
- [ ] `git status --short` — empty? If not, last session died dirty: inspect diff first.
- [ ] Read `AGENT_CHAT.md` tail for the latest receipts + blockers.
- [ ] Run green checks: `npm run build` in `server/` and `client/`.
- [ ] Set "Active work" here, then code.
