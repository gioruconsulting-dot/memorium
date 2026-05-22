// scripts/notes-v5-verify-chunk-6.mjs
//
// Contract-level verification suite for Chunk 6 server-side changes:
//   - Workstream B (study-these-now filter on POST /api/sessions/start)
//   - Workstream C (extended notes-list metadata — appended later this chunk)
//
// NOT runnable from a clean checkout — see TEST HOOKS below.
//
// USAGE
//   1. Re-add the test hooks (see TEST HOOKS).
//   2. Start the dev server in another shell with bypass env vars set:
//
//        TURSO_DATABASE_URL=file:.data/memorium-local.db \
//        TURSO_AUTH_TOKEN= \
//        NOTES_TEST_BYPASS_USER=user_v5test \
//        npm run dev
//
//   3. Run this script:
//
//        TURSO_DATABASE_URL_LOCAL=file:.data/memorium-local.db \
//        node scripts/notes-v5-verify-chunk-6.mjs
//
//   4. Remove the test hooks again before committing.
//
// TEST HOOKS (all that this suite touches; not all from prior chunks needed)
//
//   (a) middleware.js — at the top of the clerkMiddleware callback, before
//       the auth.protect() call, add:
//
//         if (process.env.NOTES_TEST_BYPASS_USER) {
//           return;
//         }
//
//   (b) app/api/sessions/start/route.js — replace the `await auth()` at the
//       top of POST with:
//
//         const testUser = process.env.NOTES_TEST_BYPASS_USER;
//         const { userId, sessionClaims } = testUser
//           ? { userId: testUser, sessionClaims: { publicMetadata: { hasNotesAccess: true } } }
//           : await auth();
//
//   (c) app/api/notes/list/route.js — same shim at top of GET (used by
//       Workstream C scenarios appended later this chunk).
//
// The script writes fixtures DIRECTLY to the local sqlite file (same DB the
// dev server points at) and asserts state via fetch + sqlite SELECT.

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
const OTHER_USER_ID = 'user_v5other';

let docCounter = 0;
function nextDocId(label) {
  docCounter += 1;
  return `doc_v5c6_${label}_${docCounter}`;
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
      console.log(`    detail: ${JSON.stringify(detail, null, 2).slice(0, 700)}`);
    }
    FAIL++;
  }
}

async function ensureUser(userId = USER_ID) {
  const now = Math.floor(Date.now() / 1000);
  await db.execute({
    sql: `INSERT OR IGNORE INTO users (id, created_at, last_active_at) VALUES (?, ?, ?)`,
    args: [userId, now, now],
  });
}

async function insertNoteDoc({ docId, userId = USER_ID, title = 'Note', draft = '' }) {
  const now = Math.floor(Date.now() / 1000);
  await db.execute({
    sql: `INSERT INTO documents (
            id, user_id, title, content, themes, description, topic, concepts_json,
            question_count, is_public, source_type, note_draft_content, note_version, created_at, updated_at
          ) VALUES (?, ?, ?, '', NULL, '', '', NULL, 0, 0, 'note', ?, 0, ?, ?)`,
    args: [docId, userId, title, draft, now, now],
  });
}

async function insertUploadedDoc({ docId, userId = USER_ID, title = 'Doc' }) {
  const now = Math.floor(Date.now() / 1000);
  await db.execute({
    sql: `INSERT INTO documents (
            id, user_id, title, content, themes, description, topic, concepts_json,
            question_count, is_public, source_type, created_at, updated_at
          ) VALUES (?, ?, ?, 'uploaded content', NULL, '', '', NULL, 0, 0, 'uploaded', ?, ?)`,
    args: [docId, userId, title, now, now],
  });
}

