-- Notes v5 — CONTRACT-ONLY migration (Chunk 7.5)
-- Tier 4: destructive operation on Parent-of-Sacred table.
-- Wipes existing notes data. Runs ONLY after personal-use week (Chunk 7)
-- and immediately before v5 deploy. Re-snapshot users fresh BEFORE this fires.
-- Companion: migrations/notes-v5-schema-expand.sql (already run at Chunk 1a).

-- =============================================================
-- Pre-execution verification (run as SELECTs before DELETE)
-- =============================================================
-- Confirm Chunk 1a's expand is in place:
-- .schema note_blocks               -- expect: table exists
-- PRAGMA table_info(documents);     -- expect: note_version column present
-- PRAGMA table_info(questions);     -- expect: block_id, retired_at, retired_reason columns present
--
-- Confirm fresh pre-wipe counts (captured at Chunk 7.5 pre-flight, NOT reused from 2026-05-21):
-- SELECT COUNT(*) FROM documents WHERE source_type='note';
-- SELECT COUNT(*) FROM questions q JOIN documents d ON d.id=q.document_id WHERE d.source_type='note';
-- SELECT COUNT(*) FROM session_answers sa JOIN questions q ON q.id=sa.question_id JOIN documents d ON d.id=q.document_id WHERE d.source_type='note';

-- =============================================================
-- Destructive cleanup
-- =============================================================

-- Wipe note data (cascades to questions → session_answers, question_feedback)
DELETE FROM documents WHERE source_type = 'note';

-- =============================================================
-- Post-wipe verification (run as SELECTs after DELETE)
-- =============================================================
-- Expected post-counts:
-- documents (note): 0
-- documents (uploaded): UNCHANGED from pre-flight count
-- questions (note-linked): 0
-- questions (uploaded-linked): UNCHANGED
-- session_answers (note-linked): 0
-- session_answers (uploaded-linked): UNCHANGED
-- study_sessions: UNCHANGED
-- users: UNCHANGED
