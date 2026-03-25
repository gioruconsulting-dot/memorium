import { NextResponse } from "next/server";
import { generateQuestions } from "@/lib/ai/generate-questions";
import { generateId, insertDocument, insertQuestion } from "@/lib/db/queries";

export async function POST(request) {
  try {
    // Parse request body
    const body = await request.json();
    const { content, title, themes } = body;

    // --- Input Validation ---

    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return NextResponse.json(
        { error: "Title is required" },
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
        { error: `Question generation failed: ${aiError.message}` },
        { status: 502 }
      );
    }

    // --- Insert document ---
    const documentId = generateId("doc");

    await insertDocument({
      id: documentId,
      title: title.trim(),
      content: trimmedContent,
      themes: cleanThemes,
      questionCount: questions.length,
    });

    // --- Insert questions ---
    for (const q of questions) {
      await insertQuestion({
        id: generateId("q"),
        documentId,
        questionText: q.question,
        questionType: q.type,
        answerText: q.correctAnswer,
        explanation: q.explanation,
        sourceReference: q.sourceReference,
      });
    }

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
      { error: `Upload failed: ${error.message}` },
      { status: 500 }
    );
  }
}

