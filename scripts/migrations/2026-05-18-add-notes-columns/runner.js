// Tier 4 migration runner — note capture, Chunk 1.
// Read-only by default. Phases must be explicitly requested.
// Re-runnable. Deterministic. Target ambiguity is fatal.
//
// Usage:
//   node --env-file=.env.local scripts/migrations/2026-05-18-add-notes-columns/runner.js \
//     --phase=preflight --label=prod-initial --confirm-target=memorium-recovery
//
// Phases:
//   preflight   — read-only snapshot, saves preflight-{label}.json
//   migrate     — applies migration.sql, saves migration-log-{label}.txt
//   postflight  — read-only snapshot + diff vs preflight-{label}.json
//
// Target resolution (in priority order):
//   1. MIGRATION_TARGET_URL  + MIGRATION_TARGET_TOKEN  (explicit override)
//   2. TURSO_DATABASE_URL    + TURSO_AUTH_TOKEN        (from .env.local)
//
// Hard stop conditions trigger non-zero exit codes — never proceed past STOP.

import { createClient } from "@libsql/client";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..", "..");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v = "true"] = a.replace(/^--/, "").split("=");
    return [k, v];
  })
);

const phase = args.phase;
const label = args.label;
const confirmTarget = args["confirm-target"];
let runId = args["run-id"];

const VALID_PHASES = ["preflight", "migrate", "postflight"];
if (!phase || !VALID_PHASES.includes(phase)) {
  console.error(`FATAL: --phase is required (one of: ${VALID_PHASES.join(", ")})`);
  process.exit(1);
}
if (!label) {
  console.error("FATAL: --label is required (e.g. prod-initial, branch, prod)");
  process.exit(1);
}
if (!confirmTarget) {
  console.error("FATAL: --confirm-target is required (DB name e.g. memorium-recovery or memorium-notes-migration)");
  process.exit(1);
}

const dbUrl = process.env.MIGRATION_TARGET_URL || process.env.TURSO_DATABASE_URL;
const dbToken = process.env.MIGRATION_TARGET_TOKEN || process.env.TURSO_AUTH_TOKEN;
const usingOverride = !!process.env.MIGRATION_TARGET_URL;

if (!dbUrl) {
  console.error("FATAL: no DB URL (set TURSO_DATABASE_URL in .env.local or MIGRATION_TARGET_URL)");
  process.exit(1);
}

const redactedUrl = dbUrl.replace(/\/\/[^@]+@/, "//[redacted]@");
const inferredDbName = dbUrl.match(/\/\/([^.-]+(?:-[^.-]+)*?)-[a-z]+-[a-z]+\./)?.[1] ?? null;
const fallbackName = dbUrl.match(/\/\/([^.]+)\./)?.[1] ?? "unknown";
const dbName = inferredDbName ?? fallbackName;

console.log(`\n=== runner.js (phase: ${phase}, label: ${label}) ===`);
console.log(`Target DB URL:       ${redactedUrl}`);
console.log(`Inferred DB name:    ${dbName}`);
console.log(`Confirm target:      ${confirmTarget}`);
console.log(`Using:               ${usingOverride ? "MIGRATION_TARGET_URL override" : "TURSO_DATABASE_URL from .env.local"}`);

if (!dbName.startsWith(confirmTarget)) {
  console.error(`\nFATAL: inferred DB name "${dbName}" does not start with --confirm-target "${confirmTarget}".`);
  console.error(`Refusing to run. Verify the target before retrying.`);
  process.exit(1);
}

if (!runId) {
  if (phase === "preflight") {
    runId = new Date().toISOString().replace(/[:.]/g, "-");
    console.log(`Generated run-id:    ${runId}`);
  } else {
    console.error(`FATAL: --run-id is required for phase=${phase} (use the run-id printed by preflight)`);
    process.exit(1);
  }
} else {
  console.log(`Run-id:              ${runId}`);
}

const artifactDir = resolve(REPO_ROOT, ".migrations", runId);
mkdirSync(artifactDir, { recursive: true });

const db = createClient({ url: dbUrl, authToken: dbToken });

