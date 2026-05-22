// scripts/notes-v5-restore-at-risk-user.mjs
// USAGE: node scripts/notes-v5-restore-at-risk-user.mjs <snapshot-json-path>
//
// Restores the at-risk user's preserved notes data from a snapshot JSON file
// produced by notes-v5-snapshot-at-risk-user.mjs.
//
// Idempotency: this script will REFUSE to run if any of the snapshot's documents
// already exist in the target DB (by id). Restore is single-shot by design.
// To re-run after a partial failure, you must manually clean up first.
//
// SAFETY: target DB is hard-checked against the snapshot's source_db field.

import { createClient } from '@libsql/client';
import { config } from 'dotenv';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

config({ path: '.env.local' });

const DB_URL = process.env.TURSO_DATABASE_URL;
const DB_TOKEN = process.env.TURSO_AUTH_TOKEN;

function die(msg) {
  console.error(`\nFATAL: ${msg}\n`);
  process.exit(1);
}

// ─── Args ──────────────────────────────────────────────────────────────────

const snapshotPath = process.argv[2];
if (!snapshotPath) die('Usage: node scripts/notes-v5-restore-at-risk-user.mjs <snapshot-json-path>');
if (!DB_URL) die('TURSO_DATABASE_URL not set. Add it to .env.local.');
if (!DB_TOKEN) die('TURSO_AUTH_TOKEN not set. Add it to .env.local.');

// Hard guard: refuse to run against any DB that isn't memorium-recovery.
if (!DB_URL.includes('memorium-recovery')) {
  die(
    `TURSO_DATABASE_URL does not point at memorium-recovery. ` +
    `Refusing to restore into a non-production DB. URL host fragment: ` +
    `${DB_URL.replace(/\/\/[^@]+@/, '//[redacted]@').slice(0, 80)}…`
  );
}

// ─── Load snapshot ─────────────────────────────────────────────────────────

const absPath = resolve(process.cwd(), snapshotPath);
console.log(`\n──────── Notes v5 — at-risk user restore ────────`);
console.log(`Snapshot file: ${absPath}`);

let snapshot;
try {
  snapshot = JSON.parse(readFileSync(absPath, 'utf8'));
} catch (err) {
  die(`Could not read or parse snapshot file: ${err.message}`);
}

if (snapshot.source_db !== 'memorium-recovery') {
  die(`Snapshot source_db is '${snapshot.source_db}', expected 'memorium-recovery'.`);
}
if (!snapshot.user_id) die('Snapshot has no user_id.');
if (!Array.isArray(snapshot.documents)) die('Snapshot has no documents array.');
if (!Array.isArray(snapshot.questions)) die('Snapshot has no questions array.');
if (!Array.isArray(snapshot.session_answers)) die('Snapshot has no session_answers array.');

const redactedUrl = DB_URL.replace(/\/\/[^@]+@/, '//[redacted]@');
console.log(`Target DB:     ${redactedUrl}`);
console.log(`Target user:   ${snapshot.user_id}`);
console.log(`Snapshot taken: ${new Date(snapshot.snapshot_at * 1000).toISOString()}`);
console.log(`Will restore:  ${snapshot.documents.length} doc(s), ${snapshot.questions.length} question(s), ${snapshot.session_answers.length} session_answer(s)`);
console.log(`\nIf this is wrong, Ctrl-C within 5 seconds.\n`);
await new Promise((r) => setTimeout(r, 5000));

const db = createClient({ url: DB_URL, authToken: DB_TOKEN });

// ─── Idempotency guard: refuse if any target row already exists ────────────

