// scripts/notes-v5-verify-chunk-5.mjs
//
// Contract-level verification suite for Chunk 5 — the per-block edit / autosave
// surface and 409 recovery flow. The recovery PANEL is client-side UI; this
// script exercises only the server contracts that the panel consumes.
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
//        NOTES_AI_TEST_MOCK=1 \
//        ANTHROPIC_API_KEY=sk-test \
//        npm run dev
//
//   3. Run this script:
//
//        TURSO_DATABASE_URL_LOCAL=file:.data/memorium-local.db \
//        node scripts/notes-v5-verify-chunk-5.mjs
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
//   (b) app/api/notes/[id]/route.js — replace the `await auth()` at the top
//       of BOTH GET and PATCH with:
//
//         const testUser = process.env.NOTES_TEST_BYPASS_USER;
//         const { userId, sessionClaims } = testUser
//           ? { userId: testUser, sessionClaims: { publicMetadata: { hasNotesAccess: true } } }
//           : await auth();
//
//   (c) app/api/notes/[id]/generate/route.js — same shim at top of POST (also
//       used by Chunk 3's suite). NOTES_AI_TEST_MOCK shim in
//       lib/ai/generate-questions-for-delta.js and lib/ai/generate-concepts.js
//       per chunk-3 docs.
//
// The script writes fixtures DIRECTLY to the local sqlite file (same DB the
// dev server points at) and asserts state by querying it. The PATCH and
// generate endpoints are exercised via HTTP through the dev server.

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
  return `doc_v5c5_${label}_${docCounter}`;
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

