# Data Sanctity Map

> **Core product invariant**
>
> Repetita's product is not the documents. It is the algorithm's accumulated knowledge of what the user knows.
>
> The graph — user → question → SR state → session_answer → study_session — is the product. Documents are inputs to the graph. The graph is what users come back for, what produces value, and what cannot be rebuilt from external sources.
>
> Every operation should be evaluated by what it could do to this graph.

---

## Sacred tables

| Table | Why sacred |
|---|---|
| `users` | Account identity, OAuth links |
| `questions` | Question identity + SR state. Text is regeneratable; identity and history are not |
| `study_sessions` | Every session the user has completed |
| `session_answers` | Links every grade to a specific question. Cannot be reconstructed |
| `question_feedback` | User-flagged bad questions. Reflects user judgment, not regeneratable |

## Parent-of-Sacred tables

Treat as Sacred for migration purposes — operations on them can cascade into Sacred data.

| Table | Cascades into |
|---|---|
| `documents` | `questions` (`ON DELETE CASCADE`), and indirectly `session_answers` via `questions` |

---

## Schema freshness

This map is accurate as of writing. FK relationships and cascade behavior change as the app evolves.

**Before any Tier 4 operation, the agent must re-verify the current cascade structure live.** Do not trust this document for blast-radius calculations on a specific operation. Use the executable safety gate (see `PRE-MORTEM-CHECKLIST.md` → "Executable Safety Gate") to inspect actual schema. Until that tooling is built, run equivalent inspection queries (`PRAGMA foreign_key_list(<table>)`) and assemble the equivalent output.

This document is the policy reference. The schema itself is the source of truth on what cascades into what right now.

---

## On `questions`: identity vs text

Question text is regeneratable from `documents.content` (~$0.015 per document, a few seconds). **Question identity is not.**

`session_answers` points to specific question IDs. Spaced repetition state is per-question. Streaks, mastery, history — all anchor on question rows. Regenerating questions creates new rows with new IDs. The old `session_answers` become orphaned. The user's learning resets.

**Therefore: `questions` is Sacred as a database entity, even though its text content can be reproduced. Regeneration is a disaster-recovery fallback, not a valid rollback strategy.**

This generalizes: "the data could be recreated" is never sufficient rationalization for risk to the graph. Graph relationships matter, not the contents of any single field.

---

## Regeneratable fields (only without changing row identity)

| Field | Cost to regenerate |
|---|---|
| `documents.description` | ~$0.015 per doc, 5 seconds |
| `documents.topic` | Same call as description |
| `questions.question_text`, `.answer_text`, `.explanation` | ~$0.015 per doc, **but breaks SR continuity if question IDs change** |

---

## Cosmetic items — never risk Sacred data for these

- `NOT NULL` tightening on populated tables
- Column reordering
- Constraint neatness
- Index cleanup unless performance-critical
- Naming cleanup
- Schema "elegance"

If the upside of the operation is in this list and the downside touches Sacred data, the operation is not done. See `SESSION-STARTUP-CONTRACT.md` → "Asymmetry rule."

---

## Cascade policy

Sacred data must not be deleted as a side effect of deleting or rewriting parent content.

**Default policy:**
- Parent-of-Sacred → Sacred foreign keys should use `RESTRICT` / `NO ACTION` unless there is a deliberate, documented product reason for cascade
- Prefer soft delete (`deleted_at` column) / archive over hard delete for parent tables
- Cascading deletion of learning history requires explicit product-level confirmation, not incidental database behavior

`ON DELETE CASCADE` is convenient for cleanup but dangerous for user learning state. The Apr 27 incident was caused by a cascade firing during a schema migration that had nothing to do with deleting documents. The cascade was always loaded; the migration pulled the trigger.

**Migration toward this policy** (TO BE DONE):
1. Audit existing FKs with cascade behavior
2. Document each one's intent (deliberate vs default-of-convenience)
3. Replace default-of-convenience cascades with `RESTRICT`
4. Where cascade is genuinely needed, document why in this file

This audit itself is Tier 4 work and must follow the full Pre-Mortem Checklist protocol.

---

## Product invariants

These statements must remain true after any migration, deploy, or production mutation. Violations are bugs, regardless of what the migration "succeeded" at:

1. Every `session_answer` references an existing `question`
2. Every `session_answer` references an existing `study_session`
3. Every `question` references an existing `document` or an explicit archived-document marker
4. Deleting or modifying documents must not erase study history unless explicitly intended
5. A user with prior sessions still sees Progress
6. A user with adopted documents still sees Library
7. A user with due questions can start a study session
8. Streak counter matches the actual `study_sessions` history (not just a stored integer)

These are the spec the database must satisfy. They should be encoded as automated tests — see `PRE-MORTEM-CHECKLIST.md` → "Product Invariants Tests."

---

## Risk tolerance per operation type

| Operation | Tolerance |
|---|---|
| Modify Sacred tier directly | Full backup + explicit consent + multi-table verification |
| Modify Parent-of-Sacred tier | Same protocol — treat as Sacred for migrations |
| Modify everything else | Standard verification per risk tier |

The product is not the documents. It's the graph.

---

## "Empty today does not mean irrelevant tomorrow"

A note on `question_feedback` specifically: at time of writing, this table has very few rows. That is not a reason to exclude it from blast-radius calculations.

If a table is Sacred and references a Parent-of-Sacred via cascade, it belongs in the verification set even if the current row count is zero. The current count is a snapshot; the cascade is structural.

This applies to any future Sacred table that may be lightly populated in early product life.
