// Live executor turn (Chunk 2, turn one). Replaces the EXECUTING fixture with a
// real Sonnet executor session behind the locked env (deadline #1), then has the
// DETERMINISTIC layer establish ground truth:
//   - the canonical git diff (harness-computed, not the executor's claim)
//   - the test result (harness re-runs node --test, not the executor's claim)
//   - the path-tier classification of every changed file (enforces no-touch)
//
// The executor's self-report is demoted to a CLAIM and compared against the
// harness's measured truth (claim-vs-truth). This applies "models propose,
// deterministic systems dispose" one notch more strictly than masterplan §3.2
// originally had it (where the executor tees its own evidence) — necessary here
// because evidence must live under .agent/runs/** which is black-path to the
// executor (§2.4). Captured as a proposed learning in the turn runner.

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildExecutorEnv } from './executor-env.js';
import { invokeExecutor } from './executor.js';
import { validateFailClosed } from './validate.js';
import { liveRepairHaiku } from './repair.js';
import { classifyPath } from './paths.js';
import { BLACK_PATH_FLOOR } from './speclint.js';

const EXECUTOR_SYSTEM_PROMPT = [
  'You are the executor in a supervised, single-turn build loop.',
  'Do ONLY the requested chunk. Do not opportunistically refactor. Do not add dependencies.',
  'Do not touch auth, schema, migrations, sacred tables, or environment config.',
  'You may READ any file to understand behavior, but you may only CREATE/EDIT the file(s)',
  'explicitly listed as writable. Never edit the function under test.',
  'If blocked, stop and report — do not improvise.',
].join(' ');

function composePrompt(spec) {
  const testFile = spec.green_paths[0];
  return [
    `OBJECTIVE: ${spec.objective}`,
    '',
    'ACCEPTANCE CRITERIA:',
    ...spec.acceptance_criteria.map((c, i) => `  ${i + 1}. ${c}`),
    '',
    `WRITABLE FILE (the only path you may create or edit): ${testFile}`,
    'NO-TOUCH: do not modify the function under test or any other file.',
    'Use Node\'s built-in test runner (import { test } from "node:test"; import assert from "node:assert/strict").',
    'After writing the test, run it once with: node --test ' + testFile,
    '',
    'CRITICAL OUTPUT RULE: your ENTIRE response is parsed as a single JSON object.',
    'The FIRST character must be "{" and the LAST character must be "}". No preamble',
    '(not even "All tests pass."), no trailing commentary, no markdown fences — JSON only.',
    'Conform to this EXECUTOR_REPORT shape:',
    '{',
    '  "summary": "<what you did>",',
    '  "files_changed": ["<paths you created/edited>"],',
    '  "commands_run": ["<commands you ran>"],',
    '  "tests_run": [{"command": "node --test ' + testFile + '", "result": "pass|fail|not_run", "output_path": ""}],',
    '  "failures": [],',
    '  "risks_noticed": [],',
    '  "deviations_from_plan": [],',
    '  "questions_for_critic": [],',
    '  "git_diff_path": "pending"',
    '}',
    'Set output_path to "" — you cannot write under .agent/; the harness records the canonical evidence itself.',
    'Set git_diff_path to "pending" — the harness computes the canonical diff itself.',
    'Report tests_run.result honestly as what you observed when you ran the test.',
  ].join('\n');
}

function git(worktree, args) {
  try {
    return { ok: true, out: execFileSync('git', args, { cwd: worktree, encoding: 'utf8' }) };
  } catch (err) {
    return { ok: false, out: `${err.stdout || ''}${err.stderr || ''}` };
  }
}

function changedFilesFrom(worktree) {
  const { out } = git(worktree, ['status', '--porcelain']);
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => line.slice(3).trim().replace(/^"|"$/g, ''));
}

// Patch scoped to exactly the given paths, including new (untracked) ones:
// intent-to-add, diff, then undo the intent-to-add so the index is restored.
// Scoping to the executor's delta keeps pre-existing changes (package-lock.json,
// the .agent harness scaffolding) out of the artifact. Touches only this sandbox.
function scopedDiff(worktree, paths) {
  if (paths.length === 0) return '';
  git(worktree, ['add', '-N', '--', ...paths]);
  const { out } = git(worktree, ['diff', '--', ...paths]);
  git(worktree, ['reset', '-q', '--', ...paths]);
  return out;
}

