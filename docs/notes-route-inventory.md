# Notes Feature — Route & Component Inventory

**Generated as part of:** Chunk 2.5 (masterplan v4)
**Branch:** `note-capture/chunk-2.5-audit`
**Prescribed behavior source of truth:** `docs/specs/notes-feature-masterplan-v4.md` §2.2 (modified routes) + §1 (containment rule)
**Audit step (this commit):** Step 1 of 4 — catalog only, no code changes.

## Column legend

- **Audited?** — code has been read and classified against the spec
- **Negative-path tested?** — endpoint has been hit by a flag-off second account with note rows existing, and confirmed no note-questions/notes surface. Empty for every row at end of Step 1 — Step 3 fills this column after Step 2 patches the gaps.

## How "Actual behavior" was determined

For each route/component, I read the file end-to-end plus every `lib/db/queries.js` function it calls. "Actual behavior re: notes" describes what the code does *today*, given the live schema after the Chunk 1 migration. Because no rows with `source_type='note'` exist yet, most "leak" gaps are dormant — they only activate once Chunk 3 starts inserting note rows. That's the whole point of doing this audit before Chunk 3.

## Audit table — API routes

| Route or component | Reads notes? | Writes notes? | Shows notes? | Requires flag? | Requires owner? | Actual behavior re: notes | Audited? | Negative-path tested? |
|---|---|---|---|---|---|---|---|---|
| `GET /api/documents/list` → `getDocumentLibraryStats` | yes (leaks) | no | yes (leaks) | no | yes | JOINs `documents` × `questions`, **no `source_type` filter** — once a flagged user creates a note, that note will appear in their `/library` card list. Non-flagged users can't reach this state today (only flagged users can create notes), but the route is the wrong shape per §2.2. | yes | |
| `GET /api/documents/browse` → `getPublicDocumentsForBrowse` | indirect | no | indirect | no | n/a (cross-user) | Filters `d.is_public = 1 AND d.user_id != ?`. Notes default to `is_public=0` per §1, so they are excluded by `is_public`. **No explicit `source_type='uploaded'` guard** — relies on the privacy rule holding (defense-in-depth missing). | yes | |
| `PATCH /api/documents/[id]` (topic edit) | yes (allows) | yes (allows) | n/a | no | yes | Owner-checked. Lets a note owner PATCH `topic`. Notes don't use `topic` (§7 leans NULL for v1), so the operation is meaningless but not a leak. **Note also:** §2.2 lists `GET /api/documents/[id]` (detail) — that route does not exist in this file (PATCH-only). The detail-read prescribed in §2.2 is effectively served by `/library/[id]/read` instead. | yes | |
| `POST /api/documents/adopt` | indirect | indirect | n/a | no | n/a (cross-user) | Checks `is_public` and refuses owner self-adoption. Notes are `is_public=0` so adopt fails with 403 ("Document is not public"). **No explicit `source_type='note'` rejection** — defense-in-depth missing per §2.2. | yes | |
| `PATCH /api/documents/set-public` → `setDocumentPublic` | yes | yes | n/a | no | yes | Owner-checked. **No `source_type='note'` rejection.** A flagged user could PATCH their own note to `is_public=1`, which then makes it eligible to surface anywhere that filters only by `is_public` (and `getPublicDocumentsForBrowse` filters only by `is_public`). This is the most direct path to a privacy violation. | yes | |
| `POST /api/documents/create` | no | no | no | n/a | yes | INSERTs without specifying `source_type`; column defaults to `'uploaded'`. Behavior correct by default. Notes are never created via this route — they will go through `/api/notes/create` (Chunk 3). | yes | |
| `DELETE /api/documents/delete` → `deleteDocument` | yes | yes | n/a | no | yes | Owner-scoped. Notes cascade-delete questions via the existing FK (notes share `documents` table). §2.2 says "works as-is, verify in audit." Verified. | yes | |
| `DELETE /api/documents/unadopt` → `deleteUserQuestionsByDocument` | yes | yes | n/a | no | yes (user's own questions) | Deletes user's own questions for `documentId`. On a note (where the user is also the document owner), this strips the note's questions without deleting the note row itself. Edge case — notes use `DELETE /api/notes/[id]` per §2.2, but this route doesn't refuse a note id. §2.2 says "verify it can't be called against a note." It can. Low-severity. | yes | |
| `GET /api/questions/session` → `getAllDueQuestions` | yes (leaks) | no | yes (leaks) | **no — should be conditional** | yes | Pure `SELECT * FROM questions WHERE user_id = ? AND next_review_at <= ... AND is_retired = 0`. **Containment missing per §1.** Once notes exist, note-questions will be served to *any* user (including flag-revoked users). | yes | |
| `POST /api/questions/grade` | yes | yes | n/a | no | yes | Owner-scoped (`question.user_id !== userId → 403`). Note-questions are owned by the note creator; non-owners can't grade them. §2.2 says "works as-is." Verified. | yes | |
| `POST /api/questions/retire` → `retireQuestionForUser` | yes | yes | n/a | no | yes | Owner-scoped. Works for note-questions same as upload-questions. §2.2 says "works as-is." Verified. | yes | |
| `POST /api/questions/prioritize` → `prioritizeDocumentQuestions` | yes | yes | n/a | no | yes | Owner-scoped UPDATE on `questions` by `(user_id, document_id)`. Works for notes. §2.2 says "works as-is." Verified. | yes | |
| `GET /api/stats/summary` → `getProgressStats` | yes (leaks) | no | yes (leaks) | **no — should be conditional** | yes (own user) | Multiple `SELECT ... FROM questions WHERE user_id = ?` queries and one `JOIN documents ON ... WHERE q.user_id = ?` for themes. **No `source_type` filter, no flag check.** Containment missing per §1. | yes | |
| `GET /api/stats/progress` → `getProgressPageData` | yes (leaks) | no | yes (leaks) | **no — should be conditional** | yes (own user) | 5 parallel queries against `questions`, `session_answers`, `study_sessions`, and one `documents` JOIN. **No `source_type` filter, no flag check.** Containment missing per §1. | yes | |
| `GET /api/stats/public` | yes (leaks) | no | yes (leaks) | n/a (public counter) | no | `SELECT COUNT(*) AS total FROM questions`. **No `source_type='uploaded'` filter.** Per §2.2, must exclude note-questions from the public counter — otherwise the public-facing total is inflated by private note material. Containment missing. | yes | |
| `POST /api/sessions/start` → `getAllDueQuestions` + `getUnreviewedQuestionsByDocument` + `getDocumentStatsForSession` | yes (leaks) | no | yes (leaks) | **no — should be conditional** | yes | Same root issue as `/api/questions/session`: pulls due questions with no `source_type` filter, then composes a session. `getDocumentStatsForSession` joins by document IDs derived from the unfiltered question set, so it would also surface note titles via `data.documentStats[docId].title`. **Containment missing per §1.** Not explicitly in §2.2's table, but covered by §3 Chunk 2.5 audit list (`app/api/sessions/*`). | yes | |
| `POST /api/sessions/complete` → `completeStudySession` + `getUserStreak` + `getAllDueQuestions` + `getCompletedSessionCount` + `awardMonthlyStreakCard` | yes (indirect) | yes | n/a | **no — should be conditional** | yes | Owner-scoped writes to `study_sessions`. **`remainingDueCount`** returned to the client comes from `getAllDueQuestions`, which leaks (see above). Not in §2.2, but covered by §3 audit list. | yes | |
| `GET /api/export` | n/a | no | n/a | no | yes | Returns 501 Not Implemented — no real handler. §2.2 says "Owner-only. Notes included for owner. Verify in audit." Not yet implementable; flag for revisit when the route is built (Chunk 5 polish or later). | yes (stub) | |
| `GET /api/notes/list` (Chunk 2 stub) | n/a | n/a | n/a | **yes** | n/a | Already gated: checks `sessionClaims.publicMetadata?.hasNotesAccess === true`, falls back to `currentUser()`. Returns `{ access: true }` on success, 403 on miss. Confirmed working in Chunk 2 (`STATE.md`). | yes | yes (Chunk 2) |

## Audit table — App pages

| Route or component | Reads notes? | Writes notes? | Shows notes? | Requires flag? | Requires owner? | Actual behavior re: notes | Audited? | Negative-path tested? |
|---|---|---|---|---|---|---|---|---|
| `app/page.js` (home) | yes (transitive) | no | yes (transitive) | no | yes (own user) | Server component. Calls `getUserContentCounts`, `getAllDueQuestions`, `getUpNextDocumentTitles`, plus `getUserStreak`/`getCompletedSessionCount`. Three of these leak note rows once notes exist: due count, "Up next" doc titles in the hero card, and the new-user heuristic (`documentCount === 0 && questionCount === 0` would correctly identify a note-having user as not new, since notes count in their `documents`/`questions` tables — OK). Once containment is patched, due-count + Up-next still need flag-aware filtering. Also calls `autoAdoptStarterDocIfFirstTime` (see lib section). | yes | |
| `app/library/page.js` | n/a (client) | no | depends on API | no | n/a | Pure fetch of `/api/documents/list` and render. Inherits whatever the API returns. Containment is upstream. | yes | |
| `app/library/[id]/read/page.js` (focused reader) | yes (renders) | no | yes (renders) | n/a | yes (via question ownership) | Calls `getAccessibleDocumentByIdForUser` — JOINs `documents` × `questions` on `q.user_id`. **A flagged user owns the questions for their own notes**, so this function returns the note row, and the page renders it as if it were an upload (markdown, TOC, etc.). **Per the prompt's locked decision: 404-block — route should check `source_type` and return `notFound()` if `'note'`, even for the owner.** Not currently doing that. | yes | |
| `app/library/[id]/read/StickyBackBar.js` | no | no | no | n/a | n/a | UI-only: sticky back-to-library bar. No document/question props or DB calls. | yes | |
| `app/library/[id]/read/TOCNav.js` | no | no | no | n/a | n/a | Takes a `headings` array derived from `document.content` upstream. Doesn't see the document object itself, doesn't render anything notes-vs-uploads-distinguishable. Pure render. | yes | |
| `app/library/[id]/read/layout.js` | no | no | no | n/a | n/a | Single-element layout wrapper, no DB. | yes | |
| `app/study/page.js` + `app/study/StudyView.js` | n/a (client) | no | depends on API | no | n/a | Suspense wrapper + client component. Fetches `/api/questions/session`, `/api/sessions/start`, `/api/sessions/complete`, `/api/questions/grade`, `/api/questions/retire`. Renders whatever the APIs return (question_text, document_title, etc.). Note-questions will surface here unfiltered today. Containment is upstream. | yes | |
| `app/progress/page.js` | n/a (client) | no | depends on API | no | n/a | Pure fetch of `/api/stats/progress` and render. Containment upstream. | yes | |
| `app/post-celebration/page.js` + `PostCelebrationView.js` | no | no | no | n/a | yes (just auth) | No document/question queries. Renders celebration scene + three CTAs (one routes to `/study?source=starter`). Notes-irrelevant. | yes | |
| `app/upload/page.js` | no | no | no | n/a | n/a | Client form, posts to `/api/documents/create`. Uploads only — never creates notes. Notes-irrelevant. | yes | |
| `app/browse/page.js` | n/a (client) | no | depends on API | no | n/a | Pure fetch of `/api/documents/browse` and render. Containment upstream. | yes | |
| `app/notes/page.js` (Chunk 2 stub) | n/a | n/a | n/a | **yes** | n/a | Server component gated by `middleware.js`. Renders "You have notes access ✓". Confirmed working in Chunk 2. | yes | yes (Chunk 2) |
| `middleware.js` | n/a | n/a | n/a | **yes (for `/notes*` and `/api/notes*`)** | n/a | Clerk middleware. Auth-protects all non-public routes; layers `hasNotesAccess` check on top for `/notes(.*)` and `/api/notes(.*)`. Uses `sessionClaims.publicMetadata` fast path with `currentUser()` fallback. Working in Chunk 2 (two-clock verified). | yes | yes (Chunk 2) |

## Audit table — Components

| Component | Reads notes? | Writes notes? | Shows notes? | Requires flag? | Requires owner? | Actual behavior re: notes | Audited? | Negative-path tested? |
|---|---|---|---|---|---|---|---|---|
| `Navigation.js` | no | no | no | yes (for Notes link) | n/a | Calls `useUser()`, conditionally appends Notes link to `LINKS` when `user?.publicMetadata?.hasNotesAccess === true`. Confirmed in Chunk 2. | yes | yes (Chunk 2) |
| `OnboardingCard.js` | no | no | no | n/a | n/a | Pure educational copy (two static modes by `completedSessions`). No DB, no document/question props. | yes | |
| `StreakCard.js` | no | no | no | n/a | n/a | Takes streak/level props (numbers only). No DB, no document/question props. | yes | |
| `CelebrationScene.js` | no | no | no | n/a | n/a | Visual effects (beams + stars + PixelDancer). No props that touch document/question. | yes | |
| `PixelDancer.js` | no | no | no | n/a | n/a | Pure SVG animation. No props. | yes | |
| `StarryBackground.js` | no | no | no | n/a | n/a | Pure visual. No props. | yes | |

## Audit subsection — `lib/` helpers that query `documents` or `questions`

Per the scope expansion: a notes-unaware DB helper called by an otherwise-correct route can still leak. Below is every helper in `lib/` that runs SQL against `documents` or `questions`, with notes-awareness classification.

### `lib/db/queries.js` — central DB module (notes-unaware top to bottom)

| Function | Tables touched | Used by | Notes-awareness gap | Required change at Step 2 |
|---|---|---|---|---|
| `insertDocument` | `documents` (write) | `/api/documents/create` | None — no `source_type` arg, defaults to `'uploaded'`. Correct for the upload path. | None for upload path. Notes will use a separate path/helper in Chunk 3. |
| `updateDocumentTopic` | `documents` (write) | `PATCH /api/documents/[id]` | Allows topic edit on a note. Topic is meaningless on notes (§7 leans NULL). | Low-priority. Either no-op for notes or reject at the route. |
| `insertQuestion` | `questions` (write) | upload path, adopt | None — works for any `source_type`. Notes will use it too in Chunk 4b. | None. |
| `getAllDueQuestions` | `questions` (read) | `sessions/start`, `questions/session`, home, `sessions/complete` (for remainingDueCount) | **No `source_type` filter, no flag awareness.** This is THE containment-critical helper per §1. | Add containment branch (flagged user → unchanged; non-flagged → JOIN `documents` and filter `source_type='uploaded'`). |
| `getUnreviewedQuestionsByDocument` | `questions` (read) | `sessions/start` (starter mode) | Scoped to a specific document; if the doc is a note, returns the note's unreviewed questions. Starter mode is only triggered by the FTUE deterministic doc id (not a note). So in practice safe today, but if anyone ever wires this up to call against a note, it would surface them. | Defensive: optional `source_type='uploaded'` filter or callers verify. Decide at Step 2. |
| `completeAbandonedSessions` | `study_sessions` (write) | `sessions/start` | Doesn't touch `documents`/`questions`. Notes-irrelevant. | None. |
| `retireQuestionForUser` | `questions`, `question_feedback` (writes) | `questions/retire` | Owner-scoped. Works for notes. | None. |
| `getDueQuestions` | `questions` (read) | (no current callers found) | Same leak shape as `getAllDueQuestions` but appears unused. | Either delete (dead code) or fix consistently. Note at Step 2. |
| `getQuestionById` | `questions` (read) | `questions/grade` | Returns any question; grade route then enforces ownership. Notes-irrelevant by itself. | None. |
| `updateQuestionAfterGrade` | `questions` (write) | `questions/grade` | Owner-scoped UPDATE. Works for notes. | None. |
| `createStudySession`, `getStudySession`, `completeStudySession`, `updateSessionCounts`, `insertSessionAnswer` | session tables | sessions/grade flow | Don't touch `documents`/`questions`. Notes-irrelevant. | None. |
| `getAllDocuments` | `documents` (read) | (no current callers found) | No `source_type` filter. Appears unused. | Dead code? Note at Step 2. |
| `getAdoptedDocuments` | `documents` × `questions` (read) | (no current callers found) | No `source_type` filter. Appears unused. | Dead code? Note at Step 2. |
| `getDocumentLibraryStats` | `documents` × `questions` × `session_answers` (read) | `/api/documents/list` | **No `source_type='uploaded'` filter.** Per §2.2, notes must not appear in Library. | Add `WHERE d.source_type = 'uploaded'`. |
| `getAccessibleDocumentByIdForUser` | `documents` × `questions` (read) | `/library/[id]/read` | **No `source_type` rejection.** A note owner gets their note back, which is then rendered in the upload reader UI. | Per the locked decision in the prompt: 404-block notes here. Either add `AND d.source_type = 'uploaded'` to the SQL (returns null → `notFound()`) OR add a check in the route page. |
| `deleteUserQuestionsByDocument` | `questions`, `session_answers` (writes) | `documents/unadopt` | Doesn't check `source_type`. Edge case — see route row. | Low-priority. |
| `deleteDocument` | `documents`, `questions`, `session_answers` (writes) | `documents/delete` | Owner-scoped. Works for notes. | None. |
| `getProgressStats` | `questions`, `study_sessions`, `documents` (read) | `/api/stats/summary` | **No `source_type` filter, no flag awareness.** | Add containment branch per §1. |
| `getPublicDocumentsForBrowse` | `documents` × `questions` (read) | `/api/documents/browse` | Filters `is_public=1`; **no explicit `source_type='uploaded'` guard.** | Add `AND d.source_type = 'uploaded'` for defense-in-depth. |
| `getDocumentById` | `documents` (read) | `documents/[id]` PATCH, `documents/adopt`, `documents/delete` | Returns any document by id, no filter. Callers then do their own checks. | None (callers are responsible). |
| `getQuestionsByDocumentAndUser` | `questions` (read) | `documents/adopt` | Scoped to `(documentId, uploaderUserId)`. Adopt route already refuses notes via `is_public` failure, so this is reached only for `source_type='uploaded'` rows in practice. | None. |
| `hasUserAdoptedDocument` | `questions` (read) | `documents/adopt` | Notes-irrelevant (adopt path is blocked upstream). | None. |
| `setDocumentPublic` | `documents` (write) | `documents/set-public` | **No `source_type='note'` rejection.** This is where the privacy leak originates if not patched. | Either: reject at the route handler, or filter in the helper. Route handler is the right layer per §2.3 defense-in-depth pattern. |
| `getDocumentStatsForSession` | `documents` × `questions` (read) | `sessions/start` | Returns title + mastery for a set of doc IDs. Notes' titles will surface for non-flagged users via `documentStats` if the doc IDs come from an unfiltered query. The fix is upstream (filter due-question set), not here. | None — upstream containment covers it. |
| `getUserStreak`, `awardMonthlyStreakCard`, `getCompletedSessionCount`, `getUserContentCounts` | `study_sessions`, `users`, plus simple counts | various | Don't filter documents/questions by source_type. `getUserContentCounts` returns total counts including notes — used for new-user redirect heuristic on home. A flagged user with notes correctly counts as "not new". OK. | None. |
| `getProgressPageData` | `questions`, `documents`, `session_answers`, `study_sessions` (read) | `/api/stats/progress` | **No `source_type` filter, no flag awareness.** | Add containment branch per §1. |
| `prioritizeDocumentQuestions` | `questions` (write) | `questions/prioritize` | Owner-scoped UPDATE. Works for notes. | None. |
| `exportAllData` | `documents`, `questions`, `study_sessions`, `session_answers` (read) | `/api/export` (currently 501) | Returns everything owner-scoped, no filter. §2.2 says notes should be included for the owner in export — so leaving as-is is correct *if* export gets implemented. | None until export is implemented. |
| `getUpNextDocumentTitles` | `documents` × `questions` (read) | home page hero card | **No `source_type` filter, no flag awareness.** Will surface note titles in "Up Next" copy for non-flagged users once notes exist. | Add containment branch per §1. |
| `ensureUser` | `users` (write) | every authed write | Notes-irrelevant. | None. |

### `lib/auto-adopt-starter.js` — FTUE write helper (notes-aware by accident)

Direct SQL: `SELECT FROM documents/questions` (reads the template), `db.batch` of `INSERT INTO documents (...)` + `INSERT INTO questions (...)`. **Does NOT specify `source_type` in the INSERT** — relies on the column default `'uploaded'`. The template doc (`TEMPLATE_DOC_ID`) is by definition `source_type='uploaded'` (it pre-dates notes), and the new rows inherit `'uploaded'` via the default.

**Verdict:** correct by default today. **Fragile assumption:** if anyone ever changes the column default or promotes the template to a note, the FTUE seed will silently mis-tag the new user's starter doc. Worth a one-line `source_type` explicit in the INSERT during Step 2, defense-in-depth.

### `lib/db/schema.js` — bootstrap schema (advisory gap, not containment)

The four Chunk 1 columns (`source_type`, `note_draft_content`, `last_generated_at`, `updated_at`) live only in `scripts/migrations/2026-05-18-add-notes-columns/migration.sql`, **not** in the bootstrap `CREATE TABLE documents` in `schema.js`. A fresh database initialized from `schema.js` alone would be missing them. This isn't a notes-containment issue — it's a maintenance hazard that the audit surfaces. Flagged here, not for Step 2.

### Other lib files (clean — confirmed no `documents`/`questions` SQL)

- `lib/db/client.js` — Turso client factory only.
- `lib/ai/generate-questions.js` — pure AI client (no DB; doesn't import `getDb` or `queries`).
- `lib/ai/classify-document.js` — pure AI client.
- `lib/upload-limits.js` — word/char constants.
- `lib/utils/auto-paragraph.js`, `lib/utils/clean-filename.js` — text utilities.

Verified via `grep -rn "getDb\|db.execute\|db.batch" lib/ app/`: the only direct-DB call sites outside `lib/db/queries.js` are `lib/auto-adopt-starter.js`, `app/api/stats/public/route.js`, and the rate-limit count inside `app/api/documents/create/route.js`. All accounted for above.

## Borderline components considered and skipped

Per Gio's clarification: list the borderline calls that didn't make the table.

- **`StickyBackBar.js`** — navigation chrome, takes no document/question prop. Skipped as plumbing.
- **`TOCNav.js`** — takes a `headings: [{level, text, id}]` array derived from a document's content upstream. It doesn't see the document object, can't tell upload from note, and renders only structural anchors. Skipped as plumbing.
- **`layout.js` under `app/library/[id]/read/`** — single-element wrapper, no props of interest. Skipped as plumbing.
- **`PixelDancer.js`, `StarryBackground.js`** — pure visuals, no props at all. Listed in the components table for completeness rather than skipped, since the prompt named "Any other component that takes a document or question object as a prop" — confirming-explicitly that they don't is the audit signal.

No components were dropped that render document/question content.

## Gaps identified

Grouped by severity. "Containment" = the §1 ripoutability rule. "Defense-in-depth" = §2.2 says to guard the route even when the natural failure mode already blocks the leak.

### Critical — direct privacy leak path

1. **`PATCH /api/documents/set-public`** does not reject `source_type='note'`. A flagged user could publish their own note. This is the *origin* of the leak chain — every downstream `is_public=1` reader (browse, public stats, adopt) would then have to defend. Fix at the source. (§2.2)

### Critical — containment (§1) missing on five core read paths

These five routes must filter by `source_type='uploaded'` for non-flagged users to make the feature actually ripoutable. Today they have no `source_type` awareness at all.

2. **`GET /api/questions/session`** → `getAllDueQuestions` — note-questions will surface in every user's study queue once notes exist.
3. **`POST /api/sessions/start`** → `getAllDueQuestions` + `getUnreviewedQuestionsByDocument` + `getDocumentStatsForSession` — note-questions composed into sessions, with note titles in `documentStats`.
4. **`GET /api/stats/summary`** → `getProgressStats` — note-questions counted in totals/mastery/accuracy for non-flagged users.
5. **`GET /api/stats/progress`** → `getProgressPageData` — note-questions counted in knowledge map, interval trend, activity calendar for non-flagged users.
6. **`GET /api/stats/public`** → bare `COUNT(*) FROM questions` — public counter inflated by every note-question across all users.

Plus transitive callers that inherit the leak via the unfiltered helpers above:

7. **`app/page.js` (home)** — due count and "Up next" titles pull from `getAllDueQuestions` and `getUpNextDocumentTitles`. Both leak. Once the helpers are patched (Step 2), home automatically inherits the fix.
8. **`POST /api/sessions/complete`** — `remainingDueCount` returned to the client comes from `getAllDueQuestions`. Same — inherits fix once the helper is patched.

### Critical — library/upload reader rendering notes

9. **`GET /api/documents/list`** → `getDocumentLibraryStats` — no `source_type='uploaded'` filter. Notes will appear as Library cards for their owners. §2.2 says notes never appear in Library.
10. **`app/library/[id]/read/page.js`** → `getAccessibleDocumentByIdForUser` — owners can navigate to `/library/<note-id>/read` and the route renders the note's content in the upload reader UI (markdown, TOC, "X min read" stats). Per the prompt's locked decision: **404-block**. Add `source_type='uploaded'` filter in the helper SQL (returns null → `notFound()` triggers in the page), or add a check in the page itself.

### High — defense-in-depth missing (functional failure-mode protects, but spec wants explicit guards)

11. **`GET /api/documents/browse`** → `getPublicDocumentsForBrowse` — filters `is_public=1`. Notes are `is_public=0` by §1, so they're excluded today. But if gap #1 is patched and ANOTHER bug ever flips a note to `is_public=1`, this is the second wall. §2.2 says to add `AND d.source_type = 'uploaded'`.
12. **`POST /api/documents/adopt`** — refuses non-public docs (so notes fail with the existing `is_public` 403). Adding an explicit `source_type='note'` rejection clarifies intent and survives any future change to the privacy assumption.

### Medium — minor cleanup / clarification

13. **`DELETE /api/documents/unadopt`** — can be called with a note id; will delete the note's questions without deleting the note row, leaving a question-less note. §2.2 says "verify it can't be called against a note." Today it can. Low-severity (only the owner can call it, and the result is non-destructive in any privacy sense). Reject if `source_type='note'`.
14. **`PATCH /api/documents/[id]` (topic edit)** — allows topic edit on a note. Topic is meaningless on notes. Either reject for notes or no-op. Cosmetic.

### Advisory — not in Chunk 2.5 scope to fix, but worth flagging

15. **`app/api/documents/[id]/route.js` has no GET handler.** §2.2 lists `GET /api/documents/[id]` (detail) as a route to modify. The detail-read flow is effectively served by `/library/[id]/read` instead. Either §2.2's table can be updated to reflect this, or a GET handler can be added later if needed. Not blocking.
16. **`lib/auto-adopt-starter.js`** does not specify `source_type` in its `INSERT INTO documents`. Correct by default today (column default `'uploaded'`), but fragile if the default ever changes or the template is promoted. One-line defensive fix.
17. **`lib/db/schema.js`** does not include the four Chunk 1 columns. Fresh-install bootstrap drifts from live schema. Maintenance hazard, not a notes-containment issue. Worth flagging.
18. **Dead-code candidates:** `getAllDocuments`, `getAdoptedDocuments`, `getDueQuestions` in `lib/db/queries.js` have no callers I could find. Either prune or fix consistently when patching siblings — decide at Step 2.

## Verification method (Step 3 — to be filled after Step 2 patches)

To be written after Step 2 lands. Plan, per Gio's prompt:

- **Agent clock:** re-read each patched route, confirm the containment filter is present and the SQL shape matches §1.
- **User clock:** with a second Clerk account that has `hasNotesAccess=false`, after notes have been created on the primary account, hit each modified endpoint via `curl` and the app UI, confirm zero note-questions in responses.

Negative-path testing is what counts. A flag-on response showing notes is expected; a flag-off response showing notes is the failure signal.
