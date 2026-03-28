import "dotenv/config";
import { getDb } from "../lib/db/client.js";

const newUserId = process.argv[2];

if (!newUserId) {
  console.error("Usage: node scripts/migrate-user.js <new-user-id>");
  console.error("Example: node scripts/migrate-user.js user_2abc123xyz");
  process.exit(1);
}

const OLD_USER_ID = "default-user";

async function migrateUser() {
  const db = getDb();

  console.log(`Migrating user_id from '${OLD_USER_ID}' → '${newUserId}'`);
  console.log("");

  const results = await db.batch([
    "PRAGMA foreign_keys = OFF",
    {
      sql: `INSERT OR IGNORE INTO users (id, created_at, last_active_at) VALUES (?, strftime('%s', 'now'), strftime('%s', 'now'))`,
      args: [newUserId],
    },
    {
      sql: "UPDATE documents SET user_id = ? WHERE user_id = ?",
      args: [newUserId, OLD_USER_ID],
    },
    {
      sql: "UPDATE questions SET user_id = ? WHERE user_id = ?",
      args: [newUserId, OLD_USER_ID],
    },
    {
      sql: "UPDATE study_sessions SET user_id = ? WHERE user_id = ?",
      args: [newUserId, OLD_USER_ID],
    },
    {
      sql: "UPDATE session_answers SET user_id = ? WHERE user_id = ?",
      args: [newUserId, OLD_USER_ID],
    },
    {
      sql: "DELETE FROM users WHERE id = ?",
      args: [OLD_USER_ID],
    },
    "PRAGMA foreign_keys = ON",
  ]);

  // results[2..5] correspond to the four UPDATE statements
  console.log(`users: inserted new row for '${newUserId}'`);
  console.log(`documents: ${results[2].rowsAffected} row(s) updated`);
  console.log(`questions: ${results[3].rowsAffected} row(s) updated`);
  console.log(`study_sessions: ${results[4].rowsAffected} row(s) updated`);
  console.log(`session_answers: ${results[5].rowsAffected} row(s) updated`);
  console.log(`users: deleted '${OLD_USER_ID}' row (${results[6].rowsAffected} row(s))`);

  console.log("\nMigration complete.");
}

migrateUser().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
