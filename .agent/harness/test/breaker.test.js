import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fingerprint, normalizeFailure, evaluateBreaker } from '../breaker.js';

const tsFailure = (overrides = {}) => ({
  tool: 'tsc',
  code_or_rule: 'TS2345',
  primary_file: 'app/lib/notes.ts',
  message_normalized: 'type error',
  ...overrides,
});

test('message text is excluded by construction', () => {
  const a = fingerprint(tsFailure({ message_normalized: 'wording one' }));
  const b = fingerprint(tsFailure({ message_normalized: 'completely different wording' }));
  assert.equal(a, b);
});

test('line/column numbers are stripped in normalization', () => {
  const a = fingerprint(tsFailure({ primary_file: 'app/lib/notes.ts:12:5' }));
  const b = fingerprint(tsFailure({ primary_file: 'app/lib/notes.ts:99' }));
  const c = fingerprint(tsFailure());
  assert.equal(a, c);
  assert.equal(b, c);
});

test('quoted literals are stripped from code_or_rule', () => {
  const a = fingerprint(tsFailure({ code_or_rule: `test 'renders the "foo" pill' failed` }));
  const b = fingerprint(tsFailure({ code_or_rule: `test 'renders the "bar" pill' failed` }));
  assert.equal(a, b);
});

test('different tools / codes / files produce different fingerprints', () => {
  const base = fingerprint(tsFailure());
  assert.notEqual(base, fingerprint(tsFailure({ tool: 'eslint' })));
  assert.notEqual(base, fingerprint(tsFailure({ code_or_rule: 'TS2322' })));
  assert.notEqual(base, fingerprint(tsFailure({ primary_file: 'app/lib/other.ts' })));
});

test('normalizeFailure lowercases tool', () => {
  assert.equal(normalizeFailure({ tool: 'TSC', code_or_rule: 'x', primary_file: 'y' }).tool, 'tsc');
});

test('gate: same fingerprint on two failed turns escalates, wording irrelevant', () => {
  const result = evaluateBreaker([
    { turn: 1, failures: [tsFailure({ message_normalized: 'Argument of type X is not assignable' })] },
    { turn: 2, failures: [tsFailure({ message_normalized: 'totally rephrased by the model' })] },
  ]);
  assert.equal(result.escalate, true);
  assert.ok(result.reasons.some((r) => r.rule === 'fingerprint_repeat'));
});

test('one failed turn does not escalate', () => {
  const result = evaluateBreaker([{ turn: 1, failures: [tsFailure()] }, { turn: 2, failures: [] }]);
  assert.equal(result.escalate, false);
  assert.equal(result.failed_turn_count, 1);
});

test('two different fingerprints on two turns do not trip the repeat rule', () => {
  const result = evaluateBreaker([
    { turn: 1, failures: [tsFailure()] },
    { turn: 2, failures: [tsFailure({ code_or_rule: 'TS9999' })] },
  ]);
  assert.equal(result.escalate, false);
});

test('repeat within a single turn does not count as two failed turns', () => {
  const result = evaluateBreaker([
    { turn: 1, failures: [tsFailure(), tsFailure({ message_normalized: 'dup in same turn' })] },
  ]);
  assert.equal(result.escalate, false);
});

test('gate: failure cap escalates at 3 failed turns even with all-different fingerprints', () => {
  const result = evaluateBreaker([
    { turn: 1, failures: [tsFailure({ code_or_rule: 'TS1111' })] },
    { turn: 2, failures: [tsFailure({ code_or_rule: 'TS2222' })] },
    { turn: 3, failures: [tsFailure({ code_or_rule: 'TS3333' })] },
  ]);
  assert.equal(result.escalate, true);
  assert.ok(result.reasons.some((r) => r.rule === 'failure_cap'));
  assert.equal(result.failed_turn_count, 3);
});

test('custom max_failures is honored', () => {
  const turns = [
    { turn: 1, failures: [tsFailure({ code_or_rule: 'A' })] },
    { turn: 2, failures: [tsFailure({ code_or_rule: 'B' })] },
  ];
  assert.equal(evaluateBreaker(turns, 2).escalate, true);
  assert.equal(evaluateBreaker(turns, 3).escalate, false);
});
