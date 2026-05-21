// scripts/notes-v5-snapshot-at-risk-user.mjs
// USAGE: node scripts/notes-v5-snapshot-at-risk-user.mjs
//
// Read-only snapshot of the at-risk user's notes data for preservation
// during the v5 wipe (per Amendment B of docs/specs/notes-feature-masterplan-v5.md).
// Writes a JSON file to disk and validates it before exiting.
//
// SAFETY: this script does NOT mutate production. Only SELECTs.
// Output: notes-snapshot-<USER_ID>-<UNIX_TS>.json in the script's working dir
// Also writes a second copy to ~/Documents/repetita-snapshots/ if that dir exists,
// for belt-and-braces local durability (operator should also manually copy to
// iCloud/Dropbox/etc per the agreed plan).

import { createClient } from '@libsql/client';
import { config } from 'dotenv';
import { writeFileSync, readFileSync, copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

config({ path: '.env.local' });

const AT_RISK_USER_ID = 'user_3DXRFF0vJ83ZIQy2UiZsZHoYLRY';
const EXPECTED_DOC_COUNT = 2;

const DB_URL = process.env.TURSO_DATABASE_URL;
const DB_TOKEN = process.env.TURSO_AUTH_TOKEN;

function die(msg) {
  console.error(`\nFATAL: ${msg}\n`);
  process.exit(1);
}

if (!DB_URL) die('TURSO_DATABASE_URL not set. Add it to .env.local.');
if (!DB_TOKEN) die('TURSO_AUTH_TOKEN not set. Add it to .env.local.');

// Hard guard: refuse to run against any DB that isn't memorium-recovery.
if (!DB_URL.includes('memorium-recovery')) {
  die(
    `TURSO_DATABASE_URL does not point at memorium-recovery. ` +
    `Refusing to snapshot from a non-production DB. URL host fragment: ` +
    `${DB_URL.replace(/\/\/[^@]+@/, '//[redacted]@').slice(0, 80)}…`
  );
}

const redactedUrl = DB_URL.replace(/\/\/[^@]+@/, '//[redacted]@');
console.log(`\n──────── Notes v5 — at-risk user snapshot ────────`);
console.log(`Target DB:   ${redactedUrl}`);
console.log(`Target user: ${AT_RISK_USER_ID}`);
console.log(`Mode:        READ-ONLY (SELECT only)`);
console.log(`If this is wrong, Ctrl-C within 3 seconds.\n`);
await new Promise((r) => setTimeout(r, 3000));

const db = createClient({ url: DB_URL, authToken: DB_TOKEN });

// ─── Read-only queries ─────────────────────────────────────────────────────

console.log('Querying documents…');
const docsRes = await db.execute({
  sql: `SELECT * FROM documents WHERE user_id = ? AND source_type = 'note'`,
  args: [AT_RISK_USER_ID],
});
const documents = docsRes.rows;
console.log(`  → ${documents.length} note document(s)`);

if (documents.length !== EXPECTED_DOC_COUNT) {
  console.warn(
    `\n⚠  Document count (${documents.length}) does not match expected (${EXPECTED_DOC_COUNT}). ` +
    `Audit was captured at a point in time; the live DB may have drifted. ` +
    `Operator should investigate before relying on this snapshot.\n`
  );
}

const docIds = documents.map((d) => d.id);

let questions = [];
let sessionAnswers = [];

if (docIds.length > 0) {
  // Placeholders for IN(...) clause
  const placeholders = docIds.map(() => '?').join(',');

  console.log('Querying questions…');
  const qRes = await db.execute({
    sql: `SELECT * FROM questions WHERE document_id IN (${placeholders})`,
    args: docIds,
  });
  questions = qRes.rows;
  console.log(`  → ${questions.length} question(s)`);

  if (questions.length > 0) {
    const qIds = questions.map((q) => q.id);
    const qPlaceholders = qIds.map(() => '?').join(',');

    console.log('Querying session_answers…');
    const saRes = await db.execute({
      sql: `SELECT * FROM session_answers WHERE question_id IN (${qPlaceholders})`,
      args: qIds,
    });
    sessionAnswers = saRes.rows;
    console.log(`  → ${sessionAnswers.length} session_answer(s)`);
  }
}

// ─── Assemble snapshot ─────────────────────────────────────────────────────

const snapshotAt = Math.floor(Date.now() / 1000);
const snapshot = {
  schema_version: 'pre-v5',
  snapshot_at: snapshotAt,
  source_db: 'memorium-recovery',
  user_id: AT_RISK_USER_ID,
  record_counts: {
    documents: documents.length,
    questions: questions.length,
    session_answers: sessionAnswers.length,
  },
  documents,
  questions,
  session_answers: sessionAnswers,
};

// Serialize BigInts (libsql sometimes returns INTEGER as bigint) for JSON.stringify
const json = JSON.stringify(
  snapshot,
  (_key, value) => (typeof value === 'bigint' ? Number(value) : value),
  2
);

const filename = `notes-snapshot-${AT_RISK_USER_ID}-${snapshotAt}.json`;
const primaryPath = resolve(process.cwd(), filename);

writeFileSync(primaryPath, json, 'utf8');
console.log(`\nWrote primary snapshot:\n  ${primaryPath}`);

// ─── Validation: parse it back, verify counts + sample rows ────────────────

console.log('\nValidating snapshot…');
const reparsed = JSON.parse(readFileSync(primaryPath, 'utf8'));

const validationErrors = [];

if (reparsed.record_counts.documents !== documents.length) {
  validationErrors.push(
    `documents count mismatch: file=${reparsed.record_counts.documents}, queried=${documents.length}`
  );
}
if (reparsed.record_counts.questions !== questions.length) {
  validationErrors.push(
    `questions count mismatch: file=${reparsed.record_counts.questions}, queried=${questions.length}`
  );
}
if (reparsed.record_counts.session_answers !== sessionAnswers.length) {
  validationErrors.push(
    `session_answers count mismatch: file=${reparsed.record_counts.session_answers}, queried=${sessionAnswers.length}`
  );
}

// Byte-identical sample check: first row of each non-empty table
function sampleEq(a, b, label) {
  // Use JSON canonicalisation to compare bigint-bearing rows fairly.
  const sa = JSON.stringify(a, (_k, v) => (typeof v === 'bigint' ? Number(v) : v));
  const sb = JSON.stringify(b);
  if (sa !== sb) validationErrors.push(`sample row mismatch in ${label}`);
}

if (documents.length > 0) sampleEq(documents[0], reparsed.documents[0], 'documents');
if (questions.length > 0) sampleEq(questions[0], reparsed.questions[0], 'questions');
if (sessionAnswers.length > 0) sampleEq(sessionAnswers[0], reparsed.session_answers[0], 'session_answers');

if (validationErrors.length > 0) {
  console.error('\n❌ VALIDATION FAILED:');
  for (const e of validationErrors) console.error(`  - ${e}`);
  console.error(
    '\nSnapshot file exists but did not pass validation. ' +
    'Do NOT proceed to Chunk 1. Investigate before re-running.\n'
  );
  process.exit(2);
}
console.log('  ✓ Record counts match');
console.log('  ✓ Sample rows byte-identical after re-parse');

// ─── Optional second copy to ~/Documents/repetita-snapshots/ ───────────────

const secondaryDir = join(homedir(), 'Documents', 'repetita-snapshots');
let secondaryPath = null;
try {
  if (!existsSync(secondaryDir)) {
    mkdirSync(secondaryDir, { recursive: true });
    console.log(`\nCreated ${secondaryDir}`);
  }
  if (statSync(secondaryDir).isDirectory()) {
    secondaryPath = join(secondaryDir, filename);
    copyFileSync(primaryPath, secondaryPath);
    console.log(`Wrote secondary copy:\n  ${secondaryPath}`);
  }
} catch (err) {
  console.warn(`\n⚠  Could not write secondary copy: ${err.message}`);
  console.warn(`   Primary copy is at ${primaryPath} — operator must manually duplicate.`);
}

// ─── Summary ──────────────────────────────────────────────────────────────

console.log(`\n──────── SUMMARY ────────`);
console.log(`User ID:            ${AT_RISK_USER_ID}`);
console.log(`Documents:          ${documents.length}`);
console.log(`Questions:          ${questions.length}`);
console.log(`Session answers:    ${sessionAnswers.length}`);
console.log(`Snapshot timestamp: ${snapshotAt} (${new Date(snapshotAt * 1000).toISOString()})`);
console.log(`Primary path:       ${primaryPath}`);
console.log(`Secondary path:     ${secondaryPath ?? '(not written — see warning above)'}`);
console.log(`Validation:         PASSED`);
console.log(`\n⚠  OPERATOR ACTION REQUIRED:`);
console.log(`   Manually copy this file to a durable location (iCloud, Dropbox, etc.)`);
console.log(`   BEFORE proceeding to Chunk 1. Local disk + Documents/ is not enough.\n`);

process.exit(0);
