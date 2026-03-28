import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { completeStudySession, getStudySession } from "@/lib/db/queries";

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

    const session = await getStudySession(sessionId, userId);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({
      summary: {
        questionsShown: Number(session.questions_shown),
        questionsAnswered: Number(session.questions_answered),
        correctCount: Number(session.correct_count),
        incorrectCount: Number(session.incorrect_count),
        skippedCount: Number(session.skipped_count),
        durationSeconds: Number(session.duration_seconds),
      },
    });
  } catch (error) {
    console.error("[API] sessions/complete failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
