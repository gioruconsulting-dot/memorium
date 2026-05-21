-- Notes v5 — EXPAND-ONLY migration (Chunk 1a)
-- Tier 3: additive DDL, no data mutation.
-- v4 notes feature continues working with these changes applied.
-- Branch-first execution per PRE-MORTEM-CHECKLIST.md.
-- Companion: migrations/notes-v5-schema-contract.sql (runs at Chunk 7.5).

-- =============================================================
-- Additive changes
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
-- Post-execution verification (run as SELECTs after DDL)
-- =============================================================
-- Confirm note_blocks table exists with correct schema:
-- .schema note_blocks
--
-- Confirm new columns on documents:
-- PRAGMA table_info(documents);
-- Should show: note_version (INTEGER NOT NULL DEFAULT 0)
--
-- Confirm new columns on questions:
-- PRAGMA table_info(questions);
-- Should show: block_id (TEXT), retired_at (INTEGER), retired_reason (TEXT)
--
-- Confirm row counts UNCHANGED (Chunk 1a is additive only):
-- SELECT COUNT(*) FROM documents WHERE source_type='note';     -- expect: pre-execution count, unchanged
-- SELECT COUNT(*) FROM documents WHERE source_type='uploaded'; -- expect: pre-execution count, unchanged
-- SELECT COUNT(*) FROM questions;                              -- expect: pre-execution count, unchanged
-- SELECT COUNT(*) FROM session_answers;                        -- expect: pre-execution count, unchanged
