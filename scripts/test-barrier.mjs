// Tests for lib/offline/barrier.js isSacredWriteRequest (Chunk 3, sub-step 4b).
// Pure logic — no IndexedDB, no SW. Plain node + node:assert.
//
// Run: node scripts/test-barrier.mjs

import assert from "node:assert/strict";
import { isSacredWriteRequest, SACRED_WRITE_PREFIXES } from "../lib/offline/barrier.js";

const HOST = "https://www.repetita.org";
let passed = 0;
const check = (label, cond) => { assert.ok(cond, label); passed++; console.log(`  ok  ${label}`); };
const sacred = (method, path) => isSacredWriteRequest({ url: HOST + path, method });

// --- TRUE: every Sacred-write route at its real method ---
const TRUE_CASES = [
  ["POST", "/api/questions/grade"],
  ["POST", "/api/questions/retire"],
  ["POST", "/api/questions/prioritize"],
  ["POST", "/api/sessions/start"],
  ["POST", "/api/sessions/complete"],
  ["POST", "/api/documents/create"],
  ["POST", "/api/documents/adopt"],
  ["DELETE", "/api/documents/unadopt"],
  ["DELETE", "/api/documents/delete"],
  ["PATCH", "/api/documents/set-public"],
  ["PATCH", "/api/documents/abc123"],   // dynamic rename
  ["POST", "/api/notes/create"],
  ["PATCH", "/api/notes/xyz"],          // dynamic note patch (autosave)
  ["DELETE", "/api/notes/xyz"],         // dynamic note delete
  ["POST", "/api/notes/xyz/generate"],  // dynamic note generate
];
for (const [m, p] of TRUE_CASES) check(`TRUE  ${m} ${p}`, sacred(m, p) === true);

// --- FALSE: drain, wrong method, reads, non-/api ---
const FALSE_CASES = [
  ["POST", "/api/sync/grades", "the drain is never barriered"],
  ["GET", "/api/questions/grade", "GET to a Sacred path"],
  ["GET", "/api/questions/all-due", "read endpoint"],
  ["GET", "/api/questions/session", "read endpoint"],
  ["GET", "/api/documents/list", "read endpoint"],
  ["GET", "/api/sessions/start", "GET to a Sacred path"],
  ["POST", "/api/stats/progress", "non-Sacred /api path"],
  ["POST", "/study", "non-/api path"],
  ["GET", "/", "root document"],
];
for (const [m, p, why] of FALSE_CASES) check(`FALSE ${m} ${p} (${why})`, sacred(m, p) === false);

// --- method case-insensitivity + relative-URL parsing ---
check("lowercase method still matches", isSacredWriteRequest({ url: "/api/questions/grade", method: "post" }) === true);
check("relative URL parses (no host)", isSacredWriteRequest({ url: "/api/notes/abc", method: "DELETE" }) === true);

// --- the prefix list is exported and sane ---
check("SACRED_WRITE_PREFIXES exported as a non-empty array", Array.isArray(SACRED_WRITE_PREFIXES) && SACRED_WRITE_PREFIXES.length > 0);
check("every prefix is an /api/ path", SACRED_WRITE_PREFIXES.every((p) => p.startsWith("/api/")));
check("drain prefix is NOT in the list", !SACRED_WRITE_PREFIXES.some((p) => p.startsWith("/api/sync")));

console.log(`\nAll ${passed} checks passed.`);
process.exit(0);
