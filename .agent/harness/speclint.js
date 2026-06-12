// Deterministic TASK_SPEC lint (masterplan §2.2, brief item 2).
//
// Runs after schema validation, before any executor turn. A spec that fails
// lint never reaches execution. These are structural checks only — the
// critic's semantic spec review is a separate, model-side duty (not Chunk 0).

import { validate } from './validate.js';

// The mandatory black-path floor. Every TASK_SPEC must list each of these
// verbatim in black_paths. `.agent/**` covers RUN.log, RISK_REGISTER.json and
// all harness artifacts; the root-level entries are the in-repo control files
// (masterplan §6).
export const BLACK_PATH_FLOOR = [
  '.env*',
  'migrations/**',
  '.agent/**',
  'MASTERPLAN.md',
  'STATE.md',
  'DECISIONS.log',
  'EVIDENCE.log',
];

// Words that make a P1C pre-approval categorical rather than specific.
const CATEGORICAL_WORDS = /\b(any|all|every|misc|etc)\b/i;

// Returns { pass: boolean, violations: [{rule, detail}] }
export function lintSpec(spec) {
  const violations = [];

  const schemaResult = validate('TASK_SPEC', spec);
  if (!schemaResult.valid) {
    return {
      pass: false,
      violations: schemaResult.errors.map((e) => ({ rule: 'schema', detail: e })),
    };
  }

  // Acceptance criteria must be non-empty and non-blank (schema already
  // enforces minItems/minLength; this guards whitespace-only strings).
  if (spec.acceptance_criteria.every((c) => c.trim() === '')) {
    violations.push({
      rule: 'acceptance_criteria_empty',
      detail: 'acceptance_criteria contains no non-blank entries',
    });
  }

  // No broad globs in green paths: `**` anywhere in a green path = reject.
  for (const p of spec.green_paths) {
    if (p.includes('**')) {
      violations.push({
        rule: 'green_path_overbroad',
        detail: `green path "${p}" contains '**' — green tier must be narrow`,
      });
    }
  }

  // Black-path floor: every floor entry must be present verbatim.
  for (const required of BLACK_PATH_FLOOR) {
    if (!spec.black_paths.includes(required)) {
      violations.push({
        rule: 'black_path_floor_missing',
        detail: `black_paths missing mandatory floor entry "${required}"`,
      });
    }
  }

  // P1C pre-approvals must name specific items — categorical entries rejected.
  for (const pre of spec.p1c_preapprovals) {
    if (CATEGORICAL_WORDS.test(pre.item) || CATEGORICAL_WORDS.test(pre.exact_scope)) {
      violations.push({
        rule: 'p1c_categorical',
        detail: `p1c_preapproval "${pre.item}" is categorical — must name one specific file, dependency, or exact change`,
      });
    }
    if (pre.item.includes('*')) {
      violations.push({
        rule: 'p1c_categorical',
        detail: `p1c_preapproval "${pre.item}" contains a glob — must name one specific item`,
      });
    }
  }

  return { pass: violations.length === 0, violations };
}
