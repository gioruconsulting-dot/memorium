# STATE — Chunks 2/3/4 COMPLETE, Chunk 5 next

**As of:** 2026-05-22

## Where we are

- **v4 (note-capture) — fully shipped on `main`.** Gated behind `hasNotesAccess`. Still serving the 3 testers from `memorium-recovery` (the v5 work is on a feature branch, not yet promoted).
- **v5 (block-model redesign) in flight** on branch `notes-v5` (6 commits ahead of `main`, no remote yet).
  - **Chunk 0 / 0.5** (pre-flight + invariants lock) — DONE
  - **Chunk 1a** (additive schema expand, Tier 3) — **DONE 2026-05-21T18Z on `memorium-recovery`**. All blast-radius counts unchanged. Verification artifacts at `.migrations/2026-05-21T18-01-42Z/` (commit `7fc737c` on `main`).
  - **Chunk 2** (backend `getNoteById` + `updateNote` + GET/PATCH route + local dev DB setup) — DONE on `notes-v5`. 11-scenario Node-level verification green + 31 curl assertions green. Commits `baaac7d`, `42c0e7b`, `4bf9440`.
  - **Chunk 3** (Generate route rewrite, retire-not-delete, atomic interactive transaction, automated verification suite covering scenarios A–H) — DONE. 58/58 assertions green. Commits `719902d`, `488ce60`.
  - **Chunk 4** (frontend journal canvas: title, sealed blocks read-only, draft autosave, state-aware Generate button, mobile sticky footer) — DONE. API contract verified via curl; visual smoke is the operator's responsibility. Commit `a720e5b`.
  - **Chunk 5 — NEXT.** Frontend in-place edit for sealed blocks + sessionStorage-backed recovery panel for 409.
  - Chunks 6, 7, 7.5, 8, 8.5 — pending.
- **Branch state on `notes-v5`:** HEAD `a720e5b`. 6 commits ahead of `main`. No pushes (commits stay local until you decide).

## Live production schema (post Chunk 1a on `memorium-recovery`)

Additive only — v4 code on `main` ignores these columns/table harmlessly. **Production has not been touched since Chunk 1a.** All Chunk 2/3/4 work runs only against the local SQLite dev DB.

- New table: **`note_blocks`** — id, document_id (FK → documents ON DELETE CASCADE), content, sealed_at, updated_at, is_stale (DEFAULT 0), stale_since, version (DEFAULT 0). Indexes: `idx_note_blocks_document(document_id, sealed_at)`, `idx_note_blocks_stale(document_id, is_stale, stale_since)`.
- `documents.note_version INTEGER NOT NULL DEFAULT 0` (currently 0 for all 51 rows).
- `questions.block_id TEXT REFERENCES note_blocks(id) ON DELETE CASCADE` (currently NULL for all 1430 rows).
- `questions.retired_at INTEGER` (nullable, currently NULL).
- `questions.retired_reason TEXT` (nullable, currently NULL).
- Indexes: `idx_questions_block(block_id)`, `idx_questions_active(document_id, retired_at)`.

`lib/db/schema.js` is **still not updated** to reflect these (carried forward; not a containment issue). The local dev DB created by `scripts/init-local-db.mjs` defines the full post-Chunk-1a schema inline, including `is_public` (which lives in production but not in `schema.js` — pre-existing drift).

## Local dev DB (new in Chunk 2)

- File: `.data/memorium-local.db` (gitignored).
- Env var: `TURSO_DATABASE_URL_LOCAL=file:.data/memorium-local.db` in `.env.local` (read by scripts).
- Init: `TURSO_DATABASE_URL_LOCAL=file:.data/memorium-local.db node scripts/init-local-db.mjs`
- Seed: `TURSO_DATABASE_URL_LOCAL=file:.data/memorium-local.db node scripts/notes-v5-seed-local.mjs`
  - Seeds `user_v5test` / `doc_v5test_note` / 3 blocks (block 3 is_stale=1).
