// Risk register validator + STATE_PATCH reconciliation
// (masterplan §2.9, §3.4; brief item 10).
//
// The critic proposes; only the orchestrator commits, and only through these
// checks. The load-bearing rules:
//   - risks are NEVER deleted — they only change status
//   - risk IDs are stable; a rename/merge without ID continuity is a rejection
//   - P0/P1* status changes require linked resolution evidence
//   - STATE_PATCH.open_risk_ids must exactly mirror the register's open set

import { validate } from './validate.js';

const P_HIGH = new Set(['P0', 'P1A', 'P1B', 'P1C']);
const TERMINAL = new Set(['resolved', 'accepted', 'false_positive']);
// Fields that may never change once a risk exists.
const IMMUTABLE_FIELDS = ['type', 'severity', 'introduced_at', 'introduced_by'];

// Validate a proposed full register against the current one.
// Returns { valid, violations: [{rule, id, detail}] }
export function validateRegisterTransition(current, proposed) {
  const violations = [];

  for (const [label, reg] of [['current', current], ['proposed', proposed]]) {
    const { valid, errors } = validate('RISK_REGISTER', reg);
    if (!valid) {
      violations.push({ rule: 'schema', id: null, detail: `${label} register invalid: ${errors.join('; ')}` });
    }
  }
  if (violations.length > 0) return { valid: false, violations };

  const currentById = new Map(current.risks.map((r) => [r.id, r]));
  const proposedById = new Map(proposed.risks.map((r) => [r.id, r]));

  if (proposedById.size !== proposed.risks.length) {
    violations.push({ rule: 'duplicate_id', id: null, detail: 'proposed register contains duplicate risk ids' });
  }

  // Never-delete + ID continuity: every existing id must survive.
  for (const [id] of currentById) {
    if (!proposedById.has(id)) {
      violations.push({
        rule: 'risk_deleted',
        id,
        detail: `${id} is missing from the proposed register — risks are never deleted, only change status. A rename or merge must keep the original id.`,
      });
    }
  }

  for (const [id, next] of proposedById) {
    const prev = currentById.get(id);

    if (!prev) {
      // New risk: must enter as open.
      if (next.status !== 'open') {
        violations.push({
          rule: 'new_risk_not_open',
          id,
          detail: `${id} is new but enters with status "${next.status}" — new risks start open`,
        });
      }
      continue;
    }

    for (const field of IMMUTABLE_FIELDS) {
      if (prev[field] !== next[field]) {
        violations.push({
          rule: 'immutable_field_changed',
          id,
          detail: `${id}.${field} changed from "${prev[field]}" to "${next[field]}" — only status and resolution_evidence may change`,
        });
      }
    }

    if (prev.status !== next.status) {
      if (TERMINAL.has(prev.status)) {
        violations.push({
          rule: 'terminal_status_changed',
          id,
          detail: `${id} status changed from terminal "${prev.status}" to "${next.status}" — terminal statuses are final; a recurrence is a new risk`,
        });
      } else if (!TERMINAL.has(next.status)) {
        violations.push({
          rule: 'invalid_transition',
          id,
          detail: `${id} status changed "${prev.status}" → "${next.status}" — only open → resolved|accepted|false_positive is allowed`,
        });
      }

      // P0/P1* leaving open requires evidence.
      if (P_HIGH.has(prev.severity) && !TERMINAL.has(prev.status)) {
        const evidence = next.resolution_evidence ?? [];
        if (evidence.length === 0) {
          violations.push({
            rule: 'p0_p1_no_evidence',
            id,
            detail: `${id} is ${prev.severity} and its status change carries no resolution_evidence`,
          });
        }
      }
    }
  }

  return { valid: violations.length === 0, violations };
}

// Apply schema-valid CRITIC_VERDICT.register_updates to a register, purely.
// Produces the proposed register that validateRegisterTransition then judges.
// Malformed updates throw — the FSM treats that as a validation failure.
export function applyRegisterUpdates(current, updates, introducedAt) {
  const next = { risks: current.risks.map((r) => ({ ...r })) };
  const byId = new Map(next.risks.map((r) => [r.id, r]));

  for (const update of updates) {
    if (update.action === 'create') {
      if (byId.has(update.id)) {
        throw new Error(`register update creates ${update.id} which already exists`);
      }
      const risk = {
        id: update.id,
        type: update.type,
        severity: update.severity,
        status: update.status ?? 'open',
        introduced_at: introducedAt,
        introduced_by: update.introduced_by ?? 'critic',
        resolution_evidence: update.resolution_evidence ?? [],
      };
      next.risks.push(risk);
      byId.set(risk.id, risk);
    } else if (update.action === 'update_status') {
      const risk = byId.get(update.id);
      if (!risk) {
        throw new Error(`register update targets unknown risk ${update.id}`);
      }
      risk.status = update.status;
      if (update.resolution_evidence?.length) {
        risk.resolution_evidence = [...risk.resolution_evidence, ...update.resolution_evidence];
      }
    } else {
      throw new Error(`unknown register update action "${update.action}"`);
    }
  }
  return next;
}

// STATE_PATCH reconciliation: open_risk_ids must be exactly the register's
// open set. An open risk missing from the patch (ST-3) or a phantom id both
// reject the patch.
export function reconcileStatePatch(patch, register) {
  const violations = [];

  const { valid, errors } = validate('STATE_PATCH', patch);
  if (!valid) {
    return {
      valid: false,
      violations: errors.map((e) => ({ rule: 'schema', id: null, detail: e })),
    };
  }

  const openInRegister = new Set(
    register.risks.filter((r) => r.status === 'open').map((r) => r.id)
  );
  const inPatch = new Set(patch.open_risk_ids);

  for (const id of openInRegister) {
    if (!inPatch.has(id)) {
      violations.push({
        rule: 'open_risk_omitted',
        id,
        detail: `${id} is open in the register but missing from STATE_PATCH.open_risk_ids — open risks cannot vanish`,
      });
    }
  }
  for (const id of inPatch) {
    if (!openInRegister.has(id)) {
      violations.push({
        rule: 'unknown_open_risk',
        id,
        detail: `${id} appears in STATE_PATCH.open_risk_ids but is not an open risk in the register`,
      });
    }
  }

  return { valid: violations.length === 0, violations };
}
