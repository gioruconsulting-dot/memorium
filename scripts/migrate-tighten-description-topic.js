import "dotenv/config";
import { getDb } from "../lib/db/client.js";

async function migrate() {
  const db = getDb();

  // ── Idempotency check: already NOT NULL? ──────────────────────────────────
  const pragma = await db.execute("PRAGMA table_info(documents)");
  const descCol  = pragma.rows.find(r => r.name === "description");
  const topicCol = pragma.rows.find(r => r.name === "topic");

  if (descCol?.notnull && topicCol?.notnull) {
    console.log("⏭ description and topic are already NOT NULL — skipping");
    return;
  }

  // ── Pre-migration safety check ────────────────────────────────────────────
  const nullCheck = await db.execute(
    "SELECT COUNT(*) as cnt FROM documents WHERE description IS NULL OR topic IS NULL"
  );
  const nullCount = Number(nullCheck.rows[0].cnt);

  if (nullCount > 0) {
    const offenders = await db.execute(
      "SELECT id, title, description, topic FROM documents WHERE description IS NULL OR topic IS NULL"
    );
    console.error(`\n✗ Safety check failed: ${nullCount} document(s) have NULL description or topic.`);
    console.error("  Fix these rows before running the migration:\n");
    for (const row of offenders.rows) {
      console.error(`  id=${row.id}  title="${row.title}"  description=${row.description ?? "NULL"}  topic=${row.topic ?? "NULL"}`);
    }
    console.error("\n  Run scripts/backfill-description-topic.js first, then retry.\n");
    process.exit(1);
  }

  // ── Row count before ──────────────────────────────────────────────────────
  const beforeCount = Number(
    (await db.execute("SELECT COUNT(*) as cnt FROM documents")).rows[0].cnt
  );
  console.log(`  Rows before: ${beforeCount}`);

  // ── Table swap (SQLite doesn't support ALTER COLUMN ... SET NOT NULL) ──────
  // Use db.batch() for atomicity — libsql HTTP client doesn't maintain transaction
  // state across separate execute() calls, so BEGIN/COMMIT won't work.
  //
  // Column order must exactly match the live table (id, user_id, title, content, themes,
  // question_count, created_at, is_public, description, topic — is_public was added via
  // migrate-add-public.js and is not in schema.js but exists in the live DB).
  try {
    await db.batch([
      `CREATE TABLE documents_new (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        themes TEXT,
        question_count INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        is_public INTEGER NOT NULL DEFAULT 1,
        description TEXT NOT NULL,
        topic TEXT NOT NULL
      )`,
      "INSERT INTO documents_new SELECT * FROM documents",
      "DROP TABLE documents",
      "ALTER TABLE documents_new RENAME TO documents",
      "CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id)",
      "CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at)",
    ], "write");
  } catch (err) {
    console.error("\n✗ Migration failed:", err.message);
    process.exit(1);
  }

  // ── Row count after ───────────────────────────────────────────────────────
  const afterCount = Number(
    (await db.execute("SELECT COUNT(*) as cnt FROM documents")).rows[0].cnt
  );

  if (afterCount !== beforeCount) {
    console.error(`\n✗ Row count mismatch! Before: ${beforeCount}, After: ${afterCount}. Investigate immediately.`);
    process.exit(1);
  }

  console.log(`\n✓ Migration complete: rows preserved: ${afterCount}`);
}

migrate().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