// Build the live-executor function the FSM injects as config.executor.
export function makeLiveExecutor({ spec, runsDir, worktree, model = 'claude-sonnet-4-6', budgetUsd = 2.0 }) {
  return function liveExecutorTurn() {
    const testFile = spec.green_paths[0];
    const testCmd = `node --test ${testFile}`;
    const diffPath = path.join(runsDir, 'executor.diff');

    // Baseline: changes that already exist before the executor runs (npm's
    // package-lock.json edit, the .agent harness scaffolding). The executor's
    // contribution is everything that appears AFTER this snapshot.
    const baseline = new Set(changedFilesFrom(worktree));

    // 1. Run the executor behind the locked env (real parent env; the allowlist
    //    strips any secrets — proven by deadline #1).
    const built = buildExecutorEnv({ parentEnv: process.env });
    const r = invokeExecutor({
      prompt: composePrompt(spec),
      systemPrompt: EXECUTOR_SYSTEM_PROMPT,
      cwd: worktree,
      env: built.env,
      model,
      budgetUsd,
      tools: 'Read Write Edit Bash Grep Glob',
      allowedTools: 'Read Write Edit Bash',
    });
    writeFileSync(path.join(runsDir, 'executor-raw-output.txt'), r.resultText || '');

    // 2. GROUND TRUTH — computed by the harness regardless of what the executor
    //    claimed. The executor's contribution = post-state minus baseline.
    const changedFiles = changedFilesFrom(worktree).filter((f) => !baseline.has(f));
    writeFileSync(diffPath, scopedDiff(worktree, changedFiles));

    // post-turn path-tier check (enforces the no-touch boundary deterministically)
    const effectiveSpec = {
      ...spec,
      black_paths: [...new Set([...spec.black_paths, ...BLACK_PATH_FLOOR])],
    };
    const tierMap = {};
    for (const f of changedFiles) tierMap[f] = classifyPath(f, effectiveSpec);
    const offending = Object.entries(tierMap).filter(([, t]) => t === 'black' || t === 'untiered');
    const onlyTestFile = changedFiles.length === 1 && changedFiles[0] === testFile;
    const boundaryHeld = offending.length === 0 && onlyTestFile;

    // re-run the test as ground truth
    let measured = 'not_run';
    let testOut = '';
    try {
      testOut = execFileSync('node', ['--test', testFile], { cwd: worktree, encoding: 'utf8' });
      measured = 'pass';
    } catch (err) {
      testOut = `${err.stdout || ''}\n${err.stderr || ''}`;
      measured = /cannot find|no test files|Cannot find module/i.test(testOut) ? 'not_run' : 'fail';
    }
    const evidenceRel = 'test-output.txt';
    writeFileSync(path.join(runsDir, evidenceRel), `${testCmd}\n\n${testOut}`);

    // 3. Validate the executor's self-report (repair-once-then-halt, §3.8). Repair
    //    only reformats (e.g. strips a prose preamble around valid JSON); a
    //    genuinely broken report still fails validation and halts. A repaired
    //    report's claims are overwritten by harness ground truth below regardless.
    const validated = validateFailClosed('EXECUTOR_REPORT', r.resultText || '', liveRepairHaiku);

    // claim-vs-truth comparison (what Gio inspects)
    const execClaimEntry = validated.ok
      ? validated.data.tests_run.find((t) => t.command.includes('--test')) || validated.data.tests_run[0]
      : null;
    const claimVsTruth = {
      report_well_formed: validated.ok,
      executor_claimed_test_result: execClaimEntry ? execClaimEntry.result : '(no valid report)',
      harness_measured_test_result: measured,
      test_result_match: execClaimEntry ? execClaimEntry.result === measured : false,
      executor_claimed_files_changed: validated.ok ? validated.data.files_changed : '(no valid report)',
      harness_measured_files_changed: changedFiles,
      tier_classification: tierMap,
      boundary_held_only_test_file: boundaryHeld,
      offending_paths: offending.map(([f, t]) => ({ file: f, tier: t })),
      cost_usd: r.costUsd,
    };
    writeFileSync(path.join(runsDir, 'claim-vs-truth.json'), JSON.stringify(claimVsTruth, null, 2));

    // 4. Canonical report = executor narrative + harness ground truth. If the
    //    executor report was malformed, pass the raw text through so the FSM's
    //    own validateFailClosed halts the run (fail-closed re-confirmation).
    if (!validated.ok) {
      return { reportRaw: r.resultText || '', diffPath, claimVsTruth, malformed: true };
    }
    const canonical = {
      ...validated.data,
      files_changed: changedFiles,
      git_diff_path: 'executor.diff',
      tests_run: [{ command: testCmd, result: measured, output_path: evidenceRel }],
    };
    writeFileSync(path.join(runsDir, 'executor_report.json'), JSON.stringify(canonical, null, 2));
    return { reportRaw: JSON.stringify(canonical), diffPath, claimVsTruth, malformed: false };
  };
}
