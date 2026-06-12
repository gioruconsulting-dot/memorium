import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { crossCheckTests } from '../crosscheck.js';

const baseReport = (testsRun) => ({
  summary: 'fixture',
  files_changed: [],
  commands_run: [],
  tests_run: testsRun,
  failures: [],
  risks_noticed: [],
  deviations_from_plan: [],
  questions_for_critic: [],
  git_diff_path: 'diff.patch',
});

function withRunsDir(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), 'harness-crosscheck-'));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('evidenced pass survives', () => {
  withRunsDir((dir) => {
    writeFileSync(
      path.join(dir, 'test-output.txt'),
      '$ npm test -- study\n✔ all 12 tests passed\n'
    );
    const { report, all_passes_evidenced } = crossCheckTests(
      baseReport([{ command: 'npm test -- study', result: 'pass', output_path: 'test-output.txt' }]),
      dir
    );
    assert.equal(report.tests_run[0].result, 'pass');
    assert.equal(all_passes_evidenced, true);
  });
});

test('ST-12: pass with missing output file downgraded to not_run (gate)', () => {
  withRunsDir((dir) => {
    const { report, downgrades } = crossCheckTests(
      baseReport([{ command: 'npm test', result: 'pass', output_path: 'nope.txt' }]),
      dir
    );
    assert.equal(report.tests_run[0].result, 'not_run');
    assert.match(downgrades[0].reason, /missing/);
  });
});

test('ST-12: pass whose output does not contain the command downgraded (gate)', () => {
  withRunsDir((dir) => {
    writeFileSync(path.join(dir, 'out.txt'), 'some unrelated build log\nDone in 3s\n');
    const { report, downgrades } = crossCheckTests(
      baseReport([{ command: 'npm test -- study', result: 'pass', output_path: 'out.txt' }]),
      dir
    );
    assert.equal(report.tests_run[0].result, 'not_run');
    assert.match(downgrades[0].reason, /does not contain the claimed command/);
  });
});

test('empty output_path and empty file both downgrade', () => {
  withRunsDir((dir) => {
    writeFileSync(path.join(dir, 'empty.txt'), '   \n');
    const { report } = crossCheckTests(
      baseReport([
        { command: 'npm test a', result: 'pass', output_path: '' },
        { command: 'npm test b', result: 'pass', output_path: 'empty.txt' },
      ]),
      dir
    );
    assert.equal(report.tests_run[0].result, 'not_run');
    assert.equal(report.tests_run[1].result, 'not_run');
  });
});

test('output_path escaping the runs directory is not evidence', () => {
  withRunsDir((dir) => {
    const { report, downgrades } = crossCheckTests(
      baseReport([{ command: 'npm test', result: 'pass', output_path: '../../etc/hosts' }]),
      dir
    );
    assert.equal(report.tests_run[0].result, 'not_run');
    assert.match(downgrades[0].reason, /escapes/);
  });
});

test('fail and not_run claims are left untouched', () => {
  withRunsDir((dir) => {
    const { report, all_passes_evidenced } = crossCheckTests(
      baseReport([
        { command: 'npm test x', result: 'fail', output_path: '' },
        { command: 'npm test y', result: 'not_run', output_path: '' },
      ]),
      dir
    );
    assert.equal(report.tests_run[0].result, 'fail');
    assert.equal(report.tests_run[1].result, 'not_run');
    assert.equal(all_passes_evidenced, true);
  });
});

test('original report object is not mutated', () => {
  withRunsDir((dir) => {
    const original = baseReport([{ command: 'npm test', result: 'pass', output_path: 'gone.txt' }]);
    crossCheckTests(original, dir);
    assert.equal(original.tests_run[0].result, 'pass');
  });
});