console.log('Checking for existing rows that would conflict…');
{
  const docIds = snapshot.documents.map((d) => d.id);
  if (docIds.length > 0) {
    const placeholders = docIds.map(() => '?').join(',');
    const existing = await db.execute({
      sql: `SELECT id FROM documents WHERE id IN (${placeholders})`,
      args: docIds,
    });
    if (existing.rows.length > 0) {
      die(
        `Documents already exist in target DB: ${existing.rows.map((r) => r.id).join(', ')}. ` +
        `Restore is single-shot. Manually clean up before re-running.`
      );
    }
  }

  const qIds = snapshot.questions.map((q) => q.id);
  if (qIds.length > 0) {
    // SQLite IN clause limit ≈ 999; we have 38, well under.
    const placeholders = qIds.map(() => '?').join(',');
    const existing = await db.execute({
      sql: `SELECT id FROM questions WHERE id IN (${placeholders})`,
      args: qIds,
    });
    if (existing.rows.length > 0) {
      die(
        `Questions already exist in target DB: ${existing.rows.length} conflict(s). ` +
        `Restore is single-shot. Manually clean up before re-running.`
      );
    }
  }

  const saIds = snapshot.session_answers.map((s) => s.id);
  if (saIds.length > 0) {
    const placeholders = saIds.map(() => '?').join(',');
    const existing = await db.execute({
      sql: `SELECT id FROM session_answers WHERE id IN (${placeholders})`,
      args: saIds,
    });
    if (existing.rows.length > 0) {
      die(
        `Session_answers already exist in target DB: ${existing.rows.length} conflict(s). ` +
        `Restore is single-shot. Manually clean up before re-running.`
      );
    }
  }
}
console.log('  ✓ No conflicts. Safe to proceed.');

// ─── Build transaction ─────────────────────────────────────────────────────

// Map document_id → its legacy block id, so we can fill questions.block_id.
const docIdToBlockId = new Map();

const statements = [];

// 1) Documents
for (const d of snapshot.documents) {
  const blockId = `block_${d.id}_legacy`;
  docIdToBlockId.set(d.id, blockId);

  // Restore document. v5 conventions:
  //   - source_type='note'
  //   - content='' (v5 reads from note_blocks for notes)
  //   - note_version=0 (fresh)
  //   - note_draft_content preserved from snapshot (may be null/empty)
  //   - All other columns preserved verbatim from snapshot.
  statements.push({
    sql: `INSERT INTO documents (
      id, user_id, title, content, themes, question_count, created_at,
      is_public, description, topic, concepts_json,
      source_type, note_draft_content, last_generated_at, updated_at, note_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      d.id,
      d.user_id,
      d.title,
      '', // v5: content unused for notes; canonical content lives in note_blocks
      d.themes ?? null,
      d.question_count ?? 0,
      d.created_at,
      d.is_public ?? 1, // preserve snapshot value; default to 1 if absent
      d.description ?? null,
      d.topic ?? null,
      d.concepts_json ?? null,
      'note',
      d.note_draft_content ?? null,
      d.last_generated_at ?? null,
      d.updated_at ?? null,
      0, // note_version: fresh
    ],
  });
}

// 2) note_blocks — one "legacy" block per document, holding the snapshot's content
for (const d of snapshot.documents) {
  const blockId = docIdToBlockId.get(d.id);
  const sealedAt = d.last_generated_at ?? d.created_at;
  const updatedAt = sealedAt;
  statements.push({
    sql: `INSERT INTO note_blocks (
      id, document_id, content, sealed_at, updated_at,
      is_stale, stale_since, version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      blockId,
      d.id,
      d.content ?? '', // snapshot's original documents.content becomes the legacy block content
      sealedAt,
      updatedAt,
      0, // is_stale
      null, // stale_since
      0, // version
    ],
  });
}

// 3) Questions — restore verbatim, but ensure block_id is set to the legacy block,
//    and clear any retired_at/retired_reason (these notes are fresh again).
for (const q of snapshot.questions) {
  const blockId = docIdToBlockId.get(q.document_id);
  if (!blockId) die(`Question ${q.id} references unknown document_id ${q.document_id}.`);

  statements.push({
    sql: `INSERT INTO questions (
      id, document_id, user_id,
      question_text, question_type, answer_text, explanation, source_reference,
      next_review_at, review_count, correct_count, incorrect_count,
      correct_streak, hard_count, current_interval_days,
      created_at, is_retired,
      concept_id, difficulty,
      block_id, retired_at, retired_reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      q.id,
      q.document_id,
      q.user_id,
      q.question_text,
      q.question_type,
      q.answer_text,
      q.explanation ?? null,
      q.source_reference ?? null,
      q.next_review_at,
      q.review_count ?? 0,
      q.correct_count ?? 0,
      q.incorrect_count ?? 0,
      q.correct_streak ?? 0,
      q.hard_count ?? 0,
      q.current_interval_days ?? 1,
      q.created_at,
      q.is_retired ?? 0,
      q.concept_id ?? null,
      q.difficulty ?? null,
      blockId, // every restored question points at the legacy block
      null, // retired_at — fresh
      null, // retired_reason — fresh
    ],
  });
}

// 4) session_answers — verbatim. FKs hold because we restored original question IDs above.
for (const sa of snapshot.session_answers) {
  statements.push({
    sql: `INSERT INTO session_answers (
      id, session_id, question_id, user_id,
      user_attempt, grade, elaboration_note, answered_at, interval_days
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      sa.id,
      sa.session_id,
      sa.question_id,
      sa.user_id,
      sa.user_attempt ?? null,
      sa.grade,
      sa.elaboration_note ?? null,
      sa.answered_at,
      sa.interval_days ?? null,
    ],
  });
}

