import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getAllDueQuestions,
  completeAbandonedSessions,
  createStudySession,
  generateId,
} from "@/lib/db/queries";

function riskScore(q) {
  return (
    Number(q.incorrect_count) * 3 +
    Number(q.hard_count) * 2 -
    Number(q.correct_count) -
    Number(q.correct_streak) * 2
  );
}

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await completeAbandonedSessions(userId);

    const allDue = await getAllDueQuestions(userId);

    if (allDue.length === 0) {
      return NextResponse.json({ sessionId: null, questions: [] });
    }

    // Sort: (1) earliest due first, (2) highest risk score, (3) oldest created
    const sorted = [...allDue].sort((a, b) => {
      const byDue = Number(a.next_review_at) - Number(b.next_review_at);
      if (byDue !== 0) return byDue;
      const byRisk = riskScore(b) - riskScore(a);
      if (byRisk !== 0) return byRisk;
      return Number(a.created_at) - Number(b.created_at);
    });

    const selected = sorted.slice(0, 15);

    const sessionId = generateId("sess");
    await createStudySession({ id: sessionId, userId, questionsShown: selected.length });

    const questions = selected.map((q) => ({
      id: q.id,
      question_text: q.question_text,
      question_type: q.question_type,
      answer_text: q.answer_text,
      explanation: q.explanation,
      source_reference: q.source_reference,
    }));

    return NextResponse.json({ sessionId, questions });
  } catch (error) {
    console.error("[API] sessions/start failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
