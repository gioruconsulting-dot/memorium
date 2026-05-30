import { openDB } from "idb";

// IndexedDB for the offline feature. Chunk 2 stores only the due-question
// DISPLAY set, namespaced by userId (shared-device safety). SR base state is
// never stored and SR math is never done client-side — the server is the single
// source of truth at sync time.

const DB_NAME = "repetita-offline";
const DB_VERSION = 2;
const DUE_CACHE_STORE = "dueCache";

// Each version's schema change is its own `if (oldVersion < N)` block so future
// chunks add stores with a clean version bump without rewriting existing upgrade
// logic.
//
// v2 (Chunk 3, sub-step 3a) adds the grade-outbox plumbing — schema only here;
// the event API + clientSeq counter logic land in sub-step 3b:
//   - outbox        keyPath "eventId"  — queued offline grade events awaiting sync
//   - card_attempts keyPath "eventId"  — reveal-time records (event id minted at reveal)
//   - meta          keyPath "key"      — small singletons; holds { key: "clientSeq", value }
// All three are keyed by the client-minted eventId / a fixed key, so no secondary
// indexes are needed (lookups are by primary key; sync sorts in memory by
// (studiedAt, clientSeq)). None added.
export function getDb() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        // Keyed by userId — one cached due-set per user on this device.
        db.createObjectStore(DUE_CACHE_STORE, { keyPath: "userId" });
      }
      if (oldVersion < 2) {
        db.createObjectStore("outbox", { keyPath: "eventId" });
        db.createObjectStore("card_attempts", { keyPath: "eventId" });
        db.createObjectStore("meta", { keyPath: "key" });
      }
    },
  });
}

// Write the user's due-set snapshot. `payload` is { questions, documentStats }
// exactly as returned by GET /api/questions/all-due.
export async function cacheDueSet(userId, { questions, documentStats }) {
  const db = await getDb();
  await db.put(DUE_CACHE_STORE, {
    userId,
    questions,
    documentStats,
    cachedAt: Math.floor(Date.now() / 1000),
  });
}

// Read the cached due-set for this user, or undefined if none.
export async function readDueSet(userId) {
  const db = await getDb();
  return db.get(DUE_CACHE_STORE, userId);
}

// Drop this user's cached due-set.
export async function clearDueSet(userId) {
  const db = await getDb();
  await db.delete(DUE_CACHE_STORE, userId);
}