- Point the dev server at it: `TURSO_DATABASE_URL=file:.data/memorium-local.db TURSO_AUTH_TOKEN= npm run dev`
- Both scripts refuse any URL that isn't `file:` — hard guard against accidental prod hits.

## Test-bypass shim pattern (used in Chunks 2/3/4)

Three locations gate-on `NOTES_TEST_BYPASS_USER`:
- `middleware.js` — early-return when env is set
- `app/api/notes/[id]/route.js` + `app/api/notes/[id]/generate/route.js` — `_authForRequest()` wrapper around `auth()`

Plus `NOTES_AI_TEST_MOCK` for the AI layer:
- `lib/ai/generate-questions-for-delta.js` — content-tag-keyed mock (`TRIGGER_NO_DISTINCT`, `TRIGGER_HARD_FAIL`, `TRIGGER_BUMP:<blockId>`)
- `lib/ai/generate-concepts.js` — returns one mock concept

All five shims tagged `TEST_BYPASS_REMOVE_BEFORE_COMMIT` and reverted before each commit. Re-application instructions live in `scripts/notes-v5-verify-chunk-3.mjs` header (Chunk 3) and at the head of `scripts/notes-v5-seed-local.mjs` (Chunk 2 pattern). Chunk 4 used the Chunk 3 pattern verbatim for the API-contract smoke.

## Locked production baseline (captured 2026-05-21T18:05Z pre-Chunk-1a)

| table | count |
|---|---|
| documents (total) | 51 |
| documents (note) | 4 |
| documents (uploaded) | 47 |
| questions (total) | 1430 |
| questions (note-linked) | 64 |
| questions (uploaded-linked) | 1366 |
| session_answers | 821 |
| study_sessions | 285 |
| users | 33 |
| question_feedback | 1 |

Unchanged through Chunks 2/3/4 (no production writes since Chunk 1a). These drift with active studying — re-baseline before any future Tier 3+ work (Chunk 7.5).

## Chunk 5 — what's next

**Scope (per `docs/specs/notes-feature-masterplan-v5.md` §3 Chunk 5):**
- Visible Edit button per sealed block (always-visible, both desktop + mobile — not hover/tap-anywhere)
- Edit mode: textarea-on-focus in place, inline "Done" button below the editing block to exit (NOT iOS keyboard accessory)
- Autosave for edited block content (3s debounce, same plumbing as draft, with per-block `version` re-check)
- "Needs refresh" badge appears after server confirms `is_stale=1`
- **409 conflict handling UI: `sessionStorage`-backed recovery panel above the draft**; manual copy + dismiss. This replaces the Chunk 4 minimum banner. Search `app/notes/[id]/page.js` for `TODO(chunk-5)` markers — they point at the conflict-banner spot where the recovery panel goes.
- Mobile keyboard handling: `scrollIntoView` on focus to keep editing block above the keyboard; verify on iOS Safari with the sticky footer

**Tier 1 (frontend only).** No schema change, no destructive ops, no production touch.

**Required reading for Chunk 5 (fresh session):**
- `docs/specs/notes-feature-masterplan-v5.md` — §1 "Block model — definitions", "Editing sealed content...", "Autosave" (esp. 409 recovery), §2.4 "Conflict (409) handling", §2.6 (mobile keyboard behaviour)
- `app/notes/[id]/page.js` end-to-end — extend, don't rewrite
- Chunk 2 commit `baaac7d` for the block-update PATCH contract (per-block `version` + `block_not_found` and `note_changed` responses)
- `scripts/notes-v5-seed-local.mjs` for the test fixture

## Pending / deferred

### v5 chunks not yet started

