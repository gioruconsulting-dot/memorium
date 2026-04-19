import "dotenv/config";
import { getDb } from "../lib/db/client.js";
import { SCHEMA_SQL } from "../lib/db/schema.js";

async function migrate() {
  const db = getDb();
  let hasError = false;

  for (const sql of SCHEMA_SQL) {
    const preview = sql.trim().split("\n")[0].slice(0, 80);
    try {
      await db.execute(sql);
      console.log(`✓ ${preview}`);
    } catch (err) {
      // ALTER TABLE ADD COLUMN fails with "duplicate column" if already applied — not an error
      if (err.message?.toLowerCase().includes('duplicate column')) {
        console.log(`⚠ ${preview} (column already exists, skipping)`);
      } else {
        console.error(`✗ ${preview}`);
        console.error(`  ${err.message}`);
        hasError = true;
      }
    }
  }

  if (hasError) {
    console.error("\nMigration completed with errors.");
    process.exit(1);
  } else {
    console.log("\nMigration completed successfully.");
  }
}

migrate();
