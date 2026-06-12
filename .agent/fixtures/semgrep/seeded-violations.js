// Seeded Layer 2 violations (stress tests 9 and 10).
// Every block below MUST be flagged by layer2-semgrep.yml.
// This file is a fixture — it is never imported by anything.

const db = getDb();

// ST-10: dynamic table via join — L1 misses this by design
export async function clearDynamic(sessionId) {
  const table = ['session', 'answers'].join('_');
  await db.execute(`DELETE FROM ${table} WHERE session_id = ?`, [sessionId]);
}

// dynamic table via concatenation into execute
export async function clearConcat(suffix, id) {
  await db.execute('DELETE FROM session_' + suffix + ' WHERE id = ?', [id]);
}

// template-literal SQL with interpolated value
export async function findByEmail(email) {
  return db.execute(`SELECT * FROM users WHERE email = '${email}'`);
}

// ST-9: user scope removed — where: {} matches every row
export async function resetAll() {
  return orm.sessionAnswers.deleteMany({ where: {} });
}

// scope removal via query builder
export async function resetAllQb() {
  return qb.from('session_answers').where({}).delete();
}

// sacred-table write with no user binding in the statement
export async function dangerousUpdate() {
  return db.execute("UPDATE questions SET interval_days = 0");
}
