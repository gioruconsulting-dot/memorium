// Migration test for lib/offline/db.js v1 -> v2 (Chunk 3, sub-step 3a).
//
// Proves the additive upgrade: a pre-existing v1 dueCache row survives the bump
// to v2, and the three new stores (outbox / card_attempts / meta) are created.
// Runs headless via fake-indexeddb (no browser). Plain node + node:assert,
// matching the existing script convention. Exits non-zero on any failure.
//
// Run: node scripts/test-idb-upgrade.mjs

import "fake-indexeddb/auto"; // registers a fresh in-memory global indexedDB (side effect, must be first)
import assert from "node:assert/strict";
import { openDB } from "idb";

const DB_NAME = "repetita-offline";
const USER = "user_test";
const sampleRow = {
  userId: USER,
  questions: [{ id: "q1", question_text: "Q?", current_interval_days: 3 }],
  documentStats: { d1: { title: "Doc", total: 1, mastered: 0 } },
  cachedAt: 1700000000,
};

let failed = 0;
const check = (label, cond) => {
  if (cond) { console.log(`  PASS  ${label}`); }
  else { console.log(`  FAIL  ${label}`); failed++; }
};

async function main() {
  // --- 1. Create the DB at v1 with the v1 store shape, write a dueCache row, close.
  const v1 = await openDB(DB_NAME, 1, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) db.createObjectStore("dueCache", { keyPath: "userId" });
    },
  });
  await v1.put("dueCache", sampleRow);
  v1.close();
  console.log("seeded v1 dueCache row, closed at version 1");

  // --- 2. Reopen via the REAL db.js code path (DB_VERSION=2 -> runs the v2 upgrade).
  const { readDueSet } = await import("../lib/offline/db.js");
  const readback = await readDueSet(USER); // triggers getDb() -> openDB(v2) -> upgrade(oldVersion=1)

  // --- 3a. dueCache row survived identically.
  check("dueCache row survives v1->v2 upgrade, byte-identical", (() => {
    try { assert.deepEqual(readback, sampleRow); return true; } catch { return false; }
  })());

  // --- 3b. The three new stores + the original store all exist at v2.
  const db = await openDB(DB_NAME, 2); // already v2; no upgrade fires
  const names = Array.from(db.objectStoreNames);
  console.log("  object stores at v2:", JSON.stringify(names));
  check("store 'dueCache' still present", names.includes("dueCache"));
  check("store 'outbox' created", names.includes("outbox"));
  check("store 'card_attempts' created", names.includes("card_attempts"));
  check("store 'meta' created", names.includes("meta"));
  // key paths are correct
  check("outbox keyPath = eventId", db.transaction("outbox").store.keyPath === "eventId");
  check("card_attempts keyPath = eventId", db.transaction("card_attempts").store.keyPath === "eventId");
  check("meta keyPath = key", db.transaction("meta").store.keyPath === "key");
  db.close();

  console.log(failed === 0 ? "\nAll assertions PASS." : `\n${failed} assertion(s) FAILED.`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
