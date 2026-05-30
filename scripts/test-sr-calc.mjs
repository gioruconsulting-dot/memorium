// Regression test for lib/sr/calc.js (Chunk 3, sub-step 1).
//
// Plain Node script — no Jest/Vitest, no new deps. Run with:
//   node scripts/test-sr-calc.mjs
// Exits non-zero on the first failed assertion.
//
// Pins the sync-only SR math against a fixed expected-output matrix so the copy
// can't silently drift from the frozen online grade route, and proves the
// refactor anchors scheduling on the PASSED timestamp (not wall-clock now),
// including across the BST/GMT DST boundary and a London-midnight boundary.

import assert from "node:assert/strict";
import { INTERVALS, midnightLondonPlus, calcNewState } from "../lib/sr/calc.js";

// --- helpers -----------------------------------------------------------------
const unix = (...args) => Math.floor(Date.UTC(...args) / 1000);
// London-readable form of a Unix-seconds value, for the pasted report.
const london = (s) =>
  new Date(s * 1000).toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "medium" });

let passed = 0;
const check = (label, fn) => {
  fn();
  passed++;
  console.log(`  ok  ${label}`);
};

// A base question at correct_streak 0 (so easy -> interval 2: INTERVALS[0]*2).
const qBase = {
  review_count: 4,
  correct_count: 3,
  incorrect_count: 1,
  correct_streak: 0,
  hard_count: 0,
  current_interval_days: 1,
};

// Pinned study moment: 2026-01-15 12:00:00 UTC (GMT season, London == UTC).
const T_BASE = unix(2026, 0, 15, 12, 0, 0);

console.log("INTERVALS:", JSON.stringify(INTERVALS));
console.log("T_BASE:", T_BASE, "->", london(T_BASE), "London\n");

// --- 1. easy: interval doubles, streak +1, anchored on studiedAt -------------
check("easy: streak 0 -> interval 2, streak 1, nextReviewAt = midnightLondonPlus(2, T)", () => {
  const s = calcNewState(qBase, "easy", T_BASE);
  assert.equal(s.currentIntervalDays, 2);            // INTERVALS[0]*2 = 2
  assert.equal(s.correctStreak, 1);
  assert.equal(s.correctCount, 4);
  assert.equal(s.reviewCount, 5);
  assert.equal(s.nextReviewAt, midnightLondonPlus(2, T_BASE));
  console.log(`        easy nextReviewAt = ${s.nextReviewAt} (${london(s.nextReviewAt)} London)`);
});

// easy cap at 180: high streak -> INTERVALS[last]*2 = 360, capped to 180.
check("easy: high streak caps interval at 180", () => {
  const s = calcNewState({ ...qBase, correct_streak: 7 }, "easy", T_BASE);
  assert.equal(s.currentIntervalDays, 180);          // min(180*2, 180)
  assert.equal(s.correctStreak, 8);
  assert.equal(s.nextReviewAt, midnightLondonPlus(180, T_BASE));
});

// --- 2. hard with current_interval_days = 7 (>3) -----------------------------
check("hard (interval 7>3): interval retained 7, nextReview brought forward to 3, hard_count+1, streak unchanged", () => {
  const q = { ...qBase, correct_streak: 5, hard_count: 2, current_interval_days: 7 };
  const s = calcNewState(q, "hard", T_BASE);
  assert.equal(s.currentIntervalDays, 7);            // retained, does NOT shrink
  assert.equal(s.nextReviewAt, midnightLondonPlus(3, T_BASE)); // min(7,3) = 3 days out
  assert.equal(s.hardCount, 3);
  assert.equal(s.correctStreak, 5);                  // unchanged
  assert.equal(s.correctCount, 4);                   // +1
  console.log(`        hard nextReviewAt = ${s.nextReviewAt} (${london(s.nextReviewAt)} London); interval stored = ${s.currentIntervalDays}`);
});

// --- 3. forgot ---------------------------------------------------------------
check("forgot: streak -> 0, interval -> 1, nextReviewAt = midnightLondonPlus(1, T)", () => {
  const q = { ...qBase, correct_streak: 6, current_interval_days: 30 };
  const s = calcNewState(q, "forgot", T_BASE);
  assert.equal(s.correctStreak, 0);
  assert.equal(s.currentIntervalDays, 1);
  assert.equal(s.incorrectCount, 2);                 // +1
  assert.equal(s.nextReviewAt, midnightLondonPlus(1, T_BASE));
});