const BLAST_RADIUS = [
  "documents",
  "questions",
  "session_answers",
  "study_sessions",
  "question_feedback",
  "users",
];

const FK_INSPECT_TABLES = ["documents", "questions", "session_answers", "question_feedback"];

const EXPECTED_COUNTS = {
  documents: 46,
  questions: 1345,
  session_answers: 761,
  study_sessions: 272,
  question_feedback: 1,
  users: 31,
};

const NEW_COLUMNS = ["source_type", "note_draft_content", "last_generated_at", "updated_at"];

async function captureSnapshot() {
  const snapshot = {
    timestamp: new Date().toISOString(),
    target_db_url_redacted: redactedUrl,
    target_db_name_inferred: dbName,
    confirm_target: confirmTarget,
    label,
    run_id: runId,
    phase,
    using_override: usingOverride,
    counts: {},
    foreign_keys: {},
    table_info_documents: null,
    documents_create_sql: null,
    per_user_doc_counts: [],
    per_user_question_counts: [],
    orphans: {},
    identity_sample_first_10_doc_ids: [],
    new_columns_state: {},
  };

  for (const table of BLAST_RADIUS) {
    const res = await db.execute(`SELECT COUNT(*) AS n FROM ${table}`);
    snapshot.counts[table] = Number(res.rows[0].n);
  }

  for (const table of FK_INSPECT_TABLES) {
    const res = await db.execute(`PRAGMA foreign_key_list('${table}')`);
    snapshot.foreign_keys[table] = res.rows.map((r) => ({
      id: r.id,
      seq: r.seq,
      table: r.table,
      from: r.from,
      to: r.to,
      on_update: r.on_update,
      on_delete: r.on_delete,
      match: r.match,
    }));
  }

  const tableInfo = await db.execute(`PRAGMA table_info('documents')`);
  snapshot.table_info_documents = tableInfo.rows.map((r) => ({
    cid: r.cid,
    name: r.name,
    type: r.type,
    notnull: r.notnull,
    dflt_value: r.dflt_value,
    pk: r.pk,
  }));

  const masterSql = await db.execute({
    sql: `SELECT sql FROM sqlite_master WHERE type='table' AND name='documents'`,
  });
  snapshot.documents_create_sql = masterSql.rows[0]?.sql ?? null;

  const docCounts = await db.execute(
    `SELECT user_id, COUNT(*) AS doc_count FROM documents GROUP BY user_id ORDER BY user_id`
  );
  snapshot.per_user_doc_counts = docCounts.rows.map((r) => ({
    user_id: String(r.user_id),
    doc_count: Number(r.doc_count),
  }));

  const qCounts = await db.execute(
    `SELECT user_id, COUNT(*) AS q_count FROM questions GROUP BY user_id ORDER BY user_id`
  );
  snapshot.per_user_question_counts = qCounts.rows.map((r) => ({
    user_id: String(r.user_id),
    q_count: Number(r.q_count),
  }));

  const o1 = await db.execute(
    `SELECT COUNT(*) AS n FROM questions q WHERE NOT EXISTS (SELECT 1 FROM documents d WHERE d.id = q.document_id)`
  );
  const o2 = await db.execute(
    `SELECT COUNT(*) AS n FROM session_answers sa WHERE NOT EXISTS (SELECT 1 FROM questions q WHERE q.id = sa.question_id)`
  );
  const o3 = await db.execute(
    `SELECT COUNT(*) AS n FROM session_answers sa WHERE NOT EXISTS (SELECT 1 FROM study_sessions s WHERE s.id = sa.session_id)`
  );
  snapshot.orphans = {
    questions_without_document: Number(o1.rows[0].n),
    session_answers_without_question: Number(o2.rows[0].n),
    session_answers_without_session: Number(o3.rows[0].n),
  };

  const idSample = await db.execute(`SELECT id FROM documents ORDER BY id LIMIT 10`);
  snapshot.identity_sample_first_10_doc_ids = idSample.rows.map((r) => String(r.id));

  const existingCols = new Set(snapshot.table_info_documents.map((c) => c.name));
  for (const col of NEW_COLUMNS) {
    if (!existingCols.has(col)) {
      snapshot.new_columns_state[col] = { present: false };
      continue;
    }
    try {
      const nullCount = await db.execute({
        sql: `SELECT COUNT(*) AS n FROM documents WHERE ${col} IS NULL`,
      });
      const sampleCount = await db.execute({
        sql:
          col === "source_type"
            ? `SELECT COUNT(*) AS n FROM documents WHERE source_type = 'uploaded'`
            : `SELECT COUNT(*) AS n FROM documents WHERE ${col} IS NOT NULL`,
      });
      snapshot.new_columns_state[col] = {
        present: true,
        null_count: Number(nullCount.rows[0].n),
        ...(col === "source_type"
          ? { uploaded_count: Number(sampleCount.rows[0].n) }
          : { not_null_count: Number(sampleCount.rows[0].n) }),
      };
    } catch (err) {
      snapshot.new_columns_state[col] = { present: true, error: err.message };
    }
  }

  if (existingCols.has("source_type")) {
    const noteCount = await db.execute(
      `SELECT COUNT(*) AS n FROM documents WHERE source_type = 'note'`
    );
    snapshot.new_columns_state.source_type.note_count = Number(noteCount.rows[0].n);
  }

  return snapshot;
}

