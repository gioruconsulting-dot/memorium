import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createHash } from "node:crypto";
import { getHasNotesAccess } from "@/lib/auth/has-notes-access";
import { getNoteById, generateId } from "@/lib/db/queries";
import { getDb } from "@/lib/db/client";
import { NOTE_MIN_WORDS, countWords } from "@/lib/upload-limits";
import { generateQuestionsForDelta } from "@/lib/ai/generate-questions-for-delta";
import { generateConcepts } from "@/lib/ai/generate-concepts";
import { NoDistinctMaterialError } from "@/lib/ai/errors";

// Masterplan §1 generation transaction:
//   - AI calls happen OUTSIDE any DB transaction
//   - All DB writes land in one libSQL batch("write") (atomic)
//   - Stale blocks: retire old questions (retired_at + is_retired=1), insert
//     new active questions, mark block fresh, bump block.version
//   - Draft: insert new note_blocks row + its new questions, clear+bump doc
//   - Concepts: fail-soft (retain prior on failure)
//   - Soft cap: regen at most 5 oldest stale per click
//   - Per-block NoDistinctMaterialError → block stays stale, questions stay
//     active, the rest of the generate still happens
//   - Hard AI failure → abort entire generate, no DB writes (502)

const HOURLY_NOTE_QUESTION_LIMIT = 30;
const STALE_BATCH_CAP = 5;

function logEvent(event, fields) {
  console.log(JSON.stringify({ event, ...fields, timestamp: Date.now() }));
}