console.log(`\nPrepared ${statements.length} INSERT statement(s):`);
console.log(`  - ${snapshot.documents.length} documents`);
console.log(`  - ${snapshot.documents.length} note_blocks (one legacy block per doc)`);
console.log(`  - ${snapshot.questions.length} questions`);
console.log(`  - ${snapshot.session_answers.length} session_answers`);

// ─── Execute as a single transaction ───────────────────────────────────────

console.log('\nExecuting transaction…');
try {
  await db.batch(statements, 'write');
  console.log('  ✓ Transaction committed');
} catch (err) {
  console.error(`\n❌ Transaction failed: ${err.message}`);
  console.error('Nothing was committed. Snapshot file is intact. Investigate before retry.\n');
  process.exit(2);
}

// ─── Verify ────────────────────────────────────────────────────────────────

console.log('\nVerifying restored counts…');
const docsRes = await db.execute({
  sql: `SELECT COUNT(*) AS n FROM documents WHERE user_id = ? AND source_type = 'note'`,
  args: [snapshot.user_id],
});
const qRes = await db.execute({
  sql: `SELECT COUNT(*) AS n FROM questions q
        JOIN documents d ON d.id = q.document_id
        WHERE d.user_id = ? AND d.source_type = 'note'`,
  args: [snapshot.user_id],
});
const saRes = await db.execute({
  sql: `SELECT COUNT(*) AS n FROM session_answers sa
        JOIN questions q ON q.id = sa.question_id
        JOIN documents d ON d.id = q.document_id
        WHERE d.user_id = ? AND d.source_type = 'note'`,
  args: [snapshot.user_id],
});
const blocksRes = await db.execute({
  sql: `SELECT COUNT(*) AS n FROM note_blocks nb
        JOIN documents d ON d.id = nb.document_id
        WHERE d.user_id = ?`,
  args: [snapshot.user_id],
});

const actual = {
  documents: Number(docsRes.rows[0].n),
  questions: Number(qRes.rows[0].n),
  session_answers: Number(saRes.rows[0].n),
  note_blocks: Number(blocksRes.rows[0].n),
};
const expected = {
  documents: snapshot.documents.length,
  questions: snapshot.questions.length,
  session_answers: snapshot.session_answers.length,
  note_blocks: snapshot.documents.length, // one legacy block per doc
};

let allGood = true;
for (const k of Object.keys(expected)) {
  const ok = actual[k] === expected[k];
  console.log(`  ${ok ? '✓' : '❌'} ${k}: actual=${actual[k]}, expected=${expected[k]}`);
  if (!ok) allGood = false;
}

if (!allGood) {
  console.error('\n❌ COUNT MISMATCH after restore. Transaction committed but state is unexpected.');
  console.error('Investigate immediately. Snapshot file is still intact.\n');
  process.exit(3);
}

console.log(`\n──────── RESTORE COMPLETE ────────`);
console.log(`User:               ${snapshot.user_id}`);
console.log(`Documents restored: ${actual.documents}`);
console.log(`Note blocks:        ${actual.note_blocks}`);
console.log(`Questions restored: ${actual.questions}`);
console.log(`Session answers:    ${actual.session_answers}`);
console.log(`\nNext: user-clock verification. Have the user log in.\n`);

process.exit(0);
