import "dotenv/config";
import { getDb } from "../lib/db/client.js";
import { classifyDocument } from "../lib/ai/classify-document.js";

async function fix() {
  const db = getDb();

  // Find docs whose description was cut at exactly 200 chars
  const result = await db.execute(
    "SELECT id, title, content, description FROM documents WHERE LENGTH(description) = 200"
  );
  const docs = result.rows;

  if (docs.length === 0) {
    console.log("✓ No truncated descriptions found");
    return;
  }

  console.log(`Found ${docs.length} doc(s) with 200-char truncated description.\n`);

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    console.log(`[${i + 1}/${docs.length}] ${doc.title}`);
    console.log(`  Old: ${doc.description}`);

    try {
      const { description } = await classifyDocument(doc.content, doc.title);
      await db.execute({
        sql:  "UPDATE documents SET description = ? WHERE id = ?",
        args: [description, doc.id],
      });
      console.log(`  New: ${description}`);
      console.log("  ✓ Fixed\n");
    } catch (err) {
      console.error(`  ✗ Failed: ${err.message}\n`);
    }
  }
}

fix().catch(console.error);
