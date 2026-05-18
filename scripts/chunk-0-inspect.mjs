// READ-ONLY production DB inspection for Repetita FTUE Chunk 0.
// This script runs ONLY SELECT and PRAGMA queries. Do not modify to include
// INSERT, UPDATE, DELETE, DROP, ALTER, or CREATE statements.

import { createClient } from '@libsql/client';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DB_URL = process.env.TURSO_DATABASE_URL;
const DB_TOKEN = process.env.TURSO_AUTH_TOKEN;

if (!DB_URL) {
  console.error('FATAL: TURSO_DATABASE_URL not set. Aborting.');
  process.exit(1);
}

const redactedUrl = DB_URL.replace(/\/\/[^@]+@/, '//[redacted]@');
console.log(`\nTarget DB: ${redactedUrl}`);
console.log('Confirm this is the intended target. Ctrl-C within 3s to abort.\n');
await new Promise(r => setTimeout(r, 3000));

const db = createClient({ url: DB_URL, authToken: DB_TOKEN });

const report = [];
const log = (line) => { report.push(line); console.log(line); };

log(`# Chunk 0 — Read-Only DB Inspection Report`);
log(`Generated: ${new Date().toISOString()}`);
log(`Target: ${redactedUrl}`);
log('');

// --- 1. All tables ---
log('## 1. All tables');
const tables = await db.execute(`
  SELECT name FROM sqlite_master
  WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream%'
  ORDER BY name
`);
const tableNames = tables.rows.map(r => r.name);
for (const n of tableNames) log(`- ${n}`);
log('');

// --- 2. Schema for Sacred + Parent-of-Sacred tables ---
log('## 2. Schema for critical tables');
const critical = ['users', 'documents', 'questions', 'study_sessions', 'session_answers', 'question_feedback'];
for (const tbl of critical) {
  if (!tableNames.includes(tbl)) {
    log(`### ${tbl}: NOT FOUND`);
    log('');
    continue;
  }
  log(`### ${tbl}`);
  const cols = await db.execute(`PRAGMA table_info('${tbl}')`);
  for (const c of cols.rows) {
    const flags = [
      c.notnull ? 'NOT NULL' : '',
      c.pk ? 'PK' : '',
      c.dflt_value !== null ? `DEFAULT ${c.dflt_value}` : '',
    ].filter(Boolean).join(' ');
    log(`- ${c.name} ${c.type}${flags ? ' ' + flags : ''}`);
  }
  const fks = await db.execute(`PRAGMA foreign_key_list('${tbl}')`);
  log(`**FKs from ${tbl}:**`);
  if (fks.rows.length === 0) {
    log('- (none)');
  } else {
    for (const fk of fks.rows) {
      log(`- ${fk.from} → ${fk.table}.${fk.to} (on_delete: ${fk.on_delete}, on_update: ${fk.on_update})`);
    }
  }
  log('');
}

// --- 3. Adoption-mechanism tables ---
log('## 3. Adoption-related tables (search: adopt|user_doc|user_question|library)');
const adoptionish = tableNames.filter(n => /adopt|user_doc|user_question|library/i.test(n));
if (adoptionish.length === 0) {
  log('None matched. Adoption mechanism may live under a different naming scheme — check Section 1.');
} else {
  for (const t of adoptionish) {
    log(`### ${t}`);
    const cols = await db.execute(`PRAGMA table_info('${t}')`);
    for (const c of cols.rows) log(`- ${c.name} ${c.type}`);
    const fks = await db.execute(`PRAGMA foreign_key_list('${t}')`);
    if (fks.rows.length > 0) {
      log(`**FKs:**`);
      for (const fk of fks.rows) {
        log(`- ${fk.from} → ${fk.table}.${fk.to} (on_delete: ${fk.on_delete})`);
      }
    }
    log('');
  }
}

// --- 4. Starter doc state ---
log('## 4. Starter doc state');

