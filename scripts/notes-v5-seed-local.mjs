// scripts/notes-v5-seed-local.mjs
// USAGE: node scripts/notes-v5-seed-local.mjs
//
// Seeds a local dev DB with a deterministic v5 test note for Chunk 2 work
// (queries.js verification of getNoteById / updateNote).
//
// Idempotent: deletes any prior rows for the seed IDs first, then re-inserts.
// Run it as many times as you want — same final state each time.
//
// Reads TURSO_DATABASE_URL_LOCAL from .env.local — a separate env var from
// the app's TURSO_DATABASE_URL so this script can never accidentally fire
// against production. Expected value: file:.data/memorium-local.db
// Run scripts/init-local-db.mjs first to create the schema.

import { createClient } from '@libsql/client';
import { config } from 'dotenv';

config({ path: '.env.local' });

// Deterministic seed IDs — pasteable into curl/test commands.
const USER_ID = 'user_v5test';
const DOC_ID = 'doc_v5test_note';
const BLOCK_IDS = ['blk_v5test_1', 'blk_v5test_2', 'blk_v5test_3'];

const DB_URL = process.env.TURSO_DATABASE_URL_LOCAL;

if (!DB_URL) {
  console.error(
    'FATAL: TURSO_DATABASE_URL_LOCAL not set.\n\n' +
    'Add this line to your .env.local:\n' +
    '  TURSO_DATABASE_URL_LOCAL=file:.data/memorium-local.db\n\n' +
    'Then run:\n' +
    '  node scripts/init-local-db.mjs   # creates the schema\n' +
    '  node scripts/notes-v5-seed-local.mjs   # seeds the test row\n'
  );
  process.exit(1);
}

// Hard guard: refuse anything that isn't a local file URL. Belt-and-braces
// since the env var name itself implies local.
if (!DB_URL.startsWith('file:')) {
  console.error(
    `FATAL: TURSO_DATABASE_URL_LOCAL must be a file: URL. Got: ${DB_URL}\n` +
    `Expected: file:.data/memorium-local.db`
  );
  process.exit(1);
}

const db = createClient({ url: DB_URL });

const now = Math.floor(Date.now() / 1000);
const ONE_HOUR = 3600;
const ONE_DAY = 86400;

console.log('Notes v5 — local seed');
console.log(`  DB: ${DB_URL.replace(/\/\/[^@]+@/, '//[redacted]@')}`);
console.log('');

// ─── Idempotent cleanup ──────────────────────────────────────────────────
// Delete in FK-safe order: note_blocks → documents → users. The document
// delete would cascade note_blocks anyway, but explicit is clearer.
console.log('Resetting prior seed rows…');
const delBlocks = await db.execute({
  sql: 'DELETE FROM note_blocks WHERE document_id = ?',
  args: [DOC_ID],
});
const delDoc = await db.execute({
  sql: 'DELETE FROM documents WHERE id = ?',
  args: [DOC_ID],
});
const delUser = await db.execute({
  sql: 'DELETE FROM users WHERE id = ?',
  args: [USER_ID],
});
console.log(`  note_blocks: deleted ${delBlocks.rowsAffected}`);
console.log(`  documents:   deleted ${delDoc.rowsAffected}`);
console.log(`  users:       deleted ${delUser.rowsAffected}`);

// ─── Insert user ─────────────────────────────────────────────────────────
console.log(`\nInserting user ${USER_ID}…`);
await db.execute({
  sql: `INSERT INTO users (id, created_at, last_active_at) VALUES (?, ?, ?)`,
  args: [USER_ID, now, now],
});

// ─── Insert document (source_type='note', draft populated, note_version=0) ─
console.log(`Inserting document ${DOC_ID}…`);
await db.execute({
  sql: `INSERT INTO documents (
          id, user_id, title, content, themes, description, topic, concepts_json,
          question_count, is_public, source_type, note_draft_content, note_version, created_at
        ) VALUES (?, ?, 'Test Note', '', NULL, '', '', NULL, 0, 0, 'note', 'draft text here', 0, ?)`,
  args: [DOC_ID, USER_ID, now],
});

// ─── Insert 3 note_blocks ────────────────────────────────────────────────
// sealed_at varies so the ORDER BY sealed_at ASC, id ASC tie-breaker is
// exercised; getNoteById should return them in the order below.
const blocks = [
  {
    id: BLOCK_IDS[0],
    content: 'Block 1 content',
    sealed_at: now - ONE_DAY,        // yesterday
    is_stale: 0,
    stale_since: null,
  },
  {
    id: BLOCK_IDS[1],
    content: 'Block 2 content',
    sealed_at: now - (8 * ONE_HOUR), // this morning (~8h ago)
    is_stale: 0,
    stale_since: null,
  },
  {
    id: BLOCK_IDS[2],
    content: 'Block 3 content',
    sealed_at: now - ONE_HOUR,       // an hour ago
    is_stale: 1,
    stale_since: now,                // most recently flipped stale
  },
];

console.log(`Inserting ${blocks.length} note_blocks…`);
for (const b of blocks) {
  await db.execute({
    sql: `INSERT INTO note_blocks
            (id, document_id, content, sealed_at, updated_at, is_stale, stale_since, version)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    args: [b.id, DOC_ID, b.content, b.sealed_at, b.sealed_at, b.is_stale, b.stale_since],
  });
}

// ─── Summary ─────────────────────────────────────────────────────────────
console.log('\nDone. Seeded state:');
console.log(`  user:     ${USER_ID}`);
console.log(`  document: ${DOC_ID}`);
console.log(`            title='Test Note', draft='draft text here', note_version=0`);
for (const b of blocks) {
  console.log(
    `  block:    ${b.id.padEnd(14)} ` +
    `sealed_at=${b.sealed_at} ` +
    `is_stale=${b.is_stale}` +
    (b.stale_since != null ? ` stale_since=${b.stale_since}` : '') +
    ` version=1`
  );
}

console.log('\nUse these IDs in verification:');
console.log(`  noteId = ${DOC_ID}`);
console.log(`  userId = ${USER_ID}`);
console.log(`  blocks = ${BLOCK_IDS.join(', ')}`);

console.log('\nTo point the Next.js dev server at this DB:');
console.log('  TURSO_DATABASE_URL=file:.data/memorium-local.db TURSO_AUTH_TOKEN= npm run dev');
console.log('(That inline override beats whatever .env.local has for this process only.)');

process.exit(0);
