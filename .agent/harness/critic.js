// Critic invocation (masterplan §2.7; deadline #2). Two walls on two vectors:
//   - cwd = evidence pack  → file-secret wall (cannot read repo, .env, secrets)
//   - locked env           → env-dump wall (cannot leak inherited secrets into
//                            the verdict via an injected "print your env")
// Read-only tools only; no MCP; no slash-commands; project settings stripped
// (the critic is adversarial and self-contained, it does not need repo hooks).
//
// Symmetric with executor.js. The cwd-jail is re-proven per run by the probes
// in probes/critic-pack-probe.js, not assumed.

import { execFileSync } from 'node:child_process';
import { buildExecutorEnv } from './executor-env.js';

const CALL_TIMEOUT_MS = 20 * 60 * 1000;

export function invokeCritic({
  prompt,
  systemPrompt,
  packDir,
  model = 'claude-opus-4-8',
  budgetUsd = 1.0,
  parentEnv = process.env,
}) {
  if (!packDir) throw new Error('invokeCritic: packDir (the evidence-pack cwd) is required');
  // env-dump wall: locked allowlist env, parent secrets stripped.
  const { env } = buildExecutorEnv({ parentEnv });

  const args = [
    '-p',
    '--tools', 'Read Grep Glob', // read-only
    '--strict-mcp-config', // no MCP servers
    '--disable-slash-commands',
    '--setting-sources', '', // self-contained; no repo settings
    '--model', model,
    '--max-budget-usd', String(budgetUsd),
    '--output-format', 'json',
    '--no-session-persistence',
  ];
  if (systemPrompt) args.push('--system-prompt', systemPrompt);

  const stdout = execFileSync('claude', args, {
    input: prompt,
    cwd: packDir, // file-secret wall
    env,
    encoding: 'utf8',
    timeout: CALL_TIMEOUT_MS,
    killSignal: 'SIGKILL',
    maxBuffer: 32 * 1024 * 1024,
  });
  const envelope = JSON.parse(stdout);
  return {
    envelope,
    resultText: typeof envelope.result === 'string' ? envelope.result : '',
    costUsd: typeof envelope.total_cost_usd === 'number' ? envelope.total_cost_usd : NaN,
  };
}
