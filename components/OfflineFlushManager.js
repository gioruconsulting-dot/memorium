'use client';

import { useEffect } from "react";
import { startFlushOnReconnect } from "@/lib/offline/flush";

// Invisible. Mounts the reconnect-flush listener for the whole app session
// (sub-step 5, chunk 3). startFlushOnReconnect() fires flushOutbox() on the
// window 'online' event and once on load if already online; single-flight is
// enforced inside flushOutbox, so this only needs to be mounted once. Returns
// its cleanup fn from the effect so the listener is removed on unmount.
export default function OfflineFlushManager() {
  useEffect(() => {
    const cleanup = startFlushOnReconnect();
    return cleanup;
  }, []);

  return null;
}
