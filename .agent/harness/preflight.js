// Deterministic preflight (masterplan §2.3, brief items 6–7).
//
// Runs before every executor turn. All checks must pass or the run halts
// before the executor gets a turn. The core is a pure function over explicit
// inputs so fixtures can drive it; `gatherLiveInputs` collects the real git
// state for live runs.
//
// Chunk 0 honesty notes:
// - Env allowlist: there is no spawned executor process yet. The check
//   validates a proposed environment against the run config's allowlist —
//   anything not explicitly injected is a violation by construction.
// - No-push: the harness never invokes push and `allow_push` is hard-required
//   to be false. Process-level enforcement (stripped credentials / pushurl
//   neutralization) arrives with the real executor.

import { execFileSync } from 'node:child_process';
import { classifyPath, matchesAny } from './paths.js';
import { BLACK_PATH_FLOOR } from './speclint.js';

export const NETWORK_POLICIES = ['registry_only', 'declared', 'none'];

// input = {
//   branch: string,
//   allowedEnv: { NAME: value, ... },   // the run config's explicit allowlist
//   actualEnv: { NAME: value, ... },    // env the executor would receive
//   changedFiles: [paths relative to repo root],
//   spec: schema-valid TASK_SPEC,
//   allowPush: boolean,                 // must be false, always
// }
// Returns { pass, halts: [{check, detail}], artifact }
export function preflight(input) {
  const halts = [];
  const { branch, allowedEnv = {}, actualEnv = {}, changedFiles = [], spec, allowPush } = input;

  // 1. Branch is not main/master.
  if (!branch || ['main', 'master'].includes(branch)) {
    halts.push({
      check: 'branch',
      detail: `current branch is "${branch}" — the loop never runs on main/master`,
    });
  }

  // 2. Environment allowlist-from-empty: every var present must have been
  // explicitly injected with exactly the allowlisted value.
  const forbiddenEnv = [];
  for (const [name, value] of Object.entries(actualEnv)) {
    if (!(name in allowedEnv) || allowedEnv[name] !== value) {
      forbiddenEnv.push(name);
    }
  }
  if (forbiddenEnv.length > 0) {
    halts.push({
      check: 'env_allowlist',
      detail: `env vars present that were never injected: ${forbiddenEnv.join(', ')}`,
    });
  }

  // 3. Network policy must be a known value (default registry_only comes from
  // the spec; an unknown value is fail-closed, not fail-open).
  if (!NETWORK_POLICIES.includes(spec.network_policy)) {
    halts.push({
      check: 'network_policy',
      detail: `unknown network policy "${spec.network_policy}"`,
    });
  }

  // 4. No-push enforcement.
  if (allowPush !== false) {
    halts.push({
      check: 'no_push',
      detail: 'allow_push must be explicitly false — pushing is a human action, post-acceptance',
    });
  }

  // 5. Working-tree changes against path tiers. Black includes the mandatory
  // floor regardless of what the spec says (defense in depth vs. lint).
  const effectiveSpec = {
    ...spec,
    black_paths: [...new Set([...spec.black_paths, ...BLACK_PATH_FLOOR])],
  };
  const tierViolations = [];
  const tierMap = {};
  for (const file of changedFiles) {
    const tier = classifyPath(file, effectiveSpec);
    tierMap[file] = tier;
    if (tier === 'black') {
      tierViolations.push({ file, tier, reason: 'black-path change — immediate halt' });
    } else if (tier === 'untiered') {
      tierViolations.push({ file, tier, reason: 'file matches no declared tier — out of bounds' });
    }
  }
  if (tierViolations.length > 0) {
    halts.push({
      check: 'path_tiers',
      detail: tierViolations
        .map((v) => `${v.file} [${v.tier}]: ${v.reason}`)
        .join('; '),
    });
  }

  const artifact = {
    env_policy: 'allowlist',
    env_vars_present: Object.keys(actualEnv),
    forbidden_env_detected: forbiddenEnv,
    network_policy: spec.network_policy,
    branch,
    allow_push: allowPush === false ? false : allowPush,
    changed_files_tiers: tierMap,
    pass: halts.length === 0,
    halts,
  };

  return { pass: halts.length === 0, halts, artifact };
}

// Standalone helper the FSM also uses: is this single file a black-path?
export function isBlackPath(filePath, spec) {
  const black = [...new Set([...(spec?.black_paths ?? []), ...BLACK_PATH_FLOOR])];
  return matchesAny(filePath, black);
}

// Live collectors (impure, used outside fixture tests).
export function gatherLiveInputs(repoRoot) {
  const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim();
  const status = execFileSync('git', ['status', '--porcelain'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  const changedFiles = status
    .split('\n')
    .filter(Boolean)
    .map((line) => line.slice(3).trim().replace(/^"|"$/g, ''));
  return { branch, changedFiles };
}
