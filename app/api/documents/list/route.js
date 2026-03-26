import { NextResponse } from "next/server";
import { getAllDocuments } from "@/lib/db/queries";

export async function GET() {
  try {
    const documents = await getAllDocuments();
    return NextResponse.json({ documents });
  } catch (error) {
    console.error("[API] documents/list failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
