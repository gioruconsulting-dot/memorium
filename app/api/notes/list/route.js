import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";

export async function GET() {
  const { userId, sessionClaims } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let hasAccess = false;
  if (sessionClaims?.publicMetadata !== undefined) {
    hasAccess = sessionClaims.publicMetadata?.hasNotesAccess === true;
  } else {
    const user = await currentUser();
    hasAccess = user?.publicMetadata?.hasNotesAccess === true;
  }

  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ access: true });
}
