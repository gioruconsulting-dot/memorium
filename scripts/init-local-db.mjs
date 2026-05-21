// scripts/init-local-db.mjs
// USAGE: node scripts/init-local-db.mjs
//
// Creates a local SQLite database at .data/memorium-local.db with the FULL
// current schema, including all Chunk 1a (Notes v5 expand) additions:
//   - documents.note_version
//   - note_blocks table + indexes
//   - questions.block_id / retired_at / retired_reason + indexes
//
// Idempotent: every CREATE / ALTER is wrapped so re-running is safe. Existing
// data is preserved (we never DROP).
//
// Reads TURSO_DATABASE_URL_LOCAL from .env.local (or env). Expected value:
//   file:.data/memorium-local.db
//
// SAFETY: refuses any URL that does not start with `file:` — the local schema
// drift below (is_public column, Chunk 1a additions) is wrong for production,
// so we hard-guard against pointing this at Turso.

import { createClient } from '@libsql/client';
import { config } from 'dotenv';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

config({ path: '.env.local' });

const DB_URL = process.env.TURSO_DATABASE_URL_LOCAL;

if (!DB_URL) {
  console.error(
    'FATAL: TURSO_DATABASE_URL_LOCAL not set.\n\n' +
    'Add this line to your .env.local:\n' +
    '  TURSO_DATABASE_URL_LOCAL=file:.data/memorium-local.db\n\n' +
    'Or run inline:\n' +
    '  TURSO_DATABASE_URL_LOCAL=file:.data/memorium-local.db node scripts/init-local-db.mjs\n'
  );
  process.exit(1);
}

if (!DB_URL.startsWith('file:')) {
  console.error(
    `FATAL: TURSO_DATABASE_URL_LOCAL must be a file: URL.\n` +
    `Got: ${DB_URL.replace(/\/\/[^@]+@/, '//[redacted]@')}\n\n` +
    `This script writes a dev-only schema (includes Chunk 1a additions, is_public,\n` +
    `etc.) and is not safe to run against any remote Turso DB.`
  );
  process.exit(1);
}

// Ensure the parent directory exists. libSQL's file driver won't create it.
const filePath = DB_URL.replace(/^file:/, '');
const dir = dirname(filePath);
if (!existsSync(dir)) {
  mkdirSync(dir, { recursive: true });
  console.log(`Created directory: ${dir}/`);
}

const db = createClient({ url: DB_URL });

console.log(`Initialising local DB at ${DB_URL}…\n`);

// libSQL has no native CREATE TABLE IF NOT EXISTS + ALTER TABLE IF NOT EXISTS
// pattern, so we run ALTERs in try/catch (mirrors lib/db/migrate.js).
async function exec(label, sql) {
  try {
    await db.execute(sql);
    console.log(`  ✓ ${label}`);
  } catch (err) {
    // Duplicate column / already-exists errors are expected on re-runs.
    const msg = String(err.message || err);
    if (/duplicate column|already exists/i.test(msg)) {
      console.log(`  – ${label} (already exists)`);
    } else {
      console.error(`  ✗ ${label}\n    ${msg}`);
      throw err;
    }
  }
}

// Enable FK enforcement (mirrors lib/db/client.js)
await db.execute('PRAGMA foreign_keys = ON');

// ─── Core tables ────────────────────────────────────────────────────────
await exec('users', `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT,
    created_at INTEGER NOT NULL,
    last_active_at INTEGER NOT NULL,
    streak_cards INTEGER NOT NULL DEFAULT 0,
    streak_card_last_used_date TEXT,
    streak_first_break_rewarded INTEGER NOT NULL DEFAULT 0,
    streak_monthly_card_month TEXT,
    streak_card_used_at INTEGER,
    streak_card_earned_at INTEGER
  )
`);

await exec('documents', `
  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    themes TEXT,
    concepts_json TEXT,
    description TEXT NOT NULL,
    topic TEXT NOT NULL,
    question_count INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'uploaded' CHECK (source_type IN ('uploaded', 'note')),
    note_draft_content TEXT,
    last_generated_at INTEGER,
    updated_at INTEGER,
    is_public INTEGER NOT NULL DEFAULT 0,
    note_version INTEGER NOT NULL DEFAULT 0
  )
`);

await exec('questions', `
  CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    question_type TEXT NOT NULL,
    answer_text TEXT NOT NULL,
    explanation TEXT,
    source_reference TEXT,
    concept_id TEXT,
    difficulty TEXT,
    next_review_at INTEGER NOT NULL,
    review_count INTEGER NOT NULL DEFAULT 0,
    correct_count INTEGER NOT NULL DEFAULT 0,
    incorrect_count INTEGER NOT NULL DEFAULT 0,
    correct_streak INTEGER NOT NULL DEFAULT 0,
    hard_count INTEGER NOT NULL DEFAULT 0,
    current_interval_days INTEGER NOT NULL DEFAULT 1,
    is_retired INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    block_id TEXT REFERENCES note_blocks(id) ON DELETE CASCADE,
    retired_at INTEGER,
    retired_reason TEXT
  )
`);

