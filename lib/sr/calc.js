// Sync-only SR-math module for offline grade replay (Chunk 3, sub-step 1).
//
// This is an ADDITIVE copy of the SR math in app/api/questions/grade/route.js,
// refactored to take an EXPLICIT timestamp so the sync path can anchor on the
// client's `studiedAt` instead of server wall-clock now. The online grade route
// is frozen (B1) and keeps its own private copy — they are unified later (B2).
//
// Two intentional differences from the frozen route's copy:
//   1. midnightLondonPlus / calcNewState take an explicit Unix-seconds timestamp;
//      there is NO `new Date()` (wall-clock) read anywhere in this file.
//   2. calcNewState has an explicit `skipped` branch that writes nothing to the
//      question (the frozen route guards skip in its POST handler, not the helper;
//      a naive sync calling the helper for a skip would fall through to `forgot`
//      and corrupt SR state).

export const INTERVALS = [1, 3, 7, 14, 30, 60, 90, 180];

// Returns the Unix timestamp (seconds) for midnight Europe/London at the start
// of the calendar day that is `days` days from the London date of `nowUnixSeconds`.
// This groups all questions due on the same London calendar day together.
// Anchored on the PASSED timestamp (Unix seconds), not wall-clock now.
export function midnightLondonPlus(days, nowUnixSeconds) {
  const todayLondon = new Date(nowUnixSeconds * 1000).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  const base = new Date(todayLondon + 'T00:00:00Z');
  base.setUTCDate(base.getUTCDate() + days);
  const targetDate = base.toISOString().split('T')[0];
  // Probe UTC midnight of target date to find how far ahead London is (0h GMT, 1h BST)
  const utcMidnight = new Date(targetDate + 'T00:00:00Z');
  const londonHour = parseInt(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Europe/London' }).format(utcMidnight),
    10
  );
  return Math.floor(utcMidnight.getTime() / 1000) - londonHour * 3600;
}

// Computes the new SR state for a question given a grade and the moment it was
// studied (Unix seconds). Behavior for easy/hard/forgot matches the frozen
// online grade route verbatim; the only addition is the explicit `skipped` branch.
//
// For `hard`: current_interval_days is RETAINED (does not shrink); only the
// next review is brought forward to min(interval, 3) days. The interval the sync
// path stores into session_answers.interval_days is currentIntervalDays (the
// retained value), NOT the 3-day bring-forward — same as the frozen route.
export function calcNewState(q, grade, studiedAtUnixSeconds) {
  // Skip writes nothing to the question. The caller bumps study_sessions.skipped_count.
  // This MUST be explicit so a skip never falls through to the `forgot` branch.
  if (grade === "skipped") {
    return { skipped: true };
  }

  const reviewCount = Number(q.review_count) + 1;
  const correctCount = Number(q.correct_count);
  const incorrectCount = Number(q.incorrect_count);
  const correctStreak = Number(q.correct_streak);
  const hardCount = Number(q.hard_count);
  const currentInterval = Number(q.current_interval_days);

  if (grade === "easy") {
    const newStreak = correctStreak + 1;
    const idx = Math.min(newStreak - 1, INTERVALS.length - 1);
    const newInterval = Math.min(INTERVALS[idx] * 2, 180);
    return {
      reviewCount,
      correctCount: correctCount + 1,
      incorrectCount,
      correctStreak: newStreak,
      hardCount,
      currentIntervalDays: newInterval,
      nextReviewAt: midnightLondonPlus(newInterval, studiedAtUnixSeconds),
    };
  }

  if (grade === "hard") {
    const nextInterval = Math.min(currentInterval, 3);
    return {
      reviewCount,
      correctCount: correctCount + 1,
      incorrectCount,
      correctStreak, // unchanged
      hardCount: hardCount + 1,
      currentIntervalDays: currentInterval, // unchanged (retained, does not shrink)
      nextReviewAt: midnightLondonPlus(nextInterval, studiedAtUnixSeconds),
    };
  }

  // forgot
  return {
    reviewCount,
    correctCount,
    incorrectCount: incorrectCount + 1,
    correctStreak: 0,
    hardCount,
    currentIntervalDays: 1,
    nextReviewAt: midnightLondonPlus(1, studiedAtUnixSeconds),
  };
}
