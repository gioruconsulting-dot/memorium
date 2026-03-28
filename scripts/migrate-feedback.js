// Migration: add is_retired column to questions + create question_feedback table
// Run with: node --env-file=.env.local scripts/migrate-feedback.js

import { getDb } from '../lib/db/client.js';

const db = getDb();

try {
  // Add is_retired to questions (no-op if already exists — will throw, caught below)
  try {
    await db.execute({
      sql: 'ALTER TABLE questions ADD COLUMN is_retired INTEGER NOT NULL DEFAULT 0',
    });
    console.log('✓ Added is_retired column to questions');
  } catch (e) {
    if (e.message?.includes('duplicate column')) {
      console.log('— is_retired column already exists, skipping');
    } else {
      throw e;
    }
  }

  // Create question_feedback table
  await db.execute({
    sql: `CREATE TABLE IF NOT EXISTS question_feedback (
      id TEXT PRIMARY KEY,
      question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      document_id TEXT NOT NULL,
      question_text TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(question_id, user_id)
    )`,
  });
  console.log('✓ Created question_feedback table');

  await db.execute({
    sql: 'CREATE INDEX IF NOT EXISTS idx_question_feedback_document ON question_feedback(document_id)',
  });
  console.log('✓ Created index on question_feedback(document_id)');

  console.log('\nMigration complete.');
} catch (err) {
  console.error('Migration failed:', err);
  process.exit(1);
}
