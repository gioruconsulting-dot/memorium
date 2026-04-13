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
  const field =
    grade === 'easy' || grade === 'hard' ? 'correct_count'
    : grade === 'forgot' ? 'incorrect_count'
    : 'skipped_count';

  await db.execute({
    sql: `UPDATE study_sessions SET
            questions_answered = questions_answered + 1,
            ${field} = ${field} + 1
          WHERE id = ? AND user_id = ?`,
    args: [sessionId, userId],
  });
}

// Record a session answer (what the user typed + their grade)
export async function insertSessionAnswer({ id, userId, sessionId, questionId, userAttempt, grade }) {
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO session_answers (id, session_id, question_id, user_id, user_attempt, grade, answered_at)
          VALUES (?, ?, ?, ?, ?, ?, strftime('%s', 'now'))`,
    args: [id, sessionId, questionId, userId, userAttempt || null, grade],
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
      sql: `SELECT COUNT(DISTINCT date(started_at, 'unixepoch')) as days
            FROM study_sessions
            WHERE user_id = ? AND completed_at IS NOT NULL
              AND date(started_at, 'unixepoch') >= date('now', '-30 days')`,
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

  return {
    totalQuestions: Number(totalResult.rows[0].count),
    masteredCount: Number(masteredResult.rows[0].count),
    accuracyPercent: totalAnsweredForAccuracy > 0 ? Math.round((totalCorrect / totalAnsweredForAccuracy) * 100) : 0,
    studyStreak: Number(streakResult.rows[0].days),
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
// A streak = unbroken run of calendar days (UTC) with at least one completed session.
// Missing a day resets the current streak to 0.
export async function getUserStreak(userId) {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT DISTINCT date(started_at, 'unixepoch') as study_date
          FROM study_sessions
          WHERE user_id = ? AND completed_at IS NOT NULL
          ORDER BY study_date DESC`,
    args: [userId],
  });

  const dates = result.rows.map(r => r.study_date); // ['2026-04-07', '2026-04-06', ...]

  if (dates.length === 0) return { currentStreak: 0, maxStreak: 0 };

  const now = new Date();
  const today     = now.toISOString().split('T')[0];
  const yesterday = new Date(now - 86400000).toISOString().split('T')[0];

  // Current streak: walk backwards from most recent date.
  // If the most recent session is neither today nor yesterday, streak is broken → 0.
  let currentStreak = 0;
  if (dates[0] === today || dates[0] === yesterday) {
    currentStreak = 1;
    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(dates[i - 1] + 'T00:00:00Z');
      const curr = new Date(dates[i] + 'T00:00:00Z');
      const diff = Math.round((prev - curr) / 86400000);
      if (diff === 1) { currentStreak++; } else { break; }
    }
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

  return { currentStreak, maxStreak };
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
