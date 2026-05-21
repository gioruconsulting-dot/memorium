# Repetita — Notes Feature Masterplan v5 (Block redesign)

**Status:** Revised after two external LLM review passes (round 1 = UX, round 2 = technical correctness). Ready for chunk-level execution. Mockup is in `notes-redesign-mockups.html`.
**Internal name:** "note capture" (unchanged from v4 — see §11)
**External name:** Notes
**Production DB:** `memorium-recovery`
**Build philosophy:** Same as v4. Smallest reviewable chunks. Schema migration isolated. Feature still gated to test users.
**Compatible with:** `SESSION-STARTUP-CONTRACT.md`, `PRE-MORTEM-CHECKLIST.md`, `DATA-SANCTITY.md`.

**Version diff (v4 → v5):** see §12 Changelog. Biggest changes: data model (textual dividers → structured blocks), editor (two textareas → unified journal canvas), Generate semantics (seal draft only → regen stale blocks + seal draft in one transaction), Save (manual → autosave). Editing sealed content updates questions — moved out of v4's "out of scope" §6 list.

---

## 0. Framing

v4 shipped and validated the cohort experiment. Personal use across ~2 weeks surfaced three issues:

1. **Visual model fights data model.** Two textareas (saved + draft) made the seal boundary visible in chrome but not in structure. For daily multi-session journaling, the saved/draft duality felt clunky.
2. **Editing sealed content was a known gap.** v4 §6 explicitly punted to "v2 if requested." Real use confirms it's needed — typos, factual corrections, and clarifications in sealed text are routine.
3. **Manual Save creates anxiety** in a multi-session-per-day flow. Autosave is table-stakes.

v5 is a UX + correctness refactor. The cohort experiment, the access model (`hasNotesAccess`), the containment story, the privacy posture, and the kill criteria are unchanged. The product invariant from `DATA-SANCTITY.md` still holds: the question/SR graph is the product. Notes are inputs.

**What this is not:** not a re-scope, not a pivot toward PKM, not a feature expansion. Same surface area, restructured for daily-use fit.

---

## Amendments (post-audit)

Locked at end of Chunk 0 audit (2026-05-21). These four items refine the rollout and data-preservation plan without changing the architecture in §2. **Where they conflict with §1 or §3, amendments win.**

### Amendment A — `is_retired` handling

The live `questions` table already has `is_retired INTEGER NOT NULL DEFAULT 0` (confirmed in Chunk 0 live-schema verification). v5 adds `retired_at` and `retired_reason` **alongside** this column, not replacing it.

- `is_retired` stays for back-compat with any v4 code path that already reads it (thumbs-down retirement flow, etc.).
- `retired_at` and `retired_reason` provide the forensic detail v5 needs (when a question was retired and why — `'block_regenerated'` is the only v5 reason, future reasons may follow).
- After Chunk 3's Generate rewrite, the invariant `is_retired = (retired_at IS NOT NULL)` should hold for any question retired by a block regeneration. Older `is_retired = 1` rows (set by the v4 thumbs-down flow before this work landed) will have `retired_at = NULL`; that is expected and not a defect.
- **All new v5 reads filter on `retired_at IS NULL`** (the new, authoritative column). v4 code reading `is_retired` keeps working until its call sites are migrated as part of Chunks 2–3.

### Amendment B — Per-user wipe handling (refines §1 "Rollout")

§1 confirmed the wipe is acceptable in aggregate. The Chunk 0 audit broke it down per user and surfaced one at-risk case. Refined handling:

- **`user_3DXRFF0vJ83ZIQy2UiZsZHoYLRY` (2 notes, indicated to rely on the feature):** pre-Chunk-1, a full JSON snapshot of their notes data (documents + questions + session_answers) is exported to disk via `scripts/notes-v5-snapshot-at-risk-user.mjs`, validated, and held by the operator in two durable locations. Their data **is still wiped from production during Chunk 1** alongside the others (the migration deletes uniformly by `source_type='note'`), but **is restored via Chunk 8.5** once v5 is stable.
- **`user_3Ba5kqiLR8PNTCmPaDoaMLsoIMY` and `user_3DcjFr50Zvg0wMQ0RzjMGUGi15i` (1 note each):** plain-text export written via `scripts/notes-v5-plain-text-export.mjs`, emailed by the operator before Chunk 1. No restore.

All three users receive a heads-up message before any DDL fires.

This supersedes §1's earlier line about "1-line JSON export of each tester's notes content (titles + concatenated content), emailed before the migration" — same intent, two formats now keyed to risk level.

### Amendment C — Chunk 8.5 added to build chunks

See §3 Chunk 8.5 for the full restore plan. Amendment C is preserved as a pointer for the audit trail.

**Updated by Amendment E**: Chunk 8.5 now follows Chunk 7.5 immediately (same operation window), not weeks later. The original ~2-4 week downtime window for the at-risk user is reduced to ~30 minutes.

### Amendment D — Stop conditions added to Chunk 7.5 pre-flight

Beyond the existing PRE-MORTEM-CHECKLIST gates (Backup Freshness, Expected-Delta Manifest, Four-Level Verification), Chunk 7.5 STOPS if **any** of the following is not satisfied. A `docs/specs/notes-v5-chunk-7-5-preflight.md` will be created when Chunk 7.5 is planned; these become its checkboxes:

1. PITR availability on `memorium-recovery` has not been re-confirmed via the Turso dashboard within the last 24 hours of Chunk 7.5 starting.
2. The at-risk user's JSON snapshot has not been validated — either the snapshot script (`scripts/notes-v5-snapshot-at-risk-user.mjs`) has not been run, or it ran but the internal record-count + sample-row validation did not pass.
3. The other two users' plain-text exports have not been written and emailed by the operator.
4. Heads-up messages have not been sent to all three affected users (`user_3DXRFF0vJ83ZIQy2UiZsZHoYLRY`, `user_3Ba5kqiLR8PNTCmPaDoaMLsoIMY`, `user_3DcjFr50Zvg0wMQ0RzjMGUGi15i`).

### Amendment E — Expand-contract split of Chunk 1

The masterplan as written bundled additive DDL and destructive DELETE into one Chunk 1, violating the expand-contract rule from `PRE-MORTEM-CHECKLIST.md`. Split into two operations:

- **Chunk 1a — Expand (additive DDL only)**: Create `note_blocks`, add `documents.note_version`, add `questions.block_id` / `retired_at` / `retired_reason`, add indexes. v4 notes remain fully functional. No user data touched. Runs early in the build.
- **Chunk 7.5 — Contract (destructive wipe)**: `DELETE FROM documents WHERE source_type='note'`. Runs immediately before v5 ships, after personal-use week. v4 notes break for ~30 minutes during ship; at-risk user's data restored at Chunk 8.5 in the same window.

