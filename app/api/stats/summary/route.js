import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getProgressStats } from "@/lib/db/queries";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const stats = await getProgressStats(userId);
    return NextResponse.json(stats);
  } catch (error) {
    console.error("[API] stats/summary failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
