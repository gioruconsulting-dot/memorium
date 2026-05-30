import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDb } from "@/lib/db/client";
import { replayGradeEvents } from "@/lib/offline/sync-replay";
import { isWellFormedEvent } from "@/lib/offline/validate-event";

// Offline grade-sync endpoint (Chunk 3, sub-step 2). Replays the client's grade
// outbox into the real SR tables via lib/offline/sync-replay. Idempotent and
// Sacred-write-safe: see that module for the per-event guarantees.
//
// A 401 is NEVER an ack — the client keeps the whole batch in its durable outbox
// and retries after re-auth. Per-event acks live in the returned `results`.
export async function POST(request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const events = Array.isArray(body?.events) ? body.events : null;
    if (!events) {
      return NextResponse.json({ error: "events array required" }, { status: 400 });
    }

    // Shape-guard the envelope before it reaches the Sacred-write replay. A
    // malformed event does NOT abort the batch and is NOT replayed — it comes
    // back as its own per-event "error" so the client can quarantine it.
    const wellFormed = [];
    const malformed = [];
    for (const ev of events) {
      if (isWellFormedEvent(ev)) {
        wellFormed.push(ev);
      } else {
        malformed.push({ eventId: ev?.eventId ?? null, status: "error", reason: "malformed_event" });
      }
    }

    const replayResults = await replayGradeEvents(getDb(), userId, wellFormed);
    return NextResponse.json({ results: [...replayResults, ...malformed] });
  } catch (error) {
    console.error("[API] sync/grades failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
