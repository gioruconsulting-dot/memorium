// Orchestrator FSM skeleton (masterplan §2.1; brief item 1).
//
// States: INIT → SPEC_REVIEW → PRECHECK → EXECUTING → SCANNING → REVIEWING
//         → [AWAITING_HUMAN] → COMMITTING_STATE → (next | DONE | HALTED_SAFE)
//
// Chunk 0: the model-calling states (EXECUTING, REVIEWING) are stubs fed by
// fixtures via config. AWAITING_HUMAN is terminal in Chunk 0 — there is no
// router yet; reaching it halts the run with the escalation logged. Manual
// resume only. Any unexpected condition → HALTED_SAFE, never silent
// continuation. Every transition is logged to RUN.log.

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { validateFailClosed, stubRepair } from './validate.js';
import { lintSpec } from './speclint.js';
import { preflight } from './preflight.js';
import { scan, highestSeverity } from './scanner.js';
import { crossCheckTests } from './crosscheck.js';
import { evaluateBreaker } from './breaker.js';
import {
  applyRegisterUpdates,
  validateRegisterTransition,
  reconcileStatePatch,
} from './register.js';
import { createRunLog } from './runlog.js';

export const STATES = [
  'INIT',
  'SPEC_REVIEW',
  'PRECHECK',
  'EXECUTING',
  'SCANNING',
  'REVIEWING',
  'AWAITING_HUMAN',
  'COMMITTING_STATE',
  'DONE',
  'HALTED_SAFE',
];

const LIVE_SEVERITIES = new Set(['P0', 'P1A', 'P1B']);

