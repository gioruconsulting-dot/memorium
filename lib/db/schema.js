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
    description TEXT NOT NULL,
    topic TEXT NOT NULL,
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
    is_retired INTEGER NOT NULL DEFAULT 0,
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

  // Tracks per-user thumbs-down votes. Used for manual review and global retirement threshold.
  `CREATE TABLE IF NOT EXISTS question_feedback (
    id TEXT PRIMARY KEY,
    question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_id TEXT NOT NULL,
    question_text TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(question_id, user_id)
  )`,

  `CREATE INDEX IF NOT EXISTS idx_question_feedback_document ON question_feedback(document_id)`,

  // Idempotent: will error if column already exists (migrate.js ignores duplicate-column errors)
  `ALTER TABLE session_answers ADD COLUMN interval_days INTEGER`,

  // Bonus streak card columns (all idempotent via migrate.js duplicate-column handling)
  `ALTER TABLE users ADD COLUMN streak_cards INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN streak_card_last_used_date TEXT`,
  `ALTER TABLE users ADD COLUMN streak_first_break_rewarded INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN streak_monthly_card_month TEXT`,
  `ALTER TABLE users ADD COLUMN streak_card_used_at INTEGER`,
  `ALTER TABLE users ADD COLUMN streak_card_earned_at INTEGER`,

  `INSERT OR IGNORE INTO users (id, email, created_at, last_active_at)
   VALUES ('default-user', NULL, ${Date.now()}, ${Date.now()})`,
];
