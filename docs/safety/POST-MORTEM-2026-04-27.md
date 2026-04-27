# Post-Mortem: Questions Table Wipe Incident

**Date:** 27 April 2026
**Severity:** High — full data loss in one production table, near-loss of all spaced repetition state across all users
**Outcome:** Full recovery via Turso point-in-time branch
**Time to detection:** ~90 minutes (user observed Library/Progress empty)
**Time to recovery:** ~2 hours from detection to fully restored production
**Permanent data loss:** ~3 hand-corrected descriptions, 1–2 study sessions completed in the recovery window

---

## Summary

A schema-tightening migration (`migrate-tighten-description-topic.js`) intended to add `NOT NULL` constraints to two columns on the `documents` table used SQLite's table-swap pattern (create new table, copy rows, drop old, rename). The DROP statement triggered `ON DELETE CASCADE` on the foreign key from `questions.document_id` to `documents.id`, deleting all 790 questions and 746 `session_answer` records as a silent side effect.

The migration's verification step checked only `documents` row count (22 preserved, correct) and reported success. The cascade damage was invisible to the verification.

The user discovered the loss when opening the app and finding Library and Progress empty.

---

## Sequence of events

| Time (BST) | Event |
|---|---|
| ~07:40 | Approximate timestamp of recovery snapshot used later (6 hours pre-incident) |
| ~08:43 | Prompt 6 sent to Claude Code: "Tighten the documents table schema: make description and topic NOT NULL" |
| 08:45:13 | Migration committed as `b97a28c` and presumably executed |
| ~08:46 | Claude Code reports: "22 rows preserved, column order intact." Migration declared successful |
| ~10:07 | User opens app, sees Home page streak (working) but Library and Progress empty |
| ~10:09 | User reports incident in chat |
| ~10:10–10:25 | Diagnostic queries confirm 22 documents intact, 0 questions, 0 session_answers |
| ~10:30 | Recovery option identified: Turso "Create From Point-in-Time" via dashboard |
| ~10:35 | Branch `memorium-recovery` created from ~6 hours pre-incident snapshot |
| ~10:40 | Branch verified: 23 documents, 790 questions, 191 study sessions, 746 session_answers |
| ~10:45 | Local `.env.local` updated to point at recovery branch. Brief Clerk env var corruption from editing, fixed |
| ~11:00 | Local app verified working against recovery branch |
| ~11:15 | Backfill re-run on recovery branch: 22 docs successfully classified |
| ~11:25 | Vercel env vars updated, redeploy triggered |
| ~11:30 | Production verified working on recovery branch. Incident closed |

---

## Root causes

Three causes, in order of upstream-to-downstream:

### 1. Cosmetic migration treated as low-risk close-out

Prompt 6 existed because the original 6-prompt build plan listed schema tightening as a "close-out step." The plan was treated as authoritative without re-evaluating whether the operation was worth any risk. The columns being nullable affected nothing functionally — making them `NOT NULL` was zero-value defensive programming. The build plan's framing leaked into the assistant's risk assessment of the operation itself.

### 2. The migration script did not handle foreign key cascades

The script implementing the SQLite table-swap pattern did not:
- Identify which tables had foreign keys pointing to `documents`
- Disable foreign key enforcement during the swap (`PRAGMA foreign_keys = OFF`)
- Back up the `questions` and `session_answers` tables to temp tables before the DROP

