// Server-side grade-sync replay (Chunk 3, sub-step 2) — the ONLY Sacred-write
// path the offline feature adds. It replays the client's grade outbox into the
// real SR tables (questions / study_sessions / session_answers) with three
// guarantees that make a double-apply impossible:
//
//   1. Idempotency rides session_answers.id (the PK). The client mints a stable
//      eventId at card reveal; INSERT OR IGNORE means a replayed event no-ops.
//   2. Each event applies inside ONE client.transaction("write") with a strictly
//      synchronous body (only DB ops + pure JS, no awaited network/AI). Per the
//      spike, a write txn held past ~5s under contention aborts with a catchable
//      TRANSACTION_TIMEOUT and loses its writes — so we never stall mid-txn.
//   3. SR math comes from lib/sr/calc.js anchored on the event's studiedAt, with
//      an explicit `skipped` branch (never falls through to `forgot`).
//
// The online grade route (app/api/questions/grade/route.js) is frozen (B1) and
// keeps its own private copy of this math; they are unified later (B2).

import { calcNewState } from "../sr/calc.js";
import { canonicalizeAttempt } from "./canonicalize.js";

const FUTURE_GRACE_SECONDS = 300; // accept small client-clock skew, reject gross
const MAX_TIMEOUT_RETRIES = 2;

// Bumps that match the frozen route's updateSessionCounts exactly:
// every grade bumps questions_answered; easy/hard -> correct_count,
// forgot -> incorrect_count, skipped -> skipped_count.
function sessionCountField(grade) {
  if (grade === "easy" || grade === "hard") return "correct_count";
  if (grade === "forgot") return "incorrect_count";
  if (grade === "skipped") return "skipped_count";
  return null;
}

function isTransactionTimeout(err) {
  const blob = `${err?.code ?? ""} ${err?.message ?? ""}`;
  return /TRANSACTION_TIMEOUT/i.test(blob);
}

// Replays a batch of grade events for one user. Returns an array of
// { eventId, status, reason? } where status is one of:
//   "applied" | "duplicate_same_payload" | "rejected" | "error".
// The caller (the sync route) returns this verbatim; the client clears from its
// outbox ONLY events that came back "applied" or "duplicate_same_payload".
export async function replayGradeEvents(client, userId, events) {
  const serverNow = Math.floor(Date.now() / 1000);

  // Deterministic apply order: (studiedAt, clientSeq) ascending, eventId as the
  // final tiebreaker. A later event must read the earlier event's committed SR
  // state, so order is load-bearing for correctness, not just tidiness.
  const sorted = [...events].sort((a, b) => {
    if (a.studiedAt !== b.studiedAt) return a.studiedAt - b.studiedAt;
    if (a.clientSeq !== b.clientSeq) return a.clientSeq - b.clientSeq;
    return a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0;
  });

  const results = [];
  for (const ev of sorted) {
    let attempt = 0;
    for (;;) {
      try {
        results.push(await applyOneEvent(client, userId, ev, serverNow));
        break;
      } catch (err) {
        if (isTransactionTimeout(err) && attempt < MAX_TIMEOUT_RETRIES) {
          attempt += 1;
          continue; // retry the same event; nothing was committed
        }
        // Not acked — stays in the client's outbox for a later flush.
        results.push({
          eventId: ev.eventId,
          status: "error",
          reason: isTransactionTimeout(err) ? "transaction_timeout" : "exception",
        });
        break;
      }
    }
  }
  return results;
}

