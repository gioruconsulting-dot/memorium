import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createRunLog } from '../runlog.js';

const TMP_LOG = path.join(tmpdir(), `harness-runlog-test-${process.pid}.log`);

test('appends one JSON line per event, never rewrites', (t) => {
  t.after(() => rmSync(TMP_LOG, { force: true }));

  const log = createRunLog('RUN-TEST-001', TMP_LOG);
  log.append('run_start', { task: 'fixture' });
  log.append('fsm_transition', { from: 'INIT', to: 'SPEC_REVIEW' });
  log.append('halt', { reason: 'fixture halt' });

  const lines = readFileSync(TMP_LOG, 'utf8').trim().split('\n');
  assert.equal(lines.length, 3);

  const first = JSON.parse(lines[0]);
  assert.equal(first.run_id, 'RUN-TEST-001');
  assert.equal(first.event, 'run_start');
  assert.ok(first.ts);

  // A second logger on the same file appends after existing content.
  const log2 = createRunLog('RUN-TEST-002', TMP_LOG);
  log2.append('run_start', {});
  const linesAfter = readFileSync(TMP_LOG, 'utf8').trim().split('\n');
  assert.equal(linesAfter.length, 4);
  assert.equal(JSON.parse(linesAfter[0]).run_id, 'RUN-TEST-001');
});

test('unknown event types are logged visibly, not dropped', (t) => {
  t.after(() => rmSync(TMP_LOG, { force: true }));
  const log = createRunLog('RUN-TEST-003', TMP_LOG);
  log.append('totally_made_up', { x: 1 });
  const entry = JSON.parse(readFileSync(TMP_LOG, 'utf8').trim());
  assert.equal(entry.event, 'halt_adjacent_unknown_event');
  assert.equal(entry.unrecognized_event_type, 'totally_made_up');
});

test('requires a run id', () => {
  assert.throws(() => createRunLog(''), /runId/);
  assert.ok(!existsSync(TMP_LOG));
});
