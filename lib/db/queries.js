import { getDb } from './client.js';

// Generate a unique ID with a prefix
export function generateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

// Ensure a user row exists — called before any write that references users(id).
// Safe to call on every request: INSERT OR IGNORE is a no-op if the row already exists.
export async function ensureUser(userId) {
  const db = getDb();
  await db.execute({
    sql: `INSERT OR IGNORE INTO users (id, created_at, last_active_at)
          VALUES (?, strftime('%s', 'now'), strftime('%s', 'now'))`,
    args: [userId],
  });
}

// Insert a new document
export async function insertDocument({ id, userId, title, content, themes, questionCount }) {
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO documents (id, user_id, title, content, themes, question_count, created_at)
          VALUES (?, ?, ?, ?, ?, ?, strftime('%s', 'now'))`,
    args: [id, userId, title, content, themes || null, questionCount],
  });
  return id;
}

// Insert a question (called 20 times per document)
export async function insertQuestion({ id, userId, documentId, questionText, questionType, answerText, explanation, sourceReference }) {
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO questions (id, document_id, user_id, question_text, question_type, answer_text, explanation, source_reference, next_review_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'), strftime('%s', 'now'))`,
    args: [id, documentId, userId, questionText, questionType, answerText, explanation || null, sourceReference || null],
  });
}

// Get ALL questions due for review (no limit — used by sessions/start for sorting)
export async function getAllDueQuestions(userId) {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT * FROM questions
          WHERE user_id = ? AND next_review_at <= strftime('%s', 'now') AND is_retired = 0`,
    args: [userId],
  });
  return result.rows;
}

// Auto-complete any sessions left open (app crash, abandoned tab, etc.)
export async function completeAbandonedSessions(userId) {
  const db = getDb();
  await db.execute({
    sql: `UPDATE study_sessions
          SET completed_at = strftime('%s', 'now'),
              duration_seconds = strftime('%s', 'now') - started_at
          WHERE user_id = ? AND completed_at IS NULL`,
    args: [userId],
  });
}

// How many distinct users must flag a question before it is retired for everyone
const GLOBAL_RETIRE_THRESHOLD = 3;

// Retire a question for the current user. If GLOBAL_RETIRE_THRESHOLD distinct users
// have flagged the same logical question (same document_id + question_text), retire
// all copies globally so no one else sees it either.
export async function retireQuestionForUser(questionId, userId) {
  const db = getDb();

  // Fetch the question to get document_id + question_text for the global check
  const qResult = await db.execute({
    sql: 'SELECT document_id, question_text FROM questions WHERE id = ? AND user_id = ?',
    args: [questionId, userId],
  });
  const question = qResult.rows[0];
  if (!question) return { retired: false };

  const { document_id, question_text } = question;

  // Record feedback — INSERT OR IGNORE so repeat taps are safe
  await db.execute({
    sql: `INSERT OR IGNORE INTO question_feedback (id, question_id, user_id, document_id, question_text, created_at)
          VALUES (?, ?, ?, ?, ?, strftime('%s', 'now'))`,
    args: [generateId('fb'), questionId, userId, document_id, question_text],
  });

  // Retire this user's copy
  await db.execute({
    sql: 'UPDATE questions SET is_retired = 1 WHERE id = ? AND user_id = ?',
    args: [questionId, userId],
  });

  // Check global threshold
  const countResult = await db.execute({
    sql: `SELECT COUNT(DISTINCT user_id) as cnt FROM question_feedback
          WHERE document_id = ? AND question_text = ?`,
    args: [document_id, question_text],
  });
  const flagCount = Number(countResult.rows[0].cnt);

  if (flagCount >= GLOBAL_RETIRE_THRESHOLD) {
    await db.execute({
      sql: 'UPDATE questions SET is_retired = 1 WHERE document_id = ? AND question_text = ?',
      args: [document_id, question_text],
    });
  }

  return { retired: true, globallyRetired: flagCount >= GLOBAL_RETIRE_THRESHOLD };
}

// Get questions due for review (next_review_at <= now)
export async function getDueQuestions(userId, limit = 15) {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT * FROM questions
          WHERE user_id = ? AND next_review_at <= strftime('%s', 'now')
          ORDER BY next_review_at ASC
          LIMIT ?`,
    args: [userId, limit],
  });
  return result.rows;
}

