import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getHasNotesAccess } from "@/lib/auth/has-notes-access";
import { getDocumentById, updateNote, deleteNote, getNoteById } from "@/lib/db/queries";

// Composite divider marker injected by the generation transaction (masterplan §2.4).
// Stripped from user-supplied content/draft on Save so a typed lookalike can't corrupt
// section parsing. Bracket chars are literal in the marker, so escaped here.
const DIVIDER_RE = /\n\n---\n\[Generated on: \d{4}-\d{2}-\d{2}\]\n/g;

const MAX_COMBINED_CHARS = 50000;

export async function GET(request, { params }) {
  const { userId, sessionClaims } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hasAccess = await getHasNotesAccess(sessionClaims);
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const note = await getNoteById({ id, userId });
  if (!note) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(note);
}

export async function PATCH(request, { params }) {
  const { userId, sessionClaims } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Defense-in-depth: middleware already gates /api/notes/* on the flag, but
  // every notes route re-verifies independently (masterplan §2.3).
  const hasAccess = await getHasNotesAccess(sessionClaims);
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();

  const hasTitle = typeof body?.title === "string";
  const hasContent = typeof body?.content === "string";
  const hasDraft = typeof body?.note_draft_content === "string";

  if (!hasTitle && !hasContent && !hasDraft) {
    return NextResponse.json(
      { error: "At least one of title, content, or note_draft_content is required" },
      { status: 400 }
    );
  }

  const doc = await getDocumentById(id);
  if (!doc || doc.user_id !== userId || doc.source_type !== "note") {
    // Single 404 for "doesn't exist", "not yours", and "not a note" — don't leak existence.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const newTitle = hasTitle ? body.title.trim() : undefined;
  const newContent = hasContent ? body.content.replace(DIVIDER_RE, "") : undefined;
  const newDraft = hasDraft ? body.note_draft_content.replace(DIVIDER_RE, "") : undefined;

  // Cap is on the combined size after strip. Missing fields fall back to the
  // stored values; nullable columns normalize to '' per masterplan §1.
  const effContent = newContent !== undefined ? newContent : (doc.content ?? "");
  const effDraft = newDraft !== undefined ? newDraft : (doc.note_draft_content ?? "");
  if (effContent.length + effDraft.length > MAX_COMBINED_CHARS) {
    return NextResponse.json(
      { error: `Combined content exceeds ${MAX_COMBINED_CHARS} characters` },
      { status: 413 }
    );
  }

  const updatedAt = await updateNote({
    id,
    userId,
    title: newTitle,
    content: newContent,
    noteDraftContent: newDraft,
  });

  return NextResponse.json({ updated_at: updatedAt });
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
