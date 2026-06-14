// Executor invocation (masterplan §2.5). Spawns a headless `claude` session as
// the executor, with the LOCKED allowlist environment from executor-env.js as
// the single point of enforcement: the child receives `env` and nothing else —
// process.env is never inherited.
//
// The full existing safety stack still applies on top (--setting-sources
// project loads the repo's .claude/settings.json → PreToolUse bash hook +
// deny-rules). MCP servers and slash-commands are stripped, as for the critic.

import { execFileSync } from 'node:child_process';

const CALL_TIMEOUT_MS = 20 * 60 * 1000;

// Spawn an arbitrary command under the locked executor env. Used by the
// enforcement probes (e.g. `node -e`, `git push`) so they exercise the EXACT
// env the real executor receives, not a re-derived copy.
export function spawnUnderExecutorEnv(file, args, { env, cwd, input }) {
  return execFileSync(file, args, {
    input,
    cwd,
    env, // enforcement: no inheritance — child sees only this
    encoding: 'utf8',
    timeout: CALL_TIMEOUT_MS,
    killSignal: 'SIGKILL',
    maxBuffer: 32 * 1024 * 1024,
  });
}

// Invoke the executor claude session. `env` MUST come from buildExecutorEnv().
export function invokeExecutor({
  prompt,
  systemPrompt,
  cwd,
  env,
  model = 'claude-haiku-4-5-20251001',
  budgetUsd = 1.0,
  tools = 'Read Edit Write Bash Grep Glob',
  allowedTools, // pre-approved tools for headless auto-run; PreToolUse hook still fires
}) {
  if (!env || typeof env !== 'object') {
    throw new Error('invokeExecutor: locked env is required (use buildExecutorEnv)');
  }
  const args = [
    '-p',
    '--tools', tools,
    '--strict-mcp-config', // no MCP servers
    '--disable-slash-commands',
    '--setting-sources', 'project', // load repo .claude settings → PreToolUse hook
    '--model', model,
    '--max-budget-usd', String(budgetUsd),
    '--output-format', 'json',
    '--no-session-persistence',
  ];
  if (allowedTools) args.push('--allowedTools', allowedTools);
  if (systemPrompt) args.push('--system-prompt', systemPrompt);

  const stdout = spawnUnderExecutorEnv('claude', args, { env, cwd, input: prompt });
  const envelope = JSON.parse(stdout);
  return {
    envelope,
    resultText: typeof envelope.result === 'string' ? envelope.result : '',
    costUsd: typeof envelope.total_cost_usd === 'number' ? envelope.total_cost_usd : NaN,
  };
}
