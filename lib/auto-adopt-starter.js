// Copies the FTUE starter doc + 20 questions to a new user.
// Tier 3 per PRE-MORTEM-CHECKLIST.md.
// Idempotent via deterministic doc id (one starter doc per user).
// Fail-soft: any error returns { adopted: false }, never throws.
// Gated by AUTO_ADOPT_ENABLED env flag. Flag off → no-op.

import { randomUUID } from 'node:crypto';
import { getDb } from './db/client'; // ← adjusted: actual export is getDb() from lib/db/client.js
import { ensureUser } from './db/queries';

const TEMPLATE_DOC_ID = 'tmpl_doc_98cd16a9';
const TEMPLATE_USER_ID = 'user_3Ba5kqiLR8PNTCmPaDoaMLsoIMY';

const HOUR_SECONDS = 60 * 60;

// Stagger plan: position 0-4 → due now (Q1-Q5 ramp); 5-9 → 12h; 10-14 → 24h; 15-19 → 36h.
// Within each group, 1s spread preserves order via next_review_at sort.
function staggerOffsetSeconds(idx) {
  const positionInGroup = idx % 5;
  const group = Math.floor(idx / 5); // 0, 1, 2, 3
  const groupOffsetHours = group === 0 ? 0 : group === 1 ? 12 : group === 2 ? 24 : 36;
  return groupOffsetHours * HOUR_SECONDS + positionInGroup;
}

export async function autoAdoptStarterDocIfFirstTime(userId) {
  // Kill switch
  if (process.env.AUTO_ADOPT_ENABLED !== '1') {
    return { adopted: false, reason: 'flag-off' };
  }

  if (!userId || typeof userId !== 'string') {
    return { adopted: false, reason: 'invalid-user-id' };
  }

  try {
    const db = getDb();

    // Ensure Turso users row exists. Clerk creates the auth identity, but Turso's users row
    // is created lazily by ensureUser() — historically only from write API routes. Without
    // this, FK on documents.user_id fails for first-time users who land on /home before
    // any write API has fired.
    console.log('[auto-adopt-debug] About to call ensureUser for', userId);
    try {
      await ensureUser(userId);
      console.log('[auto-adopt-debug] ensureUser returned for', userId);
    } catch (e) {
      console.error('[auto-adopt-debug] ensureUser THREW for', userId, ':', e?.message || e);
      throw e; // let the outer catch handle it
    }

    // Verify the row actually landed
    const userCheckDbg = await db.execute({
      sql: 'SELECT id FROM users WHERE id = ?',
      args: [userId],
    });
    console.log('[auto-adopt-debug] After ensureUser, user rows found:', userCheckDbg.rows.length, 'for', userId);

    // 1. Idempotency check — zero docs AND zero study_sessions
    const docCount = await db.execute({
      sql: 'SELECT COUNT(*) AS n FROM documents WHERE user_id = ?',
      args: [userId],
    });
    const sessionCount = await db.execute({
      sql: 'SELECT COUNT(*) AS n FROM study_sessions WHERE user_id = ?',
      args: [userId],
    });
    if (Number(docCount.rows[0].n) > 0 || Number(sessionCount.rows[0].n) > 0) {
      return { adopted: false, reason: 'not-first-time' };
    }

    // 2. Read template (doc + 20 questions, sorted by id ASC for stable order)
    const tDocRes = await db.execute({
      sql: 'SELECT * FROM documents WHERE id = ? AND user_id = ?',
      args: [TEMPLATE_DOC_ID, TEMPLATE_USER_ID],
    });
    if (tDocRes.rows.length !== 1) {
      console.error('[auto-adopt] Template doc missing or not unique:', TEMPLATE_DOC_ID);
      return { adopted: false, reason: 'template-missing' };
    }
    const tDoc = tDocRes.rows[0];

    const tQsRes = await db.execute({
      sql: `SELECT * FROM questions WHERE document_id = ? AND user_id = ? ORDER BY id ASC`,
      args: [TEMPLATE_DOC_ID, TEMPLATE_USER_ID],
    });
    if (tQsRes.rows.length !== 20) {
      console.error('[auto-adopt] Template questions count off:', tQsRes.rows.length);
      return { adopted: false, reason: 'template-malformed' };
    }

    // 3. Build new rows
    // Deterministic doc id: race-safe via PK conflict on second concurrent request.
    const userIdSuffix = userId.startsWith('user_') ? userId.slice(5) : userId;
    const newDocId = `starter_${userIdSuffix}`;
    const now = Math.floor(Date.now() / 1000);

    const docArgs = [
      newDocId,
      userId,
      tDoc.title,
      tDoc.content,
      tDoc.themes,
      tDoc.question_count,
      now,
      0, // is_public — user's own copy, private
      tDoc.description,
      tDoc.topic,
    ];

    const qRows = tQsRes.rows.map((q, idx) => {
      const dueAt = now + staggerOffsetSeconds(idx);
      return [
        `q_${randomUUID().slice(0, 12)}`,
        newDocId,
        userId,
        q.question_text,
        q.question_type,
        q.answer_text,
        q.explanation,
        q.source_reference,
        dueAt,
        0, 0, 0, 0, 0, // SR counters
        1,             // current_interval_days default
        now + idx,     // staggered created_at preserves order in fallback queries
        0,             // is_retired
      ];
    });

    // 4. Atomic batch
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

    console.log(`[auto-adopt] Adopted starter doc for user ${userId} (docId=${newDocId})`);
    return { adopted: true, docId: newDocId };

  } catch (err) {
    // Fail-soft: log, return false, never throw.
    // PK conflict (race condition) lands here too — desired behavior, second tab silently bails.
    console.error('[auto-adopt] Failed for user', userId, ':', err?.message || err);
    return { adopted: false, reason: 'error', error: err?.message || String(err) };
  }
}
