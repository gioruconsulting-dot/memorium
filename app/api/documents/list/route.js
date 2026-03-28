import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getAllDocuments, getAdoptedDocuments } from "@/lib/db/queries";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [uploaded, adopted] = await Promise.all([
      getAllDocuments(userId),
      getAdoptedDocuments(userId),
    ]);

    const documents = [
      ...uploaded.map((d) => ({ ...d, adopted: false })),
      ...adopted.map((d) => ({ ...d, adopted: true })),
    ].sort((a, b) => Number(b.created_at) - Number(a.created_at));

    return NextResponse.json({ documents });
  } catch (error) {
    console.error("[API] documents/list failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
