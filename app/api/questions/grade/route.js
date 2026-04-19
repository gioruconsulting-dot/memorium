import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getQuestionById,
  getStudySession,
  updateQuestionAfterGrade,
  updateSessionCounts,
  insertSessionAnswer,
  generateId,
} from "@/lib/db/queries";

const VALID_GRADES = new Set(["easy", "hard", "forgot", "skipped"]);
const INTERVALS = [1, 3, 7, 14, 30, 60, 90, 180];
const DAY = 86400;

// Returns the Unix timestamp (seconds) for midnight Europe/London at the start
// of the calendar day that is `days` days from today (London date). This groups
// all questions due on the same London calendar day together.
function midnightLondonPlus(days) {
  const todayLondon = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
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

function calcNewState(q, grade) {
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
      nextReviewAt: midnightLondonPlus(newInterval),
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
      currentIntervalDays: currentInterval, // unchanged
      nextReviewAt: midnightLondonPlus(nextInterval),
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
    nextReviewAt: midnightLondonPlus(1),
  };
}

export async function POST(request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { questionId, grade, userAttempt, sessionId } = body;

    if (!questionId || !grade || !sessionId) {
      return NextResponse.json(
        { error: "questionId, grade, and sessionId are required" },
        { status: 400 }
      );
    }

    if (!VALID_GRADES.has(grade)) {
      return NextResponse.json(
        { error: `Invalid grade. Must be one of: ${[...VALID_GRADES].join(", ")}` },
        { status: 400 }
      );
    }

    // Verify the session belongs to this user
    const session = await getStudySession(sessionId, userId);
    if (!session) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const question = await getQuestionById(questionId);
    if (!question) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }

    // Verify the question belongs to this user
    if (question.user_id !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let nextReviewAt = null;
    let newIntervalDays = null;

    if (grade !== "skipped") {
      const newState = calcNewState(question, grade);
      nextReviewAt = newState.nextReviewAt;
      newIntervalDays = newState.currentIntervalDays;
      await updateQuestionAfterGrade(questionId, userId, newState);
    }

    await updateSessionCounts(sessionId, userId, grade);
    await insertSessionAnswer({
      id: generateId("ans"),
      userId,
      sessionId,
      questionId,
      userAttempt: userAttempt ? String(userAttempt).slice(0, 2000) : null,
      grade,
      intervalDays: newIntervalDays,  // null for skipped; stored for easy/hard/forgot
    });

    return NextResponse.json({ success: true, nextReviewAt, newIntervalDays });
  } catch (error) {
    console.error("[API] questions/grade failed:", error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
