// Tests for lib/offline/outbox.js (Chunk 3, sub-step 3b). Headless via
// fake-indexeddb; plain node + node:assert. Exits non-zero on any failure.
//
// Run: node scripts/test-outbox.mjs

import "fake-indexeddb/auto"; // global indexedDB (side effect, must be first)
import assert from "node:assert/strict";
import { canonicalizeAttempt } from "../lib/offline/canonicalize.js";
import { getDb } from "../lib/offline/db.js";
import {
  mintEventId, recordReveal, commitGrade,
  isOutboxEmpty, listOutbox, outboxCount, getPendingQuestionIds,
} from "../lib/offline/outbox.js";

let passed = 0;
const check = async (label, fn) => { await fn(); passed++; console.log(`  ok  ${label}`); };
const deleteDb = () => new Promise((res, rej) => {
  const r = indexedDB.deleteDatabase("repetita-offline");
  r.onsuccess = () => res(); r.onerror = () => rej(r.error); r.onblocked = () => res();
});
const findOutbox = async (id) => (await listOutbox()).find((r) => r.eventId === id);
const metaSeq = async () => (await (await getDb()).get("meta", "clientSeq"))?.value;

async function main() {
  await deleteDb(); // clean slate

  // --- mintEventId sanity ---
  await check("mintEventId returns a UUID", () => {
    const id = mintEventId();
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  // --- recordReveal idempotency ---
  await check("recordReveal twice with same eventId -> one card_attempts row", async () => {
    const ev = "evR";
    await recordReveal({ eventId: ev, sessionId: "s1", questionId: "q1", sessionStartedAt: 1000, questionsShown: 5 });
    await recordReveal({ eventId: ev, sessionId: "s1", questionId: "q1", sessionStartedAt: 1000, questionsShown: 5 });
    const db = await getDb();
    assert.equal(await db.count("card_attempts"), 1);
  });

  // --- isOutboxEmpty true before any commit ---
  await check("isOutboxEmpty() true before any commit", async () => {
    assert.equal(await isOutboxEmpty(), true);
  });

  // --- first commit: row, clientSeq=1, userAttempt canonicalized ---
  const RAW = "  a \r\n b \r\n ";
  await check("commitGrade first call -> outbox row, clientSeq=1, userAttempt canonicalized", async () => {
    const env = await commitGrade({ eventId: "ev1", sessionId: "s1", questionId: "q1", grade: "easy", userAttempt: RAW, studiedAt: 1500 });
    assert.equal(env.clientSeq, 1);
    assert.equal(env.userAttempt, canonicalizeAttempt(RAW)); // shared rule, not raw
    const row = await findOutbox("ev1");
    assert.ok(row, "ev1 should be in outbox");
    assert.equal(row.clientSeq, 1);
    assert.equal(row.userAttempt, canonicalizeAttempt(RAW));
    assert.equal(row.studiedAt, 1500);
    console.log(`        stored userAttempt = ${JSON.stringify(row.userAttempt)}`);
  });

  // --- isOutboxEmpty false after a commit ---
  await check("isOutboxEmpty() false after a commit", async () => {
    assert.equal(await isOutboxEmpty(), false);
  });

  // --- retry idempotency: same eventId, different payload -> no new row, seq unchanged ---
  await check("commitGrade same eventId again -> NO new row, clientSeq unchanged, payload preserved", async () => {
    const before = await outboxCount();
    const seqBefore = await metaSeq();
    const ret = await commitGrade({ eventId: "ev1", sessionId: "s1", questionId: "q1", grade: "forgot", userAttempt: "CHANGED", studiedAt: 9999 });
    assert.equal(await outboxCount(), before);          // no new row
    assert.equal(await metaSeq(), seqBefore);            // clientSeq counter not bumped
    assert.equal(ret.clientSeq, 1);                      // returns the original envelope
    const row = await findOutbox("ev1");
    assert.equal(row.grade, "easy");                     // original payload preserved
    assert.equal(row.userAttempt, canonicalizeAttempt(RAW));
    assert.equal(row.studiedAt, 1500);
  });

  // --- monotonic clientSeq across distinct events + a DB reopen ---
  await check("two distinct events -> clientSeq 2 then (after reopen) 3 — durable monotonic", async () => {
    const e2 = await commitGrade({ eventId: "ev2", sessionId: "s1", questionId: "q2", grade: "easy", userAttempt: null, studiedAt: 1600 });
    assert.equal(e2.clientSeq, 2);
    // Force a genuine reopen: close the current connection; getDb opens a fresh one.
    (await getDb()).close();
    const e3 = await commitGrade({ eventId: "ev3", sessionId: "s1", questionId: "q3", grade: "hard", userAttempt: null, studiedAt: 1700 });
    assert.equal(e3.clientSeq, 3); // counter survived the reopen
  });

  // --- canonicalization: whitespace-only -> null ---
  await check('commitGrade userAttempt "   " -> stored null', async () => {
    const env = await commitGrade({ eventId: "ev_ws", sessionId: "s1", questionId: "q4", grade: "easy", userAttempt: "   ", studiedAt: 1800 });
    assert.equal(env.userAttempt, null);
    assert.equal((await findOutbox("ev_ws")).userAttempt, null);
  });

  // --- getPendingQuestionIds reflects queued events ---
  await check("getPendingQuestionIds reflects queued events (distinct)", async () => {
    const ids = (await getPendingQuestionIds()).sort();
    assert.deepEqual(ids, ["q1", "q2", "q3", "q4"]);
    assert.equal(await outboxCount(), 4);
  });

  console.log(`\nAll ${passed} checks passed.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
