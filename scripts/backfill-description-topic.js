import "dotenv/config";
import { getDb } from "../lib/db/client.js";
import { classifyDocument } from "../lib/ai/classify-document.js";

async function backfill() {
  const db = getDb();

  // Find all docs missing description or topic
  const result = await db.execute(
    "SELECT id, title, content FROM documents WHERE description IS NULL OR topic IS NULL"
  );
  const docs = result.rows;

  if (docs.length === 0) {
    console.log("✓ Nothing to backfill");
    return;
  }

  console.log(`Found ${docs.length} document${docs.length !== 1 ? "s" : ""} to backfill.\n`);

  let succeeded = 0;
  let failed    = 0;
  const failedIds = [];

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    console.log(`[${i + 1}/${docs.length}] ${doc.title}`);

    try {
      const { description, topic } = await classifyDocument(doc.content, doc.title);

      await db.execute({
        sql:  "UPDATE documents SET description = ?, topic = ? WHERE id = ?",
        args: [description, topic, doc.id],
      });

      const preview = description ? description.slice(0, 80) : "(null)";
      console.log(`  → topic: ${topic} | description: ${preview}${description && description.length > 80 ? "…" : ""}`);
      succeeded++;
    } catch (err) {
      console.error(`  ✗ FAILED: ${err.message}`);
      failed++;
      failedIds.push(doc.id);
    }

    // Rate-limit buffer between requests
    if (i < docs.length - 1) {
      await new Promise((res) => setTimeout(res, 1000));
    }
  }

  console.log(`\n✓ Backfill complete: ${succeeded} succeeded, ${failed} failed, ${docs.length - succeeded - failed} skipped`);

  if (failedIds.length > 0) {
    console.log("\nFailed document IDs:");
    failedIds.forEach((id) => console.log(`  ${id}`));
  }
}

backfill();
