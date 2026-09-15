# SCORECARD — public agent accountability. Rule 13.
Every user-caught miss gets a strike: what broke, owner, user impact,
remediation + timebox. 3 open strikes on one agent = ship rights suspended
until all theirs close AND they author the regression gate for the class.
Reviewers who wave a miss through share it.

## OPEN
(none — all strikes below are closed with gates in place)

## CLOSED
- [S-001] Desktop landing: dead side gutters + page scroll on load (user
  screenshot, 2026-09-15). Owner: Mira (design) + Devika (UX sign-off miss).
  Shared: Vikram (reviewed without a 1280px check). Impact: first impression
  looked amateur on desktop. Remediation: UX-017 two-column full-bleed card,
  internal-scroll right column, headless 1280x900 screenshot in chat. CLOSED
  with UX-017 shipped + screenshot gate adopted.
- [S-002] PLAY silently dead on sleeping backend (user: "clicked so many
  times", 2026-09-15). Owner: Leo (fire-and-forget connect, whisper-quiet
  failure text). Context: Render free tier naps without UptimeRobot (BE-001,
  user-action, open since 2026-09-14) — backend was freshly booted on probe.
  Impact: game unplayable after idle, zero visible state. Remediation: PLAY
  state machine (Loading / waking-retry x6 / error pill, buttons lock),
  BE-001 re-surfaced to user. CLOSED with state machine + this file.
- [S-003] No browser-boot gate in CI or DoD (process gap behind S-002).
  Owner: Riya (QA) + Kai (integration). Impact: client shipped for weeks with
  builds+tests green but nobody ever booted the page. Remediation: CI
  boot-contract job (play button, bundle present, no localhost WS) + local
  headless-Edge DOM gate (9 markers incl. JS-ran proof). CLOSED with gates
  live; Riya owns the gate receipts from here on.
