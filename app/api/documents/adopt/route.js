import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getDocumentById,
  hasUserAdoptedDocument,
  getQuestionsByDocumentAndUser,
  insertQuestion,
  generateId,
  ensureUser,
} from "@/lib/db/queries";

export async function POST(request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureUser(userId);

  try {
    const body = await request.json();
    const { documentId } = body;

    if (!documentId) {
      return NextResponse.json({ error: "documentId is required" }, { status: 400 });
    }

    // Validate document exists and is public
    const document = await getDocumentById(documentId);
    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    if (!document.is_public) {
      return NextResponse.json({ error: "Document is not public" }, { status: 403 });
    }
    if (document.user_id === userId) {
      return NextResponse.json({ error: "You cannot adopt your own document" }, { status: 400 });
    }

    // Check not already adopted
    const alreadyAdopted = await hasUserAdoptedDocument(userId, documentId);
    if (alreadyAdopted) {
      return NextResponse.json({ error: "You have already adopted this document" }, { status: 409 });
    }

    // Fetch the original uploader's questions
    const sourceQuestions = await getQuestionsByDocumentAndUser(documentId, document.user_id);
    if (sourceQuestions.length === 0) {
      return NextResponse.json({ error: "No questions found for this document" }, { status: 404 });
    }

    // Copy each question with fresh SR state for the current user
    for (const q of sourceQuestions) {
      await insertQuestion({
        id: generateId("q"),
        userId,
        documentId,
        questionText: q.question_text,
        questionType: q.question_type,
        answerText: q.answer_text,
        explanation: q.explanation || null,
        sourceReference: q.source_reference || null,
      });
    }

    console.log("[API] Document adopted", { documentId, userId, questionCount: sourceQuestions.length });

    return NextResponse.json({ success: true, questionCount: sourceQuestions.length });
  } catch (error) {
    console.error("[API] documents/adopt failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
