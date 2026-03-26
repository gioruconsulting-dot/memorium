import { NextResponse } from "next/server";
import {
  getQuestionById,
  updateQuestionAfterGrade,
  updateSessionCounts,
  insertSessionAnswer,
  generateId,
} from "@/lib/db/queries";

const VALID_GRADES = new Set(["easy", "hard", "forgot", "skipped"]);
const INTERVALS = [1, 3, 7, 14, 30, 60, 90, 180];
const DAY = 86400;

function calcNewState(q, grade) {
  const now = Math.floor(Date.now() / 1000);
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
      nextReviewAt: now + newInterval * DAY,
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
      nextReviewAt: now + nextInterval * DAY,
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
    nextReviewAt: now + DAY,
  };
}

export async function POST(request) {
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

    const question = await getQuestionById(questionId);
    if (!question) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }

    let nextReviewAt = null;

    if (grade !== "skipped") {
      const newState = calcNewState(question, grade);
      nextReviewAt = newState.nextReviewAt;
      await updateQuestionAfterGrade(questionId, newState);
    }

    await updateSessionCounts(sessionId, grade);
    await insertSessionAnswer({
      id: generateId("ans"),
      sessionId,
      questionId,
      userAttempt: userAttempt || null,
      grade,
    });

    return NextResponse.json({ success: true, nextReviewAt });
  } catch (error) {
    console.error("[API] questions/grade failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
