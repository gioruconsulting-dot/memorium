import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { generateQuestions } from "@/lib/ai/generate-questions";
import { generateId, insertDocument, insertQuestion, ensureUser } from "@/lib/db/queries";
import { getDb } from "@/lib/db/client";
import { MIN_WORDS, MAX_WORDS, countWords } from "@/lib/upload-limits";

const DAILY_DOC_LIMIT = 25;

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
    const { content, title, isPublic } = body;

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

    const wordCount = countWords(content);
    if (wordCount < MIN_WORDS) {
      return NextResponse.json(
        { error: `Document is ${wordCount} words. Minimum is ${MIN_WORDS}.` },
        { status: 400 }
      );
    }
    if (wordCount > MAX_WORDS) {
      return NextResponse.json(
        { error: `Document is ${wordCount} words. Maximum is ${MAX_WORDS}.` },
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

    // --- Rate limit: 25 documents per 24h per user (runs before the Claude call) ---
    const db = getDb();
    const countResult = await db.execute({
      sql: `SELECT COUNT(*) AS c FROM documents
            WHERE user_id = ?
              AND created_at > strftime('%s','now','-1 day')`,
      args: [userId],
    });
    if (Number(countResult.rows[0].c) >= DAILY_DOC_LIMIT) {
      return NextResponse.json(
        {
          error: "rate_limited",
          message: "Daily limit reached (25 documents per 24 hours). Try again tomorrow.",
        },
        { status: 429 }
      );
    }

    // Default to public if the client didn't send the field at all.
    const isPublicNormalized = isPublic === undefined ? true : Boolean(isPublic);

    // --- Generate questions via Claude API ---
    let questions, description, topic;
    try {
      ({ questions, description, topic } = await generateQuestions(trimmedContent, title.trim()));
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
      description,
      topic,
      questionCount: questions.length,
      isPublic: isPublicNormalized,
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
      topic,
    });

  } catch (error) {
    console.error("[API] Upload failed:", error);
    return NextResponse.json(
      { error: 'Upload failed. Please try again.' },
      { status: 500 }
    );
  }
}
