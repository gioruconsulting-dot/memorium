// Fail-closed JSON validation (masterplan §3.8).
//
// Policy: invalid model JSON gets exactly one repair-retry slot, then the run
// halts. The orchestrator never infers `continue` from malformed output, never
// regex-parses, never best-efforts. In Chunk 0 the repair slot is a stub that
// never repairs (no model calls exist yet) — the slot is wired so the halt
// path is real from day one.

import Ajv from 'ajv';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'schemas');

export const SCHEMA_NAMES = [
  'TASK_SPEC',
  'EXECUTOR_REPORT',
  'CRITIC_VERDICT',
  'RISK_REGISTER',
  'STATE_PATCH',
];

const ajv = new Ajv({ strict: true, allErrors: true });
for (const name of SCHEMA_NAMES) {
  const schema = JSON.parse(
    readFileSync(path.join(SCHEMA_DIR, `${name}.schema.json`), 'utf8')
  );
  ajv.addSchema(schema, name);
}

// Validate an already-parsed object against a named schema.
export function validate(schemaName, data) {
  const validator = ajv.getSchema(schemaName);
  if (!validator) throw new Error(`Unknown schema: ${schemaName}`);
  const valid = validator(data);
  return {
    valid: Boolean(valid),
    errors: valid
      ? []
      : validator.errors.map((e) => `${e.instancePath || '(root)'} ${e.message}`),
  };
}

// Parse raw text and validate. Malformed JSON and schema-invalid JSON are the
// same failure class: not ok, no data, reasons listed.
export function parseAndValidate(schemaName, rawText) {
  let data;
  try {
    data = JSON.parse(rawText);
  } catch (err) {
    return { ok: false, data: null, errors: [`invalid JSON: ${err.message}`] };
  }
  const { valid, errors } = validate(schemaName, data);
  return valid ? { ok: true, data, errors: [] } : { ok: false, data: null, errors };
}

// Chunk 0 repair stub: the slot exists, but nothing repairs. Returns null,
// meaning "no repaired text available" → caller must halt.
export function stubRepair() {
  return null;
}

// The fail-closed entry point the FSM uses.
// Returns { ok, data, attempts, errors, halt }.
//   ok=true            → schema-valid object, safe to act on
//   ok=false, halt=true → both the original and the single repair attempt
//                          failed (or no repair was available); the run must
//                          go to HALTED_SAFE. There is no third state.
export function validateFailClosed(schemaName, rawText, repairFn = stubRepair) {
  const first = parseAndValidate(schemaName, rawText);
  if (first.ok) return { ok: true, data: first.data, attempts: 1, errors: [], halt: false };

  const repairedText = repairFn(schemaName, rawText, first.errors);
  if (repairedText !== null && repairedText !== undefined) {
    const second = parseAndValidate(schemaName, repairedText);
    if (second.ok) return { ok: true, data: second.data, attempts: 2, errors: [], halt: false };
    return { ok: false, data: null, attempts: 2, errors: second.errors, halt: true };
  }

  return { ok: false, data: null, attempts: 2, errors: first.errors, halt: true };
}
