import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getPublicDocumentsForBrowse } from "@/lib/db/queries";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const documents = await getPublicDocumentsForBrowse(userId);
    return NextResponse.json({ documents });
  } catch (error) {
    console.error("[API] documents/browse failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
