# Notes v5 — Chunk 1a pre-flight checklist

Run through this checklist immediately before Chunk 1a executes any DDL.
**All items must be checked. Any failure = STOP.**

Source of authority: `docs/specs/notes-feature-masterplan-v5.md` Amendments D + E +
`docs/safety/PRE-MORTEM-CHECKLIST.md` ("Backup Freshness Gate",
"Expected-Delta Manifest", "Four-Level Verification").

**Scope note:** Chunk 1a is **Tier 3, additive-only**. No data is mutated.
No users are affected. User-comms + snapshot + export gates are deferred to
Chunk 7.5 (the destructive contract). See Amendment E in the masterplan.
A separate `docs/specs/notes-v5-chunk-7-5-preflight.md` will be created when
Chunk 7.5 is planned.

---

## Backup posture

- [ ] PITR confirmed available on `memorium-recovery` via Turso dashboard
- [ ] Earliest restorable timestamp noted: _______________
- [ ] Maximum acceptable loss window: 6 hours (PRE-MORTEM-CHECKLIST gate)

## User communications

**Not required for Chunk 1a.** Additive DDL, no user-visible impact, v4 notes
feature continues working throughout. User comms become required at Chunk 7.5.

## At-risk user snapshot

**Not required for Chunk 1a.** The 2026-05-21 snapshot artifact validates the
script and is held as a development artifact. The canonical restore snapshot
will be re-captured fresh at Chunk 7.5 pre-flight.

## Plain-text export

**Not required for Chunk 1a.** Will be re-run at Chunk 7.5 immediately before
the destructive operation.

## Branch-first prep

- [ ] Turso branch created from `memorium-recovery`: branch name _______________
- [ ] Branch URL noted: _______________
- [ ] Local app pointed at branch (via `.env.local` edit — VS Code, NOT nano)
- [ ] App loads + login works against branch (Two-Clock Rule, user-side check)
- [ ] v4 notes feature works against branch (open a note, edit draft, save, generate) — confirms additive DDL did not break v4 reads

## Expected-delta manifest (locked)

Chunk 1a is additive only. Every existing row count must be UNCHANGED.

| Table | Pre | Post (expected) | Delta |
|---|---|---|---|
| documents (note rows) | 4 | 4 | 0 |
| documents (uploaded rows) | 47 | 47 | 0 |
| questions (all) | ~1422 | UNCHANGED | 0 |
| session_answers (all) | ~821 | UNCHANGED | 0 |
| study_sessions | ~285 | UNCHANGED | 0 |
| users | 33 | 33 | 0 |
| note_blocks (new table) | does not exist | 0 rows | new |
| documents.note_version | column does not exist | column exists, all NULLs default to 0 | new column |
| questions.block_id | column does not exist | column exists, all NULL | new column |
| questions.retired_at | column does not exist | column exists, all NULL | new column |
| questions.retired_reason | column does not exist | column exists, all NULL | new column |

(`~` indicates counts that may shift due to active studying between today and
Chunk 1a execution. The actual pre-flight will capture exact values from
production at that moment; deltas must still be 0.)

## Pre-execution counts (run on the BRANCH)

- [ ] Pre-counts captured for documents (by source_type), questions, session_answers, study_sessions, users
- [ ] Saved to `.migrations/<timestamp>/preflight.json`
- [ ] Confirmed all match the "Pre" column above (with `~` adjusted for current production state)

## Post-execution verification (run on the BRANCH, after DDL)

- [ ] Post-counts captured for the same tables — all deltas = 0
- [ ] `note_blocks` exists with correct schema (`.schema note_blocks`)
- [ ] `documents.note_version` column exists (`PRAGMA table_info(documents);`)
- [ ] `questions.block_id`, `questions.retired_at`, `questions.retired_reason` columns exist (`PRAGMA table_info(questions);`)
- [ ] FK cascade tests from masterplan §3 Chunk 1a passed (3 tests)
- [ ] Saved to `.migrations/<timestamp>/postflight.json`
- [ ] App still loads against the branch; v4 notes feature still works end-to-end (Two-Clock Rule)

## Go / no-go

- [ ] All boxes above checked
- [ ] Operator says GO out loud
- [ ] Chunk 1a may proceed to production promotion

---

## On any failure

STOP. Do not improvise. Do not rewrite a check to make it pass. If something
unexpected appears (a pre-count off by one, a verification SELECT failing,
an additive ALTER failing on the branch), the right action is to surface it
to the operator and re-run pre-flight cleanly.

Pattern from `LEARNINGS-FROM-INCIDENT-APR27.md`: a failed pre-flight is the
cheapest place to stop. A failed post-flight is the most expensive.
