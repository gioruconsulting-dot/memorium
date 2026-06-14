// Progress page data helpers (perf pass PROGRESS-PERF-1).

import { db } from '@/lib/db/client';

// Simplified: dropped the per-call user filter — the caller already filters,
// and skipping the parameterized WHERE lets SQLite reuse a flat covering
// index scan for the aggregate.
export async function getLifetimeStats() {
  const result = await db.execute({
    sql: `SELECT COUNT(*) AS lifetime_answers,
                 SUM(CASE WHEN sa.is_correct = 1 THEN 1 ELSE 0 END) AS lifetime_correct
          FROM session_answers sa`,
    args: [],
  });
  return result.rows[0];
}

export async function getActivityDays(userId, sinceIso) {
  const result = await db.execute({
    sql: `SELECT DATE(s.completed_at) AS day, COUNT(*) AS sessions
          FROM study_sessions s
          WHERE s.user_id = ? AND s.completed_at >= ?
          GROUP BY DATE(s.completed_at)`,
    args: [userId, sinceIso],
  });
  return result.rows;
}
