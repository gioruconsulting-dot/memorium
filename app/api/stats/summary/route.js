import { NextResponse } from "next/server";
import { getProgressStats } from "@/lib/db/queries";

export async function GET() {
  try {
    const stats = await getProgressStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error("[API] stats/summary failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