await exec('study_sessions', `
  CREATE TABLE IF NOT EXISTS study_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    started_at INTEGER NOT NULL,
    completed_at INTEGER,
    questions_shown INTEGER NOT NULL,
    questions_answered INTEGER NOT NULL DEFAULT 0,
    correct_count INTEGER NOT NULL DEFAULT 0,
    incorrect_count INTEGER NOT NULL DEFAULT 0,
    skipped_count INTEGER NOT NULL DEFAULT 0,
    duration_seconds INTEGER
  )
`);

await exec('session_answers', `
  CREATE TABLE IF NOT EXISTS session_answers (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
    question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_attempt TEXT,
    grade TEXT NOT NULL,
    elaboration_note TEXT,
    answered_at INTEGER NOT NULL,
    interval_days INTEGER
  )
`);

await exec('question_feedback', `
  CREATE TABLE IF NOT EXISTS question_feedback (
    id TEXT PRIMARY KEY,
    question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_id TEXT NOT NULL,
    question_text TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(question_id, user_id)
  )
`);

// note_blocks: created here AFTER questions in declaration order, but the FK
// from questions.block_id → note_blocks(id) is fine — SQLite resolves FK
// constraints on write, not on CREATE.
await exec('note_blocks', `
  CREATE TABLE IF NOT EXISTS note_blocks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    sealed_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    is_stale INTEGER NOT NULL DEFAULT 0,
    stale_since INTEGER,
    version INTEGER NOT NULL DEFAULT 0
  )
`);

// ─── Indexes ────────────────────────────────────────────────────────────
console.log('');
const indexes = [
  ['idx_documents_user_id',          `CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id)`],
  ['idx_documents_created_at',       `CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at)`],
  ['idx_questions_document_id',      `CREATE INDEX IF NOT EXISTS idx_questions_document_id ON questions(document_id)`],
  ['idx_questions_user_id',          `CREATE INDEX IF NOT EXISTS idx_questions_user_id ON questions(user_id)`],
  ['idx_questions_next_review_at',   `CREATE INDEX IF NOT EXISTS idx_questions_next_review_at ON questions(next_review_at)`],
  ['idx_questions_review_count',     `CREATE INDEX IF NOT EXISTS idx_questions_review_count ON questions(review_count)`],
  ['idx_questions_block',            `CREATE INDEX IF NOT EXISTS idx_questions_block ON questions(block_id)`],
  ['idx_questions_active',           `CREATE INDEX IF NOT EXISTS idx_questions_active ON questions(document_id, retired_at)`],
  ['idx_study_sessions_user_id',     `CREATE INDEX IF NOT EXISTS idx_study_sessions_user_id ON study_sessions(user_id)`],
  ['idx_study_sessions_started_at',  `CREATE INDEX IF NOT EXISTS idx_study_sessions_started_at ON study_sessions(started_at)`],
  ['idx_session_answers_session_id', `CREATE INDEX IF NOT EXISTS idx_session_answers_session_id ON session_answers(session_id)`],
  ['idx_session_answers_question_id',`CREATE INDEX IF NOT EXISTS idx_session_answers_question_id ON session_answers(question_id)`],
  ['idx_question_feedback_document', `CREATE INDEX IF NOT EXISTS idx_question_feedback_document ON question_feedback(document_id)`],
  ['idx_note_blocks_document',       `CREATE INDEX IF NOT EXISTS idx_note_blocks_document ON note_blocks(document_id, sealed_at)`],
  ['idx_note_blocks_stale',          `CREATE INDEX IF NOT EXISTS idx_note_blocks_stale ON note_blocks(document_id, is_stale, stale_since)`],
];
for (const [label, sql] of indexes) {
  await exec(label, sql);
}

// ─── Verification ────────────────────────────────────────────────────────
console.log('\nVerifying schema…');
const tables = await db.execute(
  `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
);
const expected = [
  'documents', 'note_blocks', 'question_feedback', 'questions',
  'session_answers', 'study_sessions', 'users',
];
const found = tables.rows.map((r) => r.name).filter((n) => !n.startsWith('sqlite_'));
const missing = expected.filter((t) => !found.includes(t));
if (missing.length > 0) {
  console.error(`\n✗ Missing tables: ${missing.join(', ')}`);
  process.exit(1);
}
console.log(`  ✓ All ${expected.length} tables present: ${found.join(', ')}`);

// Spot-check key v5 columns
const docCols = await db.execute(`PRAGMA table_info(documents)`);
const docColNames = docCols.rows.map((r) => r.name);
const requiredDocCols = ['note_version', 'note_draft_content', 'source_type', 'is_public'];
for (const c of requiredDocCols) {
  if (!docColNames.includes(c)) {
    console.error(`  ✗ documents.${c} missing`);
    process.exit(1);
  }
}
console.log(`  ✓ documents has v5 columns: ${requiredDocCols.join(', ')}`);

const qCols = await db.execute(`PRAGMA table_info(questions)`);
const qColNames = qCols.rows.map((r) => r.name);
const requiredQCols = ['block_id', 'retired_at', 'retired_reason'];
for (const c of requiredQCols) {
  if (!qColNames.includes(c)) {
    console.error(`  ✗ questions.${c} missing`);
    process.exit(1);
  }
}
console.log(`  ✓ questions has v5 columns: ${requiredQCols.join(', ')}`);

console.log('\nDone. Local DB ready.');
console.log(`Next: node scripts/notes-v5-seed-local.mjs`);

process.exit(0);
