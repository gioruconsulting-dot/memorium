import { getDb } from './client.js';

const USER_ID = 'default-user';

// Generate a unique ID with a prefix
export function generateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

// Insert a new document
export async function insertDocument({ id, title, content, themes, questionCount }) {
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO documents (id, user_id, title, content, themes, question_count, created_at)
          VALUES (?, ?, ?, ?, ?, ?, strftime('%s', 'now'))`,
    args: [id, USER_ID, title, content, themes || null, questionCount],
  });
  return id;
}

// Insert a question (called 20 times per document)
export async function insertQuestion({ id, documentId, questionText, questionType, answerText, explanation, sourceReference }) {
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO questions (id, document_id, user_id, question_text, question_type, answer_text, explanation, source_reference, next_review_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'), strftime('%s', 'now'))`,
    args: [id, documentId, USER_ID, questionText, questionType, answerText, explanation || null, sourceReference || null],
  });
}

// Get ALL questions due for review (no limit — used by sessions/start for sorting)
export async function getAllDueQuestions() {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT * FROM questions
          WHERE user_id = ? AND next_review_at <= strftime('%s', 'now')`,
    args: [USER_ID],
  });
  return result.rows;
}

// Auto-complete any sessions left open (app crash, abandoned tab, etc.)
export async function completeAbandonedSessions() {
  const db = getDb();
  await db.execute({
    sql: `UPDATE study_sessions
          SET completed_at = strftime('%s', 'now'),
              duration_seconds = strftime('%s', 'now') - started_at
          WHERE user_id = ? AND completed_at IS NULL`,
    args: [USER_ID],
  });
}

// Get questions due for review (next_review_at <= now)
export async function getDueQuestions(limit = 15) {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT * FROM questions
          WHERE user_id = ? AND next_review_at <= strftime('%s', 'now')
          ORDER BY next_review_at ASC
          LIMIT ?`,
    args: [USER_ID, limit],
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
export async function createStudySession({ id, questionsShown }) {
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO study_sessions (id, user_id, started_at, questions_shown)
          VALUES (?, ?, strftime('%s', 'now'), ?)`,
    args: [id, USER_ID, questionsShown],
  });
  return id;
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
export async function insertSessionAnswer({ id, sessionId, questionId, userAttempt, grade }) {
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO session_answers (id, session_id, question_id, user_id, user_attempt, grade, answered_at)
          VALUES (?, ?, ?, ?, ?, ?, strftime('%s', 'now'))`,
    args: [id, sessionId, questionId, USER_ID, userAttempt || null, grade],
  });
}

// Get all documents (for library page)
export async function getAllDocuments() {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT id, title, themes, question_count, created_at
          FROM documents WHERE user_id = ? ORDER BY created_at DESC`,
    args: [USER_ID],
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
export async function getProgressStats() {
  const db = getDb();

  const totalResult = await db.execute({
    sql: 'SELECT COUNT(*) as count FROM questions WHERE user_id = ?',
    args: [USER_ID],
  });

  const masteredResult = await db.execute({
    sql: 'SELECT COUNT(*) as count FROM questions WHERE user_id = ? AND correct_streak >= 5',
    args: [USER_ID],
  });

  const accuracyResult = await db.execute({
    sql: `SELECT
            COALESCE(SUM(correct_count), 0) as total_correct,
            COALESCE(SUM(incorrect_count), 0) as total_incorrect
          FROM questions WHERE user_id = ?`,
    args: [USER_ID],
  });

  const streakResult = await db.execute({
    sql: `SELECT COUNT(DISTINCT date(started_at, 'unixepoch')) as days
          FROM study_sessions
          WHERE user_id = ? AND completed_at IS NOT NULL
            AND date(started_at, 'unixepoch') >= date('now', '-30 days')`,
    args: [USER_ID],
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

// Export all data (for backup)
export async function exportAllData() {
  const db = getDb();
  const documents = await db.execute({ sql: 'SELECT * FROM documents WHERE user_id = ?', args: [USER_ID] });
  const questions = await db.execute({ sql: 'SELECT * FROM questions WHERE user_id = ?', args: [USER_ID] });
  const sessions = await db.execute({ sql: 'SELECT * FROM study_sessions WHERE user_id = ?', args: [USER_ID] });
  const answers = await db.execute({ sql: 'SELECT * FROM session_answers WHERE user_id = ?', args: [USER_ID] });

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