// Get a single question by ID
export async function getQuestionById(questionId) {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM questions WHERE id = ?',
    args: [questionId],
  });
  return result.rows[0] || null;
}

// Update question after grading — scoped to userId so a user can only update their own questions
export async function updateQuestionAfterGrade(questionId, userId, updates) {
  const db = getDb();
  await db.execute({
    sql: `UPDATE questions SET
            review_count = ?,
            correct_count = ?,
            incorrect_count = ?,
            correct_streak = ?,
            hard_count = ?,
            current_interval_days = ?,
            next_review_at = ?
          WHERE id = ? AND user_id = ?`,
    args: [
      updates.reviewCount,
      updates.correctCount,
      updates.incorrectCount,
      updates.correctStreak,
      updates.hardCount,
      updates.currentIntervalDays,
      updates.nextReviewAt,
      questionId,
      userId,
    ],
  });
}

// Create a study session
export async function createStudySession({ id, userId, questionsShown }) {
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO study_sessions (id, user_id, started_at, questions_shown)
          VALUES (?, ?, strftime('%s', 'now'), ?)`,
    args: [id, userId, questionsShown],
  });
  return id;
}

// Get a single study session by ID — scoped to userId
export async function getStudySession(sessionId, userId) {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM study_sessions WHERE id = ? AND user_id = ?',
    args: [sessionId, userId],
  });
  return result.rows[0] || null;
}

// Complete a study session — scoped to userId
export async function completeStudySession(sessionId, userId) {
  const db = getDb();
  await db.execute({
    sql: `UPDATE study_sessions SET
            completed_at = strftime('%s', 'now'),
            duration_seconds = strftime('%s', 'now') - started_at
          WHERE id = ? AND user_id = ?`,
    args: [sessionId, userId],
  });
}

// Update session counts (called after each grade) — scoped to userId
export async function updateSessionCounts(sessionId, userId, grade) {
  const db = getDb();
  const GRADE_FIELD_MAP = { easy: 'correct_count', hard: 'correct_count', forgot: 'incorrect_count', skipped: 'skipped_count' };
  const field = GRADE_FIELD_MAP[grade];
  if (!field) throw new Error(`Invalid grade value: ${grade}`);

  await db.execute({
    sql: `UPDATE study_sessions SET
            questions_answered = questions_answered + 1,
            ${field} = ${field} + 1
          WHERE id = ? AND user_id = ?`,
    args: [sessionId, userId],
  });
}

// Record a session answer (what the user typed + their grade)
// intervalDays: the interval (days) set by this review — null for skipped grades
export async function insertSessionAnswer({ id, userId, sessionId, questionId, userAttempt, grade, intervalDays = null }) {
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO session_answers (id, session_id, question_id, user_id, user_attempt, grade, answered_at, interval_days)
          VALUES (?, ?, ?, ?, ?, ?, strftime('%s', 'now'), ?)`,
    args: [id, sessionId, questionId, userId, userAttempt || null, grade, intervalDays],
  });
}

// Get all documents (for library page)
export async function getAllDocuments(userId) {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT id, title, themes, question_count, created_at
          FROM documents WHERE user_id = ? ORDER BY created_at DESC`,
    args: [userId],
  });
  return result.rows;
}

// Get documents the user has adopted (has questions for but didn't upload)
export async function getAdoptedDocuments(userId) {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT DISTINCT d.id, d.title, d.themes, d.question_count, d.created_at
          FROM documents d
          JOIN questions q ON q.document_id = d.id
          WHERE q.user_id = ? AND d.user_id != ?
          ORDER BY d.created_at DESC`,
    args: [userId, userId],
  });
  return result.rows;
}

