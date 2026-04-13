import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDocumentLibraryStats } from "@/lib/db/queries";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rows = await getDocumentLibraryStats(userId);

    const documents = rows.map((d) => ({
      id: d.id,
      title: d.title,
      themes: d.themes,
      question_count: d.question_count,
      created_at: d.created_at,
      adopted: d.document_owner_id !== userId,
      is_public: Number(d.is_public) === 1,
      mastered: Number(d.mastered),
      progressing: Number(d.progressing),
      new_count: Number(d.new_count),
      total: Number(d.total),
      total_reps: Number(d.total_reps),
      last_studied_at: d.last_studied_at ? Number(d.last_studied_at) : null,
    }));

    return NextResponse.json({ documents });
  } catch (error) {
    console.error("[API] documents/list failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
