import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { deleteDocument } from "@/lib/db/queries";

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

    await deleteDocument(documentId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API] documents/delete failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