function validateAgainstManifest(snapshot) {
  const mismatches = [];
  for (const [table, expected] of Object.entries(EXPECTED_COUNTS)) {
    if (snapshot.counts[table] !== expected) {
      mismatches.push({ table, expected, actual: snapshot.counts[table] });
    }
  }
  return mismatches;
}

function printSnapshotSummary(snapshot, manifestMismatches) {
  console.log(`\n--- Counts ---`);
  for (const [t, n] of Object.entries(snapshot.counts)) {
    const e = EXPECTED_COUNTS[t];
    const ok = n === e ? "✓" : "✗";
    console.log(`  ${ok} ${t.padEnd(20)} ${String(n).padStart(6)}   (manifest ${e})`);
  }
  console.log(`\n--- Orphan checks ---`);
  for (const [k, v] of Object.entries(snapshot.orphans)) {
    console.log(`  ${v === 0 ? "✓" : "✗"} ${k.padEnd(40)} ${v}`);
  }
  console.log(`\n--- FK structure (count of FKs per table) ---`);
  for (const t of FK_INSPECT_TABLES) {
    console.log(`  ${t.padEnd(20)} ${snapshot.foreign_keys[t].length} FK(s)`);
  }
  console.log(`\n--- New-column state ---`);
  for (const col of NEW_COLUMNS) {
    const s = snapshot.new_columns_state[col];
    console.log(`  ${col.padEnd(22)} ${JSON.stringify(s)}`);
  }
  if (manifestMismatches.length > 0) {
    console.log(`\n!! Manifest mismatches:`);
    for (const m of manifestMismatches) {
      console.log(`  ✗ ${m.table}: expected ${m.expected}, actual ${m.actual}`);
    }
  }
}

