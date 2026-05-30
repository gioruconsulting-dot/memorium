import { defaultCache } from "@serwist/next/worker";
import { Serwist } from "serwist";
import { isSacredWriteRequest, outboxCountForSW } from "../lib/offline/barrier.js";

// Write barrier (Chunk 3, sub-step 4b). Sacred-state mutations must not reach the
// server while offline grades are still queued — a stale tab / old bundle could
// otherwise drive a write past the client-side guard. This SW listener is the
// enforced layer.
//
// IMPORTANT SW constraint: event.respondWith() must be decided SYNCHRONOUSLY, but
// the outbox count is an async IndexedDB read. So we cannot "not respondWith when
// the outbox is empty" — instead, for any Sacred-write request we respondWith and,
// once we know the count, transparently re-issue fetch(event.request) when the
// outbox is empty or unknown. That is behaviourally identical to pass-through (same
// request, same body — we never read the body), with the SW merely in the path.
const BARRIER_TIMEOUT_MS = 3000;
const BARRIER_POLL_MS = 200;

async function handleSacredWrite(request) {
  try {
    let count = await outboxCountForSW();
    // Empty -> pass through. Unknown (null) -> FAIL OPEN (pass through).
    if (count === 0 || count === null) return fetch(request);

    // count > 0: hold, polling until the drain empties the outbox or we time out.
    const deadline = Date.now() + BARRIER_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, BARRIER_POLL_MS));
      count = await outboxCountForSW();
      if (count === 0 || count === null) return fetch(request);
    }
    return new Response(JSON.stringify({ error: "sync_pending" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    // Never let the barrier itself break a write — fail open.
    return fetch(request);
  }
}

// Registered BEFORE serwist.addEventListeners() so it gets first crack. For
// non-Sacred requests we return without respondWith, leaving Serwist/network
// untouched.
self.addEventListener("fetch", (event) => {
  if (!isSacredWriteRequest({ url: event.request.url, method: event.request.method })) return;
  event.respondWith(handleSacredWrite(event.request));
});

// self.__SW_MANIFEST is injected by @serwist/next at build time — it holds the
// precache entries for the build's static assets. Declared implicitly on the
// service-worker global scope.
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        // Document (page-navigation) requests that fail offline fall back to the
        // static, auth-free offline page. API/data requests are NOT given a
        // fallback — they surface their own network error (handled in later chunks).
        url: "/~offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();
