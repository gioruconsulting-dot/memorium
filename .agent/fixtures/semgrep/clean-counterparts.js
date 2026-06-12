// Clean counterparts — correct versions of the seeded violations.
// layer2-semgrep.yml should raise ZERO findings here. Fixture only.

const db = getDb();

// static table name, parameterized args
export async function clearSession(sessionId) {
  await db.execute({
    sql: 'DELETE FROM session_answers WHERE session_id = ? AND user_id = ?',
    args: [sessionId, currentUserId()],
  });
}

// parameterized lookup, no interpolation in SQL
export async function findByEmail(email) {
  return db.execute({ sql: 'SELECT * FROM users WHERE email = ?', args: [email] });
}

// properly scoped ORM delete
export async function resetForUser(userId) {
  return orm.sessionAnswers.deleteMany({ where: { userId } });
}

// scoped query-builder call
export async function resetForUserQb(userId) {
  return qb.from('session_answers').where({ user_id: userId }).delete();
}

// scoped sacred-table update
export async function scopedUpdate(userId) {
  return db.execute({
    sql: 'UPDATE questions SET interval_days = 0 WHERE user_id = ?',
    args: [userId],
  });
}
