// One-time seed of the FTUE starter template doc + 20 questions.
// Tier 1 operation. Inserts only. Aborts if template already exists.
// Recovery: run the two DELETE statements printed at the end.

import { createClient } from '@libsql/client';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

const DB_URL = process.env.TURSO_DATABASE_URL;
const DB_TOKEN = process.env.TURSO_AUTH_TOKEN;
const USER_ID = process.env.SEED_USER_ID;
const JSON_PATH = process.argv[2] || 'scripts/STARTER-DOC-QUESTIONS.json';

if (!DB_URL) { console.error('FATAL: TURSO_DATABASE_URL not set.'); process.exit(1); }
if (!USER_ID) { console.error('FATAL: SEED_USER_ID not set.'); process.exit(1); }

const redactedUrl = DB_URL.replace(/\/\/[^@]+@/, '//[redacted]@');
console.log(`\nTarget DB: ${redactedUrl}`);
console.log(`Target user id: ${USER_ID}`);
console.log(`JSON source: ${JSON_PATH}`);
console.log('Confirm. Ctrl-C within 3s to abort.\n');
await new Promise(r => setTimeout(r, 3000));

const db = createClient({ url: DB_URL, authToken: DB_TOKEN });
const lines = [];
const log = (s) => { lines.push(s); console.log(s); };

// --- 1. Lookup user ---
const userLookup = await db.execute({
  sql: 'SELECT id FROM users WHERE id = ?',
  args: [USER_ID],
});
if (userLookup.rows.length === 0) {
  console.error(`FATAL: No user with id ${USER_ID}.`);
  process.exit(1);
}
const userId = userLookup.rows[0].id;
log(`User: ${userId}`);

// --- 2. Idempotency check ---
const existing = await db.execute({
  sql: `SELECT id, title FROM documents WHERE user_id = ? AND id LIKE 'tmpl_doc_%'`,
  args: [userId],
});
if (existing.rows.length > 0) {
  console.error(`\nABORT: Template doc(s) already exist on this account:`);
  for (const r of existing.rows) console.error(`  - id=${r.id}, title="${r.title}"`);
  console.error(`\nIf you want to re-seed, run these first (will cascade-delete questions):`);
  console.error(`  DELETE FROM documents WHERE user_id = '${userId}' AND id LIKE 'tmpl_doc_%';`);
  process.exit(1);
}

// --- 3. Load and validate JSON ---
let json;
try {
  json = JSON.parse(readFileSync(JSON_PATH, 'utf8'));
} catch (e) {
  console.error(`FATAL: Could not read JSON at ${JSON_PATH}: ${e.message}`);
  process.exit(1);
}
const { doc: docMeta, questions } = json;
if (!docMeta || !Array.isArray(questions)) {
  console.error('FATAL: JSON missing doc or questions.');
  process.exit(1);
}
if (questions.length !== 20) {
  console.error(`FATAL: Expected 20 questions, got ${questions.length}.`);
  process.exit(1);
}
const orders = questions.map(q => q.order).sort((a,b) => a-b);
for (let i = 0; i < 20; i++) {
  if (orders[i] !== i + 1) {
    console.error(`FATAL: Order field mismatch. Expected 1..20, got ${orders.join(',')}.`);
    process.exit(1);
  }
}

// --- 4. Build rows ---
const docId = `tmpl_doc_${randomUUID().slice(0, 8)}`;
const now = Date.now();

const docArgs = [
  docId,
  userId,
  docMeta.title,
  docMeta.description,           // content
  JSON.stringify([docMeta.topic]), // themes
  questions.length,
  now,
  0,                              // is_public — private template, not in /browse
  docMeta.description,
  docMeta.topic,
];

const sortedQs = [...questions].sort((a, b) => a.order - b.order);
const qRows = sortedQs.map(q => {
  const orderStr = String(q.order).padStart(2, '0');
  const qid = `tmpl_q${orderStr}_${randomUUID().slice(0, 8)}`;
  return [
    qid, docId, userId, q.question, q.type, q.answer,
    null, null,                   // explanation, source_reference
    now,                          // next_review_at — irrelevant for template, won't be studied
    0, 0, 0, 0, 0,                // SR counters
    1,                            // current_interval_days default
    now + q.order,                // created_at staggered by order
    0,                            // is_retired
  ];
});

// --- 5. Print plan ---
log('');
log('PLAN:');
log(`  INSERT 1 doc: id=${docId}, title="${docMeta.title}", is_public=0`);
log(`  INSERT 20 questions: ids tmpl_q01_xxx … tmpl_q20_xxx, all FK to docId`);
log(`  All scoped to user_id=${userId}`);
log('');
log('Proceeding in 3s. Ctrl-C to abort.');
await new Promise(r => setTimeout(r, 3000));

// --- 6. Atomic batch ---
const docStmt = {
  sql: `INSERT INTO documents
    (id, user_id, title, content, themes, question_count, created_at, is_public, description, topic)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  args: docArgs,
};
const qStmts = qRows.map(args => ({
  sql: `INSERT INTO questions
    (id, document_id, user_id, question_text, question_type, answer_text,
     explanation, source_reference, next_review_at, review_count, correct_count,
     incorrect_count, correct_streak, hard_count, current_interval_days, created_at, is_retired)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  args,
}));

await db.batch([docStmt, ...qStmts], 'write');

log('');
log('Seed complete.');

// --- 7. Verify ---
const vDoc = await db.execute({ sql: 'SELECT id, title, question_count FROM documents WHERE id = ?', args: [docId] });
const vCount = await db.execute({ sql: 'SELECT COUNT(*) AS n FROM questions WHERE document_id = ?', args: [docId] });
const vSample = await db.execute({
  sql: `SELECT id, substr(question_text, 1, 70) AS preview FROM questions WHERE document_id = ? ORDER BY id LIMIT 5`,
  args: [docId],
});

log('');
log('VERIFICATION:');
log(`  Doc row present: ${vDoc.rows.length === 1 ? 'YES' : 'NO'}`);
log(`  Questions count: ${vCount.rows[0].n} (expected 20)`);
log(`  First 5 questions sorted by id:`);
for (const r of vSample.rows) log(`    ${r.id}  →  ${r.preview}…`);

log('');
log('ROLLBACK (run if anything looks wrong — cascades to questions):');
log(`  DELETE FROM documents WHERE id = '${docId}';`);

log('');
log(`TEMPLATE DOC ID (save this — chunk 1 will reference it): ${docId}`);

// --- 8. Save report ---
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const reportPath = `scripts/seed-template-report-${ts}.md`;
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, lines.join('\n'));
console.log(`\nReport saved: ${reportPath}\n`);

await db.close?.();
