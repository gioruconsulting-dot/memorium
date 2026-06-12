import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { runFsm } from '../fsm.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures');
const CLEAN_DIFF = path.join(FIXTURES, 'diffs', 'clean-ui.diff');

const specRaw = () => readFileSync(path.join(FIXTURES, 'specs', 'valid-spec.json'), 'utf8');

const report = (overrides = {}) => ({
  summary: 'changed the empty state card',
  files_changed: ['components/EmptyStateCard.js'],
  commands_run: ['npm test'],
  tests_run: [{ command: 'npm test', result: 'pass', output_path: 'test-out.txt' }],
  failures: [],
  risks_noticed: [],
  deviations_from_plan: [],
  questions_for_critic: [],
  git_diff_path: 'diff.patch',
  ...overrides,
});

const verdict = (overrides = {}) => ({
  verdict: 'done',
  risk_flags: [],
  failure_classification: { same_root_cause: false, matches_failure_id: null, evidence: '' },
  register_updates: [],
  next_executor_prompt: null,
  state_patch_proposal: null,
  evidence: [],
  confidence: 'high',
  ...overrides,
});

function makeRun(overrides = {}) {
  const runsDir = mkdtempSync(path.join(tmpdir(), 'harness-fsm-'));
  writeFileSync(path.join(runsDir, 'test-out.txt'), '$ npm test\nall tests passed\n');
  const config = {
    runId: 'RUN-TEST',
    specRaw: specRaw(),
    runsDir,
    logPath: path.join(runsDir, 'RUN.log'),
    register: { risks: [] },
    executorTurns: [{ reportRaw: JSON.stringify(report()), diffPath: CLEAN_DIFF }],
    criticVerdictsRaw: [JSON.stringify(verdict())],
    preflightInputFor: () => ({
      branch: 'feature/x',
      allowedEnv: { NODE_ENV: 'test' },
      actualEnv: { NODE_ENV: 'test' },
      changedFiles: ['components/LibraryEmptyState.js'],
      allowPush: false,
    }),
    ...overrides,
  };
  return { config, runsDir, cleanup: () => rmSync(runsDir, { recursive: true, force: true }) };
}

test('happy path reaches DONE through all states', (t) => {
  const { config, runsDir, cleanup } = makeRun();
  t.after(cleanup);
  const result = runFsm(config);
  assert.equal(result.finalState, 'DONE', JSON.stringify(result));
  assert.deepEqual(result.history, [
    'INIT', 'SPEC_REVIEW', 'PRECHECK', 'EXECUTING', 'SCANNING', 'REVIEWING', 'COMMITTING_STATE', 'DONE',
  ]);
  // every transition is in the log
  const log = readFileSync(path.join(runsDir, 'RUN.log'), 'utf8');
  assert.ok(log.includes('"event":"run_start"'));
  assert.ok(log.includes('"final_state":"DONE"'));
});

test('continue then done loops two iterations', (t) => {
  const { config, runsDir, cleanup } = makeRun();
  t.after(cleanup);
  config.executorTurns = [
    { reportRaw: JSON.stringify(report()), diffPath: CLEAN_DIFF },
    { reportRaw: JSON.stringify(report()), diffPath: CLEAN_DIFF },
  ];
  config.criticVerdictsRaw = [
    JSON.stringify(verdict({ verdict: 'continue', next_executor_prompt: 'fix the rest' })),
    JSON.stringify(verdict()),
  ];
  const result = runFsm(config);
  assert.equal(result.finalState, 'DONE');
  assert.equal(result.history.filter((s) => s === 'PRECHECK').length, 2);
});

test('malformed CRITIC_VERDICT halts after the single repair slot (gate)', (t) => {
  const { config, runsDir, cleanup } = makeRun();
  t.after(cleanup);
  config.criticVerdictsRaw = ['{ this is not json'];
  const result = runFsm(config);
  assert.equal(result.finalState, 'HALTED_SAFE');
  assert.match(result.reason, /CRITIC_VERDICT/);
  const log = readFileSync(path.join(runsDir, 'RUN.log'), 'utf8');
  const verdictLine = log.split('\n').find((l) => l.includes('"artifact":"CRITIC_VERDICT"'));
  assert.ok(verdictLine.includes('"attempts":2'), 'repair slot consumed before halt');
});

test('overbroad spec is rejected at SPEC_REVIEW, executor never starts (gate)', (t) => {
  const { config, cleanup } = makeRun();
  t.after(cleanup);
  config.specRaw = readFileSync(path.join(FIXTURES, 'specs', 'overbroad-spec.json'), 'utf8');
  const result = runFsm(config);
  assert.equal(result.finalState, 'HALTED_SAFE');
  assert.match(result.reason, /spec lint/);
  assert.ok(!result.history.includes('PRECHECK'));
  assert.ok(!result.history.includes('EXECUTING'));
});

test('preflight failure on a later turn halts before that executor turn (ST-7 mid-run)', (t) => {
  const { config, cleanup } = makeRun();
  t.after(cleanup);
  config.executorTurns = [
    { reportRaw: JSON.stringify(report()), diffPath: CLEAN_DIFF },
    { reportRaw: JSON.stringify(report()), diffPath: CLEAN_DIFF },
  ];
  config.criticVerdictsRaw = [
    JSON.stringify(verdict({ verdict: 'continue', next_executor_prompt: 'next' })),
    JSON.stringify(verdict()),
  ];
  // branch switches to main between turn 1 and turn 2
  config.preflightInputFor = (turn) => ({
    branch: turn === 1 ? 'feature/x' : 'main',
    allowedEnv: { NODE_ENV: 'test' },
    actualEnv: { NODE_ENV: 'test' },
    changedFiles: ['components/LibraryEmptyState.js'],
    allowPush: false,
  });
  const result = runFsm(config);
  assert.equal(result.finalState, 'HALTED_SAFE');
  assert.match(result.reason, /preflight/);
  // executor ran exactly once (turn 1), never on turn 2
  assert.equal(result.history.filter((s) => s === 'EXECUTING').length, 1);
});

test('done with open P1 risk in register is rejected', (t) => {
  const { config, cleanup } = makeRun();
  t.after(cleanup);
  config.register = {
    risks: [{
      id: 'RISK-0001', type: 'security_sensitive', severity: 'P1A', status: 'open',
      introduced_at: 'RUN-PREV', introduced_by: 'scanner', resolution_evidence: [],
    }],
  };
  const result = runFsm(config);
  assert.equal(result.finalState, 'AWAITING_HUMAN');
  assert.match(result.reason, /open P0\/P1/);
});

test('iteration cap halts safely', (t) => {
  const { config, cleanup } = makeRun();
  t.after(cleanup);
  const spec = JSON.parse(specRaw());
  spec.max_iterations = 2;
  config.specRaw = JSON.stringify(spec);
  config.executorTurns = Array(2).fill({ reportRaw: JSON.stringify(report()), diffPath: CLEAN_DIFF });
  config.criticVerdictsRaw = Array(2).fill(
    JSON.stringify(verdict({ verdict: 'continue', next_executor_prompt: 'again' }))
  );
  const result = runFsm(config);
  assert.equal(result.finalState, 'HALTED_SAFE');
  assert.match(result.reason, /iteration cap/);
});
