# Repetita — Notes Feature Masterplan

**Status:** v4. Ready to execute. Built across three rounds of adversarial review, a cross-LLM review pass (12 amendments), and a codebase-snapshot verification pass (May 18, 2026 — 6 refinements). All integrated below.
**Internal name:** "note capture" (use this in commits, code comments, and scope discussions — see §11).
**External name:** Notes.
**Production DB:** `memorium-recovery`.
**Build philosophy:** Smallest reviewable chunks. Schema migration isolated. Feature gated to test users from chunk 2.
**Compatible with:** `SESSION-STARTUP-CONTRACT.md`, `PRE-MORTEM-CHECKLIST.md`, `DATA-SANCTITY.md`.

**Version diff (v3 → v4):** see §12 Changelog. The biggest correctness fixes are in §1 Concurrency, §1 Generation model, §2.4 Generation transaction, and §1 Containment (rip-out).

---

## 0. Framing

**This is a cohort segmentation experiment, not a product pivot.** Repetita's core remains "upload → generate → study." Notes is a gated, divergent workflow offered to a small group of vocal users who specifically requested editable, growing documents. It must not change the default UX for existing users, must not surface in public-facing routes (Library, Browse, Public stats), and must be ripoutable if the experiment fails.

The product invariant from `DATA-SANCTITY.md` holds: the graph (user → question → SR state → session_answer → study_session) is still the product. Notes are inputs to that graph, like uploads. The only difference is that note-inputs are mutable and grow over time.

---

## 1. Decisions locked

These are settled after four rounds of review. Any change requires re-running the adversarial process.

