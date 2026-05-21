// scripts/notes-v5-plain-text-export.mjs
// USAGE: node scripts/notes-v5-plain-text-export.mjs
//
// Read-only plain-text export of the two non-at-risk users' notes data for
// goodwill preservation before the v5 wipe (per Amendment B of
// docs/specs/notes-feature-masterplan-v5.md).
//
// Writes one .txt file per note under notes-exports-plaintext/<USER_ID>/.
// The output directory is gitignored — files contain user content and must
// NEVER be committed.
//
// SAFETY: this script does NOT mutate production. Only SELECTs.

import { createClient } from '@libsql/client';
import { config } from 'dotenv';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

config({ path: '.env.local' });

const PLAIN_TEXT_USER_IDS = [
  'user_3Ba5kqiLR8PNTCmPaDoaMLsoIMY',
  'user_3DcjFr50Zvg0wMQ0RzjMGUGi15i',
];

const DB_URL = process.env.TURSO_DATABASE_URL;
const DB_TOKEN = process.env.TURSO_AUTH_TOKEN;

function die(msg) {
  console.error(`\nFATAL: ${msg}\n`);
  process.exit(1);
}

if (!DB_URL) die('TURSO_DATABASE_URL not set. Add it to .env.local.');
if (!DB_TOKEN) die('TURSO_AUTH_TOKEN not set. Add it to .env.local.');

// Hard guard: refuse to run against any DB that isn't memorium-recovery.
if (!DB_URL.includes('memorium-recovery')) {
  die(
    `TURSO_DATABASE_URL does not point at memorium-recovery. ` +
    `Refusing to export from a non-production DB. URL host fragment: ` +
    `${DB_URL.replace(/\/\/[^@]+@/, '//[redacted]@').slice(0, 80)}…`
  );
}

const redactedUrl = DB_URL.replace(/\/\/[^@]+@/, '//[redacted]@');
console.log(`\n──────── Notes v5 — plain-text export ────────`);
console.log(`Target DB:    ${redactedUrl}`);
console.log(`Target users: ${PLAIN_TEXT_USER_IDS.join(', ')}`);
console.log(`Mode:         READ-ONLY (SELECT only)`);
console.log(`If this is wrong, Ctrl-C within 3 seconds.\n`);
await new Promise((r) => setTimeout(r, 3000));

const db = createClient({ url: DB_URL, authToken: DB_TOKEN });

const outRoot = resolve(process.cwd(), 'notes-exports-plaintext');
if (!existsSync(outRoot)) {
  mkdirSync(outRoot, { recursive: true });
  console.log(`Created output dir: ${outRoot}`);
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function sanitizeForFilename(s) {
  if (!s) return 'untitled';
  return s
    .toString()
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'untitled';
}

function humanDate(unixSeconds) {
  if (unixSeconds == null) return '(unknown)';
  const ms = Number(unixSeconds) * 1000;
  if (!Number.isFinite(ms)) return '(unknown)';
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

// ─── Per-user export ──────────────────────────────────────────────────────

const summary = [];

for (const userId of PLAIN_TEXT_USER_IDS) {
  console.log(`\nUser: ${userId}`);

  const userDir = join(outRoot, userId);
  if (!existsSync(userDir)) mkdirSync(userDir, { recursive: true });

  const notesRes = await db.execute({
    sql: `SELECT id, title, content, note_draft_content, created_at, updated_at
          FROM documents
          WHERE user_id = ? AND source_type = 'note'
          ORDER BY COALESCE(updated_at, created_at) DESC`,
    args: [userId],
  });

  console.log(`  → ${notesRes.rows.length} note(s)`);

  const written = [];

  for (const note of notesRes.rows) {
    const title = note.title?.toString().trim() || '(untitled)';
    const sealedContent = note.content?.toString() || '';
    const draftContent = note.note_draft_content?.toString() || '';

    const body =
      `Title: ${title}\n` +
      `Created: ${humanDate(note.created_at)}\n` +
      `Last updated: ${humanDate(note.updated_at)}\n` +
      `\n` +
      `=== Sealed content ===\n` +
      (sealedContent.trim() === '' ? '(empty)\n' : `${sealedContent}\n`) +
      `\n` +
      `=== Draft (unsealed) ===\n` +
      (draftContent.trim() === '' ? '(empty)\n' : `${draftContent}\n`);

    const filename = `notes-export-${userId}-${note.id}-${sanitizeForFilename(title)}.txt`;
    const path = join(userDir, filename);
    writeFileSync(path, body, 'utf8');
    written.push(path);
  }

  for (const p of written) console.log(`    wrote ${p}`);
  summary.push({ userId, count: notesRes.rows.length, dir: userDir });
}

// ─── Summary ──────────────────────────────────────────────────────────────

console.log(`\n──────── SUMMARY ────────`);
for (const row of summary) {
  console.log(`  ${row.userId}: ${row.count} note(s) → ${row.dir}`);
}
console.log(`\n⚠  OPERATOR ACTION REQUIRED:`);
console.log(`   1. Review the .txt files manually before emailing.`);
console.log(`   2. Do NOT commit notes-exports-plaintext/ — it is gitignored;`);
console.log(`      double-check before any 'git add'.`);
console.log(`   3. Email each user their own folder's contents before Chunk 1.\n`);

process.exit(0);
