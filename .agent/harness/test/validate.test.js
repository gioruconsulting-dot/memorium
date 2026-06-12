import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate, parseAndValidate, validateFailClosed, stubRepair } from '../validate.js';
import { lintSpec } from '../speclint.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures');
const readFixture = (rel) => readFileSync(path.join(FIXTURES, rel), 'utf8');

const validSpec = () => JSON.parse(readFixture('specs/valid-spec.json'));

test('valid TASK_SPEC passes schema validation', () => {
  const { valid, errors } = validate('TASK_SPEC', validSpec());
  assert.equal(valid, true, errors.join('; '));
});

test('TASK_SPEC missing risk_level fails schema validation', () => {
  const spec = validSpec();
  delete spec.risk_level;
  assert.equal(validate('TASK_SPEC', spec).valid, false);
});

test('TASK_SPEC with unknown extra field fails (strict schemas)', () => {
  const spec = validSpec();
  spec.bonus_field = 'nope';
  assert.equal(validate('TASK_SPEC', spec).valid, false);
});

test('malformed JSON is not ok and yields no data', () => {
  const result = parseAndValidate('TASK_SPEC', '{ "objective": ');
  assert.equal(result.ok, false);
  assert.equal(result.data, null);
  assert.match(result.errors[0], /invalid JSON/);
});

test('fail-closed: stub repair never repairs, result is halt', () => {
  const result = validateFailClosed('CRITIC_VERDICT', 'not json at all');
  assert.equal(result.ok, false);
  assert.equal(result.halt, true);
  assert.equal(result.attempts, 2);
});

test('fail-closed: a repair that returns still-invalid JSON also halts', () => {
  const badRepair = () => '{"still": "invalid"}';
  const result = validateFailClosed('CRITIC_VERDICT', 'garbage', badRepair);
  assert.equal(result.ok, false);
  assert.equal(result.halt, true);
  assert.equal(result.attempts, 2);
});

test('fail-closed: valid input passes on first attempt', () => {
  const result = validateFailClosed('TASK_SPEC', JSON.stringify(validSpec()));
  assert.equal(result.ok, true);
  assert.equal(result.attempts, 1);
  assert.equal(result.halt, false);
});

test('stubRepair returns null by construction', () => {
  assert.equal(stubRepair(), null);
});

test('empty RISK_REGISTER validates', () => {
  assert.equal(validate('RISK_REGISTER', { risks: [] }).valid, true);
});

test('RISK_REGISTER rejects malformed risk id', () => {
  const reg = {
    risks: [{
      id: 'RISK-7', type: 'security_sensitive', severity: 'P1A', status: 'open',
      introduced_at: 'RUN-001', introduced_by: 'scanner', resolution_evidence: [],
    }],
  };
  assert.equal(validate('RISK_REGISTER', reg).valid, false);
});

// --- spec lint ---

test('lint passes the valid fixture spec', () => {
  const result = lintSpec(validSpec());
  assert.equal(result.pass, true, JSON.stringify(result.violations));
});

test('lint rejects ** in green_paths (gate: overbroad spec)', () => {
  const result = lintSpec(JSON.parse(readFixture('specs/overbroad-spec.json')));
  assert.equal(result.pass, false);
  assert.ok(result.violations.some((v) => v.rule === 'green_path_overbroad'));
});

test('lint rejects categorical p1c preapprovals', () => {
  const result = lintSpec(JSON.parse(readFixture('specs/overbroad-spec.json')));
  assert.ok(result.violations.some((v) => v.rule === 'p1c_categorical'));
});

test('lint rejects a spec missing the black-path floor', () => {
  const spec = validSpec();
  spec.black_paths = ['.env*'];
  const result = lintSpec(spec);
  assert.equal(result.pass, false);
  assert.ok(result.violations.some((v) => v.rule === 'black_path_floor_missing'));
});

test('lint rejects whitespace-only acceptance criteria', () => {
  const spec = validSpec();
  spec.acceptance_criteria = ['   '];
  const result = lintSpec(spec);
  assert.ok(result.violations.some((v) => v.rule === 'acceptance_criteria_empty'));
});