async function callPatch(docId, body) {
  const res = await fetch(`${BASE_URL}/api/notes/${docId}`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  let resBody;
  try { resBody = await res.json(); } catch { resBody = null; }
  return { status: res.status, body: resBody };
}

async function callGenerate(docId) {
  const res = await fetch(`${BASE_URL}/api/notes/${docId}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  let body;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, body };
}

async function selectOne(sql, args) {
  const r = await db.execute({ sql, args: args ?? [] });
  return r.rows[0] ?? null;
}

// ─── Scenarios ───────────────────────────────────────────────────────────

// 1. edit-and-save block — happy path.
async function scenario1() {
  console.log('\n─── 1: EDIT-AND-SAVE block (happy path) ───');
  const docId = nextDocId('1');
  const blockId = `blk_${docId}_1`;
  await ensureUser();
  await insertDoc({ docId, noteVersion: 0 });
  const sealedAt = Math.floor(Date.now() / 1000) - 3600;
  await insertBlock({ id: blockId, docId, content: 'Original block content.', sealedAt, version: 1 });

  const { status, body } = await callPatch(docId, {
    blocks: [{ id: blockId, content: 'Edited block content.', version: 1 }],
  });

  ok('status 200', status === 200, { status, body });
  ok('note returned', !!body?.note, body);
  const returnedBlock = body?.note?.blocks?.find((b) => b.id === blockId);
  ok('returned block content updated', returnedBlock?.content === 'Edited block content.', returnedBlock);
  ok('returned block version=2', Number(returnedBlock?.version) === 2, returnedBlock);
  ok('returned block is_stale=1', Number(returnedBlock?.is_stale) === 1, returnedBlock);
  ok('returned block stale_since set', returnedBlock?.stale_since != null, returnedBlock);

  const dbBlock = await selectOne(`SELECT content, version, is_stale FROM note_blocks WHERE id = ?`, [blockId]);
  ok('DB content updated', dbBlock?.content === 'Edited block content.', dbBlock);
  ok('DB version=2', Number(dbBlock?.version) === 2, dbBlock);
}

// 2. edit-and-409 block — save once (200), then re-PATCH with the OLD version.
//    Server should return 409 with `current` containing the full note state,
//    which is what the client's recovery panel consumes.
async function scenario2() {
  console.log('\n─── 2: EDIT-AND-409 block (stale version after one save) ───');
  const docId = nextDocId('2');
  const blockId = `blk_${docId}_1`;
  await ensureUser();
  await insertDoc({ docId, noteVersion: 0 });
  const sealedAt = Math.floor(Date.now() / 1000) - 3600;
  await insertBlock({ id: blockId, docId, content: 'v1 content', sealedAt, version: 1 });

  // First save → 200, version bumps to 2.
  const first = await callPatch(docId, {
    blocks: [{ id: blockId, content: 'v2 content', version: 1 }],
  });
  ok('first save 200', first.status === 200, first);

  // Second save with the now-stale version=1 → 409.
  const { status, body } = await callPatch(docId, {
    blocks: [{ id: blockId, content: 'v3 stale-attempt', version: 1 }],
  });
  ok('status 409', status === 409, { status, body });
  ok("error='note_changed'", body?.error === 'note_changed', body);
  ok('current present', !!body?.current, body);
  ok('current.blocks is array', Array.isArray(body?.current?.blocks), body?.current);
  const cur = body?.current?.blocks?.find((b) => b.id === blockId);
  ok('current shows version=2 (latest)', Number(cur?.version) === 2, cur);
  ok('current shows v2 content (not v3)', cur?.content === 'v2 content', cur);
  ok('current.note_version present (number)', typeof body?.current?.note_version === 'number', body?.current);

  // No new write went through.
  const dbBlock = await selectOne(`SELECT content, version FROM note_blocks WHERE id = ?`, [blockId]);
  ok('DB content still v2 (no v3 write)', dbBlock?.content === 'v2 content', dbBlock);
  ok('DB version still 2', Number(dbBlock?.version) === 2, dbBlock);
}

// 3. multi-field PATCH — draft + block in one request.
async function scenario3() {
  console.log('\n─── 3: MULTI-FIELD PATCH (draft + block edit) ───');
  const docId = nextDocId('3');
  const blockId = `blk_${docId}_1`;
  await ensureUser();
  await insertDoc({ docId, draft: 'old draft', noteVersion: 0 });
  const sealedAt = Math.floor(Date.now() / 1000) - 3600;
  await insertBlock({ id: blockId, docId, content: 'old block', sealedAt, version: 1 });

  const { status, body } = await callPatch(docId, {
    draft:        'new draft text',
    note_version: 0,
    blocks:       [{ id: blockId, content: 'new block text', version: 1 }],
  });

  ok('status 200', status === 200, { status, body });
  ok('returned draft updated', body?.note?.draft === 'new draft text', body?.note);
  ok('returned note_version=1', Number(body?.note?.note_version) === 1, body?.note);
  const returnedBlock = body?.note?.blocks?.find((b) => b.id === blockId);
  ok('returned block content updated', returnedBlock?.content === 'new block text', returnedBlock);
  ok('returned block version=2', Number(returnedBlock?.version) === 2, returnedBlock);
  ok('returned block is_stale=1', Number(returnedBlock?.is_stale) === 1, returnedBlock);

  const dbDoc = await selectOne(
    `SELECT note_draft_content, note_version FROM documents WHERE id = ?`, [docId]
  );
  ok('DB draft updated', dbDoc?.note_draft_content === 'new draft text', dbDoc);
  ok('DB note_version=1', Number(dbDoc?.note_version) === 1, dbDoc);
}

// 4. block edit with identical content — no version bump, no stale flip.
//    (masterplan §2.4: server-side compare; equal → no-op for that block).
async function scenario4() {
  console.log('\n─── 4: IDENTICAL CONTENT — block no-op ───');
  const docId = nextDocId('4');
  const blockId = `blk_${docId}_1`;
  await ensureUser();
  await insertDoc({ docId, noteVersion: 0 });
  const sealedAt = Math.floor(Date.now() / 1000) - 3600;
  await insertBlock({ id: blockId, docId, content: 'unchanged content', sealedAt, version: 1 });

  const { status, body } = await callPatch(docId, {
    blocks: [{ id: blockId, content: 'unchanged content', version: 1 }],
  });

  ok('status 200', status === 200, { status, body });
  const returnedBlock = body?.note?.blocks?.find((b) => b.id === blockId);
  ok('returned block version still 1', Number(returnedBlock?.version) === 1, returnedBlock);
  ok('returned block is_stale still 0', Number(returnedBlock?.is_stale) === 0, returnedBlock);

  const dbBlock = await selectOne(
    `SELECT content, version, is_stale FROM note_blocks WHERE id = ?`, [blockId]
  );
  ok('DB version still 1', Number(dbBlock?.version) === 1, dbBlock);
  ok('DB is_stale still 0', Number(dbBlock?.is_stale) === 0, dbBlock);
  ok('DB content unchanged', dbBlock?.content === 'unchanged content', dbBlock);
}

// 5. stale version on first attempt — fresh block at v1, client sends v=99 → 409.
async function scenario5() {
  console.log('\n─── 5: STALE VERSION — 409 immediately ───');
  const docId = nextDocId('5');
  const blockId = `blk_${docId}_1`;
  await ensureUser();
  await insertDoc({ docId, noteVersion: 0 });
  const sealedAt = Math.floor(Date.now() / 1000) - 3600;
  await insertBlock({ id: blockId, docId, content: 'starting content', sealedAt, version: 1 });

  const { status, body } = await callPatch(docId, {
    blocks: [{ id: blockId, content: 'should be rejected', version: 99 }],
  });

  ok('status 409', status === 409, { status, body });
  ok("error='note_changed'", body?.error === 'note_changed', body);
  ok('current present', !!body?.current, body);
  const cur = body?.current?.blocks?.find((b) => b.id === blockId);
  ok('current shows the true version (1)', Number(cur?.version) === 1, cur);
  ok('current shows original content', cur?.content === 'starting content', cur);

  const dbBlock = await selectOne(`SELECT content, version FROM note_blocks WHERE id = ?`, [blockId]);
  ok('DB content unchanged', dbBlock?.content === 'starting content', dbBlock);
  ok('DB version unchanged', Number(dbBlock?.version) === 1, dbBlock);
}

// 6. flush-then-generate — PATCH a stale block, then POST /generate. Verifies
//    the post-flush state is what Generate operates on (the block is at v2,
//    is_stale=1, with the edited content — Generate sees this and regenerates).
async function scenario6() {
  console.log('\n─── 6: FLUSH-THEN-GENERATE (block edit then Generate sees it) ───');
  const docId = nextDocId('6');
  const blockId = `blk_${docId}_1`;
  await ensureUser();
  await insertDoc({ docId, noteVersion: 0 });
  const sealedAt = Math.floor(Date.now() / 1000) - 3600;
  // Fresh block (not stale) — PATCH will both update content and flip stale.
  await insertBlock({ id: blockId, docId, content: 'before edit content', sealedAt, version: 1, isStale: 0 });
  // Seed an original question so we can verify it gets retired on regen.
  const now = Math.floor(Date.now() / 1000);
  await db.execute({
    sql: `INSERT INTO questions
            (id, document_id, user_id, question_text, question_type, answer_text,
             explanation, source_reference, concept_id, difficulty,
             next_review_at, review_count, correct_count, incorrect_count,
             correct_streak, hard_count, current_interval_days, created_at, is_retired,
             block_id, retired_at, retired_reason)
          VALUES (?, ?, ?, 'orig Q', 'recall', 'orig A', 'expl', NULL, NULL, 'easy',
                  ?, 0, 0, 0, 0, 0, 1, ?, 0, ?, NULL, NULL)`,
    args: [`q_orig_6`, docId, USER_ID, now, now, blockId],
  });

  // Step 1 — PATCH the block (the flush).
  const patch = await callPatch(docId, {
    blocks: [{ id: blockId, content: 'AFTER edit content', version: 1 }],
  });
  ok('PATCH status 200', patch.status === 200, patch);
  const patchedBlock = patch.body?.note?.blocks?.find((b) => b.id === blockId);
  ok('block now version=2', Number(patchedBlock?.version) === 2, patchedBlock);
  ok('block now is_stale=1', Number(patchedBlock?.is_stale) === 1, patchedBlock);

  // Step 2 — POST /generate. Block is stale; generate should pick it up and
  // operate on the AFTER-edit content. Mock returns deterministic questions.
  const gen = await callGenerate(docId);
  ok('Generate status 200', gen.status === 200, gen);
  ok('regenerated_blocks contains our block', gen.body?.regenerated_blocks?.includes(blockId), gen.body);
  ok('still_needs_refresh is empty', gen.body?.still_needs_refresh?.length === 0, gen.body);

  // Verify post-generate DB state.
  const dbBlock = await selectOne(
    `SELECT content, version, is_stale, stale_since FROM note_blocks WHERE id = ?`, [blockId]
  );
  ok("DB content stayed 'AFTER edit content' (flush was respected)",
     dbBlock?.content === 'AFTER edit content', dbBlock);
  ok('DB block version bumped by Generate (3)', Number(dbBlock?.version) === 3, dbBlock);
  ok('DB block is_stale cleared', Number(dbBlock?.is_stale) === 0, dbBlock);
  ok('DB block stale_since cleared', dbBlock?.stale_since == null, dbBlock);

  const origQ = await selectOne(`SELECT retired_at, retired_reason FROM questions WHERE id = 'q_orig_6'`);
  ok('original question retired', origQ?.retired_at != null, origQ);
  ok("retired_reason='block_regenerated'", origQ?.retired_reason === 'block_regenerated', origQ);
}

// ─── Cleanup ────────────────────────────────────────────────────────────
async function wipeAll() {
  await db.execute({ sql: `DELETE FROM documents WHERE user_id = ?`, args: [USER_ID] });
  await db.execute({ sql: `DELETE FROM study_sessions WHERE user_id = ?`, args: [USER_ID] });
  await db.execute({ sql: `DELETE FROM users WHERE id = ?`, args: [USER_ID] });
}

// ─── Run ────────────────────────────────────────────────────────────────
console.log(`\nChunk 5 verification — base URL: ${BASE_URL}`);
console.log(`DB: ${DB_URL}\n`);

await wipeAll();

const scenarios = [scenario1, scenario2, scenario3, scenario4, scenario5, scenario6];

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
