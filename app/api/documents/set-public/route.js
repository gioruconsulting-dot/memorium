import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDocumentById, setDocumentPublic } from "@/lib/db/queries";

export async function PATCH(request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { documentId, isPublic } = await request.json();
  if (!documentId || typeof isPublic !== "boolean") {
    return NextResponse.json({ error: "documentId and isPublic (boolean) are required" }, { status: 400 });
  }

  try {
    const document = await getDocumentById(documentId);
    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    if (document.user_id !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (document.source_type === "note") {
      return NextResponse.json({ error: "Notes cannot be published" }, { status: 403 });
    }

    await setDocumentPublic(userId, documentId, isPublic);
    return NextResponse.json({ success: true, isPublic });
  } catch (error) {
    console.error("[API] documents/set-public failed:", error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
