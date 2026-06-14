// Deadline #1 (masterplan §2.3): process-level env-allowlist + no-push enforcement.
//
// Builds the LOCKED environment an executor child process is spawned with.
// Principle: allowlist-from-empty. The child starts from {} and receives ONLY
// explicitly named operational vars + the task's injected test vars. Repetita
// production secrets (TURSO_*, CLERK_SECRET_KEY, prod DATABASE_URL, ...) are
// never on the allowlist, so they cannot reach the executor regardless of what
// the parent process has loaded.
//
// No real production credential is ever required by this module or its probes;
// the wall is proven with canaries (fake secrets bearing the real names). See
// .agent/harness/probes/executor-enforcement-probe.js.

// Operational vars the executor's claude/node/git toolchain needs to run.
// Names only — values are copied from the parent at build time. NONE of these
// is an app/prod secret, so the allowlist stays eyeball-auditable by design.
//
// Notably ABSENT and deliberately so:
//   - ANTHROPIC_API_KEY / auth tokens: claude authenticates via the macOS
//     Keychain (login-session bound), not an env var, in this environment.
//   - CLAUDE_CODE_* session vars: injected by the parent claude session;
//     withholding them makes the executor a clean top-level session.
//   - Everything matching SECRET_SHAPED_DENY below.
export const OPERATIONAL_ALLOWLIST = [
  'PATH', // locate claude, node, git, rg
  'HOME', // ~/.claude config + Keychain-backed model auth
  'CLAUDE_CONFIG_DIR', // claude settings location
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TERM',
  'TMPDIR',
  'SHELL',
  'USER',
  'LOGNAME',
];

// Belt-and-braces DENY on top of the allowlist. The allowlist alone already
// excludes these (they are simply not on it); this regex is a build-time guard
// so that if anyone ever adds a secret-shaped name to the allowlist, the build
// throws instead of silently forwarding a secret. Applies to FORWARDED names
// only — injected test vars (chosen by the harness, known-safe values) are
// exempt, which is why DATABASE_URL can be injected as file:./... below.
export const SECRET_SHAPED_DENY =
  /TURSO|CLERK|LIBSQL|DATABASE_URL|WHSEC|SUPABASE|STRIPE|_SECRET|_PASSWORD|_TOKEN|PRIVATE_KEY|AUTH_KEY/i;

// Default test vars injected into every executor turn. Explicit safe values,
// never copied from the parent. DATABASE_URL points at a local file; Clerk keys
// are obvious dummies. A TASK_SPEC may extend/override via `injected`.
export const DEFAULT_INJECTED = {
  NODE_ENV: 'test',
  DATABASE_URL: 'file:./local-test.db',
  CLERK_SECRET_KEY: 'sk_test_DUMMY_not_a_real_key',
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_DUMMY_not_a_real_key',
};

// A dead remote-helper scheme: `git push` resolving to this looks for an
// executable `git-remote-no-push`, which does not exist, so the push fails
// locally and never touches the network — it cannot reach the real origin even
// if it misfires.
const DEAD_PUSHURL = 'no-push://disabled-by-harness';

// Git env-config injection (highest precedence, child-scoped, touches neither
// the repo config nor the user's global config). Neutralizes push only; fetch,
// status, diff, add still work normally.
export function noPushGitEnv() {
  return {
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'remote.origin.pushurl',
    GIT_CONFIG_VALUE_0: DEAD_PUSHURL,
    GIT_TERMINAL_PROMPT: '0', // never prompt for credentials
  };
}

// Throws if any forwarded allowlist name is secret-shaped. Called at build time.
export function assertAllowlistSafe(names = OPERATIONAL_ALLOWLIST) {
  const offenders = names.filter((n) => SECRET_SHAPED_DENY.test(n));
  if (offenders.length > 0) {
    throw new Error(
      `allowlist contains secret-shaped name(s): ${offenders.join(', ')} — refusing to build executor env`
    );
  }
}

// Build the locked spawn environment.
//   parentEnv : the source to copy operational values from (real process.env in
//               production; a canary-laden synthetic env in the proof).
//   injected  : explicit safe vars to set (defaults to DEFAULT_INJECTED).
// Returns { env, forwarded[], injected[], allowlist[] } for the preflight
// artifact and the auditable report.
export function buildExecutorEnv({ parentEnv, injected = DEFAULT_INJECTED } = {}) {
  assertAllowlistSafe();
  const src = parentEnv ?? {};
  const env = {};
  const forwarded = [];

  for (const name of OPERATIONAL_ALLOWLIST) {
    if (name in src && src[name] !== undefined) {
      env[name] = src[name];
      forwarded.push(name);
    }
  }

  // No-push git config (operational, safe).
  Object.assign(env, noPushGitEnv());

  // Injected test vars override/add last; recorded separately so the report can
  // show exactly what was set vs forwarded.
  const injectedNames = [];
  for (const [k, v] of Object.entries(injected ?? {})) {
    env[k] = v;
    injectedNames.push(k);
  }

  return {
    env,
    forwarded,
    injected: injectedNames,
    allowlist: [...OPERATIONAL_ALLOWLIST],
    no_push: { mechanism: 'git-env-config pushurl', dead_pushurl: DEAD_PUSHURL },
  };
}
