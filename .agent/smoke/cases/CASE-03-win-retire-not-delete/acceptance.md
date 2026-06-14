# Chunk NOTESV5-3 — acceptance criteria (Generate route, v5 block model)

Objective: rewrite `/api/notes/[id]/generate` for the v5 block model with the retire-not-delete contract from the v5 masterplan §1.

1. Generation selects up to 5 oldest stale blocks (`stale_since` asc, `sealed_at` asc, `id` asc).
2. AI calls run OUTSIDE any DB transaction; a hard AI failure aborts with 502 and zero DB writes.
3. **Retire-not-delete:** question rows belonging to a regenerated block are marked `retired_at = now`, `retired_reason = 'block_regenerated'`, `is_retired = 1` — never deleted. The UPDATE is scoped to that `block_id`, the requesting `user_id`, and the active subset (`retired_at IS NULL`).
4. All DB writes execute inside one `db.transaction('write')`; every conditional statement checks `rowsAffected` and any miss rolls the whole transaction back with a 409 carrying current state.
5. SR continuity: no question row is ever deleted by this route; `session_answers` rows are untouched by construction.
6. Verified by the automated verification suite (counts, orphan checks, retire-vs-delete invariants) — suite output is the evidence of record.

## Pre-approvals (from TASK_SPEC, decided by Gio)

- `p1c_preapprovals`: `{ "item": "questions table UPDATE (retire path)", "exact_scope": "UPDATE questions SET retired_at/retired_reason/is_retired WHERE block_id = ? AND user_id = ? AND retired_at IS NULL — inside the generate transaction only; no DELETE on questions anywhere; no other sacred-table statement" }` (DEC-V5-12, human — retire-not-delete is the chunk's core design, approved in the v5 masterplan)
- `p1c_preapprovals`: `{ "item": "questions table INSERT (replacement questions)", "exact_scope": "INSERT of newly generated question rows for the regenerated block, owner-scoped" }` (DEC-V5-12)
