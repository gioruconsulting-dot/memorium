// Live critic, wired into the FSM REVIEWING state (Chunk 2 full end-to-end).
// Per turn: assemble the clean-room evidence pack (deadline #2) from the turn's
// real artifacts, invoke the jailed Opus critic (deadline #2 walls), return the
// raw verdict text. The FSM's existing validateFailClosed + routing handle it.
//
// Reuses the 1A-proven adversarial system prompt verbatim, so the deployed critic
// matches what passed the 1A smoke test.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assembleEvidencePack, composeCriticPrompt } from './evidence-pack.js';
import { invokeCritic } from './critic.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT_PATH = path.join(HERE, '..', 'smoke', 'critic-system-prompt.md');

export function makeLiveCritic({ worktree, model = 'claude-opus-4-8', budgetUsd = 1.5 }) {
  const systemPrompt = readFileSync(SYSTEM_PROMPT_PATH, 'utf8');

  return function liveCritic({ turn, report, scanReport, diffPath, spec, register, runsDir }) {
    const packDir = path.join(runsDir, `critic-pack-turn-${turn}`);
    const diffText = readFileSync(diffPath, 'utf8');

    // Harness-MEASURED test evidence (the independent re-run written by
    // live-executor-turn), resolved from the report's output_path against runsDir.
    // The critic verifies against this, not against the executor's own claim.
    const evidenceFiles = (report.tests_run ?? [])
      .map((t) => t.output_path)
      .filter(Boolean)
      .map((p) => path.resolve(runsDir, p))
      .filter((p) => existsSync(p));

    assembleEvidencePack({
      packDir,
      worktree,
      touchedFiles: report.files_changed,
      groundTruthChanged: report.files_changed, // canonical report files_changed are harness ground truth
      contextFiles: spec.context_files ?? [],
      evidenceFiles,
      diffText,
      scannerReport: scanReport,
      executorReport: report,
      stateText: `# STATE (excerpt)\ncurrent_chunk: 2\nobjective: ${spec.objective}`,
      openRegister: { risks: register.risks.filter((r) => r.status === 'open') },
      acceptance: spec.acceptance_criteria,
    });

    const prompt = composeCriticPrompt({ packDir, acceptance: spec.acceptance_criteria });
    const r = invokeCritic({ packDir, systemPrompt, prompt, model, budgetUsd });
    writeFileSync(path.join(runsDir, `verdict-raw-turn-${turn}.txt`), r.resultText || '');
    return r.resultText;
  };
}
