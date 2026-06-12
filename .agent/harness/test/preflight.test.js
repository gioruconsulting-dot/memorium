import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preflight, isBlackPath } from '../preflight.js';
import { classifyPath, globToRegExp } from '../paths.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures');
const validSpec = () =>
  JSON.parse(readFileSync(path.join(FIXTURES, 'specs/valid-spec.json'), 'utf8'));

const baseInput = () => ({
  branch: 'feature/test-branch',
  allowedEnv: { NODE_ENV: 'test' },
  actualEnv: { NODE_ENV: 'test' },
  changedFiles: ['components/LibraryEmptyState.js'],
  spec: validSpec(),
  allowPush: false,
});

test('clean input passes preflight', () => {
  const result = preflight(baseInput());
  assert.equal(result.pass, true, JSON.stringify(result.halts));
  assert.equal(result.artifact.env_policy, 'allowlist');
  assert.deepEqual(result.artifact.forbidden_env_detected, []);
});

test('halts on main branch (gate: ST-7 branch escape)', () => {
  const result = preflight({ ...baseInput(), branch: 'main' });
  assert.equal(result.pass, false);
  assert.ok(result.halts.some((h) => h.check === 'branch'));
});

test('halts on master and on missing branch', () => {
  assert.equal(preflight({ ...baseInput(), branch: 'master' }).pass, false);
  assert.equal(preflight({ ...baseInput(), branch: '' }).pass, false);
});

test('halts on env var that was never injected', () => {
  const input = baseInput();
  input.actualEnv = { NODE_ENV: 'test', TURSO_AUTH_TOKEN: 'leaked' };
  const result = preflight(input);
  assert.equal(result.pass, false);
  assert.deepEqual(result.artifact.forbidden_env_detected, ['TURSO_AUTH_TOKEN']);
});

test('halts on injected var whose value differs from the allowlist', () => {
  const input = baseInput();
  input.actualEnv = { NODE_ENV: 'production' };
  assert.equal(preflight(input).pass, false);
});

test('halts when allowPush is not exactly false', () => {
  assert.equal(preflight({ ...baseInput(), allowPush: true }).pass, false);
  assert.equal(preflight({ ...baseInput(), allowPush: undefined }).pass, false);
});

test('halts on black-path change (gate: black-path write)', () => {
  const input = baseInput();
  input.changedFiles = ['.env.local'];
  const result = preflight(input);
  assert.equal(result.pass, false);
  const halt = result.halts.find((h) => h.check === 'path_tiers');
  assert.match(halt.detail, /black/);
});

test('black-path floor applies even if spec omits it (defense in depth)', () => {
  const input = baseInput();
  input.spec.black_paths = []; // a spec the lint would reject anyway
  input.changedFiles = ['.agent/RUN.log'];
  assert.equal(preflight(input).pass, false);
});

test('halts on untiered file — unknown is out of bounds', () => {
  const input = baseInput();
  input.changedFiles = ['scripts/new-script.sh'];
  const result = preflight(input);
  assert.equal(result.pass, false);
  assert.match(result.halts[0].detail, /untiered/);
});

test('red and yellow files pass preflight (routing is the FSM\'s job)', () => {
  const input = baseInput();
  input.changedFiles = ['app/api/notes/route.js', 'lib/sr.js'];
  const result = preflight(input);
  assert.equal(result.pass, true, JSON.stringify(result.halts));
  assert.equal(result.artifact.changed_files_tiers['app/api/notes/route.js'], 'red');
  assert.equal(result.artifact.changed_files_tiers['lib/sr.js'], 'yellow');
});

// --- path classifier ---

test('glob semantics: * stays in segment, ** crosses segments', () => {
  assert.ok(globToRegExp('.env*').test('.env.local'));
  assert.ok(!globToRegExp('app/*.js').test('app/sub/x.js'));
  assert.ok(globToRegExp('migrations/**').test('migrations/2026/001.sql'));
  assert.ok(globToRegExp('.agent/**').test('.agent/RUN.log'));
});

test('most-restrictive tier wins', () => {
  const spec = validSpec();
  spec.green_paths.push('app/api/special.js');
  // also matches red app/api/**
  assert.equal(classifyPath('app/api/special.js', spec), 'red');
});

test('isBlackPath helper honors spec + floor', () => {
  assert.equal(isBlackPath('.agent/harness/fsm.js', validSpec()), true);
  assert.equal(isBlackPath('components/Card.js', validSpec()), false);
  assert.equal(isBlackPath('MASTERPLAN.md', { black_paths: [] }), true);
});
