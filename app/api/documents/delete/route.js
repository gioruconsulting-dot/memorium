import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDocumentById, deleteDocument } from "@/lib/db/queries";

export async function DELETE(request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { documentId } = body;

    if (!documentId) {
      return NextResponse.json({ error: "documentId is required" }, { status: 400 });
    }

    // Verify the document exists and belongs to this user
    const document = await getDocumentById(documentId);
    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    if (document.user_id !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await deleteDocument(userId, documentId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API] documents/delete failed:", error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
