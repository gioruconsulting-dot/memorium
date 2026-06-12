import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scan, parseDiff, highestSeverity } from '../scanner.js';
import { readFileSync } from 'node:fs';

const DIFFS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures', 'diffs');
const diffPath = (name) => path.join(DIFFS, name);

test('parseDiff attributes added lines to files', () => {
  const { files, lineFile } = parseDiff(readFileSync(diffPath('st2-sacred-write.diff'), 'utf8'));
  assert.deepEqual(files, ['app/study/actions.js']);
  assert.ok([...lineFile.values()].every((f) => f === 'app/study/actions.js'));
  assert.ok(lineFile.size > 0);
});

test('ST-2: sacred-table write in server action flagged P0 (gate)', () => {
  const report = scan(diffPath('st2-sacred-write.diff'));
  const writeHits = report.hits.filter((h) => h.rule_id === 'sacred_table_write');
  assert.ok(writeHits.length > 0, JSON.stringify(report.hits, null, 2));
  assert.equal(writeHits[0].severity, 'P0');
  assert.equal(writeHits[0].required_route, 'live_human');
  assert.equal(writeHits[0].file, 'app/study/actions.js');
  assert.equal(highestSeverity(report), 'P0');
  assert.equal(report.semantic_review_required, true);
});

test('ST-2 diff also trips raw_sql and write_verb_in_api_route-adjacent rules', () => {
  const report = scan(diffPath('st2-sacred-write.diff'));
  const ids = new Set(report.hits.map((h) => h.rule_id));
  assert.ok(ids.has('raw_sql'));
  assert.ok(ids.has('sacred_table_reference'));
  assert.ok(ids.has('write_verb_in_api_route')); // actions.js matches the server-action file pattern
});

test('ST-13: lifecycle script flagged P1A (gate)', () => {
  const report = scan(diffPath('st13-lifecycle-script.diff'));
  const hit = report.hits.find((h) => h.rule_id === 'lifecycle_script');
  assert.ok(hit, JSON.stringify(report.hits, null, 2));
  assert.equal(hit.severity, 'P1A');
  const pathHit = report.hits.find((h) => h.rule_id === 'package_manifest');
  assert.ok(pathHit, 'package.json path rule should also fire');
  assert.equal(pathHit.severity, 'P1A');
});

test('clean UI diff: no hits, but doctrine is explicit', () => {
  const report = scan(diffPath('clean-ui.diff'));
  assert.equal(report.hits.length, 0, JSON.stringify(report.hits, null, 2));
  assert.equal(report.semantic_review_required, false);
  assert.equal(report.scanner_confidence, 'high');
  assert.match(report.doctrine, /never safe/);
  assert.equal(highestSeverity(report), null);
});

test('scanner-negative but risk-adjacent diff requires semantic review', () => {
  const report = scan(diffPath('risk-adjacent-clean.diff'));
  assert.equal(report.hits.length, 0, JSON.stringify(report.hits, null, 2));
  assert.equal(report.semantic_review_required, true);
  assert.equal(report.scanner_confidence, 'medium');
});
