// Append-only RUN.log (brief item 9, masterplan §6).
//
// Every FSM transition, validation result, scanner result, and halt reason is
// one JSON line appended to .agent/RUN.log. The file is never rewritten,
// truncated, or edited — append is the only operation this module exposes.
// Timestamps are ISO-8601; entries carry the run id so multiple runs share
// one chronological log.

import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_LOG_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'RUN.log'
);

export const EVENT_TYPES = [
  'run_start',
  'fsm_transition',
  'validation_result',
  'spec_lint_result',
  'preflight_result',
  'scanner_result',
  'register_validation',
  'evidence_crosscheck',
  'breaker_result',
  'halt',
  'run_end',
];

export function createRunLog(runId, logPath = DEFAULT_LOG_PATH) {
  if (!runId || typeof runId !== 'string') {
    throw new Error('createRunLog requires a non-empty runId string');
  }
  mkdirSync(path.dirname(logPath), { recursive: true });

  function append(eventType, detail = {}) {
    if (!EVENT_TYPES.includes(eventType)) {
      // Unknown event types are still logged, flagged as such — the log must
      // never silently drop information, but the typo should be visible.
      detail = { ...detail, unrecognized_event_type: eventType };
      eventType = 'halt_adjacent_unknown_event';
    }
    const entry = {
      ts: new Date().toISOString(),
      run_id: runId,
      event: eventType,
      ...detail,
    };
    appendFileSync(logPath, JSON.stringify(entry) + '\n');
    return entry;
  }

  return { append, logPath };
}
