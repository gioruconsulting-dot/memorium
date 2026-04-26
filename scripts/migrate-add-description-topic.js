import "dotenv/config";
import { getDb } from "../lib/db/client.js";

async function migrate() {
  const db = getDb();

  try {
    await db.execute("ALTER TABLE documents ADD COLUMN description TEXT");
    console.log("✓ Added description column to documents");
  } catch (err) {
    if (err.message.includes("duplicate column") || err.message.includes("already exists")) {
      console.log("⏭ description already present, skipping");
    } else {
      console.error("✗ Migration failed:", err.message);
      process.exit(1);
    }
  }

  try {
    await db.execute("ALTER TABLE documents ADD COLUMN topic TEXT");
    console.log("✓ Added topic column to documents");
  } catch (err) {
    if (err.message.includes("duplicate column") || err.message.includes("already exists")) {
      console.log("⏭ topic already present, skipping");
    } else {
      console.error("✗ Migration failed:", err.message);
      process.exit(1);
    }
  }

  console.log("\n✓ Migration complete");
}

migrate();
