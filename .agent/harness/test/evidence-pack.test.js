// Unit tests for the evidence-pack assembler + contamination guard (deadline #2).
// Uses a throwaway temp worktree; no model calls, no real credentials.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { assembleEvidencePack, hashDir } from '../evidence-pack.js';

let work; // fake worktree
let packRoot;

before(() => {
  work = mkdtempSync(path.join(tmpdir(), 'pack-work-'));
  packRoot = mkdtempSync(path.join(tmpdir(), 'pack-out-'));
  mkdirSync(path.join(work, 'lib', 'utils'), { recursive: true });
  writeFileSync(path.join(work, 'lib/utils/x.js'), 'export const x = 1;\n');
  writeFileSync(path.join(work, 'lib/utils/x.test.js'), 'import { x } from "./x.js";\n');
  writeFileSync(path.join(work, 'lib/utils/untouched.js'), 'export const y = 2;\n');
  writeFileSync(path.join(work, 'secret.js'), 'const k = "sk-ABC123DEF456";\n');
  // underscore-style key (Clerk/Stripe) — the gap the pack probe exposed
  writeFileSync(path.join(work, 'secret2.js'), 'const k = "sk_live_ABC123DEF456";\n');
});

after(() => {
  rmSync(work, { recursive: true, force: true });
  rmSync(packRoot, { recursive: true, force: true });
});

function clean(extra = {}) {
  return assembleEvidencePack({
    packDir: path.join(packRoot, 'pack'),
    worktree: work,
    touchedFiles: ['lib/utils/x.test.js'],
    groundTruthChanged: ['lib/utils/x.test.js'],
    contextFiles: ['lib/utils/x.js'],
    diffText: 'diff --git a/lib/utils/x.test.js ...',
    scannerReport: { hits: [] },
    executorReport: { summary: 's' },
    stateText: '# state',
    openRegister: { risks: [] },
    acceptance: ['criterion one'],
    ...extra,
  });
}

test('clean input yields a pack with full copies of touched + context files', () => {
  const { packDir, manifest } = clean();
  assert.ok(existsSync(path.join(packDir, 'touched', 'x.test.js')));
  assert.ok(existsSync(path.join(packDir, 'context', 'x.js')));
  assert.ok(existsSync(path.join(packDir, 'executor.diff')));
  assert.ok(existsSync(path.join(packDir, 'scanner_report.json')));
  assert.deepEqual(manifest.touched, ['touched/x.test.js']);
  assert.deepEqual(manifest.context, ['context/x.js']);
});

test('guard THROWS on an untouched-repo file claimed as touched (not in ground truth)', () => {
  assert.throws(
    () =>
      clean({
        touchedFiles: ['lib/utils/x.test.js', 'lib/utils/untouched.js'],
        groundTruthChanged: ['lib/utils/x.test.js'], // untouched.js NOT measured as changed
      }),
    /NOT in the harness-measured changes/
  );
});

test('guard THROWS on a secret-shaped file (by content)', () => {
  assert.throws(() => clean({ contextFiles: ['secret.js'] }), /secret-shaped/);
});

test('guard THROWS on an underscore-style key (sk_live_)', () => {
  assert.throws(() => clean({ contextFiles: ['secret2.js'] }), /secret-shaped/);
});

test('guard THROWS on a declared file missing from the worktree', () => {
  assert.throws(
    () => clean({ contextFiles: ['lib/utils/does-not-exist.js'] }),
    /missing in worktree/
  );
});

test('hashDir is stable for identical content and changes when content changes', () => {
  const { packDir } = clean();
  const h1 = hashDir(packDir);
  const h2 = hashDir(packDir);
  assert.equal(h1, h2);
  writeFileSync(path.join(packDir, 'touched', 'x.test.js'), 'mutated\n');
  assert.notEqual(hashDir(packDir), h1);
});

test('pack contains no file outside the declared set + harness evidence', () => {
  const { packDir } = clean();
  const top = readdirSync(packDir).sort();
  const allowed = new Set([
    'touched',
    'context',
    'executor.diff',
    'scanner_report.json',
    'executor_report.json',
    'state.md',
    'register.json',
    'acceptance.md',
    'PACK_MANIFEST.json',
  ]);
  for (const entry of top) assert.ok(allowed.has(entry), `unexpected pack entry: ${entry}`);
});
