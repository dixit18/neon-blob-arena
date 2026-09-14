# HANDOFF — crash-proof session state. Any agent (or human) resumes from here.

If this session died, read in this order: `HANDOFF.md` → `AGENT_CHAT.md` (tail)
→ `ORG.md` rules → `QA.md` gate. Then continue from "Next up" below.

## Where we are (update every work unit)
- Shipped: v2 MOCHI PANIC (`13bbd68`) — light candy-pop full re-theme (landing+HUD+3D),
  feel fixes (damped reconcile, 2Hz DOM, loop guards, smooth shake, DPR governor),
  memory pass (pools, zero per-frame alloc, name-texture ownership).
- Probe hooks live: HUD shows `fps/p95ms`, `longtask` counter in client, DPR governor
  steps 1.5→1.25→1.0 on p95>22ms. USER: play 30s and report `fps/p95` from HUD.
- Verified: client build green (initial 20.42KB/8.9KB gzip), landing serves 200 with
  all new IDs, combat 23/23 PASS, soak 30/30 @14.2 snaps/s tickAvg 0.3/max 2.3.
- Deploy fix: Render docker build failed on floating latest-TS (5.9.3 narrowed a
  literal dev-TS 5.5 accepted in combat.test.ts) + unpinned deps. Fixed test to be
  narrowing-proof, Dockerfile now `npm ci` from lockfile (pinned, devDeps for
  compile, prune after). Proven: pinned install → tsc 0 → prune → boot → /health ok.
  ALSO verified fixed test compiles under floating 5.9.3 (belt + suspenders).
- Tree state: CLEAN, in sync with `origin/main`. Verify with `git status -sb`.
- Prod: client auto-deploys from main; server on Render; user runs local via `.\start-local.ps1 -Restart`.
- Ports: server 7749, client 5377. Never 3000/8080/8081. Probes use :7751+.

## Active work
- None. Pick from "Next up".

## Next up (priority order)
1. USER FEEL CHECK: hard-refresh, report HUD `fps/p95` + whether jitter/double-render is gone.
2. Manual 2-tab checklist per `QA.md` (eat/dash/fire/death→spectate, hunter sighting, 360px).
3. Playtest: 3 friends + `?room=` link, PMF numbers (`/stats`).

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
