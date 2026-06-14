// Learning-loop plumbing (masterplan §2.12 / §3.7). Build-only in Chunk 2:
// schema + harvest prompt + FINAL_REVIEW section + the direction-asymmetry
// validator. No live cycle here — first harvest→challenge→apply is Chunk 3.
//
// The validator makes "loosening = higher bar" MECHANICAL, not documentary: a
// rule the system can quietly forget is not a rule.

import { readFileSync } from 'node:fs';
import { validate } from './validate.js';

export function loadLearnings(registerPath) {
  return JSON.parse(readFileSync(registerPath, 'utf8'));
}

// Append a proposed learning (harvest application). Status is forced to
// 'proposed' — harvest never approves or applies.
export function proposeLearning(register, entry) {
  const proposed = { ...entry, status: 'proposed' };
  const next = { ...register, learnings: [...register.learnings, proposed] };
  const { valid, errors } = validate('LEARNINGS_REGISTER', next);
  if (!valid) throw new Error(`proposed learning is schema-invalid: ${errors.join('; ')}`);
  return next;
}

// FINAL_REVIEW "Proposed learnings" section (masterplan §3.6). Informative —
// NEVER blocks acceptance. At most 5, ranked by array order (harvest ranks them).
export function renderProposedLearningsSection(register, { max = 5 } = {}) {
  const proposed = register.learnings.filter((l) => l.status === 'proposed').slice(0, max);
  const lines = ['## Proposed learnings', '', '_Informative only — these never block acceptance._', ''];
  if (proposed.length === 0) {
    lines.push('_No learnings proposed this task._');
    return lines.join('\n');
  }
  for (const l of proposed) {
    lines.push(`- **${l.id}** [${l.type} · ${l.direction}] — ${l.proposal}`);
    lines.push(`  - target artifact: \`${l.target_artifact}\``);
    lines.push(`  - evidence: ${l.evidence.map((e) => `\`${e}\``).join(', ')}`);
    if (l.note) lines.push(`  - note: ${l.note}`);
    if (l.direction === 'loosening') {
      lines.push('  - ⚠️ LOOSENING — P1B-equivalent: live human, ≥2-run evidence, never batched.');
    }
  }
  return lines.join('\n');
}

const TERMINAL = new Set(['rejected', 'applied']);

// Direction-asymmetry + never-delete validator (masterplan §2.9 mirror, §line-222).
// Enforces that a register transition is legal:
//   - schema-valid
//   - NEVER delete: every prior learning id is still present (status-only change)
//   - id continuity: no id renamed/merged away
//   - LOOSENING higher bar: a loosening learning moving to approved/applied
//     requires decision_ref AND >= 2 independent evidence refs, never batched
//     with another same-transition loosening in the same step.
// Returns { valid, violations: [{rule, detail}] }.
export function validateLearningTransition(before, after) {
  const violations = [];

  const schema = validate('LEARNINGS_REGISTER', after);
  if (!schema.valid) {
    return { valid: false, violations: schema.errors.map((e) => ({ rule: 'schema', detail: e })) };
  }

  const beforeById = new Map(before.learnings.map((l) => [l.id, l]));
  const afterById = new Map(after.learnings.map((l) => [l.id, l]));

  // never-delete + id continuity
  for (const id of beforeById.keys()) {
    if (!afterById.has(id)) {
      violations.push({ rule: 'never_delete', detail: `learning ${id} vanished — learnings only change status` });
    }
  }

  // loosening higher bar, on this step's transitions to approved/applied
  let loosenedThisStep = 0;
  for (const [id, after_] of afterById) {
    const before_ = beforeById.get(id);
    const movedToDecision =
      (!before_ && TERMINAL_OR_APPROVED(after_.status)) ||
      (before_ && before_.status !== after_.status && TERMINAL_OR_APPROVED(after_.status));
    if (after_.direction === 'loosening' && movedToDecision && after_.status !== 'rejected') {
      loosenedThisStep += 1;
      if (!after_.decision_ref) {
        violations.push({ rule: 'loosening_needs_decision_ref', detail: `${id}: loosening approval requires a DECISIONS.log decision_ref` });
      }
      if (!Array.isArray(after_.evidence) || after_.evidence.length < 2) {
        violations.push({ rule: 'loosening_needs_two_runs', detail: `${id}: loosening requires evidence from >= 2 independent runs` });
      }
    }
  }
  if (loosenedThisStep > 1) {
    violations.push({ rule: 'loosening_never_batched', detail: `${loosenedThisStep} loosening learnings approved in one step — loosenings are never batched` });
  }

  return { valid: violations.length === 0, violations };
}

function TERMINAL_OR_APPROVED(status) {
  return status === 'approved' || TERMINAL.has(status);
}
