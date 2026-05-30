// Tests for lib/offline/flush.js (Chunk 3, sub-step 4a). Headless via
// fake-indexeddb; plain node + node:assert. Injects a fake poster — no real fetch.
//
// Run: node scripts/test-flush.mjs
//
// NOTE: db.js's getDb opens a fresh connection per call and never closes it, so
// indexedDB.deleteDatabase() would block once any connection is open. We delete
// ONCE at startup (before any connection exists), run the v2->v3 upgrade test
// first, then reset between later tests by clearing stores (no deletion).

import "fake-indexeddb/auto"; // global indexedDB (side effect, must be first)
import assert from "node:assert/strict";
import { openDB } from "idb";
import { getDb } from "../lib/offline/db.js";
import { outboxCount } from "../lib/offline/outbox.js";
import { flushOutbox } from "../lib/offline/flush.js";

let passed = 0;
const check = async (label, fn) => { await fn(); passed++; console.log(`  ok  ${label}`); };

const deleteDbClean = () => new Promise((res, rej) => {
  const r = indexedDB.deleteDatabase("repetita-offline");
  r.onsuccess = () => res(); r.onerror = () => rej(r.error); r.onblocked = () => res();
});

// Reset by clearing contents (no deletion — connections stay open across tests).
async function resetStores() {
  const db = await getDb();
  const tx = db.transaction(["outbox", "quarantine", "meta", "card_attempts"], "readwrite");
  for (const s of ["outbox", "quarantine", "meta", "card_attempts"]) tx.objectStore(s).clear();
  await tx.done;
}

const ev = (id, extra = {}) => ({
  eventId: id, sessionId: "s", questionId: "q_" + id, grade: "easy", userAttempt: null,
  studiedAt: 1000, clientSeq: 1, sessionStartedAt: 900, questionsShown: 5, ...extra,
});

async function seedOutbox(events) {
  const db = await getDb();
  for (const e of events) await db.put("outbox", e);
}
const qCount = async () => (await getDb()).count("quarantine");
const outboxIds = async () => (await (await getDb()).getAll("outbox")).map((r) => r.eventId).sort();

// Poster factory. resultFor(ev) -> { status, reason? }. `override` forces a whole
// response (e.g. a 401). Records call count and an optional delay (overlap test).
function makePoster(resultFor, { override = null, delayMs = 0 } = {}) {
  const poster = async (events) => {
    poster.calls++;
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    if (override) return override;
    return { ok: true, status: 200, results: events.map((e) => ({ eventId: e.eventId, ...resultFor(e) })) };
  };
  poster.calls = 0;
  return poster;
}

async function main() {
  await deleteDbClean(); // clean slate, before any connection is opened

  // --- 5 (run FIRST while the DB can still be created at v2): v2 -> v3 upgrade ---
  await check("v2->v3 upgrade preserves outbox/card_attempts/meta, adds quarantine", async () => {
    const v2 = await openDB("repetita-offline", 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) db.createObjectStore("dueCache", { keyPath: "userId" });
        if (oldVersion < 2) {
          db.createObjectStore("outbox", { keyPath: "eventId" });
          db.createObjectStore("card_attempts", { keyPath: "eventId" });
          db.createObjectStore("meta", { keyPath: "key" });
        }
      },
    });
    await v2.put("outbox", ev("survivor"));
    v2.close();

    assert.equal(await outboxCount(), 1); // getDb (v3) triggers the upgrade; row survives

    const db = await openDB("repetita-offline", 3);
    const names = Array.from(db.objectStoreNames).sort();
    console.log("        stores at v3:", JSON.stringify(names));
    for (const s of ["card_attempts", "dueCache", "meta", "outbox", "quarantine"]) {
      assert.ok(names.includes(s), `store ${s} should exist`);
    }
    assert.equal((await db.get("outbox", "survivor")).eventId, "survivor");
    db.close();
  });

  // --- 1. all applied -> outbox empty ---
  await check("3 events, all applied -> outbox empty, applied=3", async () => {
    await resetStores();
    await seedOutbox([ev("a"), ev("b"), ev("c")]);
    const s = await flushOutbox(makePoster(() => ({ status: "applied" })));
    assert.equal(s.applied, 3);
    assert.equal(await outboxCount(), 0);
  });

  // --- 2. mixed acks: cleared / kept / quarantined ---
  await check("mixed: duplicate cleared, bad_clock kept, not_found quarantined", async () => {
    await resetStores();
    await seedOutbox([ev("dup"), ev("bad"), ev("gone")]);
    const poster = makePoster((e) => {
      if (e.eventId === "dup") return { status: "duplicate_same_payload" };
      if (e.eventId === "bad") return { status: "rejected", reason: "bad_clock" };
      return { status: "error", reason: "question_not_found_for_user" };
    });
    const s = await flushOutbox(poster);
    assert.equal(s.duplicates, 1);
    assert.equal(s.kept, 1);
    assert.equal(s.quarantined, 1);
    assert.deepEqual(await outboxIds(), ["bad"]);   // only the kept one remains
    assert.equal(await qCount(), 1);                // gone -> quarantine
    const qrow = await (await getDb()).get("quarantine", "gone");
    assert.equal(qrow.quarantineReason, "question_not_found_for_user");
  });

  // --- 3. whole-response 401 -> nothing cleared ---
  await check("whole-response 401 -> nothing cleared, signInNeeded", async () => {
    await resetStores();
    await seedOutbox([ev("x"), ev("y")]);
    const poster = makePoster(() => ({ status: "applied" }), { override: { ok: false, status: 401 } });
    const s = await flushOutbox(poster);
    assert.equal(s.applied, 0);
    assert.equal(s.duplicates, 0);
    assert.equal(s.quarantined, 0);
    assert.equal(s.kept, 2);
    assert.equal(s.signInNeeded, true);
    assert.equal(await outboxCount(), 2);           // untouched
  });

  // --- 4. two concurrent flushes -> poster invoked once (IDB-flag fallback) ---
  await check("two concurrent flushOutbox() -> poster invoked once", async () => {
    await resetStores();
    await seedOutbox([ev("p"), ev("q")]);
    const poster = makePoster(() => ({ status: "applied" }), { delayMs: 25 });
    const [s1, s2] = await Promise.all([flushOutbox(poster), flushOutbox(poster)]);
    assert.equal(poster.calls, 1);                  // single-flight held
    assert.equal([s1, s2].filter((s) => s.skipped).length, 1); // exactly one skipped
    assert.equal(await outboxCount(), 0);           // the one that ran drained it
  });

  console.log(`\nAll ${passed} checks passed.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