async function insertBlock({ id, docId, content = 'block content', sealedAt, isStale = 0, staleSince = null, version = 1 }) {
  const t = sealedAt ?? Math.floor(Date.now() / 1000) - 3600;
  await db.execute({
    sql: `INSERT INTO note_blocks
            (id, document_id, content, sealed_at, updated_at, is_stale, stale_since, version)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, docId, content, t, t, isStale, staleSince, version],
  });
}

// nextReviewAt: unix seconds. Pass a negative offset for "due now".
async function insertQuestion({
  id, docId, userId = USER_ID, blockId = null,
  nextReviewAt = -3600, retiredAt = null,
}) {
  const now = Math.floor(Date.now() / 1000);
  const nra = now + nextReviewAt;
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
      id, docId, userId,
      `Q text for ${id}`, `A text for ${id}`, 'expl',
      nra, now,
      retiredAt != null ? 1 : 0,
      blockId,
      retiredAt,
      retiredAt != null ? 'block_regenerated' : null,
    ],
  });
}

async function postStart({ fromNote, body = {} }) {
  const url = fromNote
    ? `${BASE_URL}/api/sessions/start?from_note=${encodeURIComponent(fromNote)}`
    : `${BASE_URL}/api/sessions/start`;
  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ limit: 100, ...body }),
  });
  let resBody;
  try { resBody = await res.json(); } catch { resBody = null; }
  return { status: res.status, body: resBody };
}

// ─── Workstream B scenarios ──────────────────────────────────────────────

// a. Happy path: 2 blocks, mixed due/not-due. Only due+active returned, all
//    from the target note.
async function scenarioBa() {
  console.log('\n─── B-a: from_note returns this note\'s active+due ───');
  const docId = nextDocId('Ba');
  const blkA = `blk_${docId}_A`;
  const blkB = `blk_${docId}_B`;
  await ensureUser();
  await insertNoteDoc({ docId });
  await insertBlock({ id: blkA, docId });
  await insertBlock({ id: blkB, docId });

  // Block A: 3 questions — 2 due, 1 future.
  await insertQuestion({ id: 'q_Ba_A1', docId, blockId: blkA, nextReviewAt: -3600 });
  await insertQuestion({ id: 'q_Ba_A2', docId, blockId: blkA, nextReviewAt: -1800 });
  await insertQuestion({ id: 'q_Ba_A3', docId, blockId: blkA, nextReviewAt: +3600 });
  // Block B: 2 questions — 1 due, 1 future.
  await insertQuestion({ id: 'q_Ba_B1', docId, blockId: blkB, nextReviewAt: -7200 });
  await insertQuestion({ id: 'q_Ba_B2', docId, blockId: blkB, nextReviewAt: +7200 });

  const { status, body } = await postStart({ fromNote: docId });
  ok('status 200', status === 200, { status, body });
  ok('sessionId present', !!body?.sessionId, body);
  ok('3 questions returned', body?.questions?.length === 3, body?.questions?.map(q => q.id));

  const returnedIds = new Set((body?.questions ?? []).map((q) => q.id));
  ok('includes q_Ba_A1 (due)', returnedIds.has('q_Ba_A1'), [...returnedIds]);
  ok('includes q_Ba_A2 (due)', returnedIds.has('q_Ba_A2'), [...returnedIds]);
  ok('includes q_Ba_B1 (due)', returnedIds.has('q_Ba_B1'), [...returnedIds]);
  ok('excludes q_Ba_A3 (future)', !returnedIds.has('q_Ba_A3'), [...returnedIds]);
  ok('excludes q_Ba_B2 (future)', !returnedIds.has('q_Ba_B2'), [...returnedIds]);
}

// b. Filter excludes questions from unrelated uploaded docs.
async function scenarioBb() {
  console.log('\n─── B-b: from_note excludes other docs\' questions ───');
  const noteId = nextDocId('Bb_note');
  const uploadId = nextDocId('Bb_upload');
  const blkN = `blk_${noteId}`;
  await ensureUser();
  await insertNoteDoc({ docId: noteId });
  await insertBlock({ id: blkN, docId: noteId });
  await insertQuestion({ id: 'q_Bb_note', docId: noteId, blockId: blkN, nextReviewAt: -3600 });

  // Uploaded doc has its own due questions — must not show up.
  await insertUploadedDoc({ docId: uploadId });
  await insertQuestion({ id: 'q_Bb_upload_1', docId: uploadId, blockId: null, nextReviewAt: -3600 });
  await insertQuestion({ id: 'q_Bb_upload_2', docId: uploadId, blockId: null, nextReviewAt: -7200 });

  const { status, body } = await postStart({ fromNote: noteId });
  ok('status 200', status === 200, { status, body });
  ok('exactly 1 question (the note\'s)', body?.questions?.length === 1, body?.questions);
  ok('the one question is from the note', body?.questions?.[0]?.id === 'q_Bb_note', body?.questions?.[0]);
}

// c. from_note pointing at a note owned by a different user → 404.
async function scenarioBc() {
  console.log('\n─── B-c: cross-user from_note → 404 ───');
  const otherDocId = nextDocId('Bc_other');
  await ensureUser();
  await ensureUser(OTHER_USER_ID);
  await insertNoteDoc({ docId: otherDocId, userId: OTHER_USER_ID });
  const otherBlk = `blk_${otherDocId}`;
  await insertBlock({ id: otherBlk, docId: otherDocId });
  await insertQuestion({ id: 'q_Bc_other', docId: otherDocId, userId: OTHER_USER_ID, blockId: otherBlk, nextReviewAt: -3600 });

  // Bypass is fixed to USER_ID; we're trying to study OTHER_USER's note.
  const { status, body } = await postStart({ fromNote: otherDocId });
  ok('status 404', status === 404, { status, body });
  ok("error='not_found'", body?.error === 'not_found', body);
}

// d. from_note absent → existing default behavior (smoke).
async function scenarioBd() {
  console.log('\n─── B-d: from_note absent → default behavior ───');
  // Existing scenarios already left some due questions in the DB for USER_ID;
  // we just need a non-empty session here.
  const { status, body } = await postStart({ fromNote: null });
  ok('status 200', status === 200, { status, body });
  ok('sessionId present', !!body?.sessionId, body);
  ok('questions array non-empty', (body?.questions?.length ?? 0) > 0, body?.questions?.length);
}

// e. All questions retired → empty session, no 404.
async function scenarioBe() {
  console.log('\n─── B-e: all-retired note → empty result ───');
  const docId = nextDocId('Be');
  const blkE = `blk_${docId}`;
  await ensureUser();
  await insertNoteDoc({ docId });
  await insertBlock({ id: blkE, docId });
  const now = Math.floor(Date.now() / 1000);
  // All three retired (retired_at = now-100). retired_at != NULL also marks
  // is_retired=1 via the helper.
  await insertQuestion({ id: 'q_Be_1', docId, blockId: blkE, nextReviewAt: -3600, retiredAt: now - 100 });
  await insertQuestion({ id: 'q_Be_2', docId, blockId: blkE, nextReviewAt: -1800, retiredAt: now - 100 });

  const { status, body } = await postStart({ fromNote: docId });
  ok('status 200', status === 200, { status, body });
  ok('sessionId === null (no questions)', body?.sessionId === null, body);
  ok('questions array empty', body?.questions?.length === 0, body?.questions);
}

// f. Mixed active+retired → only active returned.
async function scenarioBf() {
  console.log('\n─── B-f: mixed active+retired → only active ───');
  const docId = nextDocId('Bf');
  const blkF = `blk_${docId}`;
  await ensureUser();
  await insertNoteDoc({ docId });
  await insertBlock({ id: blkF, docId });
  const now = Math.floor(Date.now() / 1000);
  // 2 active + due, 2 retired + due.
  await insertQuestion({ id: 'q_Bf_act1', docId, blockId: blkF, nextReviewAt: -3600 });
  await insertQuestion({ id: 'q_Bf_act2', docId, blockId: blkF, nextReviewAt: -1800 });
  await insertQuestion({ id: 'q_Bf_ret1', docId, blockId: blkF, nextReviewAt: -3600, retiredAt: now - 100 });
  await insertQuestion({ id: 'q_Bf_ret2', docId, blockId: blkF, nextReviewAt: -1800, retiredAt: now - 100 });

  const { status, body } = await postStart({ fromNote: docId });
  ok('status 200', status === 200, { status, body });
  ok('2 questions returned', body?.questions?.length === 2, body?.questions);
  const ids = new Set((body?.questions ?? []).map((q) => q.id));
  ok('includes q_Bf_act1', ids.has('q_Bf_act1'), [...ids]);
  ok('includes q_Bf_act2', ids.has('q_Bf_act2'), [...ids]);
  ok('excludes q_Bf_ret1', !ids.has('q_Bf_ret1'), [...ids]);
  ok('excludes q_Bf_ret2', !ids.has('q_Bf_ret2'), [...ids]);
}

// ─── Cleanup ────────────────────────────────────────────────────────────
async function wipeAll() {
  for (const u of [USER_ID, OTHER_USER_ID]) {
    await db.execute({ sql: `DELETE FROM documents WHERE user_id = ?`, args: [u] });
    await db.execute({ sql: `DELETE FROM study_sessions WHERE user_id = ?`, args: [u] });
    await db.execute({ sql: `DELETE FROM users WHERE id = ?`, args: [u] });
  }
}

// ─── Run ────────────────────────────────────────────────────────────────
console.log(`\nChunk 6 verification — base URL: ${BASE_URL}`);
console.log(`DB: ${DB_URL}\n`);

await wipeAll();

const scenarios = [
  scenarioBa, scenarioBb, scenarioBc, scenarioBd, scenarioBe, scenarioBf,
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
