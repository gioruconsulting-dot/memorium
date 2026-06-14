// Unit tests for the executor env-allowlist + no-push builder (deadline #1).
// Pure-function tests; no spawning, no model calls, no real credentials.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExecutorEnv,
  assertAllowlistSafe,
  OPERATIONAL_ALLOWLIST,
  SECRET_SHAPED_DENY,
  DEFAULT_INJECTED,
  noPushGitEnv,
} from '../executor-env.js';

const MARKER = 'CANARY_LEAK_MARKER';
const canaryParent = {
  PATH: '/usr/bin:/bin',
  HOME: '/Users/test',
  CLAUDE_CONFIG_DIR: '/Users/test/.claude',
  TURSO_AUTH_TOKEN: `${MARKER}_a`,
  TURSO_DATABASE_URL: `libsql://${MARKER}_b`,
  CLERK_SECRET_KEY: `sk_live_${MARKER}_c`,
  DATABASE_URL: `libsql://${MARKER}_prod`,
  CLAUDE_CODE_SESSION_ID: 'parent-session-should-not-forward',
};

test('no canary value survives into the built env', () => {
  const { env } = buildExecutorEnv({ parentEnv: canaryParent });
  const serialized = JSON.stringify(env);
  assert.ok(!serialized.includes(MARKER), 'a canary secret leaked into the executor env');
});

test('operational vars are forwarded when present', () => {
  const { env, forwarded } = buildExecutorEnv({ parentEnv: canaryParent });
  assert.equal(env.PATH, '/usr/bin:/bin');
  assert.equal(env.HOME, '/Users/test');
  assert.ok(forwarded.includes('PATH') && forwarded.includes('HOME'));
});

test('secret-shaped parent vars are never forwarded', () => {
  const { env } = buildExecutorEnv({ parentEnv: canaryParent });
  assert.equal(env.TURSO_AUTH_TOKEN, undefined);
  assert.equal(env.TURSO_DATABASE_URL, undefined);
  assert.equal(env.CLERK_WEBHOOK_SECRET, undefined);
});

test('injected DATABASE_URL overrides a prod-shaped parent value', () => {
  const { env } = buildExecutorEnv({ parentEnv: canaryParent });
  assert.equal(env.DATABASE_URL, 'file:./local-test.db');
  assert.ok(!env.DATABASE_URL.includes(MARKER));
});

test('parent CLAUDE_CODE_* session vars are not forwarded', () => {
  const { env } = buildExecutorEnv({ parentEnv: canaryParent });
  assert.equal(env.CLAUDE_CODE_SESSION_ID, undefined);
});

test('no-push git env is present and neutralizes the push url', () => {
  const { env } = buildExecutorEnv({ parentEnv: canaryParent });
  assert.equal(env.GIT_CONFIG_COUNT, '1');
  assert.equal(env.GIT_CONFIG_KEY_0, 'remote.origin.pushurl');
  assert.equal(env.GIT_CONFIG_VALUE_0, 'no-push://disabled-by-harness');
  assert.equal(env.GIT_TERMINAL_PROMPT, '0');
});

test('the standing allowlist contains no secret-shaped names', () => {
  assert.doesNotThrow(() => assertAllowlistSafe());
  for (const name of OPERATIONAL_ALLOWLIST) {
    assert.ok(!SECRET_SHAPED_DENY.test(name), `${name} is secret-shaped`);
  }
});

test('assertAllowlistSafe throws if a secret-shaped name is added', () => {
  assert.throws(() => assertAllowlistSafe(['PATH', 'TURSO_AUTH_TOKEN']));
});

test('default injected vars use obvious dummy values, never real-looking secrets', () => {
  assert.equal(DEFAULT_INJECTED.NODE_ENV, 'test');
  assert.ok(DEFAULT_INJECTED.DATABASE_URL.startsWith('file:'));
  assert.ok(DEFAULT_INJECTED.CLERK_SECRET_KEY.includes('DUMMY'));
});

test('noPushGitEnv is self-contained and child-scoped (no file writes)', () => {
  const e = noPushGitEnv();
  assert.deepEqual(Object.keys(e).sort(), [
    'GIT_CONFIG_COUNT',
    'GIT_CONFIG_KEY_0',
    'GIT_CONFIG_VALUE_0',
    'GIT_TERMINAL_PROMPT',
  ]);
});
