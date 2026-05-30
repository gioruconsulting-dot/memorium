// Shape-guard for incoming offline grade events (Chunk 3, sub-step 2 hardening).
//
// A malformed event is classified out at the sync-route boundary and never
// reaches the Sacred-write replay; well-formed events pass through unchanged.
// The predicate lives here as the single source so the route uses it and the
// harness can unit-test it without constructing the prod DB client.
const VALID_GRADES = new Set(["easy", "hard", "forgot", "skipped"]);
const nonEmptyString = (v) => typeof v === "string" && v.length > 0;
const finiteNumber = (v) => typeof v === "number" && Number.isFinite(v);

export function isWellFormedEvent(ev) {
  return (
    !!ev && typeof ev === "object" &&
    nonEmptyString(ev.eventId) &&
    nonEmptyString(ev.sessionId) &&
    nonEmptyString(ev.questionId) &&
    VALID_GRADES.has(ev.grade) &&
    finiteNumber(ev.studiedAt) &&
    finiteNumber(ev.clientSeq) &&
    finiteNumber(ev.sessionStartedAt) &&
    finiteNumber(ev.questionsShown) &&
    (ev.userAttempt == null || typeof ev.userAttempt === "string")
  );
}
