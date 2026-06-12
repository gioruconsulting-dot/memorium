import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateRegisterTransition,
  applyRegisterUpdates,
  reconcileStatePatch,
} from '../register.js';

const risk = (id, overrides = {}) => ({
  id,
  type: 'security_sensitive',
  severity: 'P1A',
  status: 'open',
  introduced_at: 'RUN-001',
  introduced_by: 'scanner',
  resolution_evidence: [],
  ...overrides,
});

const reg = (...risks) => ({ risks });

test('identical registers pass', () => {
  const a = reg(risk('RISK-0001'));
  const result = validateRegisterTransition(a, reg(risk('RISK-0001')));
  assert.equal(result.valid, true, JSON.stringify(result.violations));
});

test('ST-15: rename without ID continuity is rejected (gate)', () => {
  const current = reg(risk('RISK-0004'));
  const proposed = reg(risk('RISK-0017')); // "merged/renamed" — old id gone
  const result = validateRegisterTransition(current, proposed);
  assert.equal(result.valid, false);
  const v = result.violations.find((x) => x.rule === 'risk_deleted');
  assert.equal(v.id, 'RISK-0004');
});

test('deleting a risk outright is rejected', () => {
  const result = validateRegisterTransition(reg(risk('RISK-0001')), reg());
  assert.equal(result.valid, false);
  assert.equal(result.violations[0].rule, 'risk_deleted');
});

test('P1 risk resolved without evidence is rejected', () => {
  const current = reg(risk('RISK-0002'));
  const proposed = reg(risk('RISK-0002', { status: 'resolved' }));
  const result = validateRegisterTransition(current, proposed);
  assert.equal(result.valid, false);
  assert.ok(result.violations.some((v) => v.rule === 'p0_p1_no_evidence'));
});

test('P1 risk resolved WITH evidence passes', () => {
  const current = reg(risk('RISK-0002'));
  const proposed = reg(
    risk('RISK-0002', { status: 'resolved', resolution_evidence: ['RUN-002#L14: fix verified'] })
  );
  const result = validateRegisterTransition(current, proposed);
  assert.equal(result.valid, true, JSON.stringify(result.violations));
});

test('P2 risk may resolve without evidence', () => {
  const current = reg(risk('RISK-0003', { severity: 'P2' }));
  const proposed = reg(risk('RISK-0003', { severity: 'P2', status: 'accepted' }));
  assert.equal(validateRegisterTransition(current, proposed).valid, true);
});

test('immutable fields cannot change (severity downgrade rejected)', () => {
  const current = reg(risk('RISK-0005', { severity: 'P0' }));
  const proposed = reg(risk('RISK-0005', { severity: 'P3' }));
  const result = validateRegisterTransition(current, proposed);
  assert.equal(result.valid, false);
  assert.ok(result.violations.some((v) => v.rule === 'immutable_field_changed'));
});

test('terminal status is final', () => {
  const current = reg(risk('RISK-0006', { status: 'resolved', resolution_evidence: ['x'] }));
  const proposed = reg(risk('RISK-0006', { status: 'open', resolution_evidence: ['x'] }));
  const result = validateRegisterTransition(current, proposed);
  assert.equal(result.valid, false);
  assert.ok(result.violations.some((v) => v.rule === 'terminal_status_changed'));
});

test('new risks must enter open', () => {
  const result = validateRegisterTransition(
    reg(),
    reg(risk('RISK-0007', { status: 'resolved', resolution_evidence: ['x'] }))
  );
  assert.equal(result.valid, false);
  assert.ok(result.violations.some((v) => v.rule === 'new_risk_not_open'));
});

// --- applyRegisterUpdates ---

test('apply create + update_status produces the expected register', () => {
  const current = reg(risk('RISK-0001', { severity: 'P2' }));
  const updates = [
    { action: 'create', id: 'RISK-0002', type: 'dependency_added', severity: 'P1A', introduced_by: 'scanner' },
    { action: 'update_status', id: 'RISK-0001', status: 'resolved', resolution_evidence: ['RUN-003 output'] },
  ];
  const next = applyRegisterUpdates(current, updates, 'RUN-003');
  assert.equal(next.risks.length, 2);
  assert.equal(next.risks.find((r) => r.id === 'RISK-0002').introduced_at, 'RUN-003');
  assert.equal(next.risks.find((r) => r.id === 'RISK-0001').status, 'resolved');
  // and the transition validates
  assert.equal(validateRegisterTransition(current, next).valid, true);
});

test('apply rejects updates to unknown risks and duplicate creates', () => {
  const current = reg(risk('RISK-0001'));
  assert.throws(() => applyRegisterUpdates(current, [{ action: 'update_status', id: 'RISK-0009', status: 'resolved' }], 'RUN-001'));
  assert.throws(() => applyRegisterUpdates(current, [{ action: 'create', id: 'RISK-0001', type: 'x', severity: 'P2' }], 'RUN-001'));
});

// --- STATE_PATCH reconciliation ---

const patch = (openIds) => ({
  current_chunk: 'chunk-0',
  objective: 'test objective',
  open_risk_ids: openIds,
  decisions_refs: [],
  next_action: 'continue',
});

test('ST-3: patch omitting an open P1 is rejected (gate)', () => {
  const register = reg(risk('RISK-0001'), risk('RISK-0002', { severity: 'P2' }));
  const result = reconcileStatePatch(patch(['RISK-0002']), register);
  assert.equal(result.valid, false);
  const v = result.violations.find((x) => x.rule === 'open_risk_omitted');
  assert.equal(v.id, 'RISK-0001');
});

test('patch matching the open set passes', () => {
  const register = reg(
    risk('RISK-0001'),
    risk('RISK-0002', { status: 'resolved', resolution_evidence: ['x'] })
  );
  const result = reconcileStatePatch(patch(['RISK-0001']), register);
  assert.equal(result.valid, true, JSON.stringify(result.violations));
});

test('patch with phantom open id is rejected', () => {
  const register = reg(risk('RISK-0001'));
  const result = reconcileStatePatch(patch(['RISK-0001', 'RISK-0099']), register);
  assert.equal(result.valid, false);
  assert.ok(result.violations.some((v) => v.rule === 'unknown_open_risk'));
});

test('schema-invalid patch is rejected outright', () => {
  const register = reg();
  const result = reconcileStatePatch({ open_risk_ids: [] }, register);
  assert.equal(result.valid, false);
  assert.equal(result.violations[0].rule, 'schema');
});