Rationale: v4's code reads `documents.content` for notes and ignores the new v5 columns. The new columns are nullable / have defaults. v4 keeps working during the entire build period. The destructive operation is therefore unnecessary at the start of the build — it only needs to happen just before v5 starts reading from `note_blocks` instead of `documents.content`.

Effect on affected users:
- At-risk user (`user_3DXRFF0vJ83ZIQy2UiZsZHoYLRY`): keeps using v4 notes through the build period. Loses access for ~30 min during Chunk 7.5 → 8.5 sequence. Data restored.
- Plain-text users: keep using v4 notes through the build period. Lose access permanently at Chunk 7.5. Receive .txt export at that moment (not earlier).
- The JSON snapshot and .txt exports produced today (2026-05-21) become development artifacts — they validate the scripts work but are not the canonical restore source. Chunk 7.5 will produce fresh exports.

---

## 1. Decisions locked

Settled in this round. Change requires re-running adversarial review.

### Design direction

Notes should feel like a calm field notebook, not a document editor. Closer to Apple Notes / Day One than Notion / Obsidian. The product north star:

> Notes is not where knowledge lives. Notes is where raw material becomes memory.

Principles:
- Draft is the visual hero. History is quiet but accessible.
- Memory actions (Generate, Study) are explicit and confident.
- Status is visible but never noisy.
- Mobile thumb ergonomics matter more than dense desktop controls.
- Avoid PKM aesthetics: no graph view, folders, backlinks, slash commands, databases.

Visual treatment (within existing dark theme + purple accent):
- Three layers: **history** (muted cards, soft borders, small date label), **capture** (larger textarea, warmer surface, prominent placeholder, word count, autosave state), **action** (sticky footer, strong primary Generate button, post-action CTAs).
- One accent color reserved for memory actions (Generate / Study).
- Muted badges for system state. Destructive actions never compete visually with habit-forming actions.
- Generous textarea line-height and padding. Optimize for long-form writing comfort.

### Product

Unchanged from v4:
- `documents` table shared with uploads via `source_type`.
- Notes strictly private. Never browsable, never adoptable, never public.
- `/notes` surface separate from Library.
- Note-questions appear in study sessions (gated by flag containment from v4 §1).
- Personal stats include note-questions; public stats do not.
- All gating, middleware, containment logic from v4 §1 and §2.3 preserved as-is.

New in v5:
- **Sealed content is structured into blocks** (one block per Generate session), not a single concatenated string with textual dividers.
- **Editing a sealed block is allowed.** Editing flags the block stale. Next Generate regenerates its questions.
- **Autosave replaces manual Save** for both draft and edited blocks.

### Editor model — journal canvas

- One vertically-scrolling canvas. Sealed blocks render at top, oldest first. Active draft input is sticky-bottom on mobile, anchored at end of scroll on desktop.
- Each sealed block renders with a small timestamp header (e.g., `May 20`) and a muted color treatment to signal sealed state.
- **Edit affordance — locked**: visible `Edit` button per sealed block is the **only** entry point to edit mode. Tap or click on block body does nothing (avoids accidental mode-entry while reading or scrolling). On desktop, button is always visible in the block corner; on mobile, same — always visible, not hover-revealed.
- Edit mode is a textarea-on-focus in place. Exit via an **inline "Done" button** rendered below the editing block (NOT relying on iOS keyboard accessory bar, which is unreliable on mobile web).
- The draft input is always in edit mode. No mode switch.
- **Needs-refresh indicator:** subtle badge or accent border on blocks where `is_stale = 1`. UI label is **"Needs refresh"** (column name `is_stale` stays in code/DB — frame is technical state, UI is "your improvement needs to flow through"). Cleared on next successful Generate.
- **Open behavior:** auto-scroll to draft. Cursor lands in draft. History is one scroll up.
- **Empty note state:** only draft area visible, with placeholder.

### Block model — definitions

- One block per successful Generate session. Plain text. No markdown rendering. No media.
- Block ordering is `sealed_at ASC, id ASC` (id as deterministic tie-breaker), set once at creation, never changed afterwards. No manual reorder in v1.
- Editing a block flips `is_stale = 1` *(if and only if content actually changed from stored value; see §2.4)*. On the **first** edit that flips the flag, server also records `stale_since = NOW`. Subsequent edits to a still-stale block don't bump `stale_since` — preserves "how long has this been pending refresh," which is the queue ordering key.
- Each block carries a monotonic `version` integer (see §2.4 — concurrency primitive).
- Reverting an edit back to the previously sealed content does NOT auto-unstale. Block stays stale until next Generate. (Simplicity over precision; cost is small.)
- Empty edited block (block trimmed to empty content) is kept, not auto-deleted. v1 surfaces a small "delete block" button on stale empty blocks. Rare edge case; keep simple.

### Stale, regeneration, and question history preservation

**Critical product invariant** *(restored — earlier draft of v5 violated this)*: the question/SR graph is the product. Regeneration **retires** old questions; it never deletes them. This preserves review history (`session_answers`, `question_feedback`), which is the actual product asset.

- On Generate, for each regenerated stale block: **retire its existing active questions** (`UPDATE questions SET retired_at = NOW, retired_reason = 'block_regenerated' WHERE block_id = ? AND retired_at IS NULL`), then **insert new active questions**. Study and session queries filter `WHERE retired_at IS NULL`. Personal stats can still surface historical retired questions if useful.
- New draft (if it meets min-words) gets sealed as a new block with new questions. All writes in one real transaction.
- If draft is empty or below min-words AND no stale blocks exist → Generate is disabled.
- If only stale blocks exist (no new draft) → Generate runs to clear them only.
- **Soft cap: 5 stale blocks per Generate click.** Selection order: `stale_since ASC, sealed_at ASC, id ASC` (oldest-stale first matches user intent better than oldest-sealed). Surfaces queue: *"Refreshed 5 of N blocks. Click Generate again to refresh the rest."* No dead-end.
- Concept regeneration on every Generate, fail-soft (unchanged from v4).
- **NoDistinctMaterialError on a stale block during multi-block regen:** block stays `is_stale = 1`, existing active questions remain un-retired, AI cost on that block is absorbed. Surfaced in toast with explicit copy: *"1 block still needs refresh because it didn't contain enough distinct material. Add more detail or remove it."* Not framed as "skipped" — frames the user's next action.

### Autosave-flush before Generate

**Locked rule** *(was open in earlier draft; now decided)*: before Generate fires, the client synchronously flushes all dirty local state — title, draft, currently-editing block. Generate is disabled while:
- any save is in flight, OR
- a debounced save is pending (timer active), OR
- a 409 recovery panel is showing, OR
- the last save returned an error.

If flush succeeds → Generate proceeds. If flush returns 409 → Generate is cancelled, recovery panel takes over. Removes a whole class of races without complex server-side reconciliation.

