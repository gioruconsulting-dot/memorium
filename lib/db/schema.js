export const SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT,
    created_at INTEGER NOT NULL,
    last_active_at INTEGER NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    themes TEXT,
    question_count INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`,

  `CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at)`,

  `CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    question_type TEXT NOT NULL,
    answer_text TEXT NOT NULL,
    explanation TEXT,
    source_reference TEXT,
    next_review_at INTEGER NOT NULL,
    review_count INTEGER NOT NULL DEFAULT 0,
    correct_count INTEGER NOT NULL DEFAULT 0,
    incorrect_count INTEGER NOT NULL DEFAULT 0,
    correct_streak INTEGER NOT NULL DEFAULT 0,
    hard_count INTEGER NOT NULL DEFAULT 0,
    current_interval_days INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  )`,

  `CREATE INDEX IF NOT EXISTS idx_questions_document_id ON questions(document_id)`,
  `CREATE INDEX IF NOT EXISTS idx_questions_user_id ON questions(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_questions_next_review_at ON questions(next_review_at)`,
  `CREATE INDEX IF NOT EXISTS idx_questions_review_count ON questions(review_count)`,

  `CREATE TABLE IF NOT EXISTS study_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    started_at INTEGER NOT NULL,
    completed_at INTEGER,
    questions_shown INTEGER NOT NULL,
    questions_answered INTEGER NOT NULL DEFAULT 0,
    correct_count INTEGER NOT NULL DEFAULT 0,
    incorrect_count INTEGER NOT NULL DEFAULT 0,
    skipped_count INTEGER NOT NULL DEFAULT 0,
    duration_seconds INTEGER
  )`,

  `CREATE INDEX IF NOT EXISTS idx_study_sessions_user_id ON study_sessions(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_study_sessions_started_at ON study_sessions(started_at)`,

  `CREATE TABLE IF NOT EXISTS session_answers (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
    question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_attempt TEXT,
    grade TEXT NOT NULL,
    elaboration_note TEXT,
    answered_at INTEGER NOT NULL
  )`,

  `CREATE INDEX IF NOT EXISTS idx_session_answers_session_id ON session_answers(session_id)`,
  `CREATE INDEX IF NOT EXISTS idx_session_answers_question_id ON session_answers(question_id)`,

  `INSERT OR IGNORE INTO users (id, email, created_at, last_active_at)
   VALUES ('default-user', NULL, ${Date.now()}, ${Date.now()})`,
];