const slugCheck = await db.execute({
  sql: `SELECT id, slug, title, COALESCE(is_shared, 'n/a') AS is_shared FROM documents WHERE slug = ?`,
  args: ['how-memory-actually-works'],
});
log(`### Match by slug 'how-memory-actually-works': ${slugCheck.rows.length} row(s)`);
for (const r of slugCheck.rows) log(`- id=${r.id}, slug=${r.slug}, title="${r.title}", is_shared=${r.is_shared}`);

const titleCheck = await db.execute({
  sql: `SELECT id, COALESCE(slug, '(no slug column)') AS slug, title FROM documents WHERE LOWER(title) LIKE ?`,
  args: ['%how memory actually works%'],
});
log(`### Match by title fuzzy 'how memory actually works': ${titleCheck.rows.length} row(s)`);
for (const r of titleCheck.rows) log(`- id=${r.id}, slug=${r.slug}, title="${r.title}"`);

const ebbCheck = await db.execute({
  sql: `SELECT id, document_id, substr(question_text, 1, 80) AS preview FROM questions WHERE question_text LIKE ?`,
  args: ['%Ebbinghaus%'],
});
log(`### Questions containing "Ebbinghaus": ${ebbCheck.rows.length} row(s)`);
for (const r of ebbCheck.rows) log(`- id=${r.id}, document_id=${r.document_id}, preview="${r.preview}..."`);

const within24Check = await db.execute({
  sql: `SELECT id, document_id, substr(question_text, 1, 80) AS preview FROM questions WHERE question_text LIKE ?`,
  args: ['%within 24 hours%'],
});
log(`### Questions containing "within 24 hours": ${within24Check.rows.length} row(s)`);
for (const r of within24Check.rows) log(`- id=${r.id}, document_id=${r.document_id}, preview="${r.preview}..."`);
log('');

// --- 5. Baseline counts ---
log('## 5. Baseline counts (snapshot before chunk 1)');
for (const tbl of critical) {
  if (!tableNames.includes(tbl)) continue;
  const c = await db.execute(`SELECT COUNT(*) AS n FROM ${tbl}`);
  log(`- ${tbl}: ${c.rows[0].n}`);
}
for (const t of adoptionish) {
  const c = await db.execute(`SELECT COUNT(*) AS n FROM ${t}`);
  log(`- ${t}: ${c.rows[0].n}`);
}
log('');

// --- 6. Verdict ---
log('## 6. Verdict');
const slugFound = slugCheck.rows.length > 0;
const titleFound = titleCheck.rows.length > 0;
const contentFound = ebbCheck.rows.length > 0 || within24Check.rows.length > 0;

if (!slugFound && !titleFound && !contentFound) {
  log('**STATE 1 — CLEAN SEED.** No starter doc and no matching question content found. Safe to proceed with chunk 1 (seed + auto-adopt).');
} else if (slugFound && slugCheck.rows.length === 1 && !titleFound && !contentFound) {
  log('**STATE 2 — DOC EXISTS, NO STRAY CONTENT.** Auto-adopt should be idempotent against this row. Inspect attached questions before chunk 1.');
} else if (slugFound && (titleFound || contentFound)) {
  log('**STATE 3 — DOC EXISTS WITH POSSIBLY STALE/PARTIAL CONTENT.** Need a reconcile pass before auto-adopt.');
} else if (!slugFound && (titleFound || contentFound)) {
  log('**STATE 4 — ORPHAN OR RENAME.** Slug missing but matching content exists elsewhere. STOP and discuss before chunk 1.');
} else {
  log('**AMBIGUOUS** — pattern does not fit known states. STOP and discuss before chunk 1.');
}
log('');

// --- 7. Notes for chunk 1 ---
log('## 7. Notes for chunk 1');
log('- Use Section 2 to confirm `documents` columns (slug, is_starter_doc, is_shared, topic, description) exist.');
log('- Use Section 2 to confirm `questions` has an `order`/equivalent field and FK to documents.');
log('- Use Section 3 to identify the adoption table chunk 1 will write to.');
log('- Use Section 5 baseline counts as the "before" snapshot for chunk 1 verification.');

// --- Save report ---
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const reportPath = `scripts/chunk-0-report-${ts}.md`;
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, report.join('\n'));
console.log(`\nReport saved: ${reportPath}\n`);

await db.close?.();