### Generate preview and post-Generate experience

**Pre-Generate preview** — progressive disclosure based on complexity of what Generate will do:

- **Simple case** (only draft, no stale blocks, draft ≥ min-words): single-line label on Generate button — *"Generate · 230 new words"*.
- **Mixed case** (draft + stale OR multiple stale OR queued stale): preview surface appears above the button:
  ```
  Ready to generate
  • 230 new words → new questions
  • 1 block needs refresh → questions replaced
  [ Generate ]
  ```
- **Stale-only case** (no draft above min-words, but ≥1 stale): *"Refresh 1 block · old questions will be replaced"* on the button.
- **Cap exceeded** (>5 stale): preview names what will happen — *"Refresh 5 of 7 blocks now. Generate again after for the rest."*

The preview reduces "what does this button do?" anxiety. For routine simple cases, no extra UI noise.

**Post-Generate experience** — the bridge back to the memory loop:

After successful Generate, the toast/transition surfaces both the outcome and the next memory action:

```
✓ 6 new questions  ·  12 refreshed
[ Study these now ]  [ Keep writing ]
```

- ***Study these now*** → study session **filtered to this note's currently-active questions** (`block_id IN this_note's_blocks AND retired_at IS NULL`). Locked for v1. Upgrade path to "questions from this Generate action only" deferred to v1.1 if a tester reports the broader scope feels wrong.
- *Keep writing* → returns focus to the (now empty) draft input.
- The animation: draft text slides up into the canvas as a new sealed block with today's date; any "Needs refresh" badges clear with a brief fade.

This is the most product-critical moment in the feature. Notes is not a writing destination — it's a capture surface that converts material into memory. The post-Generate state must keep pointing back to the study loop, not leave the user stranded admiring their note.

### Autosave

- **Debounce: 3 seconds after last keystroke.** Single timer per editing surface (draft and any one open block).
- **Endpoint:** `PATCH /api/notes/[id]` accepts `{ title?, draft?, note_version?, blocks?: [{id, content, version}] }`. Each field independently optional.
- **Concurrency primitive: monotonic integer `version`, not `updated_at`** *(updated_at in Unix seconds can collide on same-second writes and bypass conflict detection)*. Each `note_blocks` row carries a `version` column, incremented on every write. `documents` carries `note_version` covering draft + title. Server uses conditional updates: `UPDATE ... SET ..., version = version + 1 WHERE id = ? AND version = ?`. If `rowsAffected != 1` → 409. `updated_at` is retained for display only.
- **409 recovery behavior**: on 409, client (a) writes pending local edit to `sessionStorage` *(survives accidental reload during conflict; cleared on dismiss/copy)*, (b) refetches latest server state into the canvas, (c) surfaces a **recovery panel** above the draft with the local edit visible. Copy: *"This note changed elsewhere. We refreshed it and kept your unsaved edit below — copy what you need, then dismiss."* User manually copies. No auto-merge in v1.
- **Saving indicator:** near title. States: idle, "Saving…", "Saved", "Save failed — retry."
- **Window close:** any pending debounced state flushed via `navigator.sendBeacon` (best-effort).
- **Stale flag flip:** server-side compare. If incoming block content equals stored content → don't flip stale, don't bump version. Otherwise flip `is_stale = 1`, set `stale_since = NOW` if previously not stale, bump version.

### Generation transaction

1. **Client precondition**: autosave-flush has succeeded (see "Autosave-flush before Generate" rule above). Generate would not have fired otherwise.
2. Validate (server): auth, flag, ownership, `source_type='note'`, rate limit, size cap, work-to-do (≥1 stale OR draft meets min-words). Stale-count cap applied as soft limit (process 5 oldest by `stale_since ASC, sealed_at ASC, id ASC`).
3. Read full note state: all blocks (id, content, version, sealed_at, is_stale, stale_since), draft, document `note_version`.
4. AI calls (outside transaction, no DB lock held):
   - For each selected stale block: `generateQuestionsForDelta(block.content, title)`. Parallel up to 5.
   - If draft meets min-words: `generateQuestionsForDelta(draft, title)`.
   - `generateConcepts(fullSealedText, title)` where `fullSealedText` = current block contents + draft. Fail-soft.
5. Per-block failure handling: NoDistinctMaterialError → mark "still-needs-refresh" (existing questions stay un-retired), continue. Hard AI failure on a block → abort whole Generate, no DB writes, surface 502.
6. **Single real transaction** wraps all writes:
   - Re-read **block `version` values** for each block being regenerated. If any differ from step 3 → rollback, return 409 `note_changed`.
   - If draft sealing is involved, also re-read **`documents.note_version`**. If differs from step 3 → rollback, return 409. *(Closes the "tab B autosaved newer draft while tab A was generating" race.)*
   - For each regenerated stale block: `UPDATE questions SET retired_at = NOW, retired_reason = 'block_regenerated' WHERE block_id = ? AND retired_at IS NULL`, `UPDATE note_blocks SET content=?, is_stale=0, stale_since=NULL, version=version+1, updated_at=NOW WHERE id=?`, insert new questions with `block_id`.
   - If draft was regenerated: insert new `note_blocks` row (with `version=1`), insert new questions, `UPDATE documents SET note_draft_content='', note_version=note_version+1, updated_at=NOW`.
   - `UPDATE documents SET concepts_json=?, last_generated_at=NOW` (concepts may be null on fail-soft).
7. Return `{ regenerated_blocks: [ids], new_block_id?: id, new_question_count, still_needs_refresh: [ids] }`. UI shows toast, clears badges for regenerated blocks, animates new block in, surfaces still-needs-refresh copy if any.

### `documents.content` deprecation for notes

Per decision in conversation: leave column as-is, mark deprecated in code for `source_type='note'`. Read paths for notes use `note_blocks`; uploaded-doc reads unchanged.

### Rate limit and cost

- 30 generations/hour per user (unchanged from v4). A "generation" is one Generate click, regardless of stale-block count within it.
- 5-stale-per-Generate cap bounds the inner blast radius.
- Together, worst-case Claude calls per hour per user: 30 clicks × (1 draft + 5 stale + 1 concepts) = 210 calls/hour. Acceptable. Concept call is fail-soft and cheap.

### Privacy, logging, NULL handling

Unchanged from v4. Logs include new metrics: `{ regenerated_block_count, new_block_questions, skipped_block_count, total_block_count }`. Still no raw text in logs.

### Gating

Unchanged from v4. `hasNotesAccess` controls all access.

### Rollout

- **v5 migration is destructive for existing notes.** Confirmed acceptable: 3 testers, ~15 notes total, feature gated. Uploaded documents are not touched. **Note:** per-user handling has been refined post-audit — see Amendment B for which users get JSON snapshot (with eventual restore at Chunk 8.5) vs. plain text export.
- Optional courtesy: 1-line JSON export of each tester's notes content (titles + concatenated content), emailed before the migration. Adds ~15 min; preserves goodwill. Lean: do this.
- Personal-use week before any tester is re-flagged (same as v4 §1).
- Then re-enable 1-3 external testers with explicit notice: "We rebuilt notes. Your old notes are gone (we sent you a copy). Try the new version."

---

## 2. Architecture

### 2.1 Schema migration

```sql
-- New table for sealed note content blocks
CREATE TABLE note_blocks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  sealed_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  is_stale INTEGER NOT NULL DEFAULT 0,
  stale_since INTEGER,                          -- set when is_stale flips 0→1; null when sealed
  version INTEGER NOT NULL DEFAULT 0             -- monotonic, concurrency primitive
);
CREATE INDEX idx_note_blocks_document ON note_blocks(document_id, sealed_at);
CREATE INDEX idx_note_blocks_stale ON note_blocks(document_id, is_stale, stale_since);

