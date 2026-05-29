'use client';

import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { useOnlineStatus } from "@/lib/offline/useOnlineStatus";
import { cacheDueSet } from "@/lib/offline/db";
import { isOutboxEmpty } from "@/lib/offline/outbox";

// Invisible. Populates the offline due-question cache (Chunk 2). It only WRITES
// the cache — nothing consumes it yet (offline study is Chunk 3). Refreshes on
// mount and whenever the connection transitions back online, but never while the
// outbox has pending writes (so we don't clobber unsynced state). Fails quietly.
export default function OfflineCacheManager() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const online = useOnlineStatus();

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId) return;
    if (!online) return;

    let cancelled = false;

    (async () => {
      try {
        if (!(await isOutboxEmpty())) return;
        const res = await fetch("/api/questions/all-due");
        if (!res.ok) {
          console.warn("[offline] all-due fetch failed:", res.status);
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        await cacheDueSet(userId, data);
      } catch (err) {
        console.warn("[offline] cache populate skipped:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, userId, online]);

  return null;
}