// --- 4. skipped: marker only, NO question fields computed --------------------
check("skipped: returns { skipped: true } with no SR fields", () => {
  const s = calcNewState(qBase, "skipped", T_BASE);
  assert.deepEqual(s, { skipped: true });
  assert.equal(s.nextReviewAt, undefined);
  assert.equal(s.currentIntervalDays, undefined);
  assert.equal(s.reviewCount, undefined);
});

// --- 5. timestamp anchoring: different London days -> different schedule ------
check("anchoring: same grade on two different London days yields different nextReviewAt", () => {
  const T1 = unix(2026, 0, 15, 12, 0, 0); // 15 Jan
  const T2 = unix(2026, 0, 22, 12, 0, 0); // 22 Jan (a week later)
  const s1 = calcNewState(qBase, "easy", T1);
  const s2 = calcNewState(qBase, "easy", T2);
  assert.notEqual(s1.nextReviewAt, s2.nextReviewAt);
  assert.equal(s2.nextReviewAt - s1.nextReviewAt, 7 * 86400); // exactly one week apart
  console.log(`        T1 -> ${s1.nextReviewAt} (${london(s1.nextReviewAt)}); T2 -> ${s2.nextReviewAt} (${london(s2.nextReviewAt)})`);
});

// --- 6. DST: BST and GMT studiedAt both self-consistently anchored -----------
check("DST: easy during BST anchors to London midnight (self-consistent)", () => {
  const T_BST = unix(2026, 5, 15, 12, 0, 0); // 15 Jun, BST (UTC+1)
  const s = calcNewState(qBase, "easy", T_BST);
  assert.equal(s.nextReviewAt, midnightLondonPlus(2, T_BST));
  console.log(`        BST nextReviewAt = ${s.nextReviewAt} (${london(s.nextReviewAt)} London)`);
});
check("DST: easy during GMT anchors to London midnight (self-consistent)", () => {
  const T_GMT = unix(2026, 0, 15, 12, 0, 0); // 15 Jan, GMT (UTC+0)
  const s = calcNewState(qBase, "easy", T_GMT);
  assert.equal(s.nextReviewAt, midnightLondonPlus(2, T_GMT));
});

// --- 7. London-midnight boundary (BST: London midnight == UTC 23:00 prev day) -
check("midnight boundary (BST): timestamps straddling London midnight resolve to adjacent London days", () => {
  // 22:59:59 UTC on 15 Jun = 23:59:59 London (15 Jun, BST). London date 15 Jun.
  const tBefore = unix(2026, 5, 15, 22, 59, 59);
  // 23:00:01 UTC on 15 Jun = 00:00:01 London (16 Jun, BST). London date 16 Jun.
  const tAfter = unix(2026, 5, 15, 23, 0, 1);
  const mBefore = midnightLondonPlus(0, tBefore);
  const mAfter = midnightLondonPlus(0, tAfter);
  assert.equal(mAfter - mBefore, 86400); // exactly one London day apart
  // And the full grade path inherits the boundary.
  const eBefore = calcNewState(qBase, "easy", tBefore).nextReviewAt;
  const eAfter = calcNewState(qBase, "easy", tAfter).nextReviewAt;
  assert.equal(eAfter - eBefore, 86400);
  console.log(`        London midnight of tBefore = ${mBefore} (${london(mBefore)}); tAfter = ${mAfter} (${london(mAfter)})`);
});

// Two timestamps within the SAME London day -> identical anchor.
check("midnight boundary: two times on the same London day share the anchor", () => {
  const a = unix(2026, 0, 15, 0, 0, 1);  // 00:00:01 London (GMT) 15 Jan
  const b = unix(2026, 0, 15, 23, 59, 59); // 23:59:59 London (GMT) 15 Jan
  assert.equal(midnightLondonPlus(0, a), midnightLondonPlus(0, b));
});

console.log(`\nAll ${passed} checks passed.`);
