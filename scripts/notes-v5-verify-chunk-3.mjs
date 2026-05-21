// scripts/notes-v5-verify-chunk-3.mjs
//
// Verification suite for the v5 Generate route (Chunk 3). NOT runnable from
// a clean checkout — see TEST HOOKS below.
//
// USAGE
//   1. Re-add the test hooks (see TEST HOOKS).
//   2. Start the dev server in another shell, with the bypass env vars set:
//
//        TURSO_DATABASE_URL=file:.data/memorium-local.db \
//        TURSO_AUTH_TOKEN= \
//        NOTES_TEST_BYPASS_USER=user_v5test \
//        NOTES_AI_TEST_MOCK=1 \
//        ANTHROPIC_API_KEY=sk-test \
//        npm run dev
//
//   3. Run this script:
//
//        TURSO_DATABASE_URL_LOCAL=file:.data/memorium-local.db \
//        node scripts/notes-v5-verify-chunk-3.mjs
//
//   4. Remove the test hooks again before committing.
//
// TEST HOOKS (all three must be present for the suite to run)
//
//   (a) middleware.js — at the top of the clerkMiddleware callback, before
//       the auth.protect() call, add:
//
//         if (process.env.NOTES_TEST_BYPASS_USER) {
//           return;
//         }
//
//   (b) app/api/notes/[id]/generate/route.js — replace the `await auth()` at
//       the top of POST with:
//
//         const testUser = process.env.NOTES_TEST_BYPASS_USER;
//         const { userId, sessionClaims } = testUser
//           ? { userId: testUser, sessionClaims: { publicMetadata: { hasNotesAccess: true } } }
//           : await auth();
//
//   (c) lib/ai/generate-questions-for-delta.js — at the top of
//       generateQuestionsForDelta, before the existing body, add a block
//       that on NOTES_AI_TEST_MOCK:
//         - parses content for "TRIGGER_BUMP:<blockId>" and performs
//           UPDATE note_blocks SET version = version + 1 WHERE id = <blockId>
//           inline (simulates a concurrent edit landing between the route's
//           getNoteById and its write)
//         - on "TRIGGER_NO_DISTINCT" → throws NoDistinctMaterialError
//         - on "TRIGGER_HARD_FAIL"   → throws a plain Error
//         - otherwise returns 3 deterministic mock questions
//       Plus a parallel hook in lib/ai/generate-concepts.js that returns a
//       single mock concept when NOTES_AI_TEST_MOCK is set.
//
// The script writes fixtures DIRECTLY to the local sqlite file (same DB the
// dev server points at) and asserts state by querying it. The Generate
// endpoint is exercised via HTTP through the dev server.

import { createClient } from '@libsql/client';

const BASE_URL = process.env.NOTES_TEST_BASE_URL || 'http://localhost:3000';
const DB_URL = process.env.TURSO_DATABASE_URL_LOCAL;

if (!DB_URL || !DB_URL.startsWith('file:')) {
  console.error(
    `FATAL: TURSO_DATABASE_URL_LOCAL must be a file: URL. Got: ${DB_URL ?? '(unset)'}`
  );
  process.exit(1);
}

const db = createClient({ url: DB_URL });

const USER_ID = 'user_v5test';

let docCounter = 0;
function nextDocId(label) {
  docCounter += 1;
  return `doc_v5gen_${label}_${docCounter}`;
}

let PASS = 0;
let FAIL = 0;
function ok(label, cond, detail) {
  if (cond) {
    console.log(`  ✓ ${label}`);
    PASS++;
  } else {
    console.log(`  ✗ ${label}`);
    if (detail !== undefined) {
      console.log(`    detail: ${JSON.stringify(detail, null, 2).slice(0, 600)}`);
    }
    FAIL++;
  }
}

async function ensureUser() {
  const now = Math.floor(Date.now() / 1000);
  await db.execute({
    sql: `INSERT OR IGNORE INTO users (id, created_at, last_active_at) VALUES (?, ?, ?)`,
    args: [USER_ID, now, now],
  });
}

