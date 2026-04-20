import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { completeStudySession, getStudySession, getUserStreak, getAllDueQuestions, awardMonthlyStreakCard } from "@/lib/db/queries";

export async function POST(request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { sessionId } = body;

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    await completeStudySession(sessionId, userId);

    const [session, streakData, remainingDue] = await Promise.all([
      getStudySession(sessionId, userId),
      getUserStreak(userId),
      getAllDueQuestions(userId),
    ]);

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Check if this session pushed the user to exactly 15 active study days this month
    // (monthly card earn is also handled in getUserStreak for home-page detection,
    //  but we surface it here so the celebration screen can notify via localStorage)
    const now = new Date();
    const currentMonth = now.toLocaleDateString('en-CA', { timeZone: 'Europe/London' }).slice(0, 7);
    const monthlyCardEarned = await awardMonthlyStreakCard(userId, currentMonth);

    return NextResponse.json({
      summary: {
        questionsShown: Number(session.questions_shown),
        questionsAnswered: Number(session.questions_answered),
        correctCount: Number(session.correct_count),
        incorrectCount: Number(session.incorrect_count),
        skippedCount: Number(session.skipped_count),
        durationSeconds: Number(session.duration_seconds),
        currentStreak: streakData.currentStreak,
        remainingDueCount: remainingDue.length,
        monthlyCardEarned,
      },
    });
  } catch (error) {
    console.error("[API] sessions/complete failed:", error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
