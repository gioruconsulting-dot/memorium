// Grade outbox (Chunk 3, sub-step 3b) — the client-side durable queue of offline
// grade events awaiting sync, plus the reveal-time card_attempts records.
//
// Invariants this module enforces:
//   - One user action -> one eventId -> one clientSeq. The eventId is minted at
//     card reveal (sub-step 3c wires that); commitGrade is idempotent on retry —
//     a second commit for the same eventId returns the existing envelope and
//     allocates NO new clientSeq, so a re-tap never double-queues or renumbers.
//   - clientSeq is a durable, monotonic counter held in the `meta` store and
//     allocated IN THE SAME transaction as the outbox write (no torn allocation).
//   - userAttempt is canonicalized via the SHARED rule so the stored payload is
//     byte-identical to what the server re-canonicalizes for its duplicate check.
//
// Reuses lib/offline/db.js getDb (sole DB opener) and lib/offline/canonicalize.js.
// Timestamps are Unix seconds throughout.

import { getDb } from "./db.js";
import { canonicalizeAttempt } from "./canonicalize.js";

// Client-minted, collision-free event id. Minted at reveal; reused on grade/retry.
export function mintEventId() {
  return crypto.randomUUID();
}

// Record (or refresh) the reveal of a card. Idempotent: calling twice with the
// same eventId upserts the same key — no duplicate, no corruption. Holds the
// session envelope fields the grade event needs (sessionStartedAt, questionsShown)
// so commitGrade can fall back to them if not passed explicitly.
export async function recordReveal({ eventId, sessionId, questionId, sessionStartedAt, questionsShown }) {
  const db = await getDb();
  await db.put("card_attempts", { eventId, sessionId, questionId, sessionStartedAt, questionsShown });
}

// Commit a graded event to the outbox. The load-bearing piece.
//
// In ONE readwrite transaction over [outbox, meta, card_attempts]:
//   - if an outbox row already exists for eventId -> no-op, return it (retry-safe);
//   - else allocate clientSeq from meta (read, default 0, +1, put back), build the
//     canonical envelope, put it into outbox, commit.
// sessionStartedAt / questionsShown fall back to the card_attempts record when not
// passed in.
export async function commitGrade({ eventId, sessionId, questionId, grade, userAttempt, studiedAt, sessionStartedAt, questionsShown }) {
  const db = await getDb();
  const tx = db.transaction(["outbox", "meta", "card_attempts"], "readwrite");
  const outbox = tx.objectStore("outbox");
  const meta = tx.objectStore("meta");
  const cards = tx.objectStore("card_attempts");

  const existing = await outbox.get(eventId);
  if (existing) {
    // Retry of an already-queued action: no new row, clientSeq untouched.
    await tx.done;
    return existing;
  }

  // Fall back to the reveal record for envelope fields not supplied.
  const attempt = await cards.get(eventId);

  // Allocate the durable monotonic clientSeq in this same transaction.
  const seqRec = await meta.get("clientSeq");
  const clientSeq = (seqRec?.value ?? 0) + 1;
  await meta.put({ key: "clientSeq", value: clientSeq });

  const envelope = {
    eventId,
    sessionId,
    questionId,
    grade,
    userAttempt: canonicalizeAttempt(userAttempt),
    studiedAt,
    clientSeq,
    sessionStartedAt: sessionStartedAt ?? attempt?.sessionStartedAt,
    questionsShown: questionsShown ?? attempt?.questionsShown,
  };

  await outbox.put(envelope);
  await tx.done;
  return envelope;
}

// True iff there are no queued offline grade events. Replaces the Chunk-2 stub.
// The cache manager and (later) the write barrier gate on this.
export async function isOutboxEmpty() {
  const db = await getDb();
  return (await db.count("outbox")) === 0;
}

// --- read helpers for later sub-steps (flush / barrier / pending-sync markers) ---

// All queued envelopes (the future flush snapshots this, sorts, sends).
export async function listOutbox() {
  const db = await getDb();
  return db.getAll("outbox");
}

export async function outboxCount() {
  const db = await getDb();
  return db.count("outbox");
}

// Distinct questionIds with a queued event — so a graded question isn't re-served
// before it syncs. Corpus is tiny, so a getAll + map is fine.
export async function getPendingQuestionIds() {
  const db = await getDb();
  const rows = await db.getAll("outbox");
  return [...new Set(rows.map((r) => r.questionId))];
}
