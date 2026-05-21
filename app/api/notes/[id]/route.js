import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getHasNotesAccess } from "@/lib/auth/has-notes-access";
import {
  getDocumentById,
  updateNote,
  deleteNote,
  getNoteById,
} from "@/lib/db/queries";

// Masterplan §2.2 contract:
//   GET   → { id, title, draft, note_version, blocks: [{...}] }
//   PATCH ← { title?, draft?, note_version?, blocks?: [{id, content, version}] }
// Concurrency, size cap, stale-flip and block validation live in lib/db/queries.js
// (updateNote returns a tagged result). This handler is shape-only: parse body,
// dispatch, map tagged result → HTTP status.

export async function GET(_request, { params }) {
  const { userId, sessionClaims } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Defense-in-depth: middleware already gates /api/notes/*, but every notes
  // route re-verifies the flag independently (masterplan §2.3).
  const hasAccess = await getHasNotesAccess(sessionClaims);
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const note = await getNoteById(id, userId);
  if (!note) {
    // Single 404 covers "missing", "not yours", "not a note" without leaking
    // which case (matches getNoteById's null contract).
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(note);
}

export async function PATCH(request, { params }) {
  const { userId, sessionClaims } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hasAccess = await getHasNotesAccess(sessionClaims);
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    // Malformed JSON → treat as invalid patch shape.
    return NextResponse.json({ error: "invalid_patch" }, { status: 400 });
  }

  const result = await updateNote(id, userId, body);

  if (result.ok) {
    return NextResponse.json({ note: result.note });
  }

  switch (result.reason) {
    case "invalid_patch":
      return NextResponse.json({ error: "invalid_patch" }, { status: 400 });

    case "not_found":
      return NextResponse.json({ error: "not_found" }, { status: 404 });

    case "size_exceeded":
      return NextResponse.json(
        {
          error: "size_exceeded",
          combined_chars: result.combined_chars,
          limit: result.limit,
        },
        { status: 422 }
      );

    case "note_changed":
      // updateNote already attached the fresh current state.
      return NextResponse.json(
        { error: "note_changed", current: result.current },
        { status: 409 }
      );

    case "block_not_found": {
      // updateNote returns only block_id here (its shape concern stops at the
      // failed validation). The route surfaces current state for the client's
      // recovery panel — same UX as note_changed.
      const current = await getNoteById(id, userId);
      return NextResponse.json(
        {
          error: "block_not_found",
          block_id: result.block_id,
          current,
        },
        { status: 409 }
      );
    }

    default:
      // Belt-and-braces: any unmapped reason becomes a 500 with the reason
      // string visible to ops. Shouldn't happen given updateNote's contract.
      return NextResponse.json(
        { error: "unknown", reason: result.reason ?? null },
        { status: 500 }
      );
  }
}

export async function DELETE(request, { params }) {
  const { userId, sessionClaims } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hasAccess = await getHasNotesAccess(sessionClaims);
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const doc = await getDocumentById(id);
  if (!doc || doc.user_id !== userId || doc.source_type !== "note") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await deleteNote({ id, userId });
  return NextResponse.json({ deleted: true });
}
