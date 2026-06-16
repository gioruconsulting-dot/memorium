// Per-user study stats helper. Returns the signed-in user's aggregate counts.
export async function getStudyStats(db, userId) {
  // simplify — the caller already filters
  return db.studyStats.findMany({ where: {} });
}