if (phase === "preflight") {
  const snapshot = await captureSnapshot();
  const mismatches = validateAgainstManifest(snapshot);
  snapshot.manifest_mismatches = mismatches;

  const path = resolve(artifactDir, `preflight-${label}.json`);
  writeFileSync(path, JSON.stringify(snapshot, null, 2));

  printSnapshotSummary(snapshot, mismatches);
  console.log(`\nArtifact saved: ${path}`);

  if (mismatches.length > 0) {
    console.error(`\nSTOP: manifest mismatch(es) detected. Manual review required.`);
    process.exit(2);
  }
  if (Object.values(snapshot.orphans).some((v) => v !== 0)) {
    console.error(`\nSTOP: orphan rows detected. Manual review required.`);
    process.exit(2);
  }
  console.log(`\nPreflight OK. run-id for subsequent phases: ${runId}`);
} else if (phase === "migrate") {
  const cols = await db.execute(`PRAGMA table_info('documents')`);
  const existing = new Set(cols.rows.map((r) => r.name));
  const alreadyPresent = NEW_COLUMNS.filter((c) => existing.has(c));
  if (alreadyPresent.length > 0) {
    console.error(`\nSTOP: target column(s) already exist on this DB: ${alreadyPresent.join(", ")}`);
    console.error(`Idempotency check failed — DB is not in expected pre-migration state.`);
    process.exit(3);
  }

  const sqlPath = resolve(__dirname, "migration.sql");
  if (!existsSync(sqlPath)) {
    console.error(`FATAL: migration.sql not found at ${sqlPath}`);
    process.exit(1);
  }
  const fullSql = readFileSync(sqlPath, "utf8");

  // Strip line comments, split on semicolons, trim, filter empty
  const statements = fullSql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (statements.length !== 4) {
    console.error(`FATAL: expected 4 statements in migration.sql, found ${statements.length}. Refusing to run.`);
    process.exit(1);
  }

  const logLines = [];
  const logFile = resolve(artifactDir, `migration-log-${label}.txt`);
  logLines.push(`# Migration log`);
  logLines.push(`phase: migrate`);
  logLines.push(`label: ${label}`);
  logLines.push(`run_id: ${runId}`);
  logLines.push(`target: ${redactedUrl}`);
  logLines.push(`dbName: ${dbName}`);
  logLines.push(`time_start: ${new Date().toISOString()}`);
  logLines.push("");

  for (const [i, stmt] of statements.entries()) {
    logLines.push(`--- Statement ${i + 1}/4 ---`);
    logLines.push(stmt);
    console.log(`Executing statement ${i + 1}/4...`);
    try {
      const res = await db.execute(stmt);
      logLines.push(`OK (rowsAffected=${res.rowsAffected ?? 0})`);
      console.log(`  ✓ OK (rowsAffected=${res.rowsAffected ?? 0})`);
    } catch (err) {
      logLines.push(`ERROR: ${err.message}`);
      logLines.push(`time_end: ${new Date().toISOString()}`);
      writeFileSync(logFile, logLines.join("\n"));
      console.error(`\nSTOP: statement ${i + 1} failed: ${err.message}`);
      console.error(`Log saved: ${logFile}`);
      process.exit(4);
    }
    logLines.push("");
  }
  logLines.push(`time_end: ${new Date().toISOString()}`);
  writeFileSync(logFile, logLines.join("\n"));
  console.log(`\nMigration log saved: ${logFile}`);
  console.log(`All 4 statements applied. Next: --phase=postflight --label=${label} --run-id=${runId}`);
} else if (phase === "postflight") {
  const snapshot = await captureSnapshot();

  const preflightPath = resolve(artifactDir, `preflight-${label}.json`);
  if (!existsSync(preflightPath)) {
    console.error(`FATAL: preflight-${label}.json not found at ${preflightPath}`);
    console.error(`Cannot run postflight without matching preflight artifact.`);
    process.exit(1);
  }
  const pre = JSON.parse(readFileSync(preflightPath, "utf8"));

  const diff = {
    counts: {},
    foreign_keys_changed_tables: [],
    per_user_doc_count_changes: [],
    per_user_question_count_changes: [],
    documents_create_sql_changed: pre.documents_create_sql !== snapshot.documents_create_sql,
    new_columns_added: [],
    identity_sample_unchanged: null,
  };

  for (const t of BLAST_RADIUS) {
    diff.counts[t] = {
      pre: pre.counts[t],
      post: snapshot.counts[t],
      delta: snapshot.counts[t] - pre.counts[t],
    };
  }

  for (const t of FK_INSPECT_TABLES) {
    if (JSON.stringify(pre.foreign_keys[t]) !== JSON.stringify(snapshot.foreign_keys[t])) {
      diff.foreign_keys_changed_tables.push(t);
    }
  }

  const preDocByUser = Object.fromEntries(pre.per_user_doc_counts.map((r) => [r.user_id, r.doc_count]));
  for (const r of snapshot.per_user_doc_counts) {
    if (preDocByUser[r.user_id] !== r.doc_count) {
      diff.per_user_doc_count_changes.push({
        user_id: r.user_id,
        pre: preDocByUser[r.user_id] ?? 0,
        post: r.doc_count,
      });
    }
  }
  for (const r of pre.per_user_doc_counts) {
    const postRec = snapshot.per_user_doc_counts.find((x) => x.user_id === r.user_id);
    if (!postRec) {
      diff.per_user_doc_count_changes.push({ user_id: r.user_id, pre: r.doc_count, post: 0 });
    }
  }

  const preQByUser = Object.fromEntries(pre.per_user_question_counts.map((r) => [r.user_id, r.q_count]));
  for (const r of snapshot.per_user_question_counts) {
    if (preQByUser[r.user_id] !== r.q_count) {
      diff.per_user_question_count_changes.push({
        user_id: r.user_id,
        pre: preQByUser[r.user_id] ?? 0,
        post: r.q_count,
      });
    }
  }
  for (const r of pre.per_user_question_counts) {
    const postRec = snapshot.per_user_question_counts.find((x) => x.user_id === r.user_id);
    if (!postRec) {
      diff.per_user_question_count_changes.push({ user_id: r.user_id, pre: r.q_count, post: 0 });
    }
  }

  const preColNames = new Set(pre.table_info_documents.map((c) => c.name));
  diff.new_columns_added = snapshot.table_info_documents
    .filter((c) => !preColNames.has(c.name))
    .map((c) => ({
      name: c.name,
      type: c.type,
      notnull: c.notnull,
      dflt_value: c.dflt_value,
    }));

  diff.identity_sample_unchanged =
    JSON.stringify(pre.identity_sample_first_10_doc_ids) ===
    JSON.stringify(snapshot.identity_sample_first_10_doc_ids);

  const postflightOut = { ...snapshot, diff_vs_preflight: diff };
  const postPath = resolve(artifactDir, `postflight-${label}.json`);
  const diffPath = resolve(artifactDir, `verification-diff-${label}.json`);
  writeFileSync(postPath, JSON.stringify(postflightOut, null, 2));
  writeFileSync(diffPath, JSON.stringify(diff, null, 2));

  printSnapshotSummary(snapshot, validateAgainstManifest(snapshot));

  console.log(`\n--- Deltas vs preflight ---`);
  for (const t of BLAST_RADIUS) {
    const d = diff.counts[t];
    const ok = d.delta === 0 ? "✓" : "✗";
    console.log(`  ${ok} ${t.padEnd(20)} ${d.pre} → ${d.post}  (delta ${d.delta})`);
  }
  console.log(`  ${diff.foreign_keys_changed_tables.length === 0 ? "✓" : "✗"} FK structure unchanged${diff.foreign_keys_changed_tables.length > 0 ? `  (changed: ${diff.foreign_keys_changed_tables.join(", ")})` : ""}`);
  console.log(`  ${diff.per_user_doc_count_changes.length === 0 ? "✓" : "✗"} per-user doc counts unchanged (${diff.per_user_doc_count_changes.length} delta(s))`);
  console.log(`  ${diff.per_user_question_count_changes.length === 0 ? "✓" : "✗"} per-user question counts unchanged (${diff.per_user_question_count_changes.length} delta(s))`);
  console.log(`  ${diff.identity_sample_unchanged ? "✓" : "✗"} first 10 doc IDs unchanged`);
  console.log(`  new columns added: ${diff.new_columns_added.map((c) => c.name).join(", ") || "(none)"}`);

  console.log(`\nArtifacts saved:`);
  console.log(`  ${postPath}`);
  console.log(`  ${diffPath}`);

  const failed =
    BLAST_RADIUS.some((t) => diff.counts[t].delta !== 0) ||
    diff.foreign_keys_changed_tables.length !== 0 ||
    diff.per_user_doc_count_changes.length !== 0 ||
    diff.per_user_question_count_changes.length !== 0 ||
    !diff.identity_sample_unchanged ||
    Object.values(snapshot.orphans).some((v) => v !== 0) ||
    diff.new_columns_added.length !== 4;

  if (failed) {
    console.error(`\nSTOP: postflight verification failed. Do not proceed.`);
    process.exit(5);
  }
  console.log(`\nPostflight OK (Levels 1–3). Level 4 product verification is user-clock; hand off.`);
}

await db.close?.();
