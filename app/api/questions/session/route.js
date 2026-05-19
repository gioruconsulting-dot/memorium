import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getAllDueQuestions } from "@/lib/db/queries";
import { getHasNotesAccess } from "@/lib/auth/has-notes-access";

export async function GET() {
  const { userId, sessionClaims } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hasNotesAccess = await getHasNotesAccess(sessionClaims);
  const due = await getAllDueQuestions(userId, hasNotesAccess);
  return NextResponse.json({ dueCount: due.length });
}