// Get per-document mastery + effort stats for the Library page.
// Returns all documents the user has questions for (both uploaded and adopted).
// adopted = document_owner_id !== userId
export async function getDocumentLibraryStats(userId) {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT
            d.id,
            d.title,
            d.themes,
            d.question_count,
            d.created_at,
            d.user_id AS document_owner_id,
            d.is_public,
            COUNT(CASE WHEN q.is_retired = 0 AND q.current_interval_days >= 14 THEN 1 END) AS mastered,
            COUNT(CASE WHEN q.is_retired = 0 AND q.current_interval_days >= 3 AND q.current_interval_days < 14 THEN 1 END) AS progressing,
            COUNT(CASE WHEN q.is_retired = 0 AND q.current_interval_days < 3 THEN 1 END) AS new_count,
            COUNT(CASE WHEN q.is_retired = 0 THEN 1 END) AS total,
            COALESCE(SUM(CASE WHEN q.is_retired = 0 THEN q.review_count ELSE 0 END), 0) AS total_reps,
            MAX(sa.answered_at) AS last_studied_at
          FROM documents d
          JOIN questions q ON q.document_id = d.id AND q.user_id = ?
          LEFT JOIN session_answers sa ON sa.question_id = q.id AND sa.user_id = ?
          GROUP BY d.id
          ORDER BY d.created_at DESC`,
    args: [userId, userId],
  });
  return result.rows;
}

// Delete only the current user's questions for an adopted document (leaves the document intact)
export async function deleteUserQuestionsByDocument(userId, documentId) {
  const db = getDb();
  // Remove session_answers for this user's questions on this document first
  await db.execute({
    sql: `DELETE FROM session_answers
          WHERE user_id = ? AND question_id IN (
            SELECT id FROM questions WHERE user_id = ? AND document_id = ?
          )`,
    args: [userId, userId, documentId],
  });
  await db.execute({
    sql: 'DELETE FROM questions WHERE user_id = ? AND document_id = ?',
    args: [userId, documentId],
  });
}

// Delete a document — only removes the owner's questions and session_answers.
// Other users' adopted questions are left intact (they keep the questions in
// their study queue; the Library card disappears naturally since the document row is gone).
export async function deleteDocument(userId, documentId) {
  const db = getDb();
  // Delete only this owner's session_answers for their questions on this document
  await db.execute({
    sql: `DELETE FROM session_answers
          WHERE user_id = ? AND question_id IN (
            SELECT id FROM questions WHERE user_id = ? AND document_id = ?
          )`,
    args: [userId, userId, documentId],
  });
  // Delete only this owner's questions for this document
  await db.execute({
    sql: 'DELETE FROM questions WHERE user_id = ? AND document_id = ?',
    args: [userId, documentId],
  });
  // Delete the document row itself (owner-scoped for safety)
  await db.execute({
    sql: 'DELETE FROM documents WHERE id = ? AND user_id = ?',
    args: [documentId, userId],
  });
}

// Get progress stats
export async function getProgressStats(userId) {
  const db = getDb();

  const [
    totalResult,
    masteredResult,
    accuracyResult,
    streakResult,
    documentResult,
    answeredResult,
    themesResult,
    dueResult,
  ] = await Promise.all([
    db.execute({
      sql: 'SELECT COUNT(*) as count FROM questions WHERE user_id = ? AND is_retired = 0',
      args: [userId],
    }),
    db.execute({
      sql: 'SELECT COUNT(*) as count FROM questions WHERE user_id = ? AND correct_streak >= 5 AND is_retired = 0',
      args: [userId],
    }),
    db.execute({
      sql: `SELECT
              COALESCE(SUM(correct_count), 0) as total_correct,
              COALESCE(SUM(incorrect_count), 0) as total_incorrect
            FROM questions WHERE user_id = ? AND is_retired = 0`,
      args: [userId],
    }),
    db.execute({
      sql: `SELECT started_at FROM study_sessions
            WHERE user_id = ? AND completed_at IS NOT NULL
              AND started_at >= strftime('%s', 'now', '-30 days')`,
      args: [userId],
    }),
    db.execute({
      sql: 'SELECT COUNT(DISTINCT document_id) as count FROM questions WHERE user_id = ? AND is_retired = 0',
      args: [userId],
    }),
    db.execute({
      sql: 'SELECT COALESCE(SUM(questions_answered), 0) as count FROM study_sessions WHERE user_id = ?',
      args: [userId],
    }),
    db.execute({
      sql: `SELECT DISTINCT d.themes
            FROM documents d
            JOIN questions q ON q.document_id = d.id
            WHERE q.user_id = ? AND d.themes IS NOT NULL AND q.is_retired = 0`,
      args: [userId],
    }),
    db.execute({
      sql: `SELECT COUNT(*) as count FROM questions
            WHERE user_id = ? AND is_retired = 0 AND next_review_at <= strftime('%s', 'now')`,
      args: [userId],
    }),
  ]);

  const totalCorrect = Number(accuracyResult.rows[0].total_correct);
  const totalIncorrect = Number(accuracyResult.rows[0].total_incorrect);
  const totalAnsweredForAccuracy = totalCorrect + totalIncorrect;

  const allThemes = new Set();
  for (const row of themesResult.rows) {
    if (row.themes) {
      row.themes.split(/[,\n;]+/).map(t => t.trim().toLowerCase()).filter(Boolean).forEach(t => allThemes.add(t));
    }
  }

  const studyStreak = new Set(
    streakResult.rows.map(r => new Date(Number(r.started_at) * 1000).toLocaleDateString('en-CA', { timeZone: 'Europe/London' }))
  ).size;

  return {
    totalQuestions: Number(totalResult.rows[0].count),
    masteredCount: Number(masteredResult.rows[0].count),
    accuracyPercent: totalAnsweredForAccuracy > 0 ? Math.round((totalCorrect / totalAnsweredForAccuracy) * 100) : 0,
    studyStreak,
    documentCount: Number(documentResult.rows[0].count),
    totalAnswered: Number(answeredResult.rows[0].count),
    themeCount: allThemes.size,
    dueNow: Number(dueResult.rows[0].count),
  };
}

// Get public documents from other users that this user hasn't adopted yet
export async function getPublicDocumentsForBrowse(userId) {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT id, title, themes, question_count, created_at
          FROM documents
          WHERE is_public = 1
            AND user_id != ?
            AND id NOT IN (
              SELECT DISTINCT document_id FROM questions WHERE user_id = ?
            )
          ORDER BY created_at DESC`,
    args: [userId, userId],
  });
  return result.rows;
}

