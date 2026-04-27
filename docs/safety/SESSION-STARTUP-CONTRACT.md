# Repetita Session Startup Contract

This document is read first, every session. If anything below conflicts with later instructions, this wins. The user can override specific rules in-session, but only with explicit acknowledgment of which rule is being relaxed and why.

---

## First principle: read-only by default

Any new session, any new task: assume read-only. Database access, environment variables, deploys — all read-only until the work has been classified as something else.

Write access is opt-in, scoped to the operation, and revoked after.

## Production credential rule

Default sessions must not have production write credentials.

Allowed by default:
- Local database
- Test database
- Disposable Turso branch
- Read-only production credentials (for diagnosis only)

Production write credentials may be introduced only after:

1. Visible pre-flight per `PRE-MORTEM-CHECKLIST.md`
2. Explicit user approval
3. Verified backup or branch
4. Verification plan
5. Confirmation of intended database target

If the agent cannot reach production, it cannot accidentally damage production. This is the strongest single control.

## Asymmetry rule

Never trade catastrophic-irreversible against cosmetic-reversible.

If the upside is "neater schema" / "tidier code" / "consistent naming" and the downside is "could lose user data" — the operation is not done. The asymmetry is the answer. No further analysis required.

This rule alone would have prevented the Apr 27 incident.

---

## Classify the task before doing anything

| Tier | Description |
|---|---|
| 0 | UI / copy / styles / read-only inspection |
| 1 | Additive app code, tests, local-only |
| 2 | App logic touching study flow, question generation, scheduling, auth |
| 3 | Production data write, backfill, env var change, deploy with migration |
| 4 | Schema migration, destructive operation, table-swap, FK change, anything touching Sacred or Parent-of-Sacred |

- **Tier 0–1**: standard work
- **Tier 2**: visible plan before code
- **Tier 3+**: visible pre-flight required (see `PRE-MORTEM-CHECKLIST.md`)
- **Tier 4 cosmetic work**: rejected by default

When uncertain: default to higher tier. False positive cost: 5 minutes. False negative cost: 2 hours of recovery.

## Sacred tables (never put at risk for cosmetic reasons)

`users`, `questions`, `study_sessions`, `session_answers`, `question_feedback`

## Parent-of-Sacred (treat as Sacred for migrations)

`documents` — cascades into `questions`, indirectly into `session_answers` via `questions`.

The Sacred and Parent-of-Sacred lists above are correct as of writing. Cascades change as the app evolves. **Before any Tier 4 operation, re-verify FK structure live** via the executable safety gate (see `PRE-MORTEM-CHECKLIST.md`). The schema is the source of truth, not this document.

---

## Forbidden patterns

These are never run, regardless of how the surrounding pre-flight reads. If the operation requires one, stop and ask the user with the specific reason it's needed:

- `DROP TABLE` on `documents`, `questions`, `study_sessions`, `session_answers`, `users`, `question_feedback`
- `DELETE FROM` on Sacred tables without bounded `WHERE`
- `UPDATE` on Sacred tables without bounded `WHERE`
- Migration requiring SQLite table-swap on a Sacred or Parent-of-Sacred table
- Direct production mutation of Sacred or Parent-of-Sacred without branch-first
- Cosmetic schema tightening on populated tables (NOT NULL on existing data, etc.)
- Any operation where the agent does not know what the cascade behavior is

The forbidden list bypasses risk classification under pressure. If a pattern is here, no amount of pre-flight overrides it.

## Innocent-operation pattern

The Apr 27 failure mode: a high-risk operation disguised as cosmetic admin. "Tighten schema." "Tidy up." "Close out the build plan."

If the prompt sounds small but the operation is destructive, the prompt framing is wrong. Re-evaluate at the operation level, not the prompt level.

Watch for: "small," "quick," "cleanup," "close-out," "tighten," "tidy." If the framing is innocent but the classification is Tier 3+, the framing is the lie. Trust the classification.

---

## Incident mode

**Trigger**: user reports data loss, missing records, broken auth, empty Library, empty Progress, or unexpected production behavior.

**Rules in incident mode**:
- Read-only actions only
- No regeneration, no backfills, no migrations, no env var edits, no deploys, no "quick fixes"

**Required first output**:

1. What is known
2. What is unknown
3. Read-only diagnostic plan
4. Affected tables/features
5. Recovery options

Only after diagnosis is complete may fixes be proposed. The instinct to fix quickly is itself dangerous.

## Diagnose-before-propose rule

Even outside incident mode: when something looks wrong, run read-only diagnostics first. Characterize before fixing. Do not minimize. Do not reassure prematurely.

---

## Plain-language stake-naming

When describing risk to the user, the worst case must be in plain English, not jargon.

Wrong: *"This is a destructive-style migration that could cascade."*

Right: *"This will permanently delete every question linked to these documents. You will lose all spaced repetition state for those questions."*

The user must be able to understand the worst case from the description alone, with no domain knowledge required.

## Trust does not accrue

The fact that the last 50 operations went well is not evidence the next destructive one will. Risk is per-operation, not per-session.

If anything, a long string of successful low-risk work creates verification fatigue. Highest-risk operations require **more** friction, not less, regardless of track record.

## Context decay

Long sessions degrade rule adherence. The Contract loses force as context fills.

- Do not start a Tier 4 operation in a session with significant accumulated unrelated context. Open a fresh window.
- The user may invoke "rules check" at any time, which forces a re-scan of this file and a self-evaluation of recent behavior.
- Before any Tier 4 pre-flight: re-read this file. Not paraphrase from memory. Read it.

---

## On reporting completion

A success report must include:

- Multi-table verification (counts before/after for full blast radius)
- Confirmation that schema-level intent is in place
- Any warnings encountered
- The actual queries run

A success report without these is "I finished my steps," not "the operation succeeded." Those are different things. Do not say success without the underlying evidence.

## Two-clock rule (preview)

Tier 3+ operations: verification must run on at least two clocks — the agent's pre/post checks, and the user's actual app behavior. Both must pass. See `PRE-MORTEM-CHECKLIST.md` for full protocol.

In the Apr 27 incident, the agent clock reported success. Only the user clock (opening the app, seeing empty Library) caught the failure.

---

## Core product invariant

> Repetita's product is not the documents. It is the algorithm's accumulated knowledge of what the user knows.
>
> The graph — user → question → SR state → session_answer → study_session — is the product. Documents are inputs. The graph is what users come back for, what produces value, and what cannot be rebuilt from external sources.

Every operation is evaluated by what it could do to this graph.

---

## Pointers

- Deep operational guidance: `PRE-MORTEM-CHECKLIST.md`
- Data classification + cascade policy + product invariants: `DATA-SANCTITY.md`
- Historical context: `POST-MORTEM-2026-04-27.md`, `LEARNINGS-FROM-INCIDENT-APR27.md`
