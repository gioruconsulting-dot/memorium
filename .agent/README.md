# .agent — Agentic Loop Deterministic Harness (Chunk 0)

Built per `agentic-loop-masterplan-v3.1.md` (canonical spec) and
`chunk-0-handoff-brief.md`. Governing principle: **models propose;
deterministic systems dispose.** Nothing in this directory calls a model.

## Layout

```
.agent/
  schemas/        JSON Schemas for the 5 contracts (TASK_SPEC, EXECUTOR_REPORT,
                  CRITIC_VERDICT, RISK_REGISTER, STATE_PATCH) — strict, fail-closed
  harness/        validate.js   ajv fail-closed validation + single repair slot (stubbed)
                  speclint.js   deterministic TASK_SPEC lint (black-path floor, no ** in green)
                  runlog.js     append-only RUN.log writer (JSON lines)
                  paths.js      glob → tier classification (green/yellow/red/black)
                  preflight.js  branch / env-allowlist / network / no-push / path-tier checks
                  scanner.js    Layer 1 ripgrep scanner over unified diffs
                  register.js   risk-register transition validator + STATE_PATCH reconciliation
                  breaker.js    doom-loop fingerprint + failure cap (pure functions)
                  crosscheck.js test-evidence cross-check (fake pass → not_run)
                  fsm.js        orchestrator FSM skeleton (model states stubbed)
                  gate.js       Chunk 0 gate run — all seeded violations
                  test/         unit tests (node:test) against fixtures
  rules/          layer1-patterns.json (grep patterns), layer2-semgrep.yml (AST rules)
  fixtures/       synthetic diffs, specs, semgrep seeded violations — never real app code
  runs/           per-run artifacts (preflight/scanner reports, committed registers)
  RISK_REGISTER.json  canonical risk ledger (risks are never deleted)
  RUN.log         append-only log: every transition, validation, halt
```

## Commands

```sh
node --test .agent/harness/test/*.test.js      # full unit suite
node .agent/harness/gate.js                    # gate run (appends evidence to RUN.log)
semgrep scan --config .agent/rules/layer2-semgrep.yml <paths>   # Layer 2
```

External binaries required: `rg` (ripgrep, brew) and `semgrep` (brew). Node
dep: `ajv` (devDependency). All three were flagged to and approved by Gio
before installing, and are recorded as accepted entries in
`RISK_REGISTER.json` — the harness's first register entries are its own
dependencies.

**Known gap:** `package-lock.json` is NOT committed with Chunk 0 — at build
time it carried Gio's uncommitted offline-work changes, so the ajv lockfile
entries land together with the offline-work commit. Until then, `npm install`
regenerates them from `package.json`.

## Stubbed in Chunk 0 (by design — no model calls exist)

- **EXECUTING / REVIEWING states**: fixture-fed via `runFsm` config, never a model.
- **Repair-retry slot** (`validate.js stubRepair`): the slot is wired, the
  repairer always returns null → halt. A real repair prompt lands with the loop.
- **Critic spec review**: deterministic lint only; the model-side review is logged as stubbed.
- **AWAITING_HUMAN**: terminal — no router/Slack; a human reads RUN.log and resumes manually.
- **Env allowlist / no-push**: validated against declared run config; process-level
  enforcement (actually spawning the executor with an empty env, stripped push
  credentials) arrives with the real executor. **Re-entry deadline: before the
  first real executor turn in Chunk 2.**

## Deferred, with re-entry deadlines (masterplan §7 — deferral never becomes deletion)

All seven §7 deferrals, plus two added during the Chunk 0 build:

| Item | Re-entry deadline | Source |
|---|---|---|
| Cost ceiling + wall-clock cap | before Chunk 3 | §7 |
| Advanced scanner patterns | before Chunk 3 | §7 |
| Full crash-resume | before Chunk 4 | §7 |
| Cross-model audit wiring | before Chunk 4 | §7 |
| STATE.md projection polish | Chunk 2 | §7 |
| EVIDENCE.log polish | Chunk 2 | §7 |
| Slack card formatting | Chunk 4 | §7 |
| Process-level env-allowlist + no-push enforcement | before first real executor turn in Chunk 2 | Chunk 0 build |
| package-lock.json ajv entries (see known gap above) | with the offline-work commit | Chunk 0 build |

(`LEARNINGS_REGISTER` + harvest is not a deferral — it is scheduled Chunk 2
scope per masterplan §2.12 and was explicitly out of Chunk 0.)

Layer 2 semgrep starter rules were NOT deferred — they landed inside the
Chunk 0 timebox and are validated against `.agent/fixtures/semgrep/`.

## During loop runs

`.agent/**` is black-path to the executor (mandatory floor in every TASK_SPEC,
enforced by spec lint AND preflight defense-in-depth). This README and
everything here may only change in supervised sessions.