-- Document-level version for draft/title concurrency (covers Generate's draft-sealing race)
ALTER TABLE documents ADD COLUMN note_version INTEGER NOT NULL DEFAULT 0;

-- Question history preservation (replaces hard-delete on regen)
ALTER TABLE questions ADD COLUMN block_id TEXT REFERENCES note_blocks(id) ON DELETE CASCADE;
ALTER TABLE questions ADD COLUMN retired_at INTEGER;       -- null = active; set on retirement
ALTER TABLE questions ADD COLUMN retired_reason TEXT;       -- 'block_regenerated' | future reasons
CREATE INDEX idx_questions_block ON questions(block_id);
CREATE INDEX idx_questions_active ON questions(document_id, retired_at);

-- Wipe existing note data (confirmed acceptable per user)
DELETE FROM documents WHERE source_type = 'note';
-- Cascades automatically: questions (via document_id), session_answers, question_feedback
```

Notes:
- Uploaded-doc rows unchanged. Their questions keep `block_id = NULL`.
- For notes going forward: `documents.content` will be `''`; `documents.note_draft_content` still used for draft; `documents.concepts_json` still used for note-level concepts.
- `documents.last_generated_at`, `documents.updated_at` semantics unchanged.
- Pre-existing schema drift (`documents.is_public` exists in live DB but missing from schema file) — note in Chunk 0 verification; do not attempt to fix in v5 scope.

### 2.2 Routes

| Route | v5 change |
|---|---|
| `POST /api/notes/create` | Unchanged — creates empty `source_type='note'` doc |
| `GET /api/notes/list` | Unchanged |
| `GET /api/notes/[id]` | **NEW** — returns `{ title, draft, note_version, blocks: [{id, content, sealed_at, version, is_stale, stale_since}] }`. All read queries filter questions by `retired_at IS NULL` unless personal-history view is invoked. |
| `PATCH /api/notes/[id]` | **CHANGED** — accepts `{ title?, draft?, note_version?, blocks?: [{id, content, version}] }`. Per-row optimistic concurrency on `version`. Document-level concurrency on `note_version` for title/draft. Returns updated state with new versions. Removes v4's divider-injection defense (no longer relevant). |
| `POST /api/notes/[id]/generate` | **REPLACED** — implements §1 generation transaction. |
| `DELETE /api/notes/[id]` | Unchanged. Cascade chain unchanged: documents → questions → session_answers, question_feedback. `note_blocks` also cascades via `document_id`. |
| `GET /api/questions/session`, stats routes | Unchanged. Containment from v4 still works (joins through `documents` for non-flagged users). `block_id` column ignored by these queries. |

### 2.3 Gating

Unchanged from v4 §2.3. No changes to middleware, `useUser()` Navigation logic, or session-token plumbing.

### 2.4 Autosave plumbing — details

**Client state shape:**
```js
{
  title: string,
  draft: string,
  blocks: Map<id, { content, version, is_dirty }>,
  note_version: number,
  saving: boolean,
  saveError: null | string,
  recoveryPayload: null | { text, originalVersion, dismissedAt }  // sessionStorage-backed
}
```

**Debounce timer:** single timer per surface (draft and at most one block in edit mode). On fire, PATCH includes only dirty fields with last-known `version` (per block) and `note_version` (for title/draft). Single in-flight request; if another change fires during, coalesced into the next debounce.

**Conflict (409) handling:** (1) Write the unsent local payload to `sessionStorage` keyed by note id. (2) Refetch full note via `GET /api/notes/[id]`. (3) Render recovery panel above the draft, populated from `sessionStorage`. (4) User manually copies what they need; clicking *Dismiss* clears `sessionStorage`. No auto-merge in v1. The `sessionStorage` step is what makes the recovery story survive accidental reload mid-conflict — in-memory alone would lose it.

**Stale flag flip logic:** server-side. On PATCH with block content update, compare incoming `content` to stored. If equal → don't flip `is_stale`, don't bump `version`. If different → flip `is_stale=1`, set `stale_since=NOW` if previously not stale, bump `version`. Edit-and-immediately-revert (within one debounce window) won't stale; later revert won't auto-unstale (acceptable v1 simplification).

**Flush-before-Generate** *(client-side, locked rule, see §1)*: Generate button is disabled while autosave is dirty/in-flight/failed/in-recovery. On Generate click, client awaits an explicit `flushAutosave()` promise before issuing the Generate POST. If flush fails → Generate cancelled, recovery panel takes over.

**beforeunload:** flush pending state via `navigator.sendBeacon` with `keepalive: true` fetch fallback. Best-effort.

### 2.5 Generation transaction — implementation notes

- AI calls happen BEFORE the transaction starts. Never hold a DB transaction across AI calls (Turso/libSQL `transaction("write")` holds the write lock; cost is real).
- Inside the transaction:
  - **Re-check block `version` for every block being regenerated.** Conditional `UPDATE` with `WHERE version = ?`; verify `rowsAffected == 1`.
  - **Re-check `documents.note_version` if draft is being sealed or title was part of the AI input.** Conditional update; rollback on mismatch.
  - Question retirement: `UPDATE questions SET retired_at = NOW, retired_reason = 'block_regenerated' WHERE block_id = ? AND retired_at IS NULL`. Then insert new active questions.
- Implementation choice: prefer libsql `client.batch([...], "write")` for atomicity if the logic can be expressed as a fixed statement sequence (it usually can — versions are known by step 6). Reserve `client.transaction("write")` (interactive) for branching that's only knowable mid-tx, and keep its duration short.
- This fixes v4's A/B split bug (where Step A could commit without Step B): one atomic unit, full rollback on any failure inside.
- Block-level `version` granularity makes concurrent edits to *different* blocks coexist cleanly. Cross-block conflicts (e.g., one Generate + one stale-block edit) resolve via 409 to whichever loses the race.

### 2.6 Editor UI structure

**Three visual layers** (per design direction in §1):

- **History layer** — sealed blocks. Muted card surface, small date label, soft border, no heavy chrome. "Needs refresh" badge appears in block header when applicable. Visible `Edit` affordance in block corner (small ghost button or pencil icon) — tap or click anywhere in block enters textarea-on-focus edit mode; the visible affordance is the discoverability signal.
- **Capture layer** — active draft input. Larger textarea, warmer surface, prominent placeholder, live word count, autosave state. This is the visual hero.
- **Action layer** — Generate (and post-Generate CTAs). Sticky footer on mobile, anchored at end of canvas on desktop. Generate label is state-aware (see §1 Generate preview).

**Layout (vertical, top to bottom):**

```
┌─────────────────────────────────────────────┐
│ ← Notes        [Title]        Saved · 09:42 │
├─────────────────────────────────────────────┤
│                                             │
│  May 18                                     │
│  ┌───────────────────────────────────────┐  │
│  │ Sealed block content…       [✎ Edit]  │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  May 19                  ● Needs refresh    │
│  ┌───────────────────────────────────────┐  │
│  │ Sealed block content (edited)…[✎ Edit]│  │
│  └───────────────────────────────────────┘  │
│                                             │
│  ─── Draft ───                              │
│  ┌───────────────────────────────────────┐  │
│  │ Active draft input…                   │  │
│  │                            230 words  │  │
│  └───────────────────────────────────────┘  │
├─────────────────────────────────────────────┤
│ Ready: 230 new words + 1 block to refresh   │
│ [ Generate ]                                │
└─────────────────────────────────────────────┘
```

**Mobile specifics:**
- Footer Generate is fixed above the safe-area inset. Draft sits above the footer; keyboard pushes draft input up over sealed blocks.
- Tap the **visible `Edit` button** to enter edit mode (locked: not tap-anywhere — see §1). `scrollIntoView` snaps the editing block above the keyboard. Exit edit mode via an **inline "Done" button** rendered below the editing block (NOT iOS keyboard accessory bar, which is unreliable on mobile web).
- Recovery panel (on 409) anchors above draft, dismissible.

**Desktop specifics:**
- Same logical structure. Generate footer can be inline at bottom of canvas rather than fixed (decide at mockup).
- `Edit` button always visible per block (consistent with mobile; not hover-only — discoverability over chrome minimalism).

---

## 3. Build chunks

### Chunk 0 — Pre-flight + plan socialization

- Re-read SESSION-STARTUP-CONTRACT, PRE-MORTEM-CHECKLIST, DATA-SANCTITY.
- Confirm Turso PITR available.
- Confirm tester list (currently 3) and prepare courtesy export script for their notes.
- Note pre-existing schema drift (`is_public` column) for documentation purposes; do not fix here.
- Commit this masterplan (v5) to repo.

### Chunk 0.5 — Technical invariants lock *(added round 2)*

Confirm in code/docs *before* schema migration runs, since several decisions affect column shape:

- **Question retirement, not deletion** (retire-on-regen via `retired_at`, `retired_reason`; read filters `WHERE retired_at IS NULL`).
- **`version` columns** on `note_blocks` and `documents.note_version`; `updated_at` is display-only.
- **`stale_since` column** on `note_blocks`; queue-order key on Generate soft cap.
- **Flush-before-Generate** client rule + Generate disabled states.
- **Block-id FK cascade tests** (see Chunk 1).
- **Study filter semantics**: "Study these now" → `block_id IN (this_note's_blocks) AND retired_at IS NULL`.
- **Ordering tie-breaker**: all block reads use `ORDER BY sealed_at ASC, id ASC`.
- **Recovery panel** uses `sessionStorage` for the local pending payload (not just in-memory).

### Chunk 1a — Schema expand (additive DDL only)

**Tier 3** (production schema change, additive). Branch-first per `PRE-MORTEM-CHECKLIST.md`.

Operations:
- Add `note_blocks` table + indexes (document/sealed_at, document/is_stale/stale_since).
- Add `documents.note_version INTEGER NOT NULL DEFAULT 0`.
- Add `questions.block_id TEXT REFERENCES note_blocks(id) ON DELETE CASCADE`.
- Add `questions.retired_at INTEGER` (nullable; alongside existing `is_retired`).
- Add `questions.retired_reason TEXT` (nullable).
- Add indexes `idx_questions_block` and `idx_questions_active`.

**Critical**: NO destructive operations. NO `DELETE FROM documents`. v4 notes feature remains fully functional throughout.

Verification:
- Expected-delta manifest: every row count UNCHANGED. Only schema-level intent verified.
- Four-level verification scope simplified: Level 1 (counts unchanged for all blast-radius tables), Level 2 (no orphaned FKs introduced — new `block_id` FK starts NULL for all existing rows), Level 4 (v4 notes feature still works on branch — open a note, save, generate questions).
- Two-clock verification before production: agent confirms schema, operator confirms v4 notes still work in the app pointing at the branch.

FK cascade tests (subset of original Chunk 1 list — without note_blocks data, only schema correctness needed):
1. Verify `note_blocks` table created with correct FK shape; manually insert a test row then delete to confirm FK acts but no real data harmed.
2. Verify `questions.block_id` FK behavior: a hypothetical block delete cascades correctly.
3. Verify existing v4 cascade still works (uploaded doc → questions → session_answers).

Reference: see migrations/notes-v5-schema-expand.sql.

### Chunk 2 — Backend: GET + PATCH refactor + autosave plumbing

- Build `GET /api/notes/[id]` returning the structured shape with `version` and `note_version`.
- Rewrite `PATCH /api/notes/[id]` for the new payload. Per-row optimistic concurrency on `version`; document-level on `note_version`.
- Remove divider-injection defense (no longer relevant).
- 50K combined char cap now sums across all block content + draft, server-enforced.
- Verify: multi-tab autosave conflict produces 409; client sessionStorage recovery panel renders correctly.

### Chunk 3 — Backend: Generate refactor

- Implement §1 Generation transaction in a single atomic write (libsql `batch(..., "write")` preferred).
- In-transaction re-check of every regenerated block's `version` AND `documents.note_version` when draft is involved.
- **Retire-not-delete** for regenerated blocks' active questions.
- Parallel per-block AI calls, up to 5 (soft cap).
- NoDistinctMaterialError per-block "still-needs-refresh" handling (questions stay un-retired, block stays stale).
- Stale selection by `stale_since ASC, sealed_at ASC, id ASC`.
- Rate limit check unchanged.
- Tests: stale-only, mixed, still-needs-refresh, conflict-during-generation (both block-version and note-version flavors), retirement-preserves-history.

### Chunk 4 — Frontend: journal canvas (read + draft-only edit)

- New canvas layout component.
- Render sealed blocks read-only with timestamps and stale badges.
- Draft input wired to autosave.
- Saving indicator near title.
- State-aware Generate button (label + disabled states).
- Mobile + desktop responsive pass.

### Chunk 5 — Frontend: in-place edit for sealed blocks

- Visible `Edit` button per block (always visible, both mobile and desktop). Block body tap does NOT enter edit mode (locked v5 — accidental mode entry while scrolling/reading is the failure case).
- Edit mode visual state (border accent, inline cursor).
- **Inline "Done" button** rendered below the editing block to exit. Not relying on iOS keyboard accessory.
- Autosave for edited block content (3s debounce, same plumbing as draft, with `version` re-check).
- "Needs refresh" badge appears after server confirms `is_stale=1`.
- 409 conflict handling UI: `sessionStorage`-backed recovery panel above draft; manual copy + dismiss.
- Mobile keyboard handling: `scrollIntoView` on focus to keep editing block above keyboard; verify on iOS Safari with sticky footer.

### Chunk 6 — Frontend: post-Generate flow + Notes list redesign + polish

**Generate moment:**
- Pre-Generate preview (progressive disclosure per §1): simple-case button label vs. expanded multi-line summary for mixed cases.
- Loading state during multi-block regen with progress hint ("Refreshing 3 blocks…").
- Post-Generate animation: draft seals into new block at end of history, "Needs refresh" badges fade out, new block fades in with today's date.
- Post-Generate state with two CTAs: **Study these now** (jumps to filtered study session) and **Keep writing** (returns focus to empty draft). Toast confirms counts: *"6 new questions · 12 refreshed."*

**Error states:** 429 (rate limit), 422 (nothing to do, size exceeded), 409 (note changed, with recovery panel), 502 (AI failed). Each has specific copy, not generic "something went wrong."

**Notes list (`/notes`) redesign:**
- Sort by `COALESCE(updated_at, created_at) DESC`.
- Per-note card metadata: relative time (*"updated 12 min ago"*), draft word count if non-empty, count of blocks needing refresh, count of due questions. Example: *"Atomic Habits · updated 12 min ago · draft 184 words · 1 block needs refresh · 7 due"*.
- Delete moved to overflow menu or hover-only — destructive actions don't compete with habit-forming actions.
- Click anywhere on card → opens note.

**Empty states (copy teaches the loop):**
- No notes yet: *"Start capturing what you want to remember. Write rough notes while reading, listening, or watching. When you have enough material, generate study questions."* + [New note] button.
- Empty note (just opened): only draft visible with placeholder *"Jot the ideas you want to remember…"*.
- Draft below min-words: Generate label is *"Write a little more to generate questions"* (not "minimum words not met").

**Long-draft soft guidance:** when draft exceeds ~1,000 words, show subtle hint below word count: *"Smaller batches often produce sharper questions."* Informational, not blocking. Disappears when user generates.

### Chunk 7 — Personal use week

Same as v4 Chunk 6. No code changes unless bugs found. Exit criterion: "I would not be embarrassed to give this to a tester."

### Chunk 7.5 — Schema contract (destructive wipe + v5 deploy)

**Tier 4** (destructive on Sacred-tier-parent table). Full PRE-MORTEM-CHECKLIST.md ceremony.

Trigger gate: Chunk 7 (personal use week) exit criterion met — *"I would not be embarrassed to give this to a tester."*

Pre-flight (fresh, not reusing 2026-05-21 artifacts):
- Re-snapshot at-risk user via `scripts/notes-v5-snapshot-at-risk-user.mjs`. Validate fresh JSON.
- Re-run plain-text export for the other 2 users. Email them their fresh .txt with a short note.
- Heads-up message to all 3 affected users naming the specific ship time.
- Fresh SQLite backup of production via `turso db export memorium-recovery`.
- Confirm PITR window ≥6h.

Operations (all in one short window):
- `DELETE FROM documents WHERE source_type='note'` (cascades to note questions, session_answers, question_feedback).
- Deploy v5 code (Chunks 2-6 work landing in production).
- Verify v5 notes feature works end-to-end with a test note.

Reference: see migrations/notes-v5-schema-contract.sql.

Chunk 8.5 (restore at-risk user) follows immediately, within the same operation window.

### Chunk 8.5 — Restore at-risk user's preserved notes

**Trigger gate:** Chunk 7.5 has completed successfully (wipe + v5 deploy). The fresh JSON snapshot from at-risk user (created pre-Chunk-7.5) is in hand and validates against expected record counts.

**Tier 4 ceremony per PRE-MORTEM-CHECKLIST.md.**

**Restore mechanics:**
- For each preserved document: insert a fresh row into `documents` with `source_type='note'`, owned by the original user. Set `note_version=0`. Use the original `title`. Leave `content=''` (v5 doesn't use it for notes). Restore `note_draft_content` from snapshot if non-empty.
- For each preserved document: insert exactly one `note_blocks` row — the "legacy block" — containing the snapshot's `documents.content` as its content. Set `sealed_at = original documents.last_generated_at` if non-null, else `documents.created_at`. Set `is_stale=0`, `stale_since=NULL`, `version=0`.
- For each preserved question: insert into `questions` with the original row's values, plus `block_id = <the_legacy_block_id_for_that_question's_document>`, `retired_at=NULL`, `retired_reason=NULL`, `is_retired=0`.
- For each preserved session_answer: insert into `session_answers` verbatim. FK to `questions.id` is preserved because we restored the original question IDs.

**Verification:**
- Restored doc count, question count, session_answer count match snapshot
- The user can log in and see their notes
- The user can start a study session that includes their preserved questions
- The user's progress page shows their preserved session_answers
- Two-clock verification (agent + user) per PRE-MORTEM-CHECKLIST.md

### Chunk 8 — Re-onboard testers + observe + decide

Same as v4 Chunks 7 + 8. Re-evaluate against kill criteria from v4 §4.

---

## 4. Kill / iterate criteria

Unchanged from v4 §4. Re-evaluate against this redesign in the new observation window.

Additional v5-specific kill signal:
- If any tester reports data loss (block content disappeared, edit lost across sessions), treat as integrity issue → kill.

---

## 5. Risks + mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Migration accidentally wipes uploaded-doc data | Low | Catastrophic | Branch-first verify, explicit `WHERE source_type='note'`, four-level verification |
| **Regenerating questions destroys SR review history** | High *(now mitigated)* | Catastrophic | **Retire-not-delete via `retired_at`; reads filter `WHERE retired_at IS NULL`** |
| Autosave 409 silently loses typed text | Medium | Emotionally expensive | Recovery panel preserves local edit via `sessionStorage`; manual copy + dismiss |
| User has 6+ stale blocks — wants to refresh all at once | Medium | Friction | Soft cap: process 5 oldest by `stale_since ASC`, queue rest with clear message |
| Wasted regen cost from minor edits (1-char typo → full block regen) | High | $$$ small | Accept v1. ~$0.03 per regen; bounded by rate limit + 5-soft-cap |
| Stale flag stuck on after "still-needs-refresh" | Medium | Confusing | Explicit copy: *"1 block still needs refresh because it didn't contain enough distinct material"* + actionable CTA |
| `updated_at` timestamp collision allows silent overwrite | Low | Possible silent overwrite | Use monotonic `version` (per block) + `note_version` (document) as concurrency primitive |
| Concurrent: tab A autosaves block 1 while tab B Generates | Low | Race | Generate's in-tx version + note_version check catches it; 409 to whichever loses |
| Tab A's autosave to draft lost when tab B Generates first | Low *(was a real gap)* | Data loss | Flush-before-Generate (client) + in-tx `note_version` re-check (server) |
| Mobile keyboard occludes sticky draft or block in edit mode | Medium | UX friction | `scrollIntoView` on focus; inline "Done" button (NOT iOS keyboard accessory) |
| Accidental edit-mode entry on mobile while reading sealed blocks | Medium | Papercut | Locked: visible `Edit` button is the only entry point |
| `beforeunload` `sendBeacon` doesn't fire | Medium | <3s data loss | Accept; debounce floor keeps loss bounded |
| Long notes (50+ blocks) jank | Medium (later) | Bad UX | Virtualization deferred to v2.1; observe |
| Concepts regen latency dominates Generate UX (now potentially 5+ parallel AI calls) | Medium | Slow feel | Parallel execution + loading copy that names what's happening |
| Wipe migration angers a tester | Low | Goodwill | Courtesy text export sent before migration |
| FK cascade diamond (documents → blocks + questions → block) misbehaves | Low | Data integrity | Three explicit cascade tests in Chunk 1 |

---

## 6. Out of scope for v5

- Block reorder, merge, split.
- Block-level diff view (what changed since last seal).
- Per-edit "skip regen" toggle.
- Per-block question counts in canvas.
- Collapsing / virtualization for long notes.
- Auto-unstale on revert-to-original-content (after debounce window).
- Manual "force regen" on non-edited blocks.
- Real-time multi-tab sync (still refetch-on-conflict).
- Rich text or markdown rendering in blocks.
- Block-level concepts (still note-level only).
- Migration path for v4 textual-divider notes into v5 blocks (destructive wipe instead, confirmed acceptable).

If a tester requests one of these, re-anchor on v4 §0 (cohort experiment) and this §6. Revisit only if multiple testers say the same.

---

## 7. Open implementation details — decide at build time

- **Per-block AI calls:** `Promise.all` parallel up to 5 vs. sequential. **Lean: parallel.**
- **Empty edited blocks:** keep with delete affordance vs. auto-delete on save-empty. **Lean: keep.**
- **Draft min-words check when stale also exists:** if draft fails min-words, allow Generate that only regens stale (draft persists in `note_draft_content` for next time). **Lean: yes.**
- **Courtesy export format:** plain text per note vs. JSON. **Lean: plain text.** *(See Amendment B — final decision is split per user: JSON for the at-risk user, plain text for the other two.)*
- **Long-draft guidance threshold:** ~1,000 words feels right but unvalidated. **Decide via personal use.**
- **Filtered Study session URL/route shape:** how does "Study these now" pass the `block_id IN (...)` filter — query param, ephemeral session record, or a dedicated route? **Decide in Chunk 6.**
- **Retired-question visibility in personal stats:** include retired ones in lifetime totals, exclude from streak/accuracy, or hide entirely? **Lean: include in totals, exclude from streak.** Decide when stats UI is touched.

*Resolved in round 2 (no longer open):*
- ~~5-stale cap: hard reject vs. soft cap~~ → soft cap, oldest by `stale_since ASC`.
- ~~Stale UI language~~ → "Needs refresh."
- ~~Post-Generate experience~~ → two-CTA bridge.
- ~~Stale flag flip~~ → server-side diff against stored content.
- ~~Edit affordance~~ → visible `Edit` button only; no tap-anywhere.
- ~~Autosave concurrency primitive~~ → monotonic `version`, not `updated_at`.
- ~~Recovery panel persistence~~ → `sessionStorage`-backed.
- ~~Autosave-during-Generate~~ → flush-before-Generate (client-side lock).
- ~~Study filter semantics~~ → this note's active questions for v1.
- ~~Question regeneration~~ → retire-not-delete via `retired_at`.

---

## 8. Stress-test items for a third review (if desired)

These remain undecided enough to be worth a third reviewer pass, but none are blocking:

1. **The retire-not-delete column shape.** Is `retired_at` + `retired_reason` sufficient, or do we want `retired_by_action_id` to link back to the Generate that retired the question (for personal history)? **Lean: not needed v1.**
2. **`stale_since` reset semantics on auto-unstale paths.** None exist in v1 (edit-revert doesn't unstale). If we add them later, what's the rule?
3. **Mobile sticky footer + virtual keyboard behavior on iOS Safari.** Best validated by building, not by review.
4. **The post-Generate animation order** when multiple blocks refresh simultaneously. Visual question, decide at build.
5. **Long-note virtualization threshold.** At what block count does scroll jank actually start hurting? Open until observed.
6. **Reviewing retired questions** (do we surface them anywhere — personal history view?). Out of scope for v5; flag if testers ask.

---

## 9. Glossary

- **Block:** a sealed unit of note content with its own id, content, `sealed_at`, `is_stale` flag, and associated questions.
- **Sealed:** a block where `is_stale = 0` (has been Generated from in its current state).
- **Needs refresh / stale:** a block where `is_stale = 1` (edited since last Generate; questions are outdated). UI label is "Needs refresh"; `is_stale` is the code/DB name.
- **Draft:** the active in-progress writing surface, stored in `documents.note_draft_content`.
- **Canvas:** the unified scrolling editor showing sealed blocks above the draft.
- **Three layers:** history (muted sealed blocks), capture (active draft, visual hero), action (Generate + post-Generate CTAs).
- **Regenerate (a block):** delete its existing questions, generate new questions from current content, clear `is_stale`.
- **Seal (a draft):** create a new `note_blocks` row from current draft content, generate questions, clear draft.
- **Recovery panel:** UI surface on 409 conflict that preserves the user's unsent local edit alongside refetched server state, enabling manual copy.
- **Two-clock rule, containment, sealed full document:** see v4 glossary.

---

## 10. Cross-references

- Pre-flight protocol for Chunk 1: `PRE-MORTEM-CHECKLIST.md` → "Section B" and "Four-Level Verification"
- Tier classification: `SESSION-STARTUP-CONTRACT.md`
- Sacred data policy: `DATA-SANCTITY.md`
- Schema source of truth: live DB (`turso db shell memorium-recovery`)
- v4 masterplan (reference for unchanged behaviors): `docs/notes-feature-masterplan-v4.md`

---

## 11. Naming and scope discipline

Internal name in commits, comments, scope discussions: **note capture** (unchanged).
External name in UI: **Notes** (unchanged).
If scope drifts toward "knowledge management," "second brain," "PKM": re-anchor on §0 and §6.

---

## 12. Changelog

**v5 (current)** — Block-model redesign + external-review revision pass.

Structural changes (initial draft):
1. Sealed content moves from `documents.content` (single string with textual dividers) to `note_blocks` (one row per sealed Generate session).
2. Questions gain `block_id` FK linking them to source block. v4 had no positional link from question back to its source text (only a free-text `source_reference` quote, vulnerable to drift).
3. Editor reorganized from "saved area + draft area" (two textareas with a unified-visual veneer) to journal canvas (single scrolling surface with structured blocks).
4. Generate semantics extended: regenerate questions for stale blocks AND seal new draft as a new block, in one transaction.
5. Editing sealed content now updates questions for that block (moved out of v4 §6 "out of scope").
6. Autosave added for draft and currently-edited blocks (3s debounce). Save button removed entirely.
7. v4's two-step (A: seal content, B: insert questions) transaction split is replaced with a single real transaction. Closes the v4 hole where Step A could commit without Step B.
8. v4's conditional-UPDATE-on-content-equality pattern replaced with per-row `updated_at` checks at block granularity, performed inside the transaction.

External-review revision pass (integrated into above sections):

UX integrity:
9. **5-stale hard cap → soft cap.** Generate processes the 5 oldest stale blocks and surfaces the queue; no dead-end.
10. **UI rename:** "stale" → **"Needs refresh"**. Frames the user's edit as improvement, not decay. `is_stale` retained in code/DB.
11. **Generate preview added.** Progressive disclosure: simple-case button label, expanded multi-line preview for mixed cases. Reduces "what will this button do?" anxiety.
12. **Post-Generate experience designed.** Two CTAs (*Study these now* / *Keep writing*) keep the loop pointed at the memory product, not at the note as a destination.
13. **Autosave 409 trust system.** Recovery panel preserves local pending edit alongside refetched state. No silent loss of typed text.
14. **Block edit affordance made discoverable.** Visible `Edit` ghost button per block (in addition to tap-to-edit) — not hidden behind hover or invisible interaction.
15. **Design direction section added.** Three-layer model (history, capture, action), with the product north star: *"Notes is not where knowledge lives. Notes is where raw material becomes memory."*
16. **Notes list metadata expanded.** Per-card: relative time, draft word count, blocks needing refresh, due questions. Delete moved to overflow/hover.
17. **Empty states teach the loop.** Copy onboards instead of stating system state.
18. **Long-draft soft guidance** (~1,000 words) — informational nudge, not enforcement.

Pushed back on (not adopted from round-1 review):
- Did not adopt prescriptive color suggestions ("off-white surface") — design direction stays principle-level since app's dark theme + purple accent is already established.

Round-2 review pass (technical correctness, integrated into above sections):

Critical fix:
19. **Retire-not-delete for regenerated questions.** Earlier v5 draft had `DELETE questions WHERE block_id = ?`, which destroyed SR review history and contradicted the product invariant ("the question/SR graph is the product"). New: `retired_at` + `retired_reason` columns; reads filter `WHERE retired_at IS NULL`; review history preserved.

Concurrency hardened:
20. **Monotonic `version` integer as concurrency primitive.** Replaces `updated_at` timestamp checks (which could collide on same-second writes). New columns: `note_blocks.version`, `documents.note_version`. `updated_at` retained for display only.
21. **In-transaction `note_version` re-check** when draft is being sealed. Closes the "tab B autosaved newer draft while tab A was generating" race that block-level versioning alone couldn't catch.
22. **Flush-before-Generate (client-side lock).** Generate is disabled while autosave is dirty / in-flight / failed / in-recovery. Pending state is synchronously flushed before Generate fires. Removes a whole class of races.

Data model and queue:
23. **`stale_since` column** on `note_blocks`. Set when `is_stale` flips 0→1; used as primary key in soft-cap queue order (`stale_since ASC, sealed_at ASC, id ASC`). User intent: "blocks that have been pending refresh longest go first."
24. **Block ordering tie-breaker.** All reads use `ORDER BY sealed_at ASC, id ASC` for determinism.
25. **"Study these now" filter locked.** v1 scope: this note's active questions (`block_id IN this_note's_blocks AND retired_at IS NULL`). v1.1 may refine to "questions from this Generate action only" if scope feels wrong.

UI refinements:
26. **Edit button is the only entry to edit mode** (no tap-anywhere). Locked: avoids accidental mode entry when scrolling/reading long blocks on mobile. (Reverses round-1 push-back.)
27. **Inline "Done" button** below editing block, not iOS keyboard accessory bar (unreliable on mobile web).
28. **Recovery panel uses `sessionStorage`** for the local pending edit, not just in-memory. Survives accidental reload mid-conflict.
29. **Partial-success copy** reframed from "skipped" to actionable: *"1 block still needs refresh because it didn't contain enough distinct material. Add more detail or remove it."*

Build process:
30. **Chunk 0.5 added** — Technical invariants lock, before schema migration. Confirms retirement, version columns, stale_since, flush-before-Generate, study filter, and ordering tie-breaker.
31. **FK cascade tests** mandatory in Chunk 1: three explicit deletion scenarios verified before production.

Mockup feedback (round 2, user-direct):
32. **Notes list cards: word count removed** from "Draft · 234 words" — kept "Draft in progress" indicator without the number.
33. **Empty note state simplified** — removed onboarding paragraph; placeholder text + disabled "Write a little more to generate questions" button is enough to teach the loop.

Pushed back on / negotiated (round-2):
- Did not adopt reviewer's "questions from this Generate action only" filter for *Study these now*. v1 uses "questions for this note" (active, non-retired). Upgrade path noted for v1.1 if it surfaces as wrong scope.

Unchanged from v4:
- Cohort experiment framing, `hasNotesAccess` flag, containment rule, gating middleware, privacy logging rule, rate limit (30/hr), 50K char cap, fail-soft concept generation, kill criteria.

Migration: destructive for existing notes (3 testers, ~15 notes, confirmed acceptable; courtesy text export sent before migration). Uploaded documents untouched.

**Post-audit amendments (2026-05-21):** see "Amendments (post-audit)" section above. Splits courtesy export by user (JSON snapshot for at-risk user + restore via new Chunk 8.5; plain text for the others), adds Chunk 1 pre-flight stop conditions, and clarifies `is_retired` vs `retired_at` coexistence.

**v4** — Initial production ship. See `notes-feature-masterplan-v4.md`.
