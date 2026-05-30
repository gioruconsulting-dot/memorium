// Correctness harness for lib/offline/sync-replay.js (Chunk 3, sub-step 2).
//
// SAFETY: this NEVER calls getDb() and NEVER reads TURSO_DATABASE_URL, so it
// cannot touch production. It builds a throwaway LOCAL SQLite file DB under /tmp,
// seeds the REAL schema from lib/db/schema.js, and injects that client into
// replayGradeEvents (which takes the client as a parameter by design).
//
// Run: node scripts/test-sync-replay.mjs    (exits non-zero on first failure)

import assert from "node:assert/strict";
import { existsSync, rmSync, readFileSync } from "node:fs";
import { createClient } from "@libsql/client";
import { SCHEMA_SQL } from "../lib/db/schema.js";
import { replayGradeEvents } from "../lib/offline/sync-replay.js";
import { canonicalizeAttempt } from "../lib/offline/canonicalize.js";
import { isWellFormedEvent } from "../lib/offline/validate-event.js";
import { midnightLondonPlus } from "../lib/sr/calc.js";

// ---------------------------------------------------------------------------
// Default: throwaway LOCAL SQLite file. Opt-in: set SYNC_TEST_DB_URL to a
// (throwaway) remote branch — token then read from /tmp/spk.tok. Used by the
// Phase-C verification gate to run this same matrix against the real driver.
const DB_PATH = "/tmp/repetita-sync-replay-test.db";
const BRANCH_URL = process.env.SYNC_TEST_DB_URL || null;
let client;
if (BRANCH_URL) {
  const authToken = readFileSync("/tmp/spk.tok", "utf8").trim();
  client = createClient({ url: BRANCH_URL, authToken });
  console.log("RUNNING AGAINST BRANCH:", BRANCH_URL);
} else {
  for (const f of [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`]) {
    if (existsSync(f)) rmSync(f);
  }
  client = createClient({ url: `file:${DB_PATH}` });
}

const USER = "user_test";
const OTHER_USER = "user_other";
const DOC = "doc_1";
const DAY = 86400;
const NOW = Math.floor(Date.now() / 1000);
const CREATED = NOW - 300 * DAY;     // questions created ~300 days ago
const STUDIED = NOW - 1000;          // a valid recent study moment

let passed = 0;
const group = (n) => console.log(`\n=== Group ${n} ===`);
const check = async (label, fn) => { await fn(); passed++; console.log(`  ok  ${label}`); };

// --- query helpers -----------------------------------------------------------
const one = async (sql, args = []) => (await client.execute({ sql, args })).rows[0];
const getQ = (id) => one(`SELECT * FROM questions WHERE id = ?`, [id]);
const getSess = (id) => one(`SELECT * FROM study_sessions WHERE id = ?`, [id]);
const getAns = (id) => one(`SELECT * FROM session_answers WHERE id = ?`, [id]);
const count = async (sql, args = []) => Number((await one(sql, args)).c);

async function seedQuestion(id, { createdAt = CREATED, streak = 0, interval = 1, review = 0,
  correct = 0, incorrect = 0, hard = 0, owner = USER } = {}) {
  await client.execute({
    sql: `INSERT INTO questions (id, document_id, user_id, question_text, question_type,
            answer_text, next_review_at, review_count, correct_count, incorrect_count,
            correct_streak, hard_count, current_interval_days, is_retired, created_at)
          VALUES (?, ?, ?, 'q?', 'short', 'a', ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    args: [id, DOC, owner, createdAt, review, correct, incorrect, streak, hard, interval, createdAt],
  });
}

function mkEvent(o) {
  return {
    eventId: o.eventId,
    sessionId: o.sessionId,
    questionId: o.questionId,
    grade: o.grade,
    userAttempt: o.userAttempt ?? null,
    studiedAt: o.studiedAt ?? STUDIED,
    clientSeq: o.clientSeq ?? 1,
    sessionStartedAt: o.sessionStartedAt ?? (o.studiedAt ?? STUDIED) - 60,
    questionsShown: o.questionsShown ?? 5,
  };
}

// ===========================================================================
async function main() {
  // --- schema + FK enforcement ---
  // Mirror migrate.js: SCHEMA_SQL has idempotent ALTERs that duplicate columns
  // already in the CREATE TABLE; ignore only the duplicate-column error.
  for (const stmt of SCHEMA_SQL) {
    try {
      await client.execute(stmt);
    } catch (e) {
      if (!/duplicate column name/i.test(e?.message ?? "")) throw e;
    }
  }
  await client.execute("PRAGMA foreign_keys = ON");

  // Probe that FK enforcement is actually live on this local connection, so the
  // offline-session FK test (group 6) means something rather than passing vacuously.
  let fkEnforced = false;
  try {
    await client.execute({
      sql: `INSERT INTO session_answers (id, session_id, question_id, user_id, grade, answered_at)
            VALUES ('fk_probe', 'no_such_session', 'no_such_q', ?, 'easy', ?)`,
      args: [USER, NOW],
    });
    await client.execute(`DELETE FROM session_answers WHERE id = 'fk_probe'`);
  } catch {
    fkEnforced = true;
  }
  console.log(`FK enforcement on ${BRANCH_URL ? "branch" : "local"} harness: ${fkEnforced ? "ON" : "OFF"}`);
  if (!BRANCH_URL) {
    assert.equal(fkEnforced, true, "FK enforcement must be ON for the local harness to be meaningful");
  } else if (!fkEnforced) {
    console.log("  NOTE: remote branch did not enforce FK over the pooled connection. No correctness check depends on FK *throwing* — group 6 still passes via existing-parent inserts, and the zero-orphan invariants (group 12) are checked explicitly.");
  }

  // --- seed users + document ---
  for (const u of [USER, OTHER_USER]) {
    await client.execute({ sql: `INSERT INTO users (id, created_at, last_active_at) VALUES (?, ?, ?)`, args: [u, CREATED, NOW] });
  }
  await client.execute({
    sql: `INSERT INTO documents (id, user_id, title, content, description, topic, question_count, created_at)
          VALUES (?, ?, 'Doc', 'content', '', '', 0, ?)`,
    args: [DOC, USER, CREATED],
  });

  // =========================================================================
  group("1 — first apply, each grade (easy/hard/forgot/skipped) on a pre-existing online session");
  // Pre-existing online-origin session row (INSERT OR IGNORE must no-op on it).
  await client.execute({
    sql: `INSERT INTO study_sessions (id, user_id, started_at, questions_shown) VALUES (?, ?, ?, ?)`,
    args: ["sess_online", USER, STUDIED - 120, 10],
  });
  await seedQuestion("q_easy", { streak: 0, interval: 1 });
  await seedQuestion("q_hard", { streak: 4, interval: 7, hard: 1 });
  await seedQuestion("q_forgot", { streak: 5, interval: 30 });
  await seedQuestion("q_skip", { streak: 2, interval: 7 });

  const g1events = [
    mkEvent({ eventId: "e_easy", sessionId: "sess_online", questionId: "q_easy", grade: "easy", userAttempt: "my answer", clientSeq: 1 }),
    mkEvent({ eventId: "e_hard", sessionId: "sess_online", questionId: "q_hard", grade: "hard", clientSeq: 2 }),
    mkEvent({ eventId: "e_forgot", sessionId: "sess_online", questionId: "q_forgot", grade: "forgot", clientSeq: 3 }),
    mkEvent({ eventId: "e_skip", sessionId: "sess_online", questionId: "q_skip", grade: "skipped", clientSeq: 4 }),
  ];
  const g1 = await replayGradeEvents(client, USER, g1events);
  console.log("  results:", JSON.stringify(g1));

  await check("all four applied", () => {
    assert.deepEqual(g1.map((r) => r.status), ["applied", "applied", "applied", "applied"]);
  });
  await check("easy: interval 2, streak 1, review+1, answer interval_days = 2", async () => {
    const q = await getQ("q_easy");
    assert.equal(Number(q.current_interval_days), 2);
    assert.equal(Number(q.correct_streak), 1);
    assert.equal(Number(q.review_count), 1);
    assert.equal(Number(q.correct_count), 1);
    assert.equal(Number(q.next_review_at), midnightLondonPlus(2, STUDIED));
    assert.equal(Number((await getAns("e_easy")).interval_days), 2);
  });
  await check("hard (interval 7>3): interval RETAINED 7, next_review = +3, hard+1, streak unchanged, answer interval_days = 7 (not 3)", async () => {
    const q = await getQ("q_hard");
    assert.equal(Number(q.current_interval_days), 7);
    assert.equal(Number(q.next_review_at), midnightLondonPlus(3, STUDIED));
    assert.equal(Number(q.hard_count), 2);
    assert.equal(Number(q.correct_streak), 4);
    assert.equal(Number(q.correct_count), 1);
    assert.equal(Number((await getAns("e_hard")).interval_days), 7);
  });
  await check("forgot: streak 0, interval 1, incorrect+1, next_review = +1", async () => {
    const q = await getQ("q_forgot");
    assert.equal(Number(q.correct_streak), 0);
    assert.equal(Number(q.current_interval_days), 1);
    assert.equal(Number(q.incorrect_count), 1);
    assert.equal(Number(q.next_review_at), midnightLondonPlus(1, STUDIED));
  });
  await check("skipped: NO questions change, answer present with interval_days NULL", async () => {
    const q = await getQ("q_skip");
    assert.equal(Number(q.current_interval_days), 7); // unchanged
    assert.equal(Number(q.review_count), 0);          // unchanged
    assert.equal(Number(q.correct_streak), 2);        // unchanged
    const a = await getAns("e_skip");
    assert.ok(a);
    assert.equal(a.interval_days, null);
  });
  await check("session counts: answered 4, correct 2 (easy+hard), incorrect 1, skipped 1", async () => {
    const s = await getSess("sess_online");
    assert.equal(Number(s.questions_answered), 4);
    assert.equal(Number(s.correct_count), 2);
    assert.equal(Number(s.incorrect_count), 1);
    assert.equal(Number(s.skipped_count), 1);
  });
  await check("forged id: event for q_easy under OTHER_USER never writes (question_not_found_for_user)", async () => {
    const before = await getQ("q_easy");
    const r = await replayGradeEvents(client, OTHER_USER, [
      mkEvent({ eventId: "e_forged", sessionId: "sess_forged", questionId: "q_easy", grade: "forgot" }),
    ]);
    assert.equal(r[0].status, "error");
    assert.equal(r[0].reason, "question_not_found_for_user");
    const after = await getQ("q_easy");
    assert.equal(Number(after.current_interval_days), Number(before.current_interval_days));
    assert.equal(await getAns("e_forged"), undefined);
  });

  // =========================================================================
  group("2 — exact replay of the group-1 batch: every event duplicate_same_payload, state unchanged");
  const snapBefore = {
    easy: await getQ("q_easy"), hard: await getQ("q_hard"),
    forgot: await getQ("q_forgot"), skip: await getQ("q_skip"),
    sess: await getSess("sess_online"),
  };
  const g2 = await replayGradeEvents(client, USER, g1events);
  console.log("  results:", JSON.stringify(g2));
  await check("all four duplicate_same_payload", () => {
    assert.deepEqual(g2.map((r) => r.status), Array(4).fill("duplicate_same_payload"));
  });
  await check("no double-advance: questions + session counts byte-identical to pre-replay", async () => {
    assert.equal(Number((await getQ("q_easy")).current_interval_days), Number(snapBefore.easy.current_interval_days));
    assert.equal(Number((await getQ("q_easy")).review_count), Number(snapBefore.easy.review_count));
    assert.equal(Number((await getQ("q_hard")).hard_count), Number(snapBefore.hard.hard_count));
    assert.equal(Number((await getQ("q_forgot")).correct_streak), Number(snapBefore.forgot.correct_streak));
    const s = await getSess("sess_online");
    assert.equal(Number(s.questions_answered), Number(snapBefore.sess.questions_answered));
    assert.equal(Number(s.correct_count), Number(snapBefore.sess.correct_count));
    assert.equal(Number(s.skipped_count), Number(snapBefore.sess.skipped_count));
  });

  // =========================================================================
  group("3 — conflicting duplicate: same eventId, different grade -> error/conflict, not acked, nothing changed");
  const qEasyBefore = await getQ("q_easy");
  const ansEasyBefore = await getAns("e_easy");
  const g3 = await replayGradeEvents(client, USER, [
    mkEvent({ eventId: "e_easy", sessionId: "sess_online", questionId: "q_easy", grade: "forgot", userAttempt: "my answer" }),
  ]);
  console.log("  results:", JSON.stringify(g3));
  await check("status error / reason conflict (not acked)", () => {
    assert.equal(g3[0].status, "error");
    assert.equal(g3[0].reason, "conflict");
  });
  await check("original answer row and question state unchanged", async () => {
    const a = await getAns("e_easy");
    assert.equal(a.grade, ansEasyBefore.grade); // still "easy"
    const q = await getQ("q_easy");
    assert.equal(Number(q.current_interval_days), Number(qEasyBefore.current_interval_days));
    assert.equal(Number(q.correct_streak), Number(qEasyBefore.correct_streak));
  });

  // =========================================================================
  group("4 — clock reject (no clamp): future and pre-creation studiedAt write nothing");
  await seedQuestion("q_clock", { streak: 0, interval: 1, createdAt: CREATED });
  const g4 = await replayGradeEvents(client, USER, [
    mkEvent({ eventId: "e_future", sessionId: "sess_clock", questionId: "q_clock", grade: "easy", studiedAt: NOW + 365 * DAY }),
    mkEvent({ eventId: "e_old", sessionId: "sess_clock", questionId: "q_clock", grade: "easy", studiedAt: CREATED - 1 }),
  ]);
  console.log("  results:", JSON.stringify(g4));
  await check("both rejected with reason bad_clock", () => {
    for (const r of g4) { assert.equal(r.status, "rejected"); assert.equal(r.reason, "bad_clock"); }
  });
  await check("nothing written: no answers, question untouched, no session row created", async () => {
    assert.equal(await getAns("e_future"), undefined);
    assert.equal(await getAns("e_old"), undefined);
    assert.equal(await getSess("sess_clock"), undefined);
    const q = await getQ("q_clock");
    assert.equal(Number(q.review_count), 0);
    assert.equal(Number(q.current_interval_days), 1);
  });

  // =========================================================================
  group("5 — ordering: events fed reversed apply in (studiedAt, clientSeq) order, deterministic final state");
  await seedQuestion("q_order", { streak: 3, interval: 7 });
  const sameStudied = STUDIED;
  // clientSeq 1 = forgot, clientSeq 2 = easy. Fed seq-2-first (reversed).
  const g5 = await replayGradeEvents(client, USER, [
    mkEvent({ eventId: "e_o2", sessionId: "sess_order", questionId: "q_order", grade: "easy", clientSeq: 2, studiedAt: sameStudied }),
    mkEvent({ eventId: "e_o1", sessionId: "sess_order", questionId: "q_order", grade: "forgot", clientSeq: 1, studiedAt: sameStudied }),
  ]);
  console.log("  results:", JSON.stringify(g5));
  await check("both applied; final state = forgot-then-easy (interval 2, streak 1), not easy-then-forgot", async () => {
    assert.deepEqual(g5.map((r) => r.status).sort(), ["applied", "applied"]);
    const q = await getQ("q_order");
    // forgot: streak->0, interval->1, incorrect+1. then easy: streak->1, idx0 -> interval 2, correct+1. review +2.
    assert.equal(Number(q.current_interval_days), 2);
    assert.equal(Number(q.correct_streak), 1);
    assert.equal(Number(q.review_count), 2); // base 0, +1 forgot, +1 easy
  });

  // =========================================================================
  group("6 — offline-origin session: client-UUID sessionId, no pre-existing row -> created, FK satisfied, completion derived");
  await seedQuestion("q_off", { streak: 0, interval: 1 });
  const offStarted = STUDIED - 300;
  const offStudied = STUDIED - 100;
  const g6 = await replayGradeEvents(client, USER, [
    mkEvent({ eventId: "e_off", sessionId: "uuid-offline-abc", questionId: "q_off", grade: "easy",
      studiedAt: offStudied, sessionStartedAt: offStarted, questionsShown: 3 }),
  ]);
  console.log("  results:", JSON.stringify(g6));
  await check("event applied; offline session row created with FK-satisfied answer", async () => {
    assert.equal(g6[0].status, "applied");
    const s = await getSess("uuid-offline-abc");
    assert.ok(s, "offline session row should exist");
    assert.equal(Number(s.questions_shown), 3);
    const a = await getAns("e_off");
    assert.ok(a, "answer row should exist (FK to the new session satisfied)");
    assert.equal(a.session_id, "uuid-offline-abc");
  });
  await check("completion derived: started = min(start, studied), completed = studied, duration = diff", async () => {
    const s = await getSess("uuid-offline-abc");
    assert.equal(Number(s.started_at), offStarted);
    assert.equal(Number(s.completed_at), offStudied);
    assert.equal(Number(s.duration_seconds), offStudied - offStarted);
  });

  // =========================================================================
  group("7 — DST/midnight end-to-end through the replay: next_review_at anchors to the STUDIED day's London midnight");
  await seedQuestion("q_gmt", { streak: 0, interval: 1 });
  await seedQuestion("q_bst", { streak: 0, interval: 1 });
  const T_GMT = Math.floor(Date.UTC(2026, 0, 15, 12, 0, 0) / 1000); // 15 Jan 2026 (GMT), past, valid
  const T_BST = Math.floor(Date.UTC(2026, 4, 1, 12, 0, 0) / 1000);  // 1 May 2026 (BST), past, valid
  const g7 = await replayGradeEvents(client, USER, [
    mkEvent({ eventId: "e_gmt", sessionId: "sess_gmt", questionId: "q_gmt", grade: "easy", studiedAt: T_GMT }),
    mkEvent({ eventId: "e_bst", sessionId: "sess_bst", questionId: "q_bst", grade: "easy", studiedAt: T_BST }),
  ]);
  console.log("  results:", JSON.stringify(g7));
  await check("GMT studiedAt -> next_review = midnightLondonPlus(2, T_GMT), and NOT serverNow-anchored", async () => {
    const q = await getQ("q_gmt");
    assert.equal(Number(q.next_review_at), midnightLondonPlus(2, T_GMT));
    assert.notEqual(Number(q.next_review_at), midnightLondonPlus(2, NOW)); // proves it threaded studiedAt, not now
    console.log(`        q_gmt.next_review_at = ${q.next_review_at}`);
  });
  await check("BST studiedAt -> next_review = midnightLondonPlus(2, T_BST), and NOT serverNow-anchored", async () => {
    const q = await getQ("q_bst");
    assert.equal(Number(q.next_review_at), midnightLondonPlus(2, T_BST));
    assert.notEqual(Number(q.next_review_at), midnightLondonPlus(2, NOW));
    console.log(`        q_bst.next_review_at = ${q.next_review_at}`);
  });

  // =========================================================================
  group("8 — userAttempt > 2000 chars: capped identically on insert and on the duplicate re-check");
  await seedQuestion("q_long", { streak: 0, interval: 1 });
  const longEvent = mkEvent({ eventId: "e_long", sessionId: "sess_long", questionId: "q_long", grade: "easy", userAttempt: "x".repeat(2500) });
  const g8a = await replayGradeEvents(client, USER, [longEvent]);
  console.log("  first apply:", JSON.stringify(g8a));
  await check("applied; stored user_attempt capped to exactly 2000 chars", async () => {
    assert.equal(g8a[0].status, "applied");
    const a = await getAns("e_long");
    assert.equal(a.user_attempt.length, 2000);
  });
  const g8b = await replayGradeEvents(client, USER, [longEvent]); // same raw 2500-char attempt
  console.log("  re-check:", JSON.stringify(g8b));
  await check("re-send of the same long attempt -> duplicate_same_payload (cap matches, not conflict)", () => {
    assert.equal(g8b[0].status, "duplicate_same_payload");
  });

  // =========================================================================
  group("9 — malformed event classified out (no write) while a well-formed event in the same batch applies");
  await seedQuestion("q_mixed", { streak: 0, interval: 1 });
  await check("isWellFormedEvent rejects bad shapes, accepts a valid one", () => {
    assert.equal(isWellFormedEvent(mkEvent({ eventId: "ok", sessionId: "s", questionId: "q", grade: "easy" })), true);
    assert.equal(isWellFormedEvent({ ...mkEvent({ eventId: "x", sessionId: "s", questionId: "q", grade: "banana" }) }), false); // bad grade
    assert.equal(isWellFormedEvent({ eventId: "x", sessionId: "s", grade: "easy", studiedAt: STUDIED, clientSeq: 1, sessionStartedAt: 1, questionsShown: 5 }), false); // missing questionId
    assert.equal(isWellFormedEvent({ ...mkEvent({ eventId: "x", sessionId: "s", questionId: "q", grade: "easy" }), studiedAt: NaN }), false); // non-finite number
    assert.equal(isWellFormedEvent({ ...mkEvent({ eventId: "x", sessionId: "s", questionId: "q", grade: "easy" }), userAttempt: 42 }), false); // bad userAttempt type
    assert.equal(isWellFormedEvent(null), false);
  });
  // Mirror the route's partition+merge (the predicate is the single shared source).
  const good = mkEvent({ eventId: "e_good", sessionId: "sess_mixed", questionId: "q_mixed", grade: "easy" });
  const bad = { ...good, eventId: "e_bad", grade: "banana" };
  const wf = [], mf = [];
  for (const ev of [good, bad]) {
    if (isWellFormedEvent(ev)) wf.push(ev);
    else mf.push({ eventId: ev?.eventId ?? null, status: "error", reason: "malformed_event" });
  }
  const repl = await replayGradeEvents(client, USER, wf);
  const merged = [...repl, ...mf];
  console.log("  merged results:", JSON.stringify(merged));
  await check("well-formed event applied; malformed event -> malformed_event; malformed never written", async () => {
    assert.deepEqual(merged.find((r) => r.eventId === "e_good"), { eventId: "e_good", status: "applied" });
    assert.deepEqual(merged.find((r) => r.eventId === "e_bad"), { eventId: "e_bad", status: "error", reason: "malformed_event" });
    assert.equal(Number((await getQ("q_mixed")).current_interval_days), 2); // well-formed applied
    assert.equal(await getAns("e_bad"), undefined);                          // malformed wrote nothing
  });

  // =========================================================================
  group("10 — conflict/duplicate breadth on the rows=0 path (vary ONE immutable field at a time)");

  // b1: user_attempt differs ONLY by a normalization canonicalize.js erases (CRLF vs LF).
  await seedQuestion("q_b1", { streak: 0, interval: 1 });
  await replayGradeEvents(client, USER, [
    mkEvent({ eventId: "e_b1", sessionId: "sess_b1", questionId: "q_b1", grade: "easy", userAttempt: "L1\nL2" }),
  ]);
  const g_b1 = await replayGradeEvents(client, USER, [
    mkEvent({ eventId: "e_b1", sessionId: "sess_b1", questionId: "q_b1", grade: "easy", userAttempt: "L1\r\nL2" }),
  ]);
  console.log("  b1:", JSON.stringify(g_b1));
  await check("b1: user_attempt differing only by CRLF vs LF -> duplicate_same_payload (compare runs on canonicalized value, not raw)", async () => {
    assert.equal(g_b1[0].status, "duplicate_same_payload");
    const q = await getQ("q_b1");
    assert.equal(Number(q.current_interval_days), 2); // unchanged from first apply
    assert.equal(Number(q.review_count), 1);
  });

  // b2: user_attempt differs in actual CONTENT -> conflict, nothing mutated.
  await seedQuestion("q_b2", { streak: 0, interval: 1 });
  await replayGradeEvents(client, USER, [
    mkEvent({ eventId: "e_b2", sessionId: "sess_b2", questionId: "q_b2", grade: "easy", userAttempt: "answer one" }),
  ]);
  const q_b2_before = await getQ("q_b2");
  const a_b2_before = await getAns("e_b2");
  const g_b2 = await replayGradeEvents(client, USER, [
    mkEvent({ eventId: "e_b2", sessionId: "sess_b2", questionId: "q_b2", grade: "easy", userAttempt: "answer two" }),
  ]);
  console.log("  b2:", JSON.stringify(g_b2));
  await check("b2: user_attempt content differs -> conflict; questions + stored answer unchanged", async () => {
    assert.equal(g_b2[0].status, "error");
    assert.equal(g_b2[0].reason, "conflict");
    const q = await getQ("q_b2");
    assert.equal(Number(q.current_interval_days), Number(q_b2_before.current_interval_days));
    assert.equal(Number(q.review_count), Number(q_b2_before.review_count));
    assert.equal((await getAns("e_b2")).user_attempt, a_b2_before.user_attempt); // still canonicalize("answer one")
  });

  // b3: question_id differs, same eventId -> conflict, no mutation.
  await seedQuestion("q_b3a", { streak: 0, interval: 1 });
  await seedQuestion("q_b3b", { streak: 0, interval: 1 });
  await replayGradeEvents(client, USER, [
    mkEvent({ eventId: "e_b3", sessionId: "sess_b3", questionId: "q_b3a", grade: "easy" }),
  ]);
  const q_b3a_before = await getQ("q_b3a");
  const g_b3 = await replayGradeEvents(client, USER, [
    mkEvent({ eventId: "e_b3", sessionId: "sess_b3", questionId: "q_b3b", grade: "easy" }),
  ]);
  console.log("  b3:", JSON.stringify(g_b3));
  await check("b3: question_id differs on same eventId -> conflict; neither question mutated, stored answer keeps original question_id", async () => {
    assert.equal(g_b3[0].status, "error");
    assert.equal(g_b3[0].reason, "conflict");
    const qa = await getQ("q_b3a");
    assert.equal(Number(qa.current_interval_days), Number(q_b3a_before.current_interval_days));
    assert.equal(Number(qa.review_count), Number(q_b3a_before.review_count));
    assert.equal(Number((await getQ("q_b3b")).review_count), 0); // never touched
    assert.equal((await getAns("e_b3")).question_id, "q_b3a");   // stored row unchanged
  });

  // =========================================================================
  group("11 — studiedAt-PRIMARY ordering: studiedAt wins over clientSeq when they disagree");
  await seedQuestion("q_g", { streak: 3, interval: 7 });
  const T_early = STUDIED - 500;
  const T_late = STUDIED - 100; // T_late > T_early
  // A: easy @ T_early, clientSeq 2.  B: forgot @ T_late, clientSeq 1.  Fed B-first (reversed).
  // studiedAt-primary order = A then B -> final state is forgot's (absolute overwrite).
  const g_g = await replayGradeEvents(client, USER, [
    mkEvent({ eventId: "e_gB", sessionId: "sess_g", questionId: "q_g", grade: "forgot", studiedAt: T_late, clientSeq: 1 }),
    mkEvent({ eventId: "e_gA", sessionId: "sess_g", questionId: "q_g", grade: "easy", studiedAt: T_early, clientSeq: 2 }),
  ]);
  console.log("  g:", JSON.stringify(g_g));
  await check("g: studiedAt-primary order (early easy, then late forgot) -> final = forgot's state, not easy's", async () => {
    assert.deepEqual(g_g.map((r) => r.status).sort(), ["applied", "applied"]);
    const q = await getQ("q_g");
    // A(easy @ early) runs first, then B(forgot @ late) overwrites: streak->0, interval->1, incorrect+1.
    assert.equal(Number(q.correct_streak), 0);
    assert.equal(Number(q.current_interval_days), 1);
    assert.ok(Number(q.incorrect_count) >= 1);
  });

  // =========================================================================
  group("12 — DATA-SANCTITY invariants after the full matrix: zero orphans");
  await check("zero session_answers orphaned from questions", async () => {
    assert.equal(await count(`SELECT COUNT(*) c FROM session_answers sa LEFT JOIN questions q ON q.id = sa.question_id WHERE q.id IS NULL`), 0);
  });
  await check("zero session_answers orphaned from study_sessions", async () => {
    assert.equal(await count(`SELECT COUNT(*) c FROM session_answers sa LEFT JOIN study_sessions s ON s.id = sa.session_id WHERE s.id IS NULL`), 0);
  });
  await check("zero questions orphaned from documents", async () => {
    assert.equal(await count(`SELECT COUNT(*) c FROM questions q LEFT JOIN documents d ON d.id = q.document_id WHERE d.id IS NULL`), 0);
  });
  await check("canonicalizeAttempt idempotent + maps empty/whitespace to null", () => {
    assert.equal(canonicalizeAttempt("a\r\nb  \n"), "a\nb");
    assert.equal(canonicalizeAttempt(canonicalizeAttempt("a\r\nb  \n")), "a\nb");
    assert.equal(canonicalizeAttempt("   \n  "), null);
    assert.equal(canonicalizeAttempt(null), null);
    assert.equal(canonicalizeAttempt(""), null);
  });

  console.log(`\nAll ${passed} checks passed.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
