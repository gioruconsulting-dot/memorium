import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getAllDueQuestions, getDocumentStatsForSession } from "@/lib/db/queries";
import { getHasNotesAccess } from "@/lib/auth/has-notes-access";

// Read-only endpoint that returns the user's FULL due set for offline caching
// (Chunk 2). Deliberately mirrors /api/sessions/start's per-question projection
// and documentStats shape so a future offline session renders identically — but
// it is SELECT-only: it creates NO study_sessions row, applies NO limit, does NO
// sorting/interleave, and never writes. Source of truth for scheduling stays on
// the server at sync time; this carries DISPLAY fields only (no SR base state).
export async function GET() {
  const { userId, sessionClaims } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const hasNotesAccess = await getHasNotesAccess(sessionClaims);
    const due = await getAllDueQuestions(userId, hasNotesAccess);

    if (due.length === 0) {
      return NextResponse.json({ questions: [], documentStats: {} });
    }

    const docIds = [...new Set(due.map((q) => q.document_id))];
    const docStatRows = await getDocumentStatsForSession(userId, docIds, hasNotesAccess);
    const documentStats = Object.fromEntries(
      docStatRows.map((d) => [d.id, { title: d.title, total: Number(d.total), mastered: Number(d.mastered) }])
    );

    // Same 10-field projection as /api/sessions/start — display + scheduling-display
    // only. No review_count / correct_streak / hard_count / correct_count / next_review_at.
    const questions = due.map((q) => ({
      id: q.id,
      question_text: q.question_text,
      question_type: q.question_type,
      answer_text: q.answer_text,
      explanation: q.explanation,
      source_reference: q.source_reference,
      document_id: q.document_id,
      document_title: documentStats[q.document_id]?.title || null,
      incorrect_count: Number(q.incorrect_count),
      current_interval_days: Number(q.current_interval_days),
    }));

    return NextResponse.json({ questions, documentStats });
  } catch (error) {
    console.error("[API] questions/all-due failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
