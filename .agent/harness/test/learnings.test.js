// Unit tests for the learning-loop plumbing (deadline build-only, Chunk 2).
// No model calls. Exercises the schema, the seeded exhibits, never-delete, and
// the mechanical loosening higher-bar.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from '../validate.js';
import {
  renderProposedLearningsSection,
  validateLearningTransition,
  proposeLearning,
} from '../learnings.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REGISTER_PATH = path.join(HERE, '..', '..', 'LEARNINGS_REGISTER.json');
const seeded = JSON.parse(readFileSync(REGISTER_PATH, 'utf8'));

test('seeded register (three exhibits) is schema-valid', () => {
  const { valid, errors } = validate('LEARNINGS_REGISTER', seeded);
  assert.ok(valid, `seeded register invalid: ${errors.join('; ')}`);
  assert.equal(seeded.learnings.length, 3);
});

test('each exhibit names a target_artifact and carries the bootstrap note', () => {
  for (const l of seeded.learnings) {
    assert.ok(l.target_artifact && l.target_artifact.length > 0, `${l.id} missing target_artifact`);
    assert.match(l.note, /BOOTSTRAP/i, `${l.id} missing bootstrap note`);
    assert.equal(l.status, 'proposed');
    assert.equal(l.direction, 'tightening');
  }
});

test('a learning missing target_artifact is schema-INVALID', () => {
  const bad = {
    learnings: [
      { id: 'LRN-9001', type: 'process', direction: 'tightening', proposal: 'x', evidence: ['e'], status: 'proposed' },
    ],
  };
  assert.equal(validate('LEARNINGS_REGISTER', bad).valid, false);
});

test('never-delete: dropping a learning is rejected', () => {
  const after = { learnings: seeded.learnings.slice(0, 2) }; // drop LRN-0003
  const { valid, violations } = validateLearningTransition(seeded, after);
  assert.equal(valid, false);
  assert.ok(violations.some((v) => v.rule === 'never_delete'));
});

test('tightening approval is low-friction (no decision_ref required)', () => {
  const after = structuredClone(seeded);
  after.learnings[0].status = 'approved';
  after.learnings[0].decided_by = 'human';
  const { valid } = validateLearningTransition(seeded, after);
  assert.ok(valid);
});

function withLoosening() {
  const reg = structuredClone(seeded);
  reg.learnings.push({
    id: 'LRN-0004',
    type: 'cap_tuning',
    direction: 'loosening',
    proposal: 'raise max_failures from 3 to 4',
    target_artifact: '.agent/harness/breaker.js',
    evidence: ['RUN-A'],
    status: 'proposed',
  });
  return reg;
}

test('loosening → approved WITHOUT decision_ref and 2-run evidence is rejected', () => {
  const before = withLoosening();
  const after = structuredClone(before);
  const lrn = after.learnings.find((l) => l.id === 'LRN-0004');
  lrn.status = 'approved';
  const { valid, violations } = validateLearningTransition(before, after);
  assert.equal(valid, false);
  assert.ok(violations.some((v) => v.rule === 'loosening_needs_decision_ref'));
  assert.ok(violations.some((v) => v.rule === 'loosening_needs_two_runs'));
});

test('loosening → approved WITH decision_ref + 2-run evidence is allowed', () => {
  const before = withLoosening();
  const after = structuredClone(before);
  const lrn = after.learnings.find((l) => l.id === 'LRN-0004');
  lrn.status = 'approved';
  lrn.decision_ref = 'DEC-031';
  lrn.decided_by = 'human';
  lrn.evidence = ['RUN-A', 'RUN-B'];
  const { valid, violations } = validateLearningTransition(before, after);
  assert.ok(valid, JSON.stringify(violations));
});

test('two loosenings approved in one step are rejected (never batched)', () => {
  const before = withLoosening();
  before.learnings.push({
    id: 'LRN-0005',
    type: 'cap_tuning',
    direction: 'loosening',
    proposal: 'widen a path tier',
    target_artifact: '.agent/rules/layer1-patterns.json',
    evidence: ['RUN-A', 'RUN-B'],
    status: 'proposed',
  });
  const after = structuredClone(before);
  for (const id of ['LRN-0004', 'LRN-0005']) {
    const lrn = after.learnings.find((l) => l.id === id);
    lrn.status = 'approved';
    lrn.decision_ref = 'DEC-031';
    lrn.evidence = ['RUN-A', 'RUN-B'];
  }
  const { valid, violations } = validateLearningTransition(before, after);
  assert.equal(valid, false);
  assert.ok(violations.some((v) => v.rule === 'loosening_never_batched'));
});

test('FINAL_REVIEW section renders the proposals, informative + never-blocking', () => {
  const md = renderProposedLearningsSection(seeded);
  assert.match(md, /## Proposed learnings/);
  assert.match(md, /never block acceptance/i);
  assert.match(md, /LRN-0001/);
  assert.match(md, /LRN-0003/);
});

test('proposeLearning forces status=proposed and validates', () => {
  const next = proposeLearning(seeded, {
    id: 'LRN-0009',
    type: 'eval_case',
    direction: 'tightening',
    proposal: 'add an eval case',
    target_artifact: '.agent/smoke/cases',
    evidence: ['RUN-X'],
    status: 'applied', // should be forced back to proposed
  });
  assert.equal(next.learnings.at(-1).status, 'proposed');
});
