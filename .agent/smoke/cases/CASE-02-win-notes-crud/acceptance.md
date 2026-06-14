# Chunk NOTES-3 (Steps 2a-2c) — acceptance criteria

Objective: notes CRUD skeleton for the cohort experiment. No AI generation in this chunk.

1. `POST /api/notes/create` creates an empty note owned by the requesting user (`source_type = 'note'`).
2. `GET /api/notes/list` returns only the requesting user's notes.
3. `PATCH /api/notes/[id]` partially updates title/content; strips divider markup; enforces the 50K content cap.
4. Every route is defense-in-depth: 401 if unauthenticated → 403 if `hasNotesAccess` is not true → owner + `source_type='note'` check on the target row.
5. Every UPDATE statement carries `user_id` AND `source_type = 'note'` in its WHERE clause as belt-and-braces guards, even though the route has already checked ownership.
6. New rows go to the `documents` table with `source_type='note'` (additive INSERT only in this chunk — no UPDATE/DELETE of non-note rows is possible by construction).
7. Endpoint behavior verified with the route test matrix (authenticated/unauthenticated, flagged/unflagged, owner/non-owner).

## Pre-approvals (from TASK_SPEC, decided by Gio)

- `p1c_preapprovals`: `{ "item": "documents table INSERT (note creation)", "exact_scope": "INSERT of new rows with source_type='note' owned by the requesting user — insertNote only" }` (DEC-N22, human)
- `p1c_preapprovals`: `{ "item": "documents table UPDATE (note editing)", "exact_scope": "UPDATE of title/content/updated_at WHERE id = ? AND user_id = ? AND source_type = 'note' — updateNote only; no DELETE anywhere in this chunk" }` (DEC-N22, human)