async function insertDoc({ docId, title = 'Test Note', draft = '', noteVersion = 0 }) {
  const now = Math.floor(Date.now() / 1000);
  await db.execute({
    sql: `INSERT INTO documents (
            id, user_id, title, content, themes, description, topic, concepts_json,
            question_count, is_public, source_type, note_draft_content, note_version, created_at
          ) VALUES (?, ?, ?, '', NULL, '', '', NULL, 0, 0, 'note', ?, ?, ?)`,
    args: [docId, USER_ID, title, draft, noteVersion, now],
  });
}

async function insertBlock({ id, docId, content, sealedAt, isStale = 0, staleSince = null, version = 1 }) {
  await db.execute({
    sql: `INSERT INTO note_blocks
            (id, document_id, content, sealed_at, updated_at, is_stale, stale_since, version)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, docId, content, sealedAt, sealedAt, isStale, staleSince, version],
  });
}

async function insertQuestion({ id, blockId, docId, retiredAt = null }) {
  const now = Math.floor(Date.now() / 1000);
  await db.execute({
    sql: `INSERT INTO questions
            (id, document_id, user_id, question_text, question_type, answer_text,
             explanation, source_reference, concept_id, difficulty,
             next_review_at, review_count, correct_count, incorrect_count,
             correct_streak, hard_count, current_interval_days, created_at, is_retired,
             block_id, retired_at, retired_reason)
          VALUES (?, ?, ?, ?, 'recall', ?, ?, NULL, NULL, 'easy',
                  ?, 0, 0, 0, 0, 0, 1, ?, ?,
                  ?, ?, ?)`,
    args: [
      id, docId, USER_ID,
      `Q text for ${id}`,
      `A text for ${id}`,
      'expl',
      now, now,
      retiredAt != null ? 1 : 0,
      blockId,
      retiredAt,
      retiredAt != null ? 'block_regenerated' : null,
    ],
  });
}

async function callPost(documentId) {
  const res = await fetch(`${BASE_URL}/api/notes/${documentId}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  let body;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

async function selectOne(sql, args) {
  const r = await db.execute({ sql, args: args ?? [] });
  return r.rows[0] ?? null;
}
async function selectAll(sql, args) {
  const r = await db.execute({ sql, args: args ?? [] });
  return r.rows;
}

// ─── Scenarios ───────────────────────────────────────────────────────────

async function scenarioA() {
  console.log('\n─── A: STALE-ONLY ───');
  const docId = nextDocId('A');
  const blockId = `blk_${docId}_1`;
  await ensureUser();
  await insertDoc({ docId });
  await insertBlock({
    id: blockId, docId, content: 'Some block content worth questions about widgets.',
    sealedAt: Math.floor(Date.now() / 1000) - 3600, isStale: 1,
    staleSince: Math.floor(Date.now() / 1000) - 1800, version: 1,
  });
  await insertQuestion({ id: 'q_orig_A1', blockId, docId });
  await insertQuestion({ id: 'q_orig_A2', blockId, docId });

  const { status, body } = await callPost(docId);
  ok('status 200', status === 200, { status, body });
  ok('regenerated_blocks has 1', body?.regenerated_blocks?.length === 1, body);
  ok('regenerated id matches', body?.regenerated_blocks?.[0] === blockId, body);
  ok('new_block_id is null', body?.new_block_id === null, body);
  ok('new_question_count > 0', (body?.new_question_count ?? 0) > 0, body);
  ok('still_needs_refresh empty', body?.still_needs_refresh?.length === 0, body);

  const oldQs = await selectAll(
    `SELECT id, retired_at, retired_reason, is_retired FROM questions WHERE id IN ('q_orig_A1','q_orig_A2')`
  );
  ok('2 original questions still exist', oldQs.length === 2, oldQs);
  ok('original q1 retired_at != NULL', oldQs[0].retired_at != null, oldQs[0]);
  ok('original q1 is_retired=1', Number(oldQs[0].is_retired) === 1, oldQs[0]);
  ok("original q1 retired_reason='block_regenerated'", oldQs[0].retired_reason === 'block_regenerated', oldQs[0]);

  const newQs = await selectAll(
    `SELECT id, retired_at FROM questions WHERE block_id = ? AND retired_at IS NULL`,
    [blockId]
  );
  ok('new active questions exist', newQs.length > 0, newQs);

  const block = await selectOne(
    `SELECT is_stale, stale_since, version FROM note_blocks WHERE id = ?`,
    [blockId]
  );
  ok('block is_stale=0', Number(block.is_stale) === 0, block);
  ok('block stale_since=NULL', block.stale_since == null, block);
  ok('block version bumped to 2', Number(block.version) === 2, block);

  const doc = await selectOne(`SELECT note_version FROM documents WHERE id = ?`, [docId]);
  ok('documents.note_version unchanged (no draft sealed)', Number(doc.note_version) === 0, doc);
}

async function scenarioB() {
  console.log('\n─── B: DRAFT-ONLY ───');
  const docId = nextDocId('B');
  await ensureUser();
  const draft = ('lorem ipsum word ').repeat(60); // 180 words
  await insertDoc({ docId, draft });

  const { status, body } = await callPost(docId);
  ok('status 200', status === 200, { status, body });
  ok('regenerated_blocks empty', body?.regenerated_blocks?.length === 0, body);
  ok('new_block_id present', !!body?.new_block_id, body);
  ok('new_question_count > 0', (body?.new_question_count ?? 0) > 0, body);

  const newBlock = await selectOne(
    `SELECT id, content, is_stale, stale_since, version FROM note_blocks WHERE id = ?`,
    [body.new_block_id]
  );
  ok('new block row exists', !!newBlock, newBlock);
  ok('new block content == draft', newBlock?.content === draft, { actual_len: newBlock?.content?.length, expected_len: draft.length });
  ok('new block version=1', Number(newBlock?.version) === 1, newBlock);
  ok('new block is_stale=0', Number(newBlock?.is_stale) === 0, newBlock);

  const qs = await selectAll(
    `SELECT id, retired_at FROM questions WHERE block_id = ? AND retired_at IS NULL`,
    [body.new_block_id]
  );
  ok('new active questions for new block', qs.length > 0, qs);

  const doc = await selectOne(`SELECT note_draft_content, note_version FROM documents WHERE id = ?`, [docId]);
  ok("note_draft_content=''", doc.note_draft_content === '', doc);
  ok('note_version bumped to 1', Number(doc.note_version) === 1, doc);
}

async function scenarioC() {
  console.log('\n─── C: MIXED (stale + draft) ───');
  const docId = nextDocId('C');
  const staleId = `blk_${docId}_stale`;
  await ensureUser();
  const draft = ('lorem ipsum word ').repeat(60);
  await insertDoc({ docId, draft });
  await insertBlock({
    id: staleId, docId, content: 'Old block about gizmos and gadgets.',
    sealedAt: Math.floor(Date.now() / 1000) - 7200, isStale: 1,
    staleSince: Math.floor(Date.now() / 1000) - 3600, version: 1,
  });
  await insertQuestion({ id: 'q_orig_C1', blockId: staleId, docId });

  const { status, body } = await callPost(docId);
  ok('status 200', status === 200, { status, body });
  ok('regenerated_blocks has stale', body?.regenerated_blocks?.includes(staleId), body);
  ok('new_block_id present', !!body?.new_block_id, body);

  const block = await selectOne(`SELECT is_stale, version FROM note_blocks WHERE id = ?`, [staleId]);
  ok('stale block flipped fresh', Number(block.is_stale) === 0 && Number(block.version) === 2, block);
  const newBlock = await selectOne(`SELECT version FROM note_blocks WHERE id = ?`, [body.new_block_id]);
  ok('new block version=1', Number(newBlock.version) === 1, newBlock);

  const doc = await selectOne(`SELECT note_draft_content, note_version FROM documents WHERE id = ?`, [docId]);
  ok('draft cleared', doc.note_draft_content === '', doc);
  ok('note_version=1', Number(doc.note_version) === 1, doc);
}

async function scenarioD() {
  console.log('\n─── D: RETIRE-NOT-DELETE (session_answers survive) ───');
  const docId = nextDocId('D');
  const blockId = `blk_${docId}_1`;
  const oldQId = `q_orig_D1`;
  const sessionId = `sess_D_${docCounter}`;
  const saId = `sa_D_${docCounter}`;
  await ensureUser();
  await insertDoc({ docId });
  await insertBlock({
    id: blockId, docId, content: 'Some block content worth retiring.',
    sealedAt: Math.floor(Date.now() / 1000) - 3600, isStale: 1,
    staleSince: Math.floor(Date.now() / 1000) - 1800, version: 1,
  });
  await insertQuestion({ id: oldQId, blockId, docId });
  const now = Math.floor(Date.now() / 1000);
  await db.execute({
    sql: `INSERT INTO study_sessions
            (id, user_id, started_at, questions_shown, questions_answered, correct_count, incorrect_count, skipped_count)
          VALUES (?, ?, ?, 1, 1, 1, 0, 0)`,
    args: [sessionId, USER_ID, now - 1000],
  });
  await db.execute({
    sql: `INSERT INTO session_answers (id, session_id, question_id, user_id, grade, answered_at)
          VALUES (?, ?, ?, ?, 'easy', ?)`,
    args: [saId, sessionId, oldQId, USER_ID, now - 900],
  });

  const { status } = await callPost(docId);
  ok('status 200', status === 200, { status });

  const oldQ = await selectOne(`SELECT id, retired_at FROM questions WHERE id = ?`, [oldQId]);
  ok('retired question STILL EXISTS', !!oldQ, oldQ);
  ok('retired question has retired_at != NULL', oldQ?.retired_at != null, oldQ);

  const sa = await selectOne(`SELECT id, question_id FROM session_answers WHERE id = ?`, [saId]);
  ok('session_answer STILL EXISTS', !!sa, sa);
  ok('session_answer.question_id unchanged', sa?.question_id === oldQId, sa);
}

async function scenarioE() {
  console.log('\n─── E: STALE BLOCK VERSION CONFLICT → 409, no DB writes ───');
  const docId = nextDocId('E');
  const blockId = `blk_${docId}_1`;
  await ensureUser();
  await insertDoc({ docId });
  // The block's content includes "TRIGGER_BUMP:<id>" — the AI mock parses
  // this and bumps the block's version mid-AI-call (deterministically between
  // Generate's load and write steps).
  const trigContent = `Block content E. TRIGGER_BUMP:${blockId}`;
  await insertBlock({
    id: blockId, docId, content: trigContent,
    sealedAt: Math.floor(Date.now() / 1000) - 3600, isStale: 1,
    staleSince: Math.floor(Date.now() / 1000) - 1800, version: 1,
  });
  await insertQuestion({ id: 'q_orig_E1', blockId, docId });

  const { status, body } = await callPost(docId);

  ok('status 409', status === 409, { status, body });
  ok("error='note_changed'", body?.error === 'note_changed', body);
  ok('current state included', !!body?.current, body);

  const block = await selectOne(`SELECT content, version, is_stale FROM note_blocks WHERE id = ?`, [blockId]);
  // Expected: version=2 (mock's bump), content unchanged (no write went through).
  ok('block version is the bumped value (2)', Number(block.version) === 2, block);
  ok('block content unchanged from seed', block.content === trigContent, block);
  ok('block still is_stale=1', Number(block.is_stale) === 1, block);

  const oldQ = await selectOne(`SELECT retired_at FROM questions WHERE id = 'q_orig_E1'`);
  ok('original question still active (retired_at NULL)', oldQ?.retired_at == null, oldQ);

  const allQs = await selectAll(`SELECT id FROM questions WHERE block_id = ?`, [blockId]);
  ok('no new questions inserted', allQs.length === 1, allQs);
}

async function scenarioF() {
  console.log('\n─── F: NOTHING TO DO → 422 ───');
  const docId = nextDocId('F');
  await ensureUser();
  await insertDoc({ docId, draft: 'too short' });

  const { status, body } = await callPost(docId);
  ok('status 422', status === 422, { status, body });
  ok("error='nothing_to_do'", body?.error === 'nothing_to_do', body);
}

async function scenarioG() {
  console.log('\n─── G: RATE LIMIT → 429 ───');
  const rateDocId = nextDocId('G_rate');
  await ensureUser();
  await insertDoc({ docId: rateDocId });
  const blockId = `blk_${rateDocId}_1`;
  await insertBlock({
    id: blockId, docId: rateDocId, content: 'rate-limit setup',
    sealedAt: Math.floor(Date.now() / 1000) - 60, isStale: 0, version: 1,
  });
  for (let i = 0; i < 30; i++) {
    await insertQuestion({ id: `q_rate_${i}`, blockId, docId: rateDocId });
  }

  const docId = nextDocId('G_target');
  await insertDoc({ docId, draft: ('lorem ipsum word ').repeat(60) });

  const { status, body } = await callPost(docId);
  ok('status 429', status === 429, { status, body });
  ok("error='rate_limited'", body?.error === 'rate_limited', body);

  await db.execute({ sql: `DELETE FROM questions WHERE id LIKE 'q_rate_%'` });
}

async function scenarioH() {
  console.log('\n─── H: NoDistinct on 1 of 2 stale blocks ───');
  const docId = nextDocId('H');
  const goodId = `blk_${docId}_good`;
  const badId = `blk_${docId}_bad`;
  await ensureUser();
  await insertDoc({ docId });
  await insertBlock({
    id: goodId, docId, content: 'Normal block content about elephants.',
    sealedAt: Math.floor(Date.now() / 1000) - 4000, isStale: 1,
    staleSince: Math.floor(Date.now() / 1000) - 2000, version: 1,
  });
  await insertBlock({
    id: badId, docId, content: 'TRIGGER_NO_DISTINCT placeholder body',
    sealedAt: Math.floor(Date.now() / 1000) - 3000, isStale: 1,
    staleSince: Math.floor(Date.now() / 1000) - 1500, version: 1,
  });
  await insertQuestion({ id: 'q_orig_H_bad', blockId: badId, docId });

  const { status, body } = await callPost(docId);
  ok('status 200', status === 200, { status, body });
  ok('regenerated_blocks contains good block', body?.regenerated_blocks?.includes(goodId), body);
  ok('regenerated_blocks does NOT contain bad block', !body?.regenerated_blocks?.includes(badId), body);
  ok('still_needs_refresh contains bad block', body?.still_needs_refresh?.includes(badId), body);

  const good = await selectOne(`SELECT is_stale, version FROM note_blocks WHERE id = ?`, [goodId]);
  ok('good block is_stale=0 and version=2', Number(good.is_stale) === 0 && Number(good.version) === 2, good);

  const bad = await selectOne(`SELECT is_stale, version FROM note_blocks WHERE id = ?`, [badId]);
  ok('bad block still is_stale=1', Number(bad.is_stale) === 1, bad);
  ok('bad block version unchanged', Number(bad.version) === 1, bad);
  const origH = await selectOne(`SELECT retired_at FROM questions WHERE id = 'q_orig_H_bad'`);
  ok("bad block's original question still active", origH?.retired_at == null, origH);
}

// ─── Cleanup helper — wipes prior verify-script state ────────────────────
async function wipeAll() {
  // FK cascade from documents → note_blocks, questions, session_answers,
  // question_feedback. study_sessions need explicit cleanup (no parent FK
  // out of documents).
  await db.execute({
    sql: `DELETE FROM documents WHERE user_id = ?`,
    args: [USER_ID],
  });
  await db.execute({
    sql: `DELETE FROM study_sessions WHERE user_id = ?`,
    args: [USER_ID],
  });
  await db.execute({
    sql: `DELETE FROM users WHERE id = ?`,
    args: [USER_ID],
  });
}

// ─── Run ────────────────────────────────────────────────────────────────

console.log(`\nGenerate verification — base URL: ${BASE_URL}`);
console.log(`DB: ${DB_URL}\n`);

await wipeAll();

const scenarios = [
  scenarioA, scenarioB, scenarioC, scenarioD, scenarioE,
  scenarioF, scenarioG, scenarioH,
];

for (const s of scenarios) {
  try {
    await s();
  } catch (err) {
    console.log(`  ✗ scenario threw: ${err.message}`);
    console.log(err.stack);
    FAIL++;
  }
}

console.log(`\n${PASS} passed, ${FAIL} failed`);
process.exit(FAIL === 0 ? 0 : 1);
