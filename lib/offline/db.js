import { openDB } from "idb";

// IndexedDB for the offline feature. Chunk 2 stores only the due-question
// DISPLAY set, namespaced by userId (shared-device safety). SR base state is
// never stored and SR math is never done client-side — the server is the single
// source of truth at sync time.

const DB_NAME = "repetita-offline";
const DB_VERSION = 1;
const DUE_CACHE_STORE = "dueCache";

// Each version's schema change is its own `if (oldVersion < N)` block so future
// chunks (e.g. an outbox store in Chunk 3) add a store with a clean version bump
// without rewriting existing upgrade logic.
function getDb() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        // Keyed by userId — one cached due-set per user on this device.
        db.createObjectStore(DUE_CACHE_STORE, { keyPath: "userId" });
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
