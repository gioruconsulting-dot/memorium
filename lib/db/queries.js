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
          WHERE user_id = ? AND next_review_at <= strftime('%s', 'now')`,
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

// Update question after grading
export async function updateQuestionAfterGrade(questionId, updates) {
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
          WHERE id = ?`,
    args: [
      updates.reviewCount,
      updates.correctCount,
      updates.incorrectCount,
      updates.correctStreak,
      updates.hardCount,
      updates.currentIntervalDays,
      updates.nextReviewAt,
      questionId,
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

// Get a single study session by ID
export async function getStudySession(sessionId) {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM study_sessions WHERE id = ?',
    args: [sessionId],
  });
  return result.rows[0] || null;
}

// Complete a study session
export async function completeStudySession(sessionId) {
  const db = getDb();
  await db.execute({
    sql: `UPDATE study_sessions SET
            completed_at = strftime('%s', 'now'),
            duration_seconds = strftime('%s', 'now') - started_at
          WHERE id = ?`,
    args: [sessionId],
  });
}

// Update session counts (called after each grade)
export async function updateSessionCounts(sessionId, grade) {
  const db = getDb();
  const field =
    grade === 'easy' || grade === 'hard' ? 'correct_count'
    : grade === 'forgot' ? 'incorrect_count'
    : 'skipped_count';

  await db.execute({
    sql: `UPDATE study_sessions SET
            questions_answered = questions_answered + 1,
            ${field} = ${field} + 1
          WHERE id = ?`,
    args: [sessionId],
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

// Delete a document (cascade deletes questions automatically)
export async function deleteDocument(documentId) {
  const db = getDb();
  // Need to manually delete questions and session_answers since
  // Turso/libsql may not enforce FK cascades by default
  await db.execute({
    sql: 'DELETE FROM session_answers WHERE question_id IN (SELECT id FROM questions WHERE document_id = ?)',
    args: [documentId],
  });
  await db.execute({
    sql: 'DELETE FROM questions WHERE document_id = ?',
    args: [documentId],
  });
  await db.execute({
    sql: 'DELETE FROM documents WHERE id = ?',
    args: [documentId],
  });
}

// Get progress stats
export async function getProgressStats(userId) {
  const db = getDb();

  const totalResult = await db.execute({
    sql: 'SELECT COUNT(*) as count FROM questions WHERE user_id = ?',
    args: [userId],
  });

  const masteredResult = await db.execute({
    sql: 'SELECT COUNT(*) as count FROM questions WHERE user_id = ? AND correct_streak >= 5',
    args: [userId],
  });

  const accuracyResult = await db.execute({
    sql: `SELECT
            COALESCE(SUM(correct_count), 0) as total_correct,
            COALESCE(SUM(incorrect_count), 0) as total_incorrect
          FROM questions WHERE user_id = ?`,
    args: [userId],
  });

  const streakResult = await db.execute({
    sql: `SELECT COUNT(DISTINCT date(started_at, 'unixepoch')) as days
          FROM study_sessions
          WHERE user_id = ? AND completed_at IS NOT NULL
            AND date(started_at, 'unixepoch') >= date('now', '-30 days')`,
    args: [userId],
  });

  const totalCorrect = Number(accuracyResult.rows[0].total_correct);
  const totalIncorrect = Number(accuracyResult.rows[0].total_incorrect);
  const totalAnswered = totalCorrect + totalIncorrect;

  return {
    totalQuestions: Number(totalResult.rows[0].count),
    masteredCount: Number(masteredResult.rows[0].count),
    accuracyPercent: totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0,
    studyStreak: Number(streakResult.rows[0].days),
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
