# Chunk NOTES-2.1 — acceptance criteria

Objective: gate the Notes feature surfaces behind the `hasNotesAccess` Clerk flag, as the first containment layer of the note-capture cohort experiment.

1. `/notes` (all sub-paths) and `/api/notes` (all sub-paths) are inaccessible to users without `publicMetadata.hasNotesAccess === true`.
2. Gating is layered ON TOP of the existing `auth.protect()` — existing authentication behavior for all other routes is unchanged.
3. Flag check reads `sessionClaims.publicMetadata` first and falls back to `currentUser()` when publicMetadata is not present in the session token (token-shape variance between Clerk plans).
4. Unauthorized page requests redirect to `/`; unauthorized API requests receive `403` JSON, never a redirect.
5. No other routes, no schema, no data access changes in this chunk.

## Pre-approvals (from TASK_SPEC, decided by Gio)

- `p1c_preapprovals`: `{ "item": "middleware.js", "exact_scope": "add isNotesRoute matcher + hasNotesAccess gate block inside the existing clerkMiddleware callback; no change to isPublicRoute or auth.protect() behavior" }` — the red-path middleware edit for exactly this change is pre-approved (DEC-N21, human).
