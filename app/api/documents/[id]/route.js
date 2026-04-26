import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDocumentById, updateDocumentTopic } from "@/lib/db/queries";

const VALID_TOPICS = new Set(["Tech", "Business", "Science", "Humanities", "Personal Growth", "Other"]);

export async function PATCH(request, { params }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const { topic } = body;

  if (!topic || !VALID_TOPICS.has(topic)) {
    return NextResponse.json({ error: "Invalid topic" }, { status: 400 });
  }

  const doc = await getDocumentById(id);
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  if (doc.user_id !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await updateDocumentTopic(id, userId, topic);
  return NextResponse.json({ success: true, topic });
}
