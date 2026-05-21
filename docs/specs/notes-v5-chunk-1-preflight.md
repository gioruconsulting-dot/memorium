# Notes v5 — Chunk 1 pre-flight checklist

Run through this checklist immediately before Chunk 1 executes any DDL.
**All items must be checked. Any failure = STOP.**

Source of authority: `docs/specs/notes-feature-masterplan-v5.md` Amendment D +
`docs/safety/PRE-MORTEM-CHECKLIST.md` ("Backup Freshness Gate",
"Expected-Delta Manifest", "Four-Level Verification").

---

## Backup posture

- [ ] PITR confirmed available on `memorium-recovery` via Turso dashboard
- [ ] Earliest restorable timestamp noted: _______________
- [ ] Maximum acceptable loss window: 6 hours (PRE-MORTEM-CHECKLIST gate)

## User communications

- [ ] Heads-up message sent to `user_3DXRFF0vJ83ZIQy2UiZsZHoYLRY` (at-risk user)
- [ ] Heads-up message sent to `user_3Ba5kqiLR8PNTCmPaDoaMLsoIMY`
- [ ] Heads-up message sent to `user_3DcjFr50Zvg0wMQ0RzjMGUGi15i`

## At-risk user snapshot

- [ ] `scripts/notes-v5-snapshot-at-risk-user.mjs` executed
- [ ] JSON snapshot written to disk at: _______________
- [ ] Validation passed (record counts match, sample rows verified — script exits 0)
- [ ] Copy made to second durable location (iCloud / Dropbox / etc.): _______________
- [ ] Operator confirms aloud: snapshot is safe and recoverable

## Other 2 users — plain-text export

- [ ] `scripts/notes-v5-plain-text-export.mjs` executed
- [ ] Files reviewed manually: _______________
- [ ] Email sent to `user_3Ba5kqiLR8PNTCmPaDoaMLsoIMY` with their notes
- [ ] Email sent to `user_3DcjFr50Zvg0wMQ0RzjMGUGi15i` with their notes

## Branch-first prep

- [ ] Turso branch created from `memorium-recovery`: branch name _______________
- [ ] Branch URL noted: _______________
- [ ] Local app pointed at branch (via `.env.local` edit — VS Code, NOT nano)
- [ ] App loads + login works against branch (Two-Clock Rule, user-side check)

## Expected-delta manifest (locked)

| Table | Pre | Post | Delta |
|---|---|---|---|
| `documents` (note rows) | 4 | 0 | −4 |
| `documents` (uploaded rows) | 47 | 47 | 0 |
| `questions` (note-linked) | 48 | 0 | −48 |
| `questions` (uploaded-linked) | 1366 | 1366 | 0 |
| `session_answers` (note-linked) | 10 | 0 | −10 |
| `session_answers` (uploaded-linked) | 806 | 806 | 0 |
| `question_feedback` (note-linked) | 0 | 0 | 0 |
| `study_sessions` | 284 | 284 | 0 |
| `users` | 33 | 33 | 0 |

## Pre-execution counts (run on the BRANCH)

- [ ] Pre-counts captured and match the "Pre" column above, exactly
- [ ] Saved to `.migrations/<timestamp>/preflight.json`

## Go / no-go

- [ ] All boxes above checked
- [ ] Operator says GO out loud
- [ ] Chunk 1 may proceed

---

## On any failure

STOP. Do not improvise. Do not rewrite a check to make it pass. If something
unexpected appears (a pre-count off by one, a missing email, a snapshot
validation failure), the right action is to surface it to the operator and
re-run pre-flight cleanly.

Pattern from `LEARNINGS-FROM-INCIDENT-APR27.md`: the recovery operation is
itself Tier 4. A failed pre-flight is the cheapest place to stop. A failed
post-flight is the most expensive.