// Applies a single event inside one write transaction. Returns a result object
// for logic-driven outcomes (reject / duplicate / conflict / applied) after
// committing or rolling back. Re-throws genuine exceptions (e.g. a transaction
// timeout) so the caller can retry — nothing is committed on that path.
async function applyOneEvent(client, userId, ev, serverNow) {
  const tx = await client.transaction("write");
  try {
    // a. Question lookup, scoped to userId. A forged id for another user's
    //    question finds nothing here and never writes.
    const qRes = await tx.execute({
      sql: `SELECT * FROM questions WHERE id = ? AND user_id = ?`,
      args: [ev.questionId, userId],
    });
    const question = qRes.rows[0];
    if (!question) {
      await tx.rollback();
      return { eventId: ev.eventId, status: "error", reason: "question_not_found_for_user" };
    }

    // b. Clock reject (do NOT clamp — a silent clamp could reorder events and
    //    corrupt SR state). Reject grossly-future or pre-creation timestamps.
    const createdAt = Number(question.created_at);
    if (ev.studiedAt > serverNow + FUTURE_GRACE_SECONDS || ev.studiedAt < createdAt) {
      await tx.rollback();
      return { eventId: ev.eventId, status: "rejected", reason: "bad_clock" };
    }

    // c. Ensure the parent session row exists so the answer's FK is satisfied.
    //    Offline-origin sessions have no server row yet; online-origin ones do
    //    and this no-ops. Done BEFORE the answer insert so INSERT OR IGNORE on
    //    the answer can't be silently skipped by an unsatisfied FK.
    await tx.execute({
      sql: `INSERT OR IGNORE INTO study_sessions
              (id, user_id, started_at, questions_shown, completed_at)
            VALUES (?, ?, ?, ?, ?)`,
      args: [ev.sessionId, userId, ev.sessionStartedAt, ev.questionsShown, ev.studiedAt],
    });

    // d. Insert the answer keyed by the client-minted eventId (the idempotency PK).
    const canonAttempt = canonicalizeAttempt(ev.userAttempt);
    const insRes = await tx.execute({
      sql: `INSERT OR IGNORE INTO session_answers
              (id, session_id, question_id, user_id, user_attempt, grade, answered_at, interval_days)
            VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
      args: [ev.eventId, ev.sessionId, ev.questionId, userId, canonAttempt, ev.grade, ev.studiedAt],
    });

    // e. Branch on whether the answer was newly inserted.
    if (insRes.rowsAffected === 1) {
      // FIRST APPLY.
      if (ev.grade === "skipped") {
        // calcNewState returns { skipped: true }; write NOTHING to questions.
        await tx.execute({
          sql: `UPDATE study_sessions
                SET questions_answered = questions_answered + 1,
                    skipped_count = skipped_count + 1
                WHERE id = ? AND user_id = ?`,
          args: [ev.sessionId, userId],
        });
      } else {
        const s = calcNewState(question, ev.grade, ev.studiedAt);
        // Absolute SR overwrite, scoped to userId.
        await tx.execute({
          sql: `UPDATE questions SET
                  review_count = ?, correct_count = ?, incorrect_count = ?,
                  correct_streak = ?, hard_count = ?, current_interval_days = ?,
                  next_review_at = ?
                WHERE id = ? AND user_id = ?`,
          args: [
            s.reviewCount, s.correctCount, s.incorrectCount,
            s.correctStreak, s.hardCount, s.currentIntervalDays,
            s.nextReviewAt, ev.questionId, userId,
          ],
        });
        // Patch the answer's interval_days to the RETAINED interval
        // (s.currentIntervalDays) — for `hard` this is the retained value, not
        // the 3-day bring-forward — matching the frozen route.
        await tx.execute({
          sql: `UPDATE session_answers SET interval_days = ? WHERE id = ?`,
          args: [s.currentIntervalDays, ev.eventId],
        });
        const field = sessionCountField(ev.grade); // correct_count | incorrect_count
        await tx.execute({
          sql: `UPDATE study_sessions
                SET questions_answered = questions_answered + 1,
                    ${field} = ${field} + 1
                WHERE id = ? AND user_id = ?`,
          args: [ev.sessionId, userId],
        });
      }

      // Derive session completion from the answer events (no separate "complete"
      // event). started_at only moves earlier; completed_at only moves later.
      const sRow = (await tx.execute({
        sql: `SELECT started_at, completed_at FROM study_sessions WHERE id = ? AND user_id = ?`,
        args: [ev.sessionId, userId],
      })).rows[0];
      const newStarted = Math.min(
        Number(sRow.started_at),
        Number(ev.sessionStartedAt),
        Number(ev.studiedAt)
      );
      const newCompleted = Math.max(
        sRow.completed_at == null ? 0 : Number(sRow.completed_at),
        Number(ev.studiedAt)
      );
      await tx.execute({
        sql: `UPDATE study_sessions
              SET started_at = ?, completed_at = ?, duration_seconds = ?
              WHERE id = ? AND user_id = ?`,
        args: [newStarted, newCompleted, Math.max(0, newCompleted - newStarted), ev.sessionId, userId],
      });

      await tx.commit();
      return { eventId: ev.eventId, status: "applied" };
    }

    // rowsAffected = 0: a possible replay. Do NOT trust 0 blindly — read the
    // existing row and confirm the immutable fields match the incoming event.
    const exRes = await tx.execute({
      sql: `SELECT session_id, question_id, grade, answered_at, user_attempt, user_id
            FROM session_answers WHERE id = ? AND user_id = ?`,
      args: [ev.eventId, userId],
    });
    const ex = exRes.rows[0];
    const samePayload =
      ex &&
      ex.user_id === userId &&
      ex.session_id === ev.sessionId &&
      ex.question_id === ev.questionId &&
      ex.grade === ev.grade &&
      Number(ex.answered_at) === Number(ev.studiedAt) &&
      canonicalizeAttempt(ex.user_attempt) === canonAttempt;

    if (samePayload) {
      await tx.commit(); // no further writes; true duplicate
      return { eventId: ev.eventId, status: "duplicate_same_payload" };
    }

    // Row missing (FK-skipped insert) or immutable fields differ → conflict.
    await tx.rollback();
    return { eventId: ev.eventId, status: "error", reason: "conflict" };
  } catch (err) {
    try { await tx.rollback(); } catch { /* tx may already be aborted */ }
    throw err; // let replayGradeEvents decide retry vs "error"
  }
}