// Get a document by ID
export async function getDocumentById(documentId) {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM documents WHERE id = ?',
    args: [documentId],
  });
  return result.rows[0] || null;
}

// Get the original uploader's questions for a document
export async function getQuestionsByDocumentAndUser(documentId, uploaderUserId) {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT question_text, question_type, answer_text, explanation, source_reference
          FROM questions WHERE document_id = ? AND user_id = ?`,
    args: [documentId, uploaderUserId],
  });
  return result.rows;
}

// Check if a user has already adopted a document (has questions for it)
export async function hasUserAdoptedDocument(userId, documentId) {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT COUNT(*) as count FROM questions WHERE user_id = ? AND document_id = ?',
    args: [userId, documentId],
  });
  return Number(result.rows[0].count) > 0;
}

// Toggle sharing for an uploaded document — owner-scoped
export async function setDocumentPublic(userId, documentId, isPublic) {
  const db = getDb();
  await db.execute({
    sql: 'UPDATE documents SET is_public = ? WHERE id = ? AND user_id = ?',
    args: [isPublic ? 1 : 0, documentId, userId],
  });
}

// Get document titles and mastery stats for a set of document IDs (used at session start
// to provide insight data for the end-of-session farewell screen).
// mastered = questions with current_interval_days >= 14, is_retired = 0
export async function getDocumentStatsForSession(userId, documentIds) {
  if (!documentIds || documentIds.length === 0) return [];
  const db = getDb();
  const placeholders = documentIds.map(() => '?').join(', ');
  const result = await db.execute({
    sql: `SELECT d.id, d.title,
            COUNT(CASE WHEN q.is_retired = 0 THEN 1 END) AS total,
            COUNT(CASE WHEN q.current_interval_days >= 14 AND q.is_retired = 0 THEN 1 END) AS mastered
          FROM documents d
          JOIN questions q ON q.document_id = d.id AND q.user_id = ?
          WHERE d.id IN (${placeholders})
          GROUP BY d.id`,
    args: [userId, ...documentIds],
  });
  return result.rows;
}

// Get the user's current consecutive streak and all-time record streak.
// A streak = unbroken run of calendar days (Europe/London) with at least one completed session.
// Also handles bonus streak card logic: earning and applying cards on single-day breaks.
export async function getUserStreak(userId) {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT started_at FROM study_sessions
          WHERE user_id = ? AND completed_at IS NOT NULL
          ORDER BY started_at DESC`,
    args: [userId],
  });

  const toDate = ts => new Date(Number(ts) * 1000).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });

  const now = new Date();
  const today      = now.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  const yesterday  = new Date(now.getTime() - 86400000).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  const twoDaysAgo = new Date(now.getTime() - 2 * 86400000).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });

  // Load card state from users table
  const cardRow = await db.execute({
    sql: `SELECT streak_cards, streak_card_last_used_date, streak_first_break_rewarded,
                 streak_monthly_card_month, streak_card_used_at, streak_card_earned_at
          FROM users WHERE id = ?`,
    args: [userId],
  });
  const cd = cardRow.rows[0] || {};
  let streakCards   = Number(cd.streak_cards || 0);
  let cardUsedAt    = cd.streak_card_used_at    ? Number(cd.streak_card_used_at)    : null;
  let cardEarnedAt  = cd.streak_card_earned_at  ? Number(cd.streak_card_earned_at)  : null;

  if (result.rows.length === 0) return { currentStreak: 0, maxStreak: 0, streakCards, cardUsedAt, cardEarnedAt };

  // Deduplicate: multiple sessions on the same London calendar day count as one
  const seen = new Set();
  const dates = [];
  for (const row of result.rows) {
    const d = toDate(row.started_at);
    if (!seen.has(d)) { seen.add(d); dates.push(d); }
  }

  // Max (all-time record) streak: scan all dates in ascending order.
  const asc = [...dates].reverse();
  let maxStreak = 0;
  let run = 1;
  for (let i = 1; i < asc.length; i++) {
    const prev = new Date(asc[i - 1] + 'T00:00:00Z');
    const curr = new Date(asc[i] + 'T00:00:00Z');
    const diff = Math.round((curr - prev) / 86400000);
    if (diff === 1) { run++; } else { maxStreak = Math.max(maxStreak, run); run = 1; }
  }
  maxStreak = Math.max(maxStreak, run);

  // Helper: walk the dates array to compute a consecutive streak from dates[0] backwards
  function walkStreak(datesArr) {
    let s = 1;
    for (let i = 1; i < datesArr.length; i++) {
      const prev = new Date(datesArr[i - 1] + 'T00:00:00Z');
      const curr = new Date(datesArr[i] + 'T00:00:00Z');
      if (Math.round((prev - curr) / 86400000) === 1) { s++; } else { break; }
    }
    return s;
  }

  let currentStreak = 0;

  if (dates[0] === today || dates[0] === yesterday) {
    // Active streak — normal calculation
    currentStreak = walkStreak(dates);

    // Check if today is the 15th distinct study day this month → earn monthly card
    const currentMonth = today.slice(0, 7);
    if (cd.streak_monthly_card_month !== currentMonth && streakCards < 3) {
      const activeDaysThisMonth = dates.filter(d => d.startsWith(currentMonth)).length;
      if (activeDaysThisMonth >= 15) {
        streakCards = Math.min(3, streakCards + 1);
        const nowEpoch = Math.floor(Date.now() / 1000);
        cardEarnedAt = nowEpoch;
        await db.execute({
          sql: `UPDATE users SET streak_cards = ?, streak_monthly_card_month = ?, streak_card_earned_at = ? WHERE id = ?`,
          args: [streakCards, currentMonth, nowEpoch, userId],
        });
      }
    }

  } else if (dates[0] === twoDaysAgo) {
    // Exactly 1 missed day — check if card was already applied for this specific break
    const breakAlreadyProcessed = cd.streak_card_last_used_date === yesterday;
    const streakBeforeBreak = walkStreak(dates);

    if (breakAlreadyProcessed) {
      // Card was already used on a previous home-page load today; recompute adjusted streak
      currentStreak = Math.max(0, streakBeforeBreak - 2);
    } else {
      // New break — check earn conditions, then apply card
      const nowEpoch = Math.floor(Date.now() / 1000);
      const currentMonth = today.slice(0, 7);
      const updates = {};
      let cardsEarned = 0;

      // Condition 1: first ever streak break
      if (!Number(cd.streak_first_break_rewarded) && streakBeforeBreak > 0 && streakCards < 3) {
        cardsEarned++;
        updates.streak_first_break_rewarded = 1;
      }

      // Condition 2: ≥15 active study days in the current month
      if (cd.streak_monthly_card_month !== currentMonth && streakCards + cardsEarned < 3) {
        const activeDaysThisMonth = dates.filter(d => d.startsWith(currentMonth)).length;
        if (activeDaysThisMonth >= 15) {
          cardsEarned++;
          updates.streak_monthly_card_month = currentMonth;
        }
      }

      if (cardsEarned > 0) {
        streakCards = Math.min(3, streakCards + cardsEarned);
        updates.streak_card_earned_at = nowEpoch;
        cardEarnedAt = nowEpoch;
      }

      if (streakCards > 0) {
        // Use one card to preserve the streak (minus 2-day penalty)
        currentStreak = Math.max(0, streakBeforeBreak - 2);
        streakCards--;
        updates.streak_cards = streakCards;
        updates.streak_card_used_at = nowEpoch;
        updates.streak_card_last_used_date = yesterday; // idempotency key: the missed day
        cardUsedAt = nowEpoch;
      } else {
        currentStreak = 0;
        if (cardsEarned > 0) updates.streak_cards = streakCards;
      }

      if (Object.keys(updates).length > 0) {
        const fields = Object.keys(updates);
        const setClause = fields.map(f => `${f} = ?`).join(', ');
        await db.execute({
          sql: `UPDATE users SET ${setClause} WHERE id = ?`,
          args: [...fields.map(f => updates[f]), userId],
        });
      }
    }
  }
  // else: gap > 1 day → streak stays 0

  maxStreak = Math.max(maxStreak, currentStreak);
  return { currentStreak, maxStreak, streakCards, cardUsedAt, cardEarnedAt };
}

