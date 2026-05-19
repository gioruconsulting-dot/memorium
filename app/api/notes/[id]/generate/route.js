import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createHash } from "node:crypto";
import { getHasNotesAccess } from "@/lib/auth/has-notes-access";
import { getDocumentById, generateId } from "@/lib/db/queries";
import { getDb } from "@/lib/db/client";
import { NOTE_MIN_WORDS, countWords } from "@/lib/upload-limits";
import { generateQuestionsForDelta } from "@/lib/ai/generate-questions-for-delta";
import { generateConcepts } from "@/lib/ai/generate-concepts";
import { NoDistinctMaterialError } from "@/lib/ai/errors";

const HOURLY_NOTE_QUESTION_LIMIT = 30;
const MAX_COMBINED_CHARS = 50000;

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

function logEvent(event, fields) {
  console.log(JSON.stringify({ event, ...fields, timestamp: Date.now() }));
}

export async function POST(request, { params }) {
  const startedAt = Date.now();
  const { id: documentId } = await params;

  // a. Auth
  const { userId, sessionClaims } = await auth();
  if (!userId) {
    logEvent("note_generation_failed", {
      documentId,
      userId: null,
      error: "unauthorized",
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // b. Notes-access flag (defense-in-depth — middleware also gates, masterplan §2.3)
  const hasAccess = await getHasNotesAccess(sessionClaims);
  if (!hasAccess) {
    logEvent("note_generation_failed", {
      documentId,
      userId,
      error: "forbidden",
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // c. Document exists + owned + source_type='note' — single 404 covers all three
  // (mirrors PATCH/DELETE in app/api/notes/[id]/route.js). getDocumentById gives us
  // concepts_json for the fail-soft path below.
  const doc = await getDocumentById(documentId);
  if (!doc || doc.user_id !== userId || doc.source_type !== "note") {
    logEvent("note_generation_failed", {
      documentId,
      userId,
      error: "not_found",
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const draft = doc.note_draft_content ?? "";
  const content = doc.content ?? "";
  const inputWordCount = countWords(draft);
  const inputHash = createHash("sha256").update(draft).digest("hex");

  logEvent("note_generation_started", {
    documentId,
    userId,
    inputHash,
    inputWordCount,
  });

  // d. Rate limit: 30 note-questions inserted per rolling hour, per user.
  const db = getDb();
  const rateResult = await db.execute({
    sql: `SELECT COUNT(*) AS c FROM questions q
          JOIN documents d ON d.id = q.document_id
          WHERE q.user_id = ?
            AND d.source_type = 'note'
            AND q.created_at > strftime('%s','now','-1 hour')`,
    args: [userId],
  });
  if (Number(rateResult.rows[0].c) >= HOURLY_NOTE_QUESTION_LIMIT) {
    logEvent("note_generation_failed", {
      documentId,
      userId,
      inputHash,
      error: "rate_limited",
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(
      {
        error: "rate_limited",
        message: "Hourly limit reached (30 note-questions per hour). Try again later.",
        retryAfterSeconds: 3600,
      },
      { status: 429, headers: { "Retry-After": "3600" } }
    );
  }

  // e. Draft length gate
  if (inputWordCount < NOTE_MIN_WORDS) {
    logEvent("note_generation_failed", {
      documentId,
      userId,
      inputHash,
      error: "draft_too_short",
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(
      {
        error: "draft_too_short",
        minWords: NOTE_MIN_WORDS,
        actualWords: inputWordCount,
      },
      { status: 422 }
    );
  }

  // f. Combined-size cap (content + divider + draft)
  const divider = `\n\n---\n[Generated on: ${todayUTC()}]\n`;
  const projectedSize = content.length + divider.length + draft.length;
  if (projectedSize > MAX_COMBINED_CHARS) {
    logEvent("note_generation_failed", {
      documentId,
      userId,
      inputHash,
      error: "size_exceeded",
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(
      {
        error: "size_exceeded",
        cap: MAX_COMBINED_CHARS,
        actual: projectedSize,
      },
      { status: 422 }
    );
  }

  // --- AI calls (masterplan §2.4 steps 3–6) ---

  // Snapshot for optimistic concurrency. The WHERE clause on the UPDATE compares
  // current_state-at-write against these — if a concurrent PATCH mutated the row
  // mid-generation, rowsAffected=0 and we 409.
  const contentAtStart = content;
  const draftAtStart = draft;
  const sealedContent = contentAtStart + divider + draftAtStart;

  const [questionsResult, conceptsResult] = await Promise.allSettled([
    generateQuestionsForDelta(draftAtStart, doc.title ?? ""),
    generateConcepts(sealedContent, doc.title ?? ""),
  ]);

  // Questions outcome — terminal on either failure mode.
  if (questionsResult.status === "rejected") {
    const reason = questionsResult.reason;
    if (reason instanceof NoDistinctMaterialError) {
      logEvent("note_generation_failed", {
        documentId,
        userId,
        inputHash,
        error: "no_distinct_material",
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json(
        {
          error: "no_distinct_material",
          message: "Not enough distinct material to generate questions — add more content.",
        },
        { status: 422 }
      );
    }
    logEvent("note_generation_failed", {
      documentId,
      userId,
      inputHash,
      error: "questions_generation_failed",
      errorMessage: reason?.message,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(
      {
        error: "questions_generation_failed",
        message: "Question generation failed. Please try again.",
      },
      { status: 502 }
    );
  }
  const questions = questionsResult.value;

  // Concepts outcome — fail-soft per masterplan §1. Retain prior concepts_json
  // on failure; the document is still useful with stale concepts.
  let newConceptsJson;
  let conceptsRegenerated;
  if (conceptsResult.status === "fulfilled") {
    newConceptsJson = JSON.stringify(conceptsResult.value);
    conceptsRegenerated = true;
  } else {
    logEvent("note_generation_concepts_failed", {
      documentId,
      userId,
      inputHash,
      errorMessage: conceptsResult.reason?.message,
    });
    newConceptsJson = doc.concepts_json ?? null;
    conceptsRegenerated = false;
  }

  // --- Transaction (D4d two-step) ---

  // Step A — conditional UPDATE on documents. Optimistic concurrency via the
  // content/draft equality in the WHERE clause. rowsAffected=0 means a concurrent
  // PATCH moved the row out from under us → 409.
  const updateResult = await db.execute({
    sql: `UPDATE documents
          SET content = ?,
              note_draft_content = '',
              concepts_json = ?,
              last_generated_at = strftime('%s','now'),
              updated_at = strftime('%s','now')
          WHERE id = ?
            AND user_id = ?
            AND source_type = 'note'
            AND content = ?
            AND note_draft_content = ?`,
    args: [sealedContent, newConceptsJson, documentId, userId, contentAtStart, draftAtStart],
  });

  if (updateResult.rowsAffected === 0) {
    logEvent("note_generation_failed", {
      documentId,
      userId,
      inputHash,
      error: "note_changed",
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(
      {
        error: "note_changed",
        message: "Your note changed during generation — please refresh and try again.",
      },
      { status: 409 }
    );
  }

  // Step B — atomic batch insert of all questions. Column list mirrors
  // auto-adopt-starter.js plus concept_id (NULL, per masterplan §1) and difficulty
  // (from the AI). SR-state defaults match the schema (lib/db/schema.js:47–53).
  const qStmts = questions.map((q) => ({
    sql: `INSERT INTO questions
            (id, document_id, user_id, question_text, question_type, answer_text,
             explanation, source_reference, concept_id, difficulty,
             next_review_at, review_count, correct_count, incorrect_count,
             correct_streak, hard_count, current_interval_days, created_at, is_retired)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?,
                  strftime('%s','now'), 0, 0, 0, 0, 0, 1,
                  strftime('%s','now'), 0)`,
    args: [
      generateId("q"),
      documentId,
      userId,
      q.question,
      q.type,
      q.correct_answer,
      q.explanation,
      q.source_reference,
      q.difficulty ?? null,
    ],
  }));

  await db.batch(qStmts, "write");

  // Step C — terminal success log + response
  logEvent("note_generation_success", {
    documentId,
    userId,
    inputHash,
    questionCount: questions.length,
    conceptsRegenerated,
    durationMs: Date.now() - startedAt,
  });
  return NextResponse.json({ questionsAdded: questions.length });
}