### Product
- Notes share the `documents` table with uploads, distinguished by `source_type` column (`'uploaded'` default, `'note'` for notes).
- Notes are **strictly private**: never public, never browsable, never adoptable. Enforced at UI, route, and policy levels.
- Notes do not appear in Library. They have their own surface at `/notes`.
- Note-generated questions DO appear in normal study sessions for the owning user (they're real questions; the graph is the product).
- Note-generated questions DO count in personal stats. They do NOT count in the public `/api/stats/public` counter.

### Editor model — single visual surface, two DB fields
- One visual document. Looks like a growing journal.
- Date dividers separate previously-generated sections from the current draft section.
- Old content (above any divider) is freely editable. A subtle persistent banner appears when cursor is in old content: *"Editing previous content. Questions already generated from this section won't change."*
- New content (below the last divider, in the draft area) is what Generate operates on.
- DB-side: `documents.content` holds everything above the current draft. `documents.note_draft_content` holds the draft below.
- Save persists both fields. Generate uses only `note_draft_content`.
- **Implementation constraint:** the editor renders as one visual document but is implemented as separate controls/regions for `content` and `note_draft_content`. The form state is `{ content, note_draft_content }`. The draft boundary is structural — never inferred by parsing a single textarea. This prevents boundary-corruption bugs and accidental section-parsing failures.
- **Dirty-state invariant:** if either field has unsaved local changes, Generate is disabled with hover hint *"Save before generating."* Generate always operates on the latest saved draft in the DB. Generate never silently saves.

### Generation model
- **Save and Generate are strictly separate.** Save never calls Claude. Generate is an explicit user action.
- On successful Generate: append draft into content with a date divider, clear the draft field, insert new questions, regenerate concepts from the **sealed full document** (old content + divider + just-generated draft), update timestamps — all in one DB transaction.
- Questions are generated only from the draft. Concepts are regenerated from the sealed full document each generation. (This was a v3 hole: concepts were generated from pre-generation content, which omitted the new draft.)
- Two separate AI functions: `generateQuestionsForDelta(draftText, title)` and `generateConcepts(sealedFullText, title)`.
- **Concept generation is fail-soft:** if `generateConcepts` fails, log a warning, retain prior `concepts_json`, and still seal the draft and insert questions. Concepts are additive metadata; a flaky concepts API call must not block the user's primary action. Question generation is hard-required: if it fails, no DB changes.
- **Question shape:** note-generated questions match the existing `questions` schema, including the optional `concept_id` (TEXT, NULL allowed) and `difficulty` (TEXT, NULL allowed) fields. The new prompt may populate these or leave them NULL; downstream code already handles both.

### Question count for notes
- Prompt-led: prompt asks Claude for 3–15 questions ordered most useful first, generating only from genuinely distinct concepts.
- Server-enforced: accept 1–15 questions. If 16–20 returned, truncate to first 15 (which are the strongest per the ordering). If 0 returned, surface "not enough distinct material — add more content." If >20 or malformed, fail (existing retry layer in `generateQuestions` handles malformed responses already).
- Uploaded docs continue to generate ~20 questions as today. No change to upload flow.

### Gating
- **`publicMetadata.hasNotesAccess: true`** on the user, set via Clerk dashboard.
- Routes under `/notes/*` and `/api/notes/*`.
- Middleware checks `sessionClaims.publicMetadata?.hasNotesAccess === true` for these paths.
- Every notes API route independently verifies the flag plus ownership of the document.
- Navigation component conditionally renders a Notes link via `useUser()` hook on the client.

### Containment — making the feature actually ripoutable
- Note-generated questions appear in `/api/questions/session`, `/api/stats/summary`, and `/api/stats/progress` **only for users with current `hasNotesAccess=true`**.
- For non-flagged users (including users whose flag was revoked), these three routes join through `documents` and include only `source_type='uploaded'`.
- This is what makes the experiment actually ripoutable. If a tester loses the flag, the `/notes` UI disappears AND note-questions stop surfacing in `/study` and `/progress`. The feature can be cleanly withdrawn at the cohort level without data deletion. (v3 hole: the plan claimed ripoutability but the containment was missing.)
- Implementation sketch:
  ```sql
  -- flagged user
  WHERE questions.user_id = ?
    AND questions.next_review_at <= ?

  -- non-flagged user
  JOIN documents ON documents.id = questions.document_id
  WHERE questions.user_id = ?
    AND documents.source_type = 'uploaded'
    AND questions.next_review_at <= ?
  ```

### Word and character limits
- `MIN_WORDS` enforced on the **draft** (not the full document). Generate button disabled below threshold.
- **50,000 character cap enforced server-side** on Save (combined `content + draft`) and again on Generate (combined `content + divider + draft`). UI shows soft warning at 90%, hard rejects at 100%. UI-only enforcement is bypassable; server must be the source of truth.
- No upper word limit on the draft beyond the character cap.

### Concurrency and abuse protection
- **Double-submit / multi-tab protection via conditional UPDATE:** the post-AI transaction matches on the exact `content` AND `note_draft_content` used as input. If either changed during the AI call, the update affects 0 rows; we abort and surface *"your note changed during generation — please refresh and try again."* (v3 hole: matched draft only, leaving saved content unprotected against Tab B edits.)
- **Per-user rate limit:** 30 generations/hour on `/api/notes/[id]/generate`. Returns 429 with `Retry-After` header on exceed. Protects against runaway Claude spend from a compromised account or buggy client.
- **Divider injection protection:** literal divider markers (`---\n[Generated on: YYYY-MM-DD]\n`) are stripped or escaped from user input server-side on Save. Otherwise a user can type a fake divider and corrupt section parsing. Decide stripping vs. structured-field representation in Chunk 3.
- Input hash (SHA-256 of draft) logged on every generation attempt for debugging.

### Privacy — logging
- Generation logs MUST NOT include raw note content, draft text, source references, or full AI prompts.
- Logs MAY include: `documentId`, `userId`, `inputHash`, input word count, question count, duration, status, error class.
- This matters because notes are private by design and potentially more personal than uploads.

### NULL handling
- `note_draft_content` is stored as `''` (empty string) on note creation, never NULL.
- NULL allowed for uploaded docs (no backfill — they will always be NULL).
- All read paths normalize `NULL → ''` (`const draft = row.note_draft_content ?? '';`).
- Generation SQL uses app-computed strings rather than SQL concatenation with nullable values, to avoid silent NULL-concatenation bugs.

### Rollout
- **Personal-use week first.** I use the feature with real audiobook notes for at least one full week before any external user gets the flag.
- Then 1–3 external test users, gated by Clerk dashboard.
- Observe for 2–4 weeks against concrete kill criteria (§4).

---

## 2. Architecture

### 2.1 Schema migration

Four additive columns on `documents`. All nullable or defaulted. No backfill required. No FK changes. No constraint tightening on existing data.

```sql
ALTER TABLE documents
  ADD COLUMN source_type TEXT NOT NULL DEFAULT 'uploaded'
  CHECK (source_type IN ('uploaded', 'note'));

ALTER TABLE documents
  ADD COLUMN note_draft_content TEXT;

ALTER TABLE documents
  ADD COLUMN last_generated_at INTEGER;

ALTER TABLE documents
  ADD COLUMN updated_at INTEGER;
```

**Notes on each column:**

- **`source_type`** discriminates note from upload. CHECK constraint validates on every insert/update. SQLite tests added CHECK constraints against existing rows at ALTER time; since all existing rows will satisfy `'uploaded'` via the default, this passes.
- **`note_draft_content`** holds the ungenerated draft for notes. Stored as `''` (empty string) on note creation. NULL for uploaded docs (no backfill). All application read paths normalize `NULL → ''`.
- **`last_generated_at`** is the unix timestamp (seconds — per the project convention) of the last successful generation on this note. NULL for uploaded docs and never-generated notes. Useful for UI and debugging.
- **`updated_at`** is the unix timestamp of the last save. NULL for existing uploaded docs (no backfill). Notes set this on every save. Listing notes uses `COALESCE(updated_at, created_at) DESC`.

**`documents.question_count` behavior:**
- For uploads: unchanged. Set at creation, never updated.
- For notes: not maintained. Source of truth for note row counts is `SELECT COUNT(*) FROM questions WHERE document_id = ?`. This is indexed and fast. Don't update the stored column for notes — leave it at 0 or whatever insert sets.

**Chunk 0 verification item:** confirm `documents.concepts_json` already exists in production schema. Referenced in §2.4 but not added by this migration.

### 2.2 Routes

**New page routes:**
- `/notes` — list of user's notes, sorted by `COALESCE(updated_at, created_at) DESC`
- `/notes/new` — creates an empty note, redirects to `/notes/[id]`
- `/notes/[id]` — single note view with the unified editor

**New API routes:**
- `POST /api/notes/create` — creates an empty note (`source_type='note'`, `is_public=0`, `content=''`, `note_draft_content=''`, `question_count=0`), returns id. The `question_count` column is `NOT NULL` so must be set explicitly.
- `PATCH /api/notes/[id]` — updates `content` and/or `note_draft_content`, sets `updated_at`. Enforces 50K char cap on combined size. Strips divider markers from input. Never calls Claude.
- `POST /api/notes/[id]/generate` — runs the generation transaction (see §2.4). Rate-limited 30/hour.
- `GET /api/notes/list` — fetches user's notes
- `DELETE /api/notes/[id]` — deletes a note (cascades to questions via existing FK)

**Modified existing routes** (privacy and integration):

| Route | Modification |
|---|---|
| `GET /api/documents/list` | Filter `WHERE source_type = 'uploaded'`. Notes never appear in Library. |
| `GET /api/documents/browse` | Already filters `is_public=1`. Add explicit `source_type='uploaded'` guard. |
| `POST /api/documents/set-public` | Reject with 403 if `source_type='note'`. Notes cannot be published. |
| `POST /api/documents/adopt` | Reject with 403 if `source_type='note'`. Notes cannot be adopted. |
| `GET /api/documents/[id]` (detail) | Allow read for notes only if user is owner AND has flag. |
| `DELETE /api/documents/delete` | Works as-is (owner-only). Verify in audit. |
| `GET /api/questions/session` | Note-questions included **only if** `hasNotesAccess=true`. Otherwise join `documents` and filter `source_type='uploaded'`. |
| `POST /api/questions/grade` | Works as-is. Verify in audit. |
| `POST /api/questions/retire`, `POST /api/questions/prioritize` | Work as-is. Verify in audit. |
| `GET /api/stats/summary`, `GET /api/stats/progress` | Note-questions counted **only if** `hasNotesAccess=true`. Otherwise filter `source_type='uploaded'`. |
| `GET /api/stats/public` | **Exclude** note-questions from the public counter. Add `source_type='uploaded'` join. |
| `GET /api/export` | Owner-only. Notes included for owner. Verify in audit. |
| `POST /api/documents/unadopt` | N/A for notes (notes are never adopted). Verify it can't be called against a note. |

The full audit including UI components is Chunk 2.5.

### 2.3 Gating

**Middleware** (`middleware.js`):
- Existing pattern: `clerkMiddleware` + `createRouteMatcher` with public routes `/sign-in*`, `/sign-up*`, `/api/stats/public`. Everything else is gated by `auth.protect()`. **The notes flag check is an additional layer on top — do not replace the existing pattern.**
- Add a check: if path starts with `/notes` or `/api/notes`, after `auth.protect()` has run, verify `sessionClaims.publicMetadata?.hasNotesAccess === true`.
- If not present in `sessionClaims`: fall back to fetching `currentUser()` and reading `publicMetadata.hasNotesAccess`. Slower but reliable. Verify in Chunk 2 which path actually fires.
- If unauthorized: redirect `/notes/*` requests to `/`; return 403 for `/api/notes/*` requests.
- Existing matcher already covers `/api/*`. Verified.

**Navigation** (`components/Navigation.js`):
- Convert to read `useUser()` from `@clerk/nextjs`.
- Conditionally include a Notes link in `LINKS` array when `user?.publicMetadata?.hasNotesAccess === true`.
- The conditional is one line. The rest of Navigation is unchanged.

**Server-side defense in depth:**
- Every notes API route independently checks the flag (don't trust middleware alone).
- Every notes API route checks document ownership (`user_id` match).
- Every notes API route checks `source_type='note'` where relevant (e.g., generate route refuses to operate on uploaded docs).

**Clerk session token behavior:**
- After flipping `hasNotesAccess` in the dashboard, the user must sign out and back in (or wait ~60s for token refresh) for it to take effect. Document in test plan and tester onboarding.
- Same applies in reverse for revocation: there is a ≤60s window where a revoked user can still hit notes routes. The containment rule in §1 means stats/study routes are safe regardless of stale tokens, because they filter server-side on flag state at request time (via `currentUser()` not just `sessionClaims`).
- Verify in Chunk 2 that `publicMetadata` actually flows into `sessionClaims`. If Clerk's session token customization isn't enabled by default in our setup, configure it explicitly.

### 2.4 Generation transaction — step by step

This is the most concurrency-sensitive operation in the feature. Walking through it carefully.

1. **Request validation** (synchronous, fast)
   - Auth: user is signed in
   - Flag: `hasNotesAccess` is true
   - Document: exists, is owned by user, `source_type='note'`
   - Rate limit: this user has not exceeded 30 generations in the last hour
   - Draft: `note_draft_content` exists (normalized from possible NULL), meets `MIN_WORDS`
   - Size: combined `content + divider + draft` is within the 50,000 char cap

2. **Capture state for optimistic concurrency**
   - Read full row in one query
   - `content_at_start = row.content`
   - `draft_at_start = row.note_draft_content ?? ''`
   - `divider = '\n\n---\n[Generated on: ' + today + ']\n'`
   - `sealed_content = content_at_start + divider + draft_at_start` (app-computed; do not rely on SQL string concat)
   - `input_hash = sha256(draft_at_start)`
   - Log: `{ documentId, userId, inputHash, inputWordCount, timestamp, status: 'started' }` — never the raw text

3. **AI calls** (slow, no DB lock held)
   - `generateQuestionsForDelta(draft_at_start, title)` → required. Returns 1–20 questions; truncate to 15 if 16–20.
   - `generateConcepts(sealed_content, title)` → fail-soft. Returns concepts JSON.
   - If questions call fails: log failure, return 502 to user, no DB changes.
   - If concepts call fails: log warning, retain prior `concepts_json`, continue with question insert. User still gets their questions.

4. **Validate AI response**
   - Question count between 1 and 20. Truncate to 15 if 16–20. Reject if 0 or >20 or malformed.
   - Each question has required fields per existing schema.

5. **Transactional commit** (one DB transaction wrapping UPDATE + INSERT questions)
   - Conditional UPDATE on `documents`:
     ```sql
     UPDATE documents
     SET content = ?,                   -- sealed_content (app-computed)
         note_draft_content = '',
         concepts_json = ?,             -- new concepts, OR prior concepts_json if fail-soft
         last_generated_at = strftime('%s','now'),
         updated_at = strftime('%s','now')
     WHERE id = ?
       AND user_id = ?
       AND source_type = 'note'
       AND content = ?                  -- match content_at_start
       AND note_draft_content = ?       -- match draft_at_start
     ```
   - If `rowsAffected === 0`: rollback. The note changed during the AI call (Tab B edited content, draft, or both). Surface *"your note changed during generation — please refresh and try again."*
   - If `rowsAffected === 1`: insert questions linked to this document in the same transaction. Commit.
   - Log: `{ ..., status: 'success', questionCount, durationMs, conceptsRegenerated: bool }`

6. **Response**
   - Return `{ questionsAdded: N }`
   - Client refetches the note to show the updated unified content + empty draft

**The divider format:** `\n\n---\n[Generated on: YYYY-MM-DD]\n` — a literal markdown horizontal rule plus a date stamp on the next line. The frontend parses this when rendering for visual separators and date labels in the top-right of each section. Server-side, this exact pattern is stripped/refused from user input to prevent fake divider injection.

### 2.5 The editor — UX detail

A single visual document, but architecturally two fields rendered as two regions.

**Visual layout (top to bottom):**
- Note title (editable, single line)
- Saved content area — renders `documents.content`, including any horizontal rule dividers
  - For each divider, the date stamp parsed from the divider text is shown in the top-right of that section
  - All content here is editable, but uses its own control bound to `content`
- A subtle horizontal line marker ("draft area" boundary), with today's date in the top-right corner
- Draft area — separate editable textarea backed by `documents.note_draft_content`
- Footer: word count for draft, Save button, Generate button

**Implementation constraint (load-bearing):**
- The two areas look continuous but are separate React-controlled regions. Form state is `{ content, note_draft_content }`. The boundary is structural, not parsed.
- Why this matters: if the two were one textarea split by parsing a divider, then editing inside an old section could accidentally cross the boundary, or a typo in a divider could re-bucket text. Separate controls eliminate the class of bug entirely.

**Banner behavior:**
- When cursor focus is in the saved content area: show banner *"Editing previous content. Questions already generated from this section won't change."* — non-modal, persistent, dismissable but reappears on next focus event in old content.
- When cursor focus is in the draft area: no banner.

**Save semantics:**
- Save button persists both fields via `PATCH /api/notes/[id]`.
- Server enforces: 50K char cap on combined size; strip/refuse divider markers in input.
- No autosave in v1. User clicks Save. (Adding autosave later if testers request it.)
- Successful save updates `updated_at` server-side.

**Generate semantics:**
- Generate button enabled only when ALL of: draft meets `MIN_WORDS` AND there are no unsaved local edits in either field.
- If there are unsaved edits, button is disabled with hover hint *"Save before generating."*
- Clicking Generate posts to `/api/notes/[id]/generate`. Disable button during the call (loading state).
- Server-side double-submit protection is the conditional update — even if a determined user double-clicks past the disabled state, the second request will get `rowsAffected = 0` and fail cleanly.
- Server-side rate limit: 429 with `Retry-After` if >30/hour.
- On success: refetch note, show toast "N questions added," draft area becomes empty, new date divider appears in saved content.

---

## 3. Build chunks

Each chunk is one work session. Don't combine.

### Chunk 0 — Pre-flight + plan socialization
- Re-read `SESSION-STARTUP-CONTRACT.md`, `PRE-MORTEM-CHECKLIST.md`, `DATA-SANCTITY.md`
- Confirm production DB target (`memorium-recovery`) and current schema matches the May 18 snapshot (`documents`: 46 rows, `questions`: 1345 rows, `users`: 31 rows)
- Confirm `hasNotesAccess` flag is **not yet set** on any user (no premature exposure)
- Commit this masterplan (v4) to the repo

**Output:** confirmation cleared to proceed. No code, no schema changes.

### Chunk 1 — Schema migration (Tier 4, full ceremony)

The riskiest chunk. Done alone with full PRE-MORTEM-CHECKLIST protocol.

**Pre-flight (plain language for user approval):**
- This adds 4 nullable/defaulted columns to `documents`. No existing rows are rewritten. No FK changes. No constraints tightened on existing data.
- Worst case: the migration breaks something invisible we didn't anticipate; all existing flows (Library, Browse, Study, Stats) start failing. Time to detect: minutes (Two-Clock Rule). Time to recover: ~30 min via Turso branch restoration.
- Backup window: verify Turso PITR is currently available with timestamp within last 6 hours.

**Procedure:**
1. Verify backup/restore point available
2. Create Turso branch `memorium-notes-migration` from current production
3. Run all four ALTER statements on the branch
4. Run verification queries:
   ```sql
   SELECT COUNT(*) FROM documents WHERE source_type != 'uploaded';      -- expect 0
   SELECT COUNT(*) FROM documents WHERE source_type IS NULL;              -- expect 0
   SELECT COUNT(*) FROM documents WHERE source_type = 'note';            -- expect 0
   SELECT COUNT(*) FROM documents;                                        -- expect 46 (or current)
   SELECT COUNT(*) FROM questions;                                        -- expect 1345 (or current)
   SELECT COUNT(*) FROM users;                                            -- expect 31 (or current)
   PRAGMA foreign_key_list(documents);
   PRAGMA foreign_key_list(questions);
   ```
5. Four-level verification (counts, relationships, identity, product). Product level: point local app at branch, manually test Library load, Browse load, Study session, Upload of a new doc, Delete of a doc.
6. Generate verification artifacts (manual JSON for now — `.migrations/{timestamp}/`)
7. Two-clock verification: my agent counts + user manual verification
8. Only if all pass: apply same migration to production
9. Repeat full verification on production
10. Commit migration script + verification artifacts

**Hard stop conditions:** any unexpected delta, any FK structure change, any verification query failure → STOP, do not proceed to production.

**Expected build time:** 60–90 min including verification.

### Chunk 2 — Gating infrastructure

**Build the access-control layer before any feature code.**

1. Set `hasNotesAccess: true` on my own user via Clerk dashboard
2. **Configure Clerk session-token customization to include `publicMetadata`.** As of the May 18 snapshot, no `publicMetadata` is in use anywhere in the codebase — this is the **first** such usage, so the session-token customization is almost certainly not pre-configured. After configuring, test that `sessionClaims.publicMetadata` is populated on sign-in. If not, the `currentUser()` fallback path will fire instead (slower but works).
3. Update `middleware.js` to gate `/notes` and `/api/notes` as an additional layer on top of the existing `auth.protect()` pattern
4. Update `components/Navigation.js` — convert to use `useUser()`, conditionally include Notes link
5. Create stub `/notes/page.js` (renders "You have notes access ✓")
6. Create stub `/api/notes/list/route.js` (returns `{ access: true }` with flag check)
7. Test:
   - Signed in as me with flag: see Notes link, can hit `/notes`, can hit `/api/notes/list`
   - Signed in as another account without flag: no Notes link, `/notes` redirects to `/`, `/api/notes/list` returns 403
   - Sign out / sign in cycle verified after flipping the flag
   - **Revoke test:** flip the flag back off, verify within 60s the user can no longer access `/notes`

**No production data touched.** Pure additive code.

### Chunk 2.5 — Route and component inventory

Build the classification table before building feature code. Catches privacy leaks before they exist.

**Audit every route and component touching documents/questions/concepts.** Output is a markdown table committed to `docs/notes-route-inventory.md`:

| Route or component | Reads notes? | Writes notes? | Shows notes? | Requires flag? | Requires owner? | Notes behavior | Verified? |
|---|---|---|---|---|---|---|---|

Routes to audit (non-exhaustive):
- All routes in `app/api/documents/*`
- All routes in `app/api/questions/*`
- All routes in `app/api/stats/*`
- All routes in `app/api/sessions/*`
- `app/api/export/route.js`
- `app/page.js`
- `app/library/` and sub-routes (especially `app/library/[id]/read/` — focused reader. Decide: block notes from rendering, or allow? Lean: block, since Library doesn't link to notes anyway and a direct-URL bypass shouldn't render a notes UI in the upload reader.)
- `app/study/` and sub-routes
- `app/progress/`
- `app/post-celebration/`
- `app/upload/`
- `app/browse/`

Components to audit:
- `Navigation.js`
- `OnboardingCard.js`
- `StreakCard.js`
- `CelebrationScene.js`
- Any other component that takes a document or question object as a prop

For each row, add filters/guards in code where the audit reveals a leak. Then mark Verified.

**Output:** committed audit doc + code changes for any gaps. Pay special attention to the containment rule in §1: stats and study routes filter by `source_type='uploaded'` for non-flagged users.

### Chunk 3 — Notes CRUD (no AI yet)

The skeleton: create, list, view, edit, save, delete. No generation yet.

- `POST /api/notes/create` — creates empty note (`source_type='note'`, `is_public=0`, `content=''`, `note_draft_content=''`)
- `GET /api/notes/list` — fetches user's notes, sorted by `COALESCE(updated_at, created_at) DESC`
- `PATCH /api/notes/[id]` — updates `content` and/or `note_draft_content`, sets `updated_at`. Enforces 50K char cap. Strips divider markers from input. Decide stripping vs. structured representation at build time.
- `DELETE /api/notes/[id]` — verifies cascade still works for notes
- `/notes/page.js` — list view UI
- `/notes/new/page.js` — creates and redirects
- `/notes/[id]/page.js` — unified editor UI without Generate button yet:
  - Title field
  - Saved content area (separate control, renders content with date-divider parsing)
  - Draft area (separate control)
  - Save button (no Generate yet)
  - Focus-tracking banner ("Editing previous content...")

**Verification:** can create, edit, save, delete notes. Date dividers in `content` render with date in top-right. Notes never show in `/library` or `/browse`. Other users can't see them. Server rejects oversized saves. User-typed fake dividers are stripped or rejected.

### Chunk 4a — AI functions

Build the two new AI functions in isolation.

- `lib/ai/generate-questions-for-delta.js` — new prompt asking for 3–15 questions from delta content, ordered most-useful-first, only from distinct concepts
- `lib/ai/generate-concepts.js` — new prompt asking for concepts JSON only, no questions

Both functions follow the same retry/error-handling shape as existing `generateQuestions`. Test both with sample inputs before integrating.

### Chunk 4b — Generation route

Wire up `/api/notes/[id]/generate` per §2.4.

- Validation including rate limit check
- Capture `content_at_start`, `draft_at_start`, compute sealed content, hash draft
- Two AI calls (parallel where safe): questions required, concepts fail-soft
- Validate response
- Conditional transactional update guarding BOTH `content` AND `note_draft_content`
- Insert questions in same transaction
- Logging without raw text
- Frontend: Generate button on `/notes/[id]/page.js`, disabled when dirty or draft below `MIN_WORDS`, loading state, success toast, error states for both "note changed" and "rate limited"

**Verification:**
- Create note, type 200 words, generate → see N questions appear
- Append more text, generate → see additional questions, existing questions' SR state unchanged
- Try to generate with draft below `MIN_WORDS` → button disabled
- Edit draft locally without saving, try to Generate → button disabled with "Save before generating"
- Open same note in two tabs, edit and save in tab A, try to generate in tab B without refreshing → tab B fails cleanly with "note changed" error
- **Race scenario:** tab A starts Generate, tab B edits OLD content and saves, tab A finishes AI calls → tab A's conditional UPDATE fails (rowsAffected=0) and surfaces "note changed". This is the v3 hole; verify it's now closed.
- Trigger 31 generations in an hour → 31st returns 429
- Concept generation forced failure (mock) → questions still ship, prior concepts retained, warning logged
- Generated questions appear in normal study sessions
- After grading note-questions, SR state updates normally
- After deleting a note, its questions cascade-delete
- **Containment test:** flip flag off on my user, hit `/api/questions/session` → note-questions no longer appear

### Chunk 5 — Polish + edge cases

- Empty state for `/notes` ("You haven't created any notes yet")
- Word count display for draft + soft warning approaching 50K cap
- Delete confirmation
- Mobile responsiveness pass on `/notes` and `/notes/[id]` (long unified editor is the tricky case)
- Error states: network errors, AI failures, draft-changed conflicts, rate limit
- Banner UX refinement based on personal use
- Make sure Chunk 2.5 audit is still accurate (re-run on any new routes added in 3/4)
- **Optional:** lightweight localStorage backup of in-progress edits, restore on page load. Add only if personal use surfaces data-loss anxiety.

### Chunk 6 — Personal use week

**No code changes during this chunk unless bugs are found.**

- Use the feature with real audiobook notes for at least 7 days
- Create at least 3 different notes
- Generate questions at least 5 times across them
- Study note-questions in normal sessions, mixed with upload-questions
- Edit old content at least once, observe banner behavior
- Trigger every error state at least once intentionally (including rate limit and "note changed")
- Take notes (meta) on what's awkward, confusing, or broken
- Fix anything that's not shippable to a tester

**Exit criterion:** I would not be embarrassed to give this to a vocal user.

### Chunk 7 — Ship to test users

- Identify 1–3 specific test users by name (mentally is fine, but commit before flipping)
- Set `hasNotesAccess: true` for each in Clerk dashboard
- Send each a short message: what it is, how to use it, what feedback you want, how long the experiment runs (2–4 weeks)
- Make sure each knows: sign out / sign in to activate
- Establish how they report back (email, chat, etc.)

**No code in this chunk.** Rollout + observation setup.

### Chunk 8 — Observe + decide
- 2–4 weeks of test-user usage
- Apply kill criteria from §4
- Decide: kill, iterate, or ship to all

---

## 4. Kill / iterate criteria

**Pre-committed before Chunk 7 flips any external flag.**

**Continue / ship to all if all of:**
- At least 2 of 3 testers create multiple notes within the observation window
- At least 2 of 3 testers generate questions from notes more than once
- At least 1 tester studies note-generated questions in regular sessions
- No tester reports a privacy/confusion issue severe enough to block continued use
- No data integrity issues observed

**Iterate (don't ship to all, but don't kill) if:**
- Testers use notes but report specific UX friction that's clearly addressable
- Adoption is mixed (1 of 3 uses it heavily, others don't engage) — needs more signal

**Kill if:**
- A tester says "I stopped using it" or "it's not useful to me"
- Testers create notes but never generate questions (means it's a note-taking detour, not a Repetita feature)
- Any data integrity issue traced to the feature
- Privacy leak found in production

**The sunk-cost guardrail:** "I stopped using it" is a kill signal, not an iterate signal. Don't reframe negative feedback as "I should improve it" unless the tester explicitly says so.

---

## 5. Risks + mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Schema migration breaks existing flows | Low | Catastrophic | Branch-first, four-level verification, two clocks |
| `publicMetadata` doesn't reach `sessionClaims` | Medium | Annoying | Test explicitly in Chunk 2; fallback to `currentUser()` in middleware |
| Clerk session-token customization not pre-configured (first `publicMetadata` use in codebase) | Medium | Annoying | Configure explicitly in Chunk 2 step 2; `currentUser()` fallback as safety net |
| User edits old content expecting questions to update | High | Confusing not catastrophic | Persistent banner makes constraint explicit |
| Notes leak into Library / Browse / Public stats | Medium | Privacy violation | Defense-in-depth filters on all listed routes, Chunk 2.5 audit |
| Race: Tab B edits saved content while Tab A generates | Low | Data loss (stale overwrite) | Conditional UPDATE guards BOTH `content` AND `note_draft_content` |
| Race: two tabs generating simultaneously | Low | Inconsistent state | Conditional UPDATE: second write hits `rowsAffected=0`, fails cleanly |
| Runaway Claude spend via excess generations | Low | Moderate cost | Per-user rate limit 30/hour on generate route |
| Concept generation flake blocks user | Medium | Annoying | Fail-soft: keep prior concepts, ship questions anyway |
| Fake divider injection via user content | Low | Visual confusion | Strip/refuse divider markers server-side on Save |
| Prompt injection in note content | Low | Low | Existing JSON-schema validation in `generateQuestions` is the defense; output is validated structured data |
| Stale token after flag revoke | Medium | Privacy | Stats/study routes filter `source_type='uploaded'` for non-flagged users — doesn't rely on token alone |
| Claude returns >15 questions | Low | Wasted gen | Truncate to first 15 (prompt ordered most-useful-first) |
| Claude returns 0 questions | Medium | Bad UX | Surface clear "not enough distinct material" message |
| Raw note content in logs | Low | Privacy violation | Logs include only ids, hashes, counts, timing — never raw text |
| User loses 30 min of typing on browser crash | Medium | Annoying | v1 accepts this; localStorage backup deferred to Chunk 5 polish if testers complain |
| Test user abandons silently → false negative | Medium | Wrong decision | Direct outreach, not just passive observation |
| Concept regeneration cost doubles | Certain | Negligible (~$0.03/gen) | Accept |
| `note_draft_content` column conflicts with existing migrations | Low | Build delay | Verify on branch before production |

---

## 6. Explicitly out of scope for v1

This is "note capture" — a feature for generating study questions from captured material. It is not a knowledge management system.

Out of scope:
- Markdown rendering or rich text editor (plain textarea fine)
- Folders, tags, search across notes
- Backlinks, bidirectional links
- Image attachments, audio dictation
- Sharing notes between users (intentionally never — this is the whole privacy point)
- Auto-save / optimistic UI (explicit Save is fine for v1)
- "Convert note to public document" feature (user can copy-paste to `/upload`)
- Version history / undo
- Editing old content updates existing questions (architectural constraint; v2 feature if requested)
- Different AI prompts for different note types (audiobook vs. article vs. journal)
- Note-generated questions distinguishable in study UI (they're just questions)
- Migration of existing uploaded docs to notes (no path needed)
- WebSocket multi-tab sync (conditional UPDATE is the contention strategy)
- Encryption at rest beyond DB defaults
- Audit log of edits

If a tester requests one of these, the answer is: *"That's outside note capture. This feature exists to generate study questions from captured material. We can revisit if multiple testers say the same."*

---

## 7. Open implementation details — decide at build time

These are too tactical to lock now. Resolve when the relevant chunk starts.

- **Date divider format on render:** parse the literal divider text (`\n\n---\n[Generated on: YYYY-MM-DD]\n`) or store divider metadata in a separate field? Probably parse at render time — keeps the data model simple.
- **Divider injection defense:** strip on save vs. use a non-parseable storage representation (HTML comment, sentinel)? Decide in Chunk 3 based on what feels less brittle.
- **Banner dismissability:** show always when in old content, or hide after first dismiss per session? Lean: always show, but make it small and unobtrusive.
- **Empty draft on first visit to a brand-new note:** placeholder text? Lean yes: "Start typing your notes here..."
- **Note title:** required at creation, or editable later? Lean: editable later, default to "Untitled note" or timestamp.
- **`MIN_WORDS` threshold for note deltas:** same as upload (whatever it is today) or lower? Probably lower for notes (e.g., 50 words instead of 150). Decide in Chunk 4b based on what feels right in personal testing.
- **Rate limit storage:** in-memory per process, Redis-style external, or DB-backed? For 1–4 users at v1, simplest possible. Probably a small `generation_attempts` table or in-process counter. Decide in Chunk 4b. Note that the existing `/api/documents/create` rate limit is 25 docs/day per user (per-day, not per-hour) — different unit but acceptable divergence given the different cost shape.
- **`description` and `topic` columns on notes:** the existing `generateQuestions` function returns these for uploaded docs; the new `generateConcepts` for notes might or might not. Decision needed: (a) generate once on first successful Generate from sealed content, then keep static; (b) regenerate every Generate; (c) leave NULL for notes since the `/notes` UI doesn't surface them. **Lean: (c) leave NULL for v1.** The columns are nullable; the notes UI uses `title` directly. Decide in Chunk 4b.

---

## 8. Glossary

- **Note:** a document with `source_type='note'`. Private, editable, accumulates drafts and generated questions over time.
- **Draft:** the new ungenerated content in a note, stored in `documents.note_draft_content`.
- **Saved content / accumulated content:** the previously-generated material in a note, stored in `documents.content`.
- **Sealed content:** the result of `content + divider + draft` after a successful generation. Becomes the new `content`.
- **Date divider:** the literal text marker (`---\n[Generated on: YYYY-MM-DD]`) appended to `content` when a draft is sealed into history via successful generation.
- **Two-clock rule:** agent verification + user verification, per `PRE-MORTEM-CHECKLIST.md`.
- **Containment:** the property that removing `hasNotesAccess` from a user causes note-questions to disappear from their study/stats views, not just the `/notes` UI.

---

## 9. Cross-references

- **Pre-flight protocol for Chunk 1:** `PRE-MORTEM-CHECKLIST.md` → "Section B" and "Four-Level Verification"
- **Tier classification:** `SESSION-STARTUP-CONTRACT.md` → "Classify the task before doing anything"
- **Sacred data policy:** `DATA-SANCTITY.md` → "Sacred tables" and "Cascade policy"
- **Schema source of truth:** live DB (`turso db shell memorium-recovery` → `.schema documents`)
- **AI integration patterns:** `API-INTEGRATION.md`

---

## 10. Session handoff notes

This masterplan (v4) is the contract. A fresh chat window starting from:
1. `SESSION-STARTUP-CONTRACT.md`
2. `PRE-MORTEM-CHECKLIST.md`
3. `DATA-SANCTITY.md`
4. This file (v4)

...has everything needed to execute any chunk.

**Recommended pacing:**
- Chunks 0, 1 → one fresh window each (Chunk 1 is the migration; deserves its own session)
- Chunks 2 + 2.5 → one window together if context allows
- Chunks 3, 4a, 4b, 5 → one window each
- Chunks 6, 7, 8 → no Claude sessions needed (personal use + rollout + observation)

**Re-upload at each session start:**
- This masterplan (v4)
- Mockups or screenshots if doing UI work in 3 or 5

**Things that must be true before any chunk starts:**
- Latest version of this file is in the repo
- The schema state matches what's documented in §2.1
- Production DB target confirmed
- Reading order at top of §10 completed for the session

---

## 11. Naming and scope discipline

- Internal name in commits, comments, scope discussions: **note capture**.
- External name in UI: **Notes**.
- If scope discussion drifts toward "knowledge management," "second brain," "PKM," or similar: re-anchor on §0 (cohort segmentation experiment) and §6 (out of scope).

---

## 12. Changelog

**v4 (current)** — Two refinement passes integrated:

*Pass A: cross-LLM review (12 amendments)*

Critical correctness (data integrity & privacy):
1. Conditional UPDATE in §2.4 now guards BOTH `content` AND `note_draft_content`. v3 only guarded the draft, leaving saved-content edits during generation vulnerable to stale overwrites.
2. `generateConcepts` now runs on the sealed full content (post-divider, includes new draft), not pre-generation content. v3 contradicted its own §1 by generating concepts that omitted the new section.
3. Generate button is disabled when there are unsaved edits in either field. v3 didn't specify the dirty-state rule, leaving it possible to generate against stale persisted state.
4. Containment rule added (§1, §2.2): stats and study routes filter by `source_type='uploaded'` for non-flagged users. v3 claimed ripoutability but lacked the containment.

Implementation discipline:
5. Editor explicitly implemented as two separate controls/regions, not one concatenated textarea (§2.5).
6. NULL handling: `note_draft_content` stored as `''` on insert; app code normalizes NULL→'' on read; SQL uses app-computed strings, not nullable concat (§1, §2.1).
7. Privacy logging rule: logs never contain raw note text (§1, §2.4).

Abuse / robustness:
8. Per-user rate limit 30/hour on generate route (§1, §2.4, §5).
9. 50,000 char cap enforced server-side on Save and Generate (§1, §2.4).
10. Divider injection defense: strip/refuse divider markers from user input on Save (§1, §2.4, §5).
11. Concept generation is fail-soft: questions still ship even if concepts fails (§1, §2.4, §5).

Other:
12. Risk table typo fix (`node_draft_content` → `note_draft_content`); added new risks for prompt injection, rate-limit abuse, divider injection, fail-soft concepts, stale-token revocation, log privacy, browser-crash data loss.

*Pass B: codebase snapshot verification (May 18, 2026) — 6 refinements*

13. **`concepts_json` confirmed to exist** in live schema. Chunk 0 verification item removed.
14. **`question_count` is `NOT NULL`** — note creation must explicitly insert `question_count=0` (§2.2).
15. **First `publicMetadata` usage in the codebase** — Chunk 2 step 2 elevated from "verify, configure if not" to "configure explicitly." Risk row added (§5).
16. **Note question shape** — must include optional `concept_id` and `difficulty` fields per existing `questions` schema (§1 Generation model).
17. **Middleware layering** — notes flag check is an additional layer on top of the existing `auth.protect()` pattern, not a replacement (§2.3).
18. **`description`/`topic` on notes** — decision deferred to §7 open details; lean leave NULL for v1.
19. **Chunk 2.5 audit** — explicitly include `app/library/[id]/read/` focused reader; decide whether to block notes there.

**v3** — Three rounds of internal adversarial review. Locked decisions, isolated migration, ripoutable framing.