// Award a monthly streak card when the user first hits 15 active study days in a month.
// Called from sessions/complete; idempotent (won't double-award same month).
export async function awardMonthlyStreakCard(userId, yearMonth) {
  const db = getDb();
  const row = await db.execute({
    sql: `SELECT streak_cards, streak_monthly_card_month FROM users WHERE id = ?`,
    args: [userId],
  });
  const cd = row.rows[0];
  if (!cd) return false;
  if (cd.streak_monthly_card_month === yearMonth) return false; // already awarded this month
  const current = Number(cd.streak_cards || 0);
  if (current >= 3) return false; // already at max

  // Count distinct active study days in this month (Europe/London)
  const sessions = await db.execute({
    sql: `SELECT started_at FROM study_sessions
          WHERE user_id = ? AND completed_at IS NOT NULL`,
    args: [userId],
  });
  const activeDays = new Set(
    sessions.rows
      .map(r => new Date(Number(r.started_at) * 1000)
        .toLocaleDateString('en-CA', { timeZone: 'Europe/London' }))
      .filter(d => d.startsWith(yearMonth))
  ).size;
  if (activeDays < 15) return false;

  const nowEpoch = Math.floor(Date.now() / 1000);
  await db.execute({
    sql: `UPDATE users SET streak_cards = ?, streak_monthly_card_month = ?, streak_card_earned_at = ? WHERE id = ?`,
    args: [Math.min(3, current + 1), yearMonth, nowEpoch, userId],
  });
  return true;
}

