import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { generateQuestions } from "@/lib/ai/generate-questions";
import { generateId, insertDocument, insertQuestion, ensureUser } from "@/lib/db/queries";

export async function POST(request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ensureUser and body parsing are independent — run in parallel
  const [, body] = await Promise.all([
    ensureUser(userId),
    request.json(),
  ]);

  try {
    const { content, title, themes } = body;

    // --- Input Validation ---

    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 }
      );
    }

    if (title.trim().length > 500) {
      return NextResponse.json(
        { error: "Title too long — maximum 500 characters" },
        { status: 400 }
      );
    }

    if (!content || typeof content !== "string") {
      return NextResponse.json(
        { error: "Content is required" },
        { status: 400 }
      );
    }

    const trimmedContent = content.trim();

    if (trimmedContent.length < 100) {
      return NextResponse.json(
        { error: "Content too short — need at least 100 characters for meaningful questions" },
        { status: 400 }
      );
    }

    if (trimmedContent.length > 50000) {
      return NextResponse.json(
        { error: "Content too long — maximum 50,000 characters" },
        { status: 400 }
      );
    }

    const cleanThemes = themes
      ? String(themes).trim().substring(0, 500)
      : null;

    // --- Generate questions via Claude API ---
    let questions;
    try {
      questions = await generateQuestions(trimmedContent, title.trim(), cleanThemes || "");
    } catch (aiError) {
      console.error("[API] Question generation failed:", aiError.message);
      return NextResponse.json(
        { error: 'Question generation failed. Please try again.' },
        { status: 502 }
      );
    }

    // --- Insert document (must complete before questions due to FK) ---
    const documentId = generateId("doc");

    await insertDocument({
      id: documentId,
      userId,
      title: title.trim(),
      content: trimmedContent,
      themes: cleanThemes,
      questionCount: questions.length,
    });

    // --- Insert all questions in parallel ---
    await Promise.all(
      questions.map((q) =>
        insertQuestion({
          id: generateId("q"),
          userId,
          documentId,
          questionText: q.question,
          questionType: q.type,
          answerText: q.correctAnswer,
          explanation: q.explanation,
          sourceReference: q.sourceReference,
        })
      )
    );

    // --- Log success ---
    console.log("[API] Document created", {
      documentId,
      title: title.trim(),
      questionCount: questions.length,
      contentLength: trimmedContent.length,
    });

    // --- Return success ---
    return NextResponse.json({
      documentId,
      title: title.trim(),
      questionCount: questions.length,
    });

  } catch (error) {
    console.error("[API] Upload failed:", error);
    return NextResponse.json(
      { error: 'Upload failed. Please try again.' },
      { status: 500 }
    );
  }
}
