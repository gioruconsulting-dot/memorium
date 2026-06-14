// Chunk 2 — supervised single executor turn (turn one).
//
// Runs two TASK_SPECs in one session:
//   1. an overbroad spec (green = app/**) → the spec gate must REJECT it (ST-11)
//   2. the good cleanFilename test spec → live Sonnet executor → stop at the
//      validated, cross-checked EXECUTOR_REPORT (before scanner/critic).
//
// The critic stays stubbed/off (deadline #2, clean-room packs, lands first).
// REVIEWING is never reached: stopAfter='EXECUTOR_REPORT'.

import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runFsm } from './fsm.js';
import { makeLiveExecutor } from './live-executor-turn.js';
import { buildExecutorEnv } from './executor-env.js';
import { gatherLiveInputs } from './preflight.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORKTREE = path.resolve(HERE, '../..');
const FIX = path.join(WORKTREE, '.agent', 'fixtures', 'chunk2');
const LOG = path.join(WORKTREE, '.agent', 'RUN.log');

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

// --- 1. ST-11: overbroad spec must be rejected by the spec gate ---
function runOverbroad() {
  const specRaw = readFileSync(path.join(FIX, 'task-spec-overbroad.json'), 'utf8');
  const runId = `chunk2-st11-${stamp()}`;
  const runsDir = path.join(WORKTREE, '.agent', 'runs', runId);
  mkdirSync(runsDir, { recursive: true });
  const res = runFsm({
    runId,
    specRaw,
    runsDir,
    logPath: LOG,
    register: { risks: [] },
    preflightInputFor: () => ({}), // never reached — lint halts first
  });
  const pass = res.finalState === 'HALTED_SAFE' && /spec lint/i.test(res.reason);
  return { res, pass };
}

// --- 2. Good spec: live executor turn, stop at EXECUTOR_REPORT ---
function runGood() {
  const spec = JSON.parse(readFileSync(path.join(FIX, 'task-spec-good.json'), 'utf8'));
  const testFile = spec.green_paths[0];

  // Refuse to run if the executor's target file already exists — a leftover from
  // a prior run would make the baseline-delta capture nothing. Don't auto-delete.
  if (existsSync(path.join(WORKTREE, testFile))) {
    throw new Error(
      `${testFile} already exists in the worktree — remove it before re-running so the turn starts clean`
    );
  }

  const live = gatherLiveInputs(WORKTREE);
  // Guard: no pre-existing APP-tree changes (outside .agent and package-lock).
  const appDirty = live.changedFiles.filter(
    (f) => !f.startsWith('.agent/') && f !== 'package-lock.json'
  );
  if (appDirty.length > 0) {
    throw new Error(`app-tree not clean before the turn: ${appDirty.join(', ')}`);
  }

  const runId = `chunk2-turn1-${stamp()}`;
  const runsDir = path.join(WORKTREE, '.agent', 'runs', runId);
  mkdirSync(runsDir, { recursive: true });
  const builtEnv = buildExecutorEnv({ parentEnv: process.env }).env;

  const res = runFsm({
    runId,
    specRaw: JSON.stringify(spec),
    runsDir,
    logPath: LOG,
    register: { risks: [] },
    executor: makeLiveExecutor({ spec, runsDir, worktree: WORKTREE }),
    stopAfter: 'EXECUTOR_REPORT',
    preflightInputFor: () => ({
      branch: live.branch, // agentic-harness (not main)
      allowedEnv: builtEnv,
      actualEnv: builtEnv, // executor changes don't exist yet at PRECHECK
      changedFiles: [],
      allowPush: false,
    }),
  });
  return { res, runsDir };
}

function main() {
  console.log('\n========================================');
  console.log('CHUNK 2 — turn one (supervised single turn)');
  console.log('========================================');

  console.log('\n--- ST-11: overbroad spec (green=app/**) must be REJECTED ---');
  const st11 = runOverbroad();
  console.log(`  finalState: ${st11.res.finalState}`);
  console.log(`  reason:     ${st11.res.reason}`);
  console.log(`  [${st11.pass ? 'PASS' : 'FAIL'}] spec gate ${st11.pass ? 'rejected the overbroad spec' : 'did NOT reject as expected'}`);

  console.log('\n--- Turn one: good spec, live Sonnet executor, stop at EXECUTOR_REPORT ---');
  const { res, runsDir } = runGood();
  console.log(`  finalState: ${res.finalState}`);
  console.log(`  reason:     ${res.reason}`);

  const cvt = JSON.parse(readFileSync(path.join(runsDir, 'claim-vs-truth.json'), 'utf8'));
  console.log('\n  CLAIM-vs-TRUTH (the two checks Gio asked for):');
  console.log(`    boundary held (only the test file changed): ${cvt.boundary_held_only_test_file}`);
  console.log(`    files changed (harness-measured):           ${JSON.stringify(cvt.harness_measured_files_changed)}`);
  console.log(`    tier classification:                        ${JSON.stringify(cvt.tier_classification)}`);
  console.log(`    executor claimed test result:               ${cvt.executor_claimed_test_result}`);
  console.log(`    harness measured test result:               ${cvt.harness_measured_test_result}`);
  console.log(`    claim matches truth:                        ${cvt.test_result_match}`);
  console.log(`    executor cost (usd):                        ${cvt.cost_usd}`);

  console.log(`\n  artifacts: ${path.relative(WORKTREE, runsDir)}`);
  console.log('    - executor.diff          (canonical diff, harness-computed)');
  console.log('    - test-output.txt        (harness re-run of node --test)');
  console.log('    - claim-vs-truth.json    (executor claim vs harness ground truth)');
  console.log('    - executor-raw-output.txt(the executor\'s raw final output)');
  console.log('');
}

main();