- **Chunk 5** — Tier 1, **next**
- **Chunk 6** (frontend post-Generate flow + Notes list redesign + polish) — Tier 1
- **Chunk 7** (personal use week) — Tier 0
- **Chunk 7.5** (schema contract: `DELETE FROM documents WHERE source_type='note'` + cleanup) — **Tier 4 destructive**. Deferred to immediately before v5 ships. Needs:
  - Fresh at-risk user snapshot (`scripts/notes-v5-snapshot-at-risk-user.mjs`)
  - Fresh plain-text export (`scripts/notes-v5-plain-text-export.mjs`)
  - Email the exports to the affected users
  - Full Tier 4 pre-flight per `PRE-MORTEM-CHECKLIST.md`
- **Chunk 8** (re-onboard testers + observe + decide) — Tier 0
- **Chunk 8.5** (restore at-risk user's preserved notes) — Tier 2; follows 7.5 within the same operation window

### Hard prereq for Chunk 7 (carry-forward from v4)

**Flag #1 — `getProgressPageData` aggregate-counter containment.** Queries #3 (`activityDays`) + #4 (`lifetimeStats`) in `lib/db/queries.js` not flag-aware. Aggregate-only leak. Must close before flipping `hasNotesAccess=true` on any external user. Memory: `project_progress_aggregate_containment_deferred.md`.

### Smaller carry-forwards (not blocking)

- **Library `handleReviewFirst` missing `res.ok`** — cross-feature parity sweep. One-line fix, sweep when convenient.
- **`is_public` schema drift in `schema.js`** — TODO comment in-file. Pre-existing.
- **Env-loading convention inconsistency** — `npm run test:api` uses `node --env-file=.env.local`; `scripts/*.mjs` use `dotenv`. Both work, harmless.
- **Filename `lib/upload-limits.js`** — also holds `NOTE_MIN_WORDS`. Rename to `lib/word-limits.js` when convenient.
- **`lib/db/schema.js` doesn't include the Chunk 1a v5 additions** — local dev DB has them via `init-local-db.mjs`; production has them since Chunk 1a; bootstrap-from-schema.js drift not closed.
- **21 docs leaked public (security audit M-tier)** — `is_public` DEFAULT 1 silently published pre-fix uploads. Forward fix in `eac4728`; existing rows untouched. Memory: `project_public_docs_unremediated.md`.
- **"Review this first" prioritize button removed from the notes editor page in Chunk 4.** Layout doesn't include it per masterplan §2.6. The prioritize route still works; restore if testers ask.

## Operational notes (from earlier chunks)

- **Turso CLI naming rule:** lowercase letters + digits + dashes only.
- **Turso shell stdin:** doesn't consume stdin non-interactively. Pass SQL as a single quoted arg.
- **Production DB target:** always `memorium-recovery` (not parent `memorium`).
- **PITR window on Starter:** 6h+ confirmed via live probes. Re-probe per Tier 3+ pre-flight.
- **libSQL `batch("write")` is atomic on SQL errors only — NOT on rowsAffected=0.** A conditional UPDATE that matches no rows is a successful 0-row operation; the rest of the batch commits. Found hands-on in Chunk 3 scenario E. Use `db.transaction("write")` with explicit rollback when you need rowsAffected-driven abort.
- **Direct invocation of route handlers from raw Node fails** with `Cannot find module 'next/server'` (Next.js package exports aren't resolvable outside its runtime). Test via HTTP through the dev server + the bypass shim pattern instead. Found in Chunk 3.

## Reminders

- `STATE.md` stays untracked. Do not commit it.
- `scripts/test-ai-functions.js` stays untracked. Pre-existing v4 working artifact.
- Re-read `docs/safety/*` at the start of any session involving the database, schema, env vars, or deployment.
- Memory has the full live picture in `MEMORY.md` — that's the canonical state across sessions; this file is the quick-glance summary for the current working directory.
- `notes-v5` branch sits 6 commits ahead of `main`. Production keeps running v4 from `main` until you choose to merge + Chunk 7.5 ships.