A pre-existing project decision (V2 handoff #19) explicitly noted: *"Turso doesn't support `PRAGMA foreign_keys = OFF` over remote connections — use Turso shell for FK-sensitive migrations."* This was visible in the project files at conversation start. It was not surfaced when the migration was being designed.

### 3. The verification step was insufficient

The script verified row count on `documents` only. It did not check `questions.count()` or `session_answers.count()` before and after. A two-line addition to the safety check would have caught the cascade immediately and triggered a rollback. The "22 rows preserved" success message was technically correct and operationally useless.

---

## Blast radius (visualized)

```
documents.id (the table being dropped)
  └── questions.document_id  ON DELETE CASCADE  ← all 790 rows deleted
        └── session_answers.question_id  ON DELETE CASCADE  ← all 746 rows deleted
              (transitively affected)
```

**Tables NOT affected:**
- `users` (no FK from documents)
- `study_sessions` (FK to users, not documents)
- `question_feedback` (FK to questions; row count was zero, but the FK structure means it would have been emptied if it had contained rows — see DATA-SANCTITY.md "Empty today does not mean irrelevant tomorrow")

---

## What verification ran vs what should have run

### What ran (declared success)

```sql
SELECT COUNT(*) FROM documents;
-- returned 22, interpreted as success
```

### What should have run

```sql
SELECT COUNT(*) FROM documents;
SELECT COUNT(*) FROM questions;
SELECT COUNT(*) FROM session_answers;
SELECT COUNT(*) FROM study_sessions;
SELECT COUNT(*) FROM question_feedback;
```

The 4-line addition would have caught the failure immediately. The cost of writing it was zero. The cost of not writing it was 2 hours of recovery and the user's trust.

---

## What worked

- **Turso point-in-time recovery on free tier**: a 6-hour pre-incident snapshot was available via the dashboard "Create From Point-in-Time" feature. Without this, recovery would have required regenerating all 790 questions via the Claude API at ~$12 cost and complete loss of SR state.
- **User caught the issue within 90 minutes**: Home page streak still rendered (`study_sessions` table unaffected), which made the empty Library/Progress views feel anomalous rather than expected.
- **Diagnostic-before-action discipline**: 7 SELECT queries to characterize the damage before any recovery action prevented further data loss from a panicked fix.
- **Branch-based recovery rather than overwrite**: creating `memorium-recovery` left the broken `memorium` database intact as a forensic record and provided a rollback path if the recovery itself went wrong.

---

## What didn't work

- **The "small, low-risk" framing on Prompt 6**: This was the highest-risk operation in the entire build, framed as a tidy-up.
- **Verification scope on destructive migrations**: The verification covered the table being modified but not its dependents. This is the failure that allowed the incident to be reported as a success.
- **The pre-existing FK warning was inert**: Decision #19 in the V2 handoff documented exactly this risk. It was visible but not active — no checklist made anyone consult it before writing the migration.
- **Plain-language risk communication**: The pre-flight description of Prompt 6 used phrases like "destructive-style migration (table swap)." That's accurate and means nothing to a non-DBA. It should have said: *"This migration drops and recreates the documents table. Every question linked to those documents will be permanently deleted as a side effect. You will lose all spaced repetition state."*

---

## Permanent data loss

- ~3 hand-corrected descriptions made before the recovery snapshot — reverted by the post-recovery backfill, since the backfill regenerates descriptions for any doc with NULL values, and the snapshot pre-dated the manual corrections.
- 1–2 study sessions completed between snapshot time (~07:40) and migration time (~08:45). User confirmed minimal.

---

## Cost of incident

- ~$0.34 in Anthropic API to re-run backfill on recovery branch
- ~2 hours of recovery work
- 1–2 hours of trust degradation between user and assistant — addressed via this post-mortem and the rules going forward

---

## Specific failures

Named without blame attribution per the user's instruction. These are actions and omissions, not character judgments.

**Assistant (Claude in chat):**
- Wrote Prompt 6 without consulting V2 handoff decision #19 (the FK warning).
- Framed Prompt 6 as a low-risk close-out in the conversation. Specifically used the words "small, low-risk" in the lead-up.
- Specified verification logic that only covered the modified table, not its FK dependents.
- Did not require a backup-to-temp-table step in the migration script.
- Used engineer-speak ("could cascade," "destructive-style migration") rather than plain-language stakes.

**Claude Code (executing the migration):**
- Wrote a migration script that dropped a parent table without first disabling foreign keys or backing up child tables.
- Reported migration success based on a verification step that did not cover cascade-affected tables.

**System-level (the build process):**
- The original 6-prompt plan included a cosmetic close-out that didn't justify its risk profile. The plan was followed without challenge.
- No standing pre-flight checklist for migrations existed at the start of the work.
- The V2 handoff's FK warning was a passive document, not an active checklist item.

---

## What would have prevented this

This incident would have been prevented by ANY of these single interventions:

1. Not doing a cosmetic destructive migration in the first place (highest leverage)
2. Detecting table-swap as a Tier 4 stop condition
3. Checking incoming FKs before the DROP
4. Backing up `questions` and `session_answers` to temp tables before the DROP
5. Running on a Turso branch first
6. Multi-table verification before declaring success
7. Visible pre-flight to the user with worst-case named in plain English

**Defense in depth: any one of these breaks the failure chain.** We had zero of them active. Going forward, we want at least three.

The new `SESSION-STARTUP-CONTRACT.md` and `PRE-MORTEM-CHECKLIST.md` together provide all seven, plus mechanical controls (Sacred Data Collapse Monitor, executable safety gate, verification artifacts) that don't depend on the agent remembering them.

---

## Near-miss severity

**Very high.**

Without Turso point-in-time recovery on free tier, this incident would have caused permanent loss of:
- All spaced repetition state for all users
- All `session_answer` history
- 16-day study streak rendered meaningless (counter survives, but the underlying data it represents is gone)

**Estimated cost in alternate-timeline-without-PITR:**
- ~$12 in API to regenerate 790 questions
- Total loss of SR scheduling state (every question reset to interval=1)
- Total loss of `question_feedback` data
- All users restart their learning from zero
- Hard product reset

Recovery worked because of one feature on one platform's free tier. **That should not be the only line of defense.** The mechanical controls specified in `PRE-MORTEM-CHECKLIST.md` exist to make sure it isn't.
