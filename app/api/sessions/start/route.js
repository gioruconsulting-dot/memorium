import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getAllDueQuestions,
  completeAbandonedSessions,
  createStudySession,
  generateId,
  ensureUser,
  getDocumentStatsForSession,
} from "@/lib/db/queries";

// Round-robin interleave so consecutive questions come from different documents
function interleaveByDocument(questions) {
  const groups = new Map();
  for (const q of questions) {
    if (!groups.has(q.document_id)) groups.set(q.document_id, []);
    groups.get(q.document_id).push(q);
  }
  const buckets = [...groups.values()];
  const result = [];
  while (result.length < questions.length) {
    for (const bucket of buckets) {
      if (bucket.length > 0) result.push(bucket.shift());
    }
  }
  return result;
}

function riskScore(q) {
  return (
    Number(q.incorrect_count) * 3 +
    Number(q.hard_count) * 2 -
    Number(q.correct_count) -
    Number(q.correct_streak) * 2
  );
}

export async function POST(request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureUser(userId);

  // limit: number = cap questions; capped at 100 max
  const MAX_SESSION_LIMIT = 100;
  let limit = 15;
  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body.limit === 'number' && body.limit > 0) {
      limit = Math.min(Math.floor(body.limit), MAX_SESSION_LIMIT);
    }
  } catch {}

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

    const selected = interleaveByDocument(sorted.slice(0, limit));

    const sessionId = generateId("sess");
    await createStudySession({ id: sessionId, userId, questionsShown: selected.length });

    // Fetch document stats for insight computation on the farewell screen
    const docIds = [...new Set(selected.map(q => q.document_id))];
    const docStatRows = await getDocumentStatsForSession(userId, docIds);
    const docStatsMap = Object.fromEntries(
      docStatRows.map(d => [d.id, { title: d.title, total: Number(d.total), mastered: Number(d.mastered) }])
    );

    const questions = selected.map((q) => ({
      id: q.id,
      question_text: q.question_text,
      question_type: q.question_type,
      answer_text: q.answer_text,
      explanation: q.explanation,
      source_reference: q.source_reference,
      // Fields for end-of-session insight
      document_id: q.document_id,
      document_title: docStatsMap[q.document_id]?.title || null,
      incorrect_count: Number(q.incorrect_count),
      current_interval_days: Number(q.current_interval_days),
    }));

    return NextResponse.json({ sessionId, questions, documentStats: docStatsMap });
  } catch (error) {
    console.error("[API] sessions/start failed:", error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
