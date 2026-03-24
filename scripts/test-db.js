import { getDb } from "../lib/db/client.js";

async function run() {
  const db = getDb();
  let passed = 0;
  let failed = 0;

  async function check(label, fn) {
    try {
      await fn();
      console.log(`✓ ${label}`);
      passed++;
    } catch (err) {
      console.error(`✗ ${label}: ${err.message}`);
      failed++;
    }
  }

  // 1. Verify default-user exists
  await check("default-user exists", async () => {
    const result = await db.execute({
      sql: "SELECT * FROM users WHERE id = 'default-user'",
      args: [],
    });
    if (result.rows.length === 0) throw new Error("default-user not found");
    console.log("  →", JSON.stringify(result.rows[0]));
  });

  // 2. Insert test document
  await check("insert test document", async () => {
    await db.execute({
      sql: `INSERT INTO documents (id, user_id, title, content, themes, question_count, created_at)
            VALUES ('test_doc_001', 'default-user', 'Test Document', 'This is test content.', 'Testing', 0, strftime('%s', 'now'))`,
      args: [],
    });
  });

  // 3. Read it back
  await check("read test document back", async () => {
    const result = await db.execute({
      sql: "SELECT * FROM documents WHERE id = 'test_doc_001'",
      args: [],
    });
    if (result.rows.length === 0) throw new Error("test document not found");
    console.log("  → title:", result.rows[0].title);
  });

  // 4. Delete it
  await check("delete test document", async () => {
    await db.execute({
      sql: "DELETE FROM documents WHERE id = 'test_doc_001'",
      args: [],
    });
  });

  // 5. Confirm deletion
  await check("confirm deletion (count = 0)", async () => {
    const result = await db.execute({
      sql: "SELECT COUNT(*) as count FROM documents WHERE id = 'test_doc_001'",
      args: [],
    });
    const count = Number(result.rows[0].count);
    if (count !== 0) throw new Error(`Expected 0, got ${count}`);
    console.log("  → count:", count);
  });

  console.log(`\n${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

run();
