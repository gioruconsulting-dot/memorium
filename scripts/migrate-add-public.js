import "dotenv/config";
import { getDb } from "../lib/db/client.js";

async function migrate() {
  const db = getDb();

  try {
    await db.execute("ALTER TABLE documents ADD COLUMN is_public INTEGER NOT NULL DEFAULT 1");
    console.log("✓ Added is_public column to documents (default 1 — all existing docs are now public)");
  } catch (err) {
    if (err.message.includes("duplicate column")) {
      console.log("✓ is_public column already exists — nothing to do");
    } else {
      console.error("✗ Migration failed:", err.message);
      process.exit(1);
    }
  }

  console.log("\nMigration complete.");
}

migrate();
