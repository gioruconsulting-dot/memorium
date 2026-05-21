-- Notes v5 schema migration
-- Drafted: 2026-05-21
-- Target: memorium-recovery (production), run on a branch first
-- DESTRUCTIVE: wipes existing notes data after additive changes.
--
-- See docs/specs/notes-feature-masterplan-v5.md §2.1 for the source-of-truth schema.
-- See docs/specs/notes-v5-chunk-1-preflight.md for the operator pre-flight checklist
-- that MUST be completed before any statement below executes.
--
-- Execution order:
--   1. Additive section runs first.
--   2. Verification SELECTs (commented below) are run as separate queries and
--      compared against the locked Expected-Delta Manifest before the DELETE.
--   3. The DELETE executes only after manifest match + operator GO.
--   4. Post-wipe verification SELECTs (commented below) confirm the manifest
--      held end-to-end.

-- =============================================================
-- Additive changes (safe, run first)
-- =============================================================

-- New table for sealed note content blocks
CREATE TABLE note_blocks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  sealed_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  is_stale INTEGER NOT NULL DEFAULT 0,
  stale_since INTEGER,
  version INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_note_blocks_document ON note_blocks(document_id, sealed_at);
CREATE INDEX idx_note_blocks_stale ON note_blocks(document_id, is_stale, stale_since);

-- Document-level version for draft/title concurrency
ALTER TABLE documents ADD COLUMN note_version INTEGER NOT NULL DEFAULT 0;

-- Question history preservation (adds alongside existing is_retired)
ALTER TABLE questions ADD COLUMN block_id TEXT REFERENCES note_blocks(id) ON DELETE CASCADE;
ALTER TABLE questions ADD COLUMN retired_at INTEGER;
ALTER TABLE questions ADD COLUMN retired_reason TEXT;
CREATE INDEX idx_questions_block ON questions(block_id);
CREATE INDEX idx_questions_active ON questions(document_id, retired_at);

-- =============================================================
-- Destructive cleanup (runs ONLY after snapshots + exports verified)
-- =============================================================

-- Verify pre-wipe counts (these must match the locked expected-delta manifest)
-- Run each as a separate SELECT; capture results in preflight.json before DELETE.
-- SELECT COUNT(*) FROM documents WHERE source_type='note';
--   -- expect 4
-- SELECT COUNT(*) FROM questions q JOIN documents d ON d.id=q.document_id WHERE d.source_type='note';
--   -- expect 48
-- SELECT COUNT(*) FROM session_answers sa
--   JOIN questions q ON q.id=sa.question_id
--   JOIN documents d ON d.id=q.document_id
--   WHERE d.source_type='note';
--   -- expect 10
-- SELECT COUNT(*) FROM question_feedback qf
--   JOIN questions q ON q.id=qf.question_id
--   JOIN documents d ON d.id=q.document_id
--   WHERE d.source_type='note';
--   -- expect 0
-- Lock these in the migration log before DELETE.

-- Wipe note data (cascades to questions → session_answers, question_feedback;
-- note_blocks created above are empty at this point, so nothing to cascade there yet).
DELETE FROM documents WHERE source_type = 'note';

-- =============================================================
-- Post-wipe verification (run as SELECTs after DELETE)
-- =============================================================
-- Expected post-counts (must match the locked manifest exactly):
--
-- documents (note):                      0
-- documents (uploaded):                  47   (UNCHANGED)
-- questions (note-linked):               0
-- questions (uploaded-linked):           1366 (UNCHANGED)
-- session_answers (note-linked):         0
-- session_answers (uploaded-linked):     806  (UNCHANGED)
-- question_feedback (note-linked):       0
-- study_sessions:                        284  (UNCHANGED)
-- users:                                 33   (UNCHANGED)
--
-- Run each verification query separately; any deviation is a failure regardless
-- of step-by-step success reports (see PRE-MORTEM-CHECKLIST.md "Expected-Delta
-- Manifest"). On deviation: STOP, do not promote branch, alert operator.
