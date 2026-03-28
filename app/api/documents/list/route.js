import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getAllDocuments } from "@/lib/db/queries";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const documents = await getAllDocuments(userId);
    return NextResponse.json({ documents });
  } catch (error) {
    console.error("[API] documents/list failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