export async function POST(_request, { params }) {
  const startedAt = Date.now();
  const { id: documentId } = await params;

  // ─── a. Auth ─────────────────────────────────────────────────────────
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

  // ─── b. Notes-access flag (defense-in-depth) ─────────────────────────
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

  // ─── c. Load note state (ownership + source_type='note' + 404) ───────
  const note = await getNoteById(documentId, userId);
  if (!note) {
    logEvent("note_generation_failed", {
      documentId,
      userId,
      error: "not_found",
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // ─── d. "Something to do" gate ───────────────────────────────────────
  const draft = note.draft ?? "";
  const draftWordCount = countWords(draft);
  const hasDraftToSeal = draftWordCount >= NOTE_MIN_WORDS;
  const allStaleBlocks = note.blocks.filter((b) => b.is_stale === 1);

  if (!hasDraftToSeal && allStaleBlocks.length === 0) {
    logEvent("note_generation_failed", {
      documentId,
      userId,
      error: "nothing_to_do",
      draftWordCount,
      staleBlockCount: 0,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(
      {
        error: "nothing_to_do",
        message:
          draftWordCount > 0
            ? `Draft is below the ${NOTE_MIN_WORDS}-word minimum and no blocks need refresh.`
            : "Nothing to generate: no draft and no blocks need refresh.",
        minWords: NOTE_MIN_WORDS,
        actualWords: draftWordCount,
      },
      { status: 422 }
    );
  }

  // ─── e. Rate limit (v4 logic — preserved verbatim) ───────────────────
  // 30 note-questions inserted per rolling hour, per user.
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

  // ─── f. Soft cap — select up to 5 oldest stale blocks ────────────────
  // Order: stale_since ASC, sealed_at ASC, id ASC (masterplan §1).
  const selectedStaleBlocks = [...allStaleBlocks]
    .sort((a, b) => {
      const sa = a.stale_since ?? 0;
      const sb = b.stale_since ?? 0;
      if (sa !== sb) return sa - sb;
      if (a.sealed_at !== b.sealed_at) return a.sealed_at - b.sealed_at;
      return a.id < b.id ? -1 : 1;
    })
    .slice(0, STALE_BATCH_CAP);
  const overflowStaleCount = allStaleBlocks.length - selectedStaleBlocks.length;

  const inputHash = createHash("sha256")
    .update(JSON.stringify({
      d: draft,
      b: selectedStaleBlocks.map((x) => ({ id: x.id, v: x.version })),
    }))
    .digest("hex");

  logEvent("note_generation_started", {
    documentId,
    userId,
    inputHash,
    draftWordCount,
    selectedStaleCount: selectedStaleBlocks.length,
    overflowStaleCount,
    totalBlockCount: note.blocks.length,
  });

  // ─── g. AI dispatch (outside any transaction) ────────────────────────
  // Parallel: each selected stale block, draft (if sealing), concepts (fail-soft).
  // We use allSettled so per-call outcomes can be classified individually:
  //   - fulfilled       → got questions, regen this block
  //   - NoDistinctMat.  → block stays stale, original questions remain active
  //   - other rejection → hard fail, abort whole generate
  const sealedFullText =
    note.blocks.map((b) => b.content).join("\n\n") +
    (draft ? `\n\n${draft}` : "");
  const title = note.title ?? "";

  const staleAiCalls = selectedStaleBlocks.map((b) =>
    generateQuestionsForDelta(b.content, title)
  );
  const draftAiCall = hasDraftToSeal
    ? generateQuestionsForDelta(draft, title)
    : Promise.resolve(null);
  const conceptsAiCall = generateConcepts(sealedFullText, title);

  const [staleResults, draftResult, conceptsResult] = await Promise.all([
    Promise.allSettled(staleAiCalls),
    draftAiCall.then(
      (v) => ({ status: "fulfilled", value: v }),
      (e) => ({ status: "rejected", reason: e })
    ),
    conceptsAiCall.then(
      (v) => ({ status: "fulfilled", value: v }),
      (e) => ({ status: "rejected", reason: e })
    ),
  ]);

  // ─── h. Classify outcomes ────────────────────────────────────────────
  // Hard failures (non-NoDistinctMaterialError rejections) on any block or
  // draft → abort entire generate. NO DB writes.
  const stillNeedsRefresh = [];
  const regenBlocks = []; // { id, content, version, newQuestions: [...] }
  for (let i = 0; i < selectedStaleBlocks.length; i++) {
    const block = selectedStaleBlocks[i];
    const result = staleResults[i];
    if (result.status === "fulfilled") {
      regenBlocks.push({
        id: block.id,
        content: block.content,
        version: block.version,
        newQuestions: result.value,
      });
    } else if (result.reason instanceof NoDistinctMaterialError) {
      stillNeedsRefresh.push(block.id);
    } else {
      logEvent("note_generation_failed", {
        documentId,
        userId,
        inputHash,
        error: "questions_generation_failed",
        failedBlockId: block.id,
        errorMessage: result.reason?.message,
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
  }

  // Draft outcome (only when we actually attempted draft sealing).
  let draftSealing = null; // { newBlockId, newQuestions, originalNoteVersion }
  let draftNoDistinct = false;
  if (hasDraftToSeal) {
    if (draftResult.status === "fulfilled") {
      draftSealing = {
        newBlockId: generateId("blk"),
        newQuestions: draftResult.value,
        originalNoteVersion: note.note_version,
      };
    } else if (draftResult.reason instanceof NoDistinctMaterialError) {
      // Per spec: don't seal, still proceed with stale-block regeneration.
      draftNoDistinct = true;
    } else {
      logEvent("note_generation_failed", {
        documentId,
        userId,
        inputHash,
        error: "questions_generation_failed",
        failedDraft: true,
        errorMessage: draftResult.reason?.message,
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
  }

  // Concepts: fail-soft per masterplan §1.
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
    // Refetch the stored concepts to keep them intact. (getNoteById doesn't
    // surface concepts_json today — small extra read instead of expanding
    // the Chunk 2 function shape.)
    const docRes = await db.execute({
      sql: `SELECT concepts_json FROM documents WHERE id = ?`,
      args: [documentId],
    });
    newConceptsJson = docRes.rows[0]?.concepts_json ?? null;
    conceptsRegenerated = false;
  }

  // ─── i. Execute writes inside an interactive transaction ─────────────
  // We use db.transaction("write") instead of db.batch(..., "write") because
  // libSQL's batch is atomic on SQL errors but NOT on rowsAffected=0: a
  // conditional WHERE that matches no rows is a successful 0-row UPDATE
  // and the batch still commits everything else. Interactive transactions
  // let us inspect rowsAffected per statement and explicitly rollback on
  // a concurrency miss. Per masterplan §2.5: keep the tx duration short
  // (all AI calls already done above; this is pure DB).
  const now = Math.floor(Date.now() / 1000);
  let totalNewQuestions = 0;
  let conflictDetected = false;

  const insertQuestionSql = `
    INSERT INTO questions
      (id, document_id, user_id, question_text, question_type, answer_text,
       explanation, source_reference, concept_id, difficulty,
       next_review_at, review_count, correct_count, incorrect_count,
       correct_streak, hard_count, current_interval_days, created_at, is_retired,
       block_id, retired_at, retired_reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?,
            ?, 0, 0, 0, 0, 0, 1, ?, 0,
            ?, NULL, NULL)`;

  const tx = await db.transaction("write");
  try {
    // Per regenerated block: retire old questions, conditional UPDATE on the
    // block itself (concurrency check), then INSERT new questions.
    for (const r of regenBlocks) {
      await tx.execute({
        sql: `UPDATE questions
              SET retired_at = ?, retired_reason = 'block_regenerated', is_retired = 1
              WHERE block_id = ? AND retired_at IS NULL`,
        args: [now, r.id],
      });

      const blockUpdate = await tx.execute({
        sql: `UPDATE note_blocks
              SET content = ?, is_stale = 0, stale_since = NULL,
                  version = version + 1, updated_at = ?
              WHERE id = ? AND version = ?`,
        args: [r.content, now, r.id, r.version],
      });
      if (blockUpdate.rowsAffected !== 1) {
        conflictDetected = true;
        break;
      }

      for (const q of r.newQuestions) {
        await tx.execute({
          sql: insertQuestionSql,
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
            now, // next_review_at — due immediately
            now, // created_at
            r.id, // block_id
          ],
        });
        totalNewQuestions++;
      }
    }

    if (!conflictDetected && draftSealing) {
      await tx.execute({
        sql: `INSERT INTO note_blocks
                (id, document_id, content, sealed_at, updated_at,
                 is_stale, stale_since, version)
              VALUES (?, ?, ?, ?, ?, 0, NULL, 1)`,
        args: [draftSealing.newBlockId, documentId, draft, now, now],
      });
      for (const q of draftSealing.newQuestions) {
        await tx.execute({
          sql: insertQuestionSql,
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
            now,
            now,
            draftSealing.newBlockId,
          ],
        });
        totalNewQuestions++;
      }
      const docUpdate = await tx.execute({
        sql: `UPDATE documents
              SET note_draft_content = '',
                  note_version = note_version + 1,
                  concepts_json = ?,
                  last_generated_at = ?,
                  updated_at = ?
              WHERE id = ? AND user_id = ? AND source_type = 'note'
                AND note_version = ?`,
        args: [
          newConceptsJson,
          now,
          now,
          documentId,
          userId,
          draftSealing.originalNoteVersion,
        ],
      });
      if (docUpdate.rowsAffected !== 1) {
        conflictDetected = true;
      }
    } else if (!conflictDetected) {
      // No draft sealing → still record concepts + last_generated_at + updated_at
      // on the doc. Not conditional on note_version (we didn't touch the draft).
      await tx.execute({
        sql: `UPDATE documents
              SET concepts_json = ?, last_generated_at = ?, updated_at = ?
              WHERE id = ? AND user_id = ? AND source_type = 'note'`,
        args: [newConceptsJson, now, now, documentId, userId],
      });
    }

    if (conflictDetected) {
      await tx.rollback();
    } else {
      await tx.commit();
    }
  } catch (err) {
    // Any thrown error inside the tx → rollback and let the route 500.
    try { await tx.rollback(); } catch {}
    throw err;
  }

  if (conflictDetected) {
    logEvent("note_generation_failed", {
      documentId,
      userId,
      inputHash,
      error: "note_changed",
      durationMs: Date.now() - startedAt,
    });
    const current = await getNoteById(documentId, userId);
    return NextResponse.json(
      { error: "note_changed", current },
      { status: 409 }
    );
  }

  // ─── k. Success ──────────────────────────────────────────────────────
  const regenerated_block_ids = regenBlocks.map((r) => r.id);
  const new_block_id = draftSealing ? draftSealing.newBlockId : null;

  logEvent("note_generation_success", {
    documentId,
    userId,
    inputHash,
    regenerated_block_count: regenerated_block_ids.length,
    new_block_questions: draftSealing
      ? draftSealing.newQuestions.length
      : 0,
    skipped_block_count: stillNeedsRefresh.length,
    total_block_count: note.blocks.length,
    draft_no_distinct: draftNoDistinct,
    concepts_regenerated: conceptsRegenerated,
    new_question_count: totalNewQuestions,
    overflowStaleCount,
    durationMs: Date.now() - startedAt,
  });

  return NextResponse.json({
    regenerated_blocks: regenerated_block_ids,
    new_block_id,
    new_question_count: totalNewQuestions,
    still_needs_refresh: stillNeedsRefresh,
  });
}
