import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { setDocumentPublic } from "@/lib/db/queries";

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
    await setDocumentPublic(userId, documentId, isPublic);
    return NextResponse.json({ success: true, isPublic });
  } catch (error) {
    console.error("[API] documents/set-public failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
