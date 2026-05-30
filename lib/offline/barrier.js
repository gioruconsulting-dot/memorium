// Write barrier (Chunk 3, sub-step 4b) — the predicate + SW-safe outbox read that
// let the service worker hold Sacred-state mutations while offline grades are still
// queued. Pure + dependency-free so it unit-tests without IndexedDB or a SW.
//
// The barrier never touches the DRAIN (/api/sync/grades) and never touches reads
// (GET) — only POST/PATCH/DELETE to a Sacred-write route.

// Pathname prefixes whose POST/PATCH/DELETE mutate Sacred or parent-of-sacred state.
// The two trailing catch-alls ("/api/documents/", "/api/notes/") cover the dynamic
// id routes (/api/documents/<id> rename, /api/notes/<id> patch/delete, generate).
// Order is for readability only — matching is "startsWith ANY", so the catch-alls
// don't shadow the specific entries.
export const SACRED_WRITE_PREFIXES = [
  "/api/questions/grade",
  "/api/questions/retire",
  "/api/questions/prioritize",
  "/api/sessions/start",
  "/api/sessions/complete",
  "/api/documents/create",
  "/api/documents/adopt",
  "/api/documents/unadopt",
  "/api/documents/delete",
  "/api/documents/set-public",
  "/api/documents/", // PATCH rename /api/documents/<id>
  "/api/notes/create",
  "/api/notes/",      // /api/notes/<id> PATCH/DELETE and /api/notes/<id>/generate
];

const WRITE_METHODS = new Set(["POST", "PATCH", "DELETE"]);

// True iff this request is a Sacred-state mutation the barrier should gate.
// `url` may be absolute (SW request.url) or a pathname; method is case-insensitive.
// The drain (/api/sync/grades) and all GET / non-/api requests return false.
export function isSacredWriteRequest({ url, method }) {
  if (!WRITE_METHODS.has(String(method).toUpperCase())) return false;
  let pathname;
  try {
    pathname = new URL(url, "http://localhost").pathname;
  } catch {
    return false;
  }
  if (pathname.startsWith("/api/sync/")) return false; // the drain is never barriered
  return SACRED_WRITE_PREFIXES.some((p) => pathname.startsWith(p));
}

// SW-safe, self-closing read of the outbox count. Opens repetita-offline with NO
// upgrade handler (never creates/upgrades schema), counts "outbox", closes the
// connection, and returns the number. Returns null (UNKNOWN) on any blocked /
// error / version-race / missing-store condition so the caller can fail OPEN.
// Deliberately does NOT reuse getDb (which never closes — connection-hygiene).
export function outboxCountForSW() {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };

    let req;
    try {
      req = indexedDB.open("repetita-offline"); // no version -> open at current
    } catch {
      return done(null);
    }

    req.onblocked = () => done(null);
    req.onerror = () => done(null);
    req.onupgradeneeded = () => {
      // DB absent or below current version: do NOT create/upgrade schema from the
      // SW (that would risk a malformed DB). Abort the versionchange -> onerror.
      try { req.transaction?.abort(); } catch { /* ignore */ }
      done(null);
    };
    req.onsuccess = () => {
      const db = req.result;
      try {
        if (!db.objectStoreNames.contains("outbox")) { db.close(); return done(null); }
        const tx = db.transaction("outbox", "readonly");
        const countReq = tx.objectStore("outbox").count();
        countReq.onsuccess = () => { const n = countReq.result; db.close(); done(n); };
        countReq.onerror = () => { db.close(); done(null); };
      } catch {
        try { db.close(); } catch { /* ignore */ }
        done(null);
      }
    };
  });
}
