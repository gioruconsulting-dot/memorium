import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getAllDueQuestions } from "@/lib/db/queries";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const due = await getAllDueQuestions(userId);
  return NextResponse.json({ dueCount: due.length });
}