// config = {
//   runId: string,
//   specRaw: string (raw TASK_SPEC JSON text),
//   runsDir: string,
//   logPath: string,
//   register: RISK_REGISTER object (starting state),
//   // Chunk 0 fixture feeds (replace model calls):
//   executorTurns: [{ reportRaw: string, diffPath: string }],
//   criticVerdictsRaw: [string],
//   // per-turn preflight inputs; function (turnNumber) → input fields,
//   // so fixtures can simulate a mid-run branch switch (ST-7)
//   preflightInputFor: (turn) => ({ branch, allowedEnv, actualEnv, changedFiles, allowPush }),
//   // Chunk 2: live executor injection. When present, EXECUTING calls this
//   // instead of reading a fixture: (turn) => { reportRaw, diffPath, ... }.
//   executor: (turn) => ({ reportRaw, diffPath }),
//   // Chunk 2: live critic injection. When present, REVIEWING calls this
//   // instead of reading a fixture: (ctx) => rawVerdictText.
//   critic: ({ turn, report, scanReport, scanPath, diffPath, spec, register, runsDir }) => rawVerdict,
//   // Chunk 2: deliberate stop point. 'EXECUTOR_REPORT' returns a clean
//   // HALTED_SAFE after the report validates + cross-checks, before SCANNING.
//   stopAfter: 'EXECUTOR_REPORT' | undefined,
// }
export function runFsm(config) {
  const {
    runId,
    specRaw,
    runsDir,
    logPath,
    register: initialRegister,
    executorTurns = [],
    criticVerdictsRaw = [],
    preflightInputFor,
    executor,
    critic,
    stopAfter,
    repairFn = stubRepair,
  } = config;

  mkdirSync(runsDir, { recursive: true });
  const log = createRunLog(runId, logPath);
  const history = [];
  let state = 'INIT';
  let register = initialRegister ?? { risks: [] };
  const failureTurns = [];

  const transition = (to, detail = {}) => {
    log.append('fsm_transition', { from: state, to, ...detail });
    history.push(to);
    state = to;
  };

  const halt = (reason, detail = {}) => {
    log.append('halt', { reason, state_at_halt: state, ...detail });
    transition('HALTED_SAFE', { reason });
    log.append('run_end', { final_state: 'HALTED_SAFE', reason });
    return { finalState: 'HALTED_SAFE', reason, history, register };
  };

  const escalate = (reason, detail = {}) => {
    transition('AWAITING_HUMAN', { reason, ...detail });
    // Chunk 0: no router exists. AWAITING_HUMAN is terminal; a human reads
    // RUN.log and resumes manually.
    log.append('halt', {
      reason: `escalated to human: ${reason}`,
      state_at_halt: 'AWAITING_HUMAN',
      ...detail,
    });
    log.append('run_end', { final_state: 'AWAITING_HUMAN', reason });
    return { finalState: 'AWAITING_HUMAN', reason, history, register };
  };

  log.append('run_start', { run_id: runId });
  history.push('INIT');

  // --- INIT: load and validate the TASK_SPEC (fail-closed) ---
  const specResult = validateFailClosed('TASK_SPEC', specRaw);
  log.append('validation_result', {
    artifact: 'TASK_SPEC',
    ok: specResult.ok,
    attempts: specResult.attempts,
    errors: specResult.errors,
  });
  if (!specResult.ok) {
    return halt('TASK_SPEC failed fail-closed validation', { errors: specResult.errors });
  }
  const spec = specResult.data;

  // --- SPEC_REVIEW: deterministic lint (critic spec review is a stub) ---
  transition('SPEC_REVIEW');
  const lint = lintSpec(spec);
  log.append('spec_lint_result', { pass: lint.pass, violations: lint.violations });
  if (!lint.pass) {
    return halt('spec lint rejected the TASK_SPEC', { violations: lint.violations });
  }
  log.append('validation_result', {
    artifact: 'critic_spec_review',
    ok: true,
    stubbed: true,
    note: 'Chunk 0: critic spec review is a stub; deterministic lint only',
  });

  // --- iteration loop ---
  const maxIterations = spec.max_iterations;
  for (let turn = 1; turn <= maxIterations; turn++) {
    // PRECHECK (every executor turn)
    transition('PRECHECK', { turn });
    const pfInput = { ...preflightInputFor(turn), spec };
    const pf = preflight(pfInput);
    const artifactPath = path.join(runsDir, `preflight-turn-${turn}.json`);
    writeFileSync(artifactPath, JSON.stringify(pf.artifact, null, 2));
    log.append('preflight_result', { turn, pass: pf.pass, halts: pf.halts, artifact: artifactPath });
    if (!pf.pass) {
      return halt('preflight failed — executor never starts this turn', { turn, halts: pf.halts });
    }

    // EXECUTING (live executor if injected, else fixture-fed)
    const liveExecutor = typeof executor === 'function';
    transition('EXECUTING', { turn, stubbed: !liveExecutor, live: liveExecutor });
    let turnArtifact;
    if (liveExecutor) {
      turnArtifact = executor(turn);
      log.append('executor_turn', {
        turn,
        live: true,
        diff_path: turnArtifact.diffPath,
        claim_vs_truth: turnArtifact.claimVsTruth ?? null,
      });
    } else {
      turnArtifact = executorTurns[turn - 1];
      if (!turnArtifact) {
        return halt('no executor fixture for this turn — model states are stubs in Chunk 0', { turn });
      }
    }
    const reportResult = validateFailClosed('EXECUTOR_REPORT', turnArtifact.reportRaw, repairFn);
    log.append('validation_result', {
      artifact: 'EXECUTOR_REPORT',
      turn,
      ok: reportResult.ok,
      attempts: reportResult.attempts,
      errors: reportResult.errors,
    });
    if (!reportResult.ok) {
      return halt('EXECUTOR_REPORT failed fail-closed validation', { turn, errors: reportResult.errors });
    }

    // Test-evidence cross-check
    const { report, downgrades, all_passes_evidenced } = crossCheckTests(
      reportResult.data,
      runsDir
    );
    log.append('evidence_crosscheck', { turn, downgrades, all_passes_evidenced });

    // Doom-loop breaker over accumulated failures
    failureTurns.push({ turn, failures: report.failures });
    const breaker = evaluateBreaker(failureTurns, spec.max_failures);
    log.append('breaker_result', {
      turn,
      escalate: breaker.escalate,
      reasons: breaker.reasons,
      failed_turn_count: breaker.failed_turn_count,
    });
    if (breaker.escalate) {
      return escalate('doom-loop breaker fired', { turn, reasons: breaker.reasons });
    }

    // Chunk 2 deliberate stop: report validated + cross-checked, halt before the
    // scanner/critic so the human inspects the executor artifact on its own.
    if (stopAfter === 'EXECUTOR_REPORT') {
      log.append('run_end', {
        final_state: 'HALTED_SAFE',
        reason: 'deliberate stop after executor turn (Chunk 2 turn one)',
        turn,
        all_passes_evidenced,
        downgrades,
      });
      transition('HALTED_SAFE', { reason: 'stop_after_executor' });
      return {
        finalState: 'HALTED_SAFE',
        reason: 'deliberate stop after executor turn',
        history,
        register,
        report,
      };
    }

    // SCANNING
    transition('SCANNING', { turn });
    const scanReport = scan(turnArtifact.diffPath);
    const scanPath = path.join(runsDir, `scanner-turn-${turn}.json`);
    writeFileSync(scanPath, JSON.stringify(scanReport, null, 2));
    const topSeverity = highestSeverity(scanReport);
    log.append('scanner_result', {
      turn,
      hits: scanReport.hits.length,
      top_severity: topSeverity,
      scanner_confidence: scanReport.scanner_confidence,
      semantic_review_required: scanReport.semantic_review_required,
      report: scanPath,
    });
    const scannerForcesHuman = topSeverity !== null && LIVE_SEVERITIES.has(topSeverity);

    // REVIEWING (live critic if injected, else fixture-fed)
    const liveCritic = typeof critic === 'function';
    transition('REVIEWING', { turn, stubbed: !liveCritic, live: liveCritic });
    let verdictRaw;
    if (liveCritic) {
      verdictRaw = critic({
        turn,
        report,
        scanReport,
        scanPath,
        diffPath: turnArtifact.diffPath,
        spec,
        register,
        runsDir,
      });
      log.append('critic_turn', { turn, live: true });
    } else {
      verdictRaw = criticVerdictsRaw[turn - 1];
      if (verdictRaw === undefined) {
        return halt('no critic fixture for this turn — model states are stubs in Chunk 0', { turn });
      }
    }
    const verdictResult = validateFailClosed('CRITIC_VERDICT', verdictRaw, repairFn);
    log.append('validation_result', {
      artifact: 'CRITIC_VERDICT',
      turn,
      ok: verdictResult.ok,
      attempts: verdictResult.attempts,
      errors: verdictResult.errors,
    });
    if (!verdictResult.ok) {
      return halt('CRITIC_VERDICT failed fail-closed validation — verdict is never inferred', {
        turn,
        errors: verdictResult.errors,
      });
    }
    const verdict = verdictResult.data;

    // Scanner P0/P1 cannot be cleared by the critic alone.
    if (scannerForcesHuman) {
      return escalate(`scanner flagged ${topSeverity} — human route regardless of critic verdict`, {
        turn,
        critic_verdict: verdict.verdict,
        scanner_report: scanPath,
      });
    }

    // COMMITTING_STATE: register updates + state patch, deterministic gates.
    transition('COMMITTING_STATE', { turn });
    let proposedRegister;
    try {
      proposedRegister = applyRegisterUpdates(register, verdict.register_updates, runId);
    } catch (err) {
      return halt('register updates could not be applied', { turn, error: err.message });
    }
    const regCheck = validateRegisterTransition(register, proposedRegister);
    log.append('register_validation', { turn, valid: regCheck.valid, violations: regCheck.violations });
    if (!regCheck.valid) {
      return halt('register transition rejected', { turn, violations: regCheck.violations });
    }

    if (verdict.state_patch_proposal !== null) {
      const patchCheck = reconcileStatePatch(verdict.state_patch_proposal, proposedRegister);
      log.append('register_validation', {
        turn,
        artifact: 'STATE_PATCH',
        valid: patchCheck.valid,
        violations: patchCheck.violations,
      });
      if (!patchCheck.valid) {
        return halt('STATE_PATCH rejected — open risks cannot vanish', {
          turn,
          violations: patchCheck.violations,
        });
      }
    }

    register = proposedRegister;
    writeFileSync(path.join(runsDir, 'RISK_REGISTER.json'), JSON.stringify(register, null, 2));

    // Route on verdict.
    if (verdict.verdict === 'escalate') {
      return escalate('critic verdict: escalate', { turn, risk_flags: verdict.risk_flags });
    }
    if (verdict.verdict === 'done') {
      const unevidenced = report.tests_run.filter((t) => t.result !== 'pass');
      if (!all_passes_evidenced || unevidenced.length > 0) {
        return escalate('done rejected: test claims lack evidence', {
          turn,
          downgrades,
          non_passing: unevidenced.map((t) => ({ command: t.command, result: t.result })),
        });
      }
      const openHigh = register.risks.filter(
        (r) => r.status === 'open' && ['P0', 'P1A', 'P1B', 'P1C'].includes(r.severity)
      );
      if (openHigh.length > 0) {
        return escalate('done rejected: open P0/P1 risks in the register', {
          turn,
          open: openHigh.map((r) => r.id),
        });
      }
      transition('DONE', { turn });
      log.append('run_end', { final_state: 'DONE', turn });
      return { finalState: 'DONE', reason: 'critic verdict done, checks passed', history, register, report, downgrades };
    }
    // verdict === 'continue' → next iteration
    log.append('fsm_transition', { from: state, to: 'PRECHECK', note: 'next iteration', turn });
  }

  return halt(`iteration cap reached (max_iterations=${spec.max_iterations}) without done`);
}
