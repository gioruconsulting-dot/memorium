import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getHasNotesAccess } from "@/lib/auth/has-notes-access";
import { ensureUser, generateId, insertNote } from "@/lib/db/queries";

export async function POST() {
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

  await ensureUser(userId);

  const id = generateId("doc");
  // Owner binding: the new row is written with user_id = authenticated userId.
  // No pre-existing record to ownership-check on create.
  await insertNote({ id, userId });

  return NextResponse.json({ id });
}
