import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { retireQuestionForUser } from "@/lib/db/queries";

export async function POST(request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { questionId } = await request.json();

    if (!questionId) {
      return NextResponse.json({ error: "questionId is required" }, { status: 400 });
    }

    const result = await retireQuestionForUser(questionId, userId);

    if (!result.retired) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, globallyRetired: result.globallyRetired });
  } catch (error) {
    console.error("[API] questions/retire failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