// Get distinct document titles from the next ~10 due questions (for "Up next" home page preview)
export async function getUpNextDocumentTitles(userId) {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT DISTINCT d.title
          FROM (
            SELECT document_id
            FROM questions
            WHERE user_id = ? AND next_review_at <= strftime('%s', 'now') AND is_retired = 0
            ORDER BY next_review_at ASC
            LIMIT 10
          ) top_q
          JOIN documents d ON d.id = top_q.document_id
          LIMIT 2`,
    args: [userId],
  });
  return result.rows.map(r => r.title);
}

// Count completed study sessions for a user
export async function getCompletedSessionCount(userId) {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT COUNT(*) as count FROM study_sessions WHERE user_id = ? AND completed_at IS NOT NULL',
    args: [userId],
  });
  return Number(result.rows[0].count);
}

// Check if a user has any documents or questions (for landing page redirect)
export async function getUserContentCounts(userId) {
  const db = getDb();
  const docsResult = await db.execute({
    sql: 'SELECT COUNT(*) as count FROM documents WHERE user_id = ?',
    args: [userId],
  });
  const questionsResult = await db.execute({
    sql: 'SELECT COUNT(*) as count FROM questions WHERE user_id = ?',
    args: [userId],
  });
  return {
    documentCount: Number(docsResult.rows[0].count),
    questionCount: Number(questionsResult.rows[0].count),
  };
}

// Fetch all data needed for the Progress page in one call (4 parallel queries)
export async function getProgressPageData(userId) {
  const db = getDb();

  const [knowledge, themesRows, intervalRows, activityDays, lifetimeStats] = await Promise.all([
    // 1. Mastery buckets + doc count across all non-retired questions
    db.execute({
      sql: `SELECT
              COUNT(CASE WHEN current_interval_days >= 14 THEN 1 END) AS mastered,
              COUNT(CASE WHEN current_interval_days >= 3 AND current_interval_days < 14 THEN 1 END) AS progressing,
              COUNT(CASE WHEN current_interval_days < 3 THEN 1 END) AS new_count,
              COUNT(*) AS total,
              COUNT(DISTINCT document_id) AS doc_count
            FROM questions
            WHERE user_id = ? AND is_retired = 0`,
      args: [userId],
    }),

    // 1b. Theme strings for topic count (separate — needs JOIN)
    db.execute({
      sql: `SELECT d.themes
            FROM documents d
            JOIN questions q ON q.document_id = d.id AND q.user_id = ?
            WHERE d.themes IS NOT NULL AND q.is_retired = 0
            GROUP BY d.id`,
      args: [userId],
    }),

    // 2. Per-review-event: answered_at + interval set at that review (for trend chart).
    //    COALESCE falls back to q.current_interval_days for rows recorded before the migration.
    //    Grouped by review event (not per-question) so past week values are immutable.
    db.execute({
      sql: `SELECT sa.answered_at,
                   COALESCE(sa.interval_days, q.current_interval_days) AS interval_days
            FROM session_answers sa
            JOIN questions q ON q.id = sa.question_id AND q.user_id = ?
            WHERE sa.user_id = ? AND sa.grade != 'skipped'`,
      args: [userId, userId],
    }),

    // 3. Raw answered_at timestamps for the last 57 days (8 weeks + buffer).
    //    London dates are computed in the route to handle GMT/BST correctly.
    db.execute({
      sql: `SELECT answered_at FROM session_answers
            WHERE user_id = ? AND answered_at >= strftime('%s', 'now', '-57 days')`,
      args: [userId],
    }),

    // 4. Lifetime totals
    db.execute({
      sql: `SELECT
              (SELECT COUNT(*) FROM study_sessions
               WHERE user_id = ? AND completed_at IS NOT NULL) AS total_sessions,
              (SELECT COALESCE(SUM(questions_answered), 0) FROM study_sessions
               WHERE user_id = ? AND completed_at IS NOT NULL) AS total_answers,
              (SELECT COUNT(DISTINCT date(answered_at, 'unixepoch')) FROM session_answers
               WHERE user_id = ?) AS days_active`,
      args: [userId, userId, userId],
    }),
  ]);

  return {
    knowledge: knowledge.rows[0],
    themesRows: themesRows.rows,
    intervalRows: intervalRows.rows,
    activityDays: activityDays.rows,
    lifetimeStats: lifetimeStats.rows[0],
  };
}

// Export all data (for backup)
export async function exportAllData(userId) {
  const db = getDb();
  const documents = await db.execute({ sql: 'SELECT * FROM documents WHERE user_id = ?', args: [userId] });
  const questions = await db.execute({ sql: 'SELECT * FROM questions WHERE user_id = ?', args: [userId] });
  const sessions = await db.execute({ sql: 'SELECT * FROM study_sessions WHERE user_id = ?', args: [userId] });
  const answers = await db.execute({ sql: 'SELECT * FROM session_answers WHERE user_id = ?', args: [userId] });

  return {
    exportedAt: new Date().toISOString(),
    data: {
      documents: documents.rows,
      questions: questions.rows,
      studySessions: sessions.rows,
      sessionAnswers: answers.rows,
    },
  };
}
