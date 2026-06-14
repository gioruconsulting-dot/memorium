// Close-out step 6: tighten documents schema — make description and topic
// NOT NULL now that the backfill has populated every row.
// Small, low-risk: SQLite can't add NOT NULL in place, so we use the
// standard table-swap pattern.

import { db } from '../lib/db/client.js';

const swap = `
  CREATE TABLE documents_new (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'uploaded',
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    description TEXT NOT NULL,
    topic TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT
  );
  INSERT INTO documents_new SELECT id, user_id, source_type, title, content,
    description, topic, created_at, updated_at FROM documents;
  DROP TABLE documents;
  ALTER TABLE documents_new RENAME TO documents;
`;

async function main() {
  const before = (await db.execute('SELECT COUNT(*) AS n FROM documents')).rows[0].n;
  console.log(`documents before: ${before}`);

  for (const stmt of swap.split(';').map((s) => s.trim()).filter(Boolean)) {
    await db.execute(stmt);
  }

  const after = (await db.execute('SELECT COUNT(*) AS n FROM documents')).rows[0].n;
  console.log(`documents after: ${after}`);
  if (after !== before) {
    throw new Error(`row count mismatch: ${before} -> ${after}`);
  }
  console.log('Migration complete. Rows preserved, column order intact.');
}

main();
