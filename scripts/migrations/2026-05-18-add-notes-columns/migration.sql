-- Notes feature schema migration — Chunk 1
-- Adds 4 additive columns to documents. Tier 4 operation.
-- Internal name: note capture (masterplan §11).
-- Spec: docs/specs/notes-feature-masterplan-v4.md §2.1
-- Safety protocol: docs/safety/PRE-MORTEM-CHECKLIST.md
--
-- Operation is additive: no row rewrites, no FK changes, no constraint
-- tightening on existing data. CHECK constraint validates future writes;
-- existing rows satisfy it via the DEFAULT 'uploaded'.

ALTER TABLE documents
  ADD COLUMN source_type TEXT NOT NULL DEFAULT 'uploaded'
  CHECK (source_type IN ('uploaded', 'note'));

ALTER TABLE documents
  ADD COLUMN note_draft_content TEXT;

ALTER TABLE documents
  ADD COLUMN last_generated_at INTEGER;

ALTER TABLE documents
  ADD COLUMN updated_at INTEGER;
