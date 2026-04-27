# Pre-Mortem Checklist

Purpose: Surface worst-case outcomes before writing any prompt or executing any operation that could touch critical functionality or critical data.

This document is the deep operational reference. The active enforcement layer is `SESSION-STARTUP-CONTRACT.md`.

---

## Strategic principle

Prompt discipline is not enough. For production data safety, prefer controls that do not depend on the agent remembering or behaving well:

- No default production write access
- Branch-first execution
- Executable safety checks
- CI / static SQL guards
- Saved verification artifacts
- Product invariant tests
- Post-deploy monitors

This document specifies the rules. Several sections describe tooling that must be built (marked **TO BE BUILT**). The specs are the contract; building can follow. Until each piece is built, the agent must run equivalent manual procedures and surface the same outputs.

---

## Risk Tier Rubric

| Tier | Description | Required protocol |
|---|---|---|
| 0 | UI copy, styles, read-only inspection | Standard work |
| 1 | Additive app code, tests, local-only | Standard work |
| 2 | App logic touching study flow, question generation, scheduling, auth | Visible plan, no special protocol |
| 3 | Production data write, backfill, bulk update, env var change, deploy with migration | Visible pre-flight required |
| 4 | Schema migration, destructive operation, table-swap, FK change, operation touching Sacred or Parent-of-Sacred | Visible pre-flight + explicit user approval + branch-first protocol |

Tier 4 cosmetic work: rejected by default.

When uncertain: default to higher tier. False positive cost: 5 minutes. False negative cost: 2 hours of recovery.

---

## When this checklist applies

**Always run for:**
- Any database migration
- Schema changes (add/drop column, change constraint, add/drop index, FK changes)
- Operations using SQLite's table-swap pattern
- Bulk data operations (`UPDATE`/`DELETE` without bounded `WHERE` on critical tables)
- Environment variable changes affecting database or auth
- Deployments that include a migration
- Recovery operations (which can themselves fail destructively — see "Recovery as Tier 4")

**Skip for:**
- UI tweaks not affecting data flow
- Style and copy changes
- Non-functional refactors
- Local-only experiments not connected to production DB

If unsure: run the checklist.

---

## Mandatory Stop Conditions

STOP immediately and ask the user before proceeding if any of these are true:

- The operation requires SQLite table-swap
- The operation drops or recreates any table
- The operation touches `documents`, `questions`, `study_sessions`, `session_answers`, `users`, or `question_feedback`
- The operation changes database or auth environment variables
- The current database target is unclear or unverified
- Any FK relationship or cascade behavior is unknown
- Any verification query fails
- Pre-operation counts are surprising or different from expected
- The operation is cosmetic but destructive (the Apr 27 pattern)
- The recovery path is unknown
- The operation is being run in a long session that has accumulated significant unrelated context (open a fresh window)
- The operation is described in conversation as "small," "quick," "cleanup," or "close-out" — but classification places it at Tier 3+. The framing-vs-classification mismatch is itself a stop condition.

Default on stop conditions: **STOP and ASK.** Never improvise.

---

## Section A — For Claude (chat) before writing any prompt to Claude Code

Run internally. Surface anything that doesn't pass to the user.

### A1. Operation classification
- What is the actual database/data operation triggered by this prompt? (Not what the prompt says — what it does.)
- Does it touch any Sacred-tier table?
- Does it touch any table that cascades into a Sacred-tier table?
- Is it additive (safe), modifying (medium), destructive (high)?
- What tier is this? (0–4)

### A2. Foreign key blast radius
- List every FK pointing TO the table being modified
- List every FK pointing FROM the table being modified
- For each: is `ON DELETE CASCADE` / `SET NULL` / `RESTRICT` in effect?
- Cascade-affected tables MUST be in the operation's blast radius

**This must be verified live, not reasoned about from memory.** Use the executable safety gate (below).

### A3. Worst case (plain language)

Required sentence structure: *"If this operation fails or behaves unexpectedly, the worst case is: ___"*

Must include:
- Specific tables that could be affected
- Estimated row counts at risk
- What the user would experience (not what the database would log)
- Estimated cost and time to recover (dollars and hours)

If the worst case includes loss of Sacred-tier data: the prompt requires explicit user consent with the worst-case sentence read back to them. No exceptions.

### A4. Necessity check
- Is this operation actually necessary right now?
- Could it be deferred to a moment with less risk?
- "The plan said to" is NOT a sufficient reason. Re-evaluate.
- Is this cosmetic? If yes and Tier 3+: default answer is "do not do it."

### A5. Plain-language pre-flight to user

Before sending the Claude Code prompt, the user must see:
- What the operation does (plain language, no SQL jargon)
- The worst case from A3
- Cost and time to recover from the worst case
- Whether a backup or rollback path exists, and its freshness (see "Backup Freshness Gate")
- Explicit ask: *"Do you want to proceed?"*

For high-risk operations on Sacred tier: do not proceed without an affirmative answer. Implicit consent does not exist for Tier 4.

### A6. Prompt content requirements

The Claude Code prompt must include:
- All blast-radius tables identified
- Pre-operation backup of cascade-affected tables to temp tables (or branch-first execution)
- Verification step covering ALL blast-radius tables before AND after, with row counts compared to expected deltas
- Explicit rollback path on verification failure
- Idempotency check that does NOT substitute for data-preservation check
- Output of verification artifacts (see "Verification Artifacts")

---

## Section B — For Claude Code before executing any risky operation

Embedded in prompts written by the chat assistant.

### B1. Pre-operation
- Confirm operation runs against intended database (check `TURSO_DATABASE_URL`)
- Run `COUNT` query on every blast-radius table; save to local variables
- If operation drops/recreates a table with FKs: confirm cascade behavior. If `ON DELETE CASCADE` on incoming FK: ABORT and report
- Confirm recent backup or recovery path exists (Turso PITR window: minimum 6 hours; verify the actual restore point timestamp)

### B2. During operation
- Wrap in transaction where supported
- For DROP with FK dependents: EITHER disable FK enforcement (Turso shell only — not supported on remote connections) OR copy dependent contents to temp tables before drop, restore after rename
- Never assume `ON DELETE CASCADE` is the desired behavior during a migration

### B3. Post-operation verification

See "Four-Level Verification" below. All four levels for Tier 4.

### B4. Reporting

Success report MUST include:
- Pre-counts and post-counts for every blast-radius table
- Schema-level intent confirmation (constraints, indexes, FKs)
- Warnings encountered
- Exact verification queries run and their results
- Saved verification artifacts (see "Verification Artifacts")

A report without these is "I finished my steps," not a success report.

### B5. Anomaly response
- Pre/post mismatch across blast radius: STOP, do not commit, alert user
- Verification query fails to run: STOP, do not commit, alert user
- Database in unexpected state at start: STOP, confirm with user before proceeding

Default: **STOP and ASK,** never "try to fix it."

---

## Four-Level Verification

All four levels required for Tier 4. First two for Tier 3.

### Level 1 — Counts
Row counts for every blast-radius table, before and after. Differences must match expected deltas exactly.

### Level 2 — Relationships
- No orphaned foreign keys
- Parent-child counts by parent
- Counts grouped by `user_id` where applicable

### Level 3 — Identity
- Sample IDs from before still exist after
- Critical primary keys preserved
- No unexpected ID churn

### Level 4 — Product
User-facing flows tested live:
- Library loads with expected docs
- Study session can start
- An answer can be graded
- Progress page shows historical state
- Streak still renders correctly
- Login works (auth not silently broken by env changes)

A migration is not "done" until Level 4 passes. Counts are not enough.

---

## Two-Clock Rule

For Tier 3+: verification must run on at least two different clocks.

- **Agent clock**: Claude Code's pre/post counts and assertions
- **User clock**: User-side functional check on the actual app

Both must pass.

In the Apr 27 incident, agent-clock verification reported success. Only user-clock verification (opening the app, seeing empty Library) caught the failure.

The agent verifies what it was told to verify. The user verifies what the user actually experiences.

---

## Expected-Delta Manifest

Before any Tier 3+ operation, write the expected row-count deltas explicitly.

**Example:**

```
Operation: tighten documents.description and .topic to NOT NULL

Expected deltas:
- documents:         22  → 22
- questions:         790 → 790
- session_answers:   746 → 746
- study_sessions:    191 → 191
- question_feedback: 0   → 0
```

Any unexpected delta is a failure, even if the migration step itself reported success.

This prevents the "agent rationalizes a count change after the fact" failure mode. The expected state is locked in before execution; deviation cannot be reframed as success.

---

## Verification Artifacts

For Tier 3+ operations, verification must produce machine-readable artifacts saved to disk:

- `preflight.json` — counts, schema state, FK structure, target database
- `postflight.json` — same fields, post-operation
- `verification-diff.json` — computed deltas vs expected manifest
- `migration-log.txt` — full operation log

The assistant may summarize. The raw artifacts are the source of truth. Do not accept a plain-language success report without the underlying artifacts.

**TO BE BUILT**: `npm run verify:migration` script that produces these artifacts in a standardized location (`.migrations/{timestamp}/`).

Until built: agent generates equivalent JSON output by hand and saves to the same path. The format is the contract.

---

## Executable Safety Gate

For Tier 3+ operations, manual reasoning about blast radius is insufficient because schema drifts as the app evolves.

**TO BE BUILT**: `npm run db:safety-check -- --operation "<description>" --tables <list>`

Output (JSON):

```json
{
  "database_target": "memorium-production",
  "operation": "schema_change",
  "risk_tier": 4,
  "direct_tables": ["documents"],
  "incoming_foreign_keys": [
    {
      "from_table": "questions",
      "from_column": "document_id",
      "to_table": "documents",
      "to_column": "id",
      "on_delete": "CASCADE"
    }
  ],
  "blast_radius_tables": ["documents", "questions", "session_answers", "question_feedback"],
  "pre_counts": { "...": "..." },
  "stop_conditions": ["..."],
  "recommendation": "STOP_AND_REQUIRE_USER_APPROVAL"
}
```

**Until built**: agent must run equivalent inspection queries (`PRAGMA foreign_key_list(<table>)` for each candidate table, `SELECT COUNT(*)` for each blast-radius member) and assemble equivalent output before Tier 3+ work.

---

## Branch-First Protocol

For Tier 3+ work on production data:

1. Create fresh branch from production via `Create From Point-in-Time` or `turso db branch`
2. Run operation on branch
3. Run all four verification levels on branch
4. Point local app at branch, run user-clock verification
5. Only then: apply to production OR promote the branch

**Direct mutation of production allowed only for:**
- Purely additive migrations (new columns/tables/indexes — no drops, no rewrites)
- Backfills with bounded `WHERE` on non-Sacred tables
- Operations with verified backup window covering at least 6 hours

Default mental model: "prove the migration somewhere disposable first," not "run migration, recover if needed."

---

## Backup Freshness Gate

Before Tier 4 work, state explicitly:

- Latest restorable backup/branch timestamp
- Maximum possible permanent data loss window (now − latest restore point)
- Whether that loss window is acceptable
- Estimated recovery time
- Who must approve

**Example:**

```
Latest restorable point: 07:40 BST
Current time:            08:43 BST
Maximum loss window:     63 minutes
Estimated permanent loss in worst case: ~2 study sessions completed in window
Recovery time estimate:  ~2 hours
Acceptable? [user decision]
```

Do not proceed if backup window is unknown.

**Backup verification is active, not assumed.** Before pre-flight: actually check that a restorable point exists in Turso. PITR availability is a feature, not a guarantee. The agent must verify the restore point is currently available, not infer it from "Turso has PITR."

---

## Expand-Contract Migration Rule

For production schema evolution, default to expand-contract:

1. **Expand**: add new nullable columns/tables/indexes without removing old structure
2. Deploy code that can read/write both old and new shape
3. **Backfill** safely on a branch or with bounded batches
4. Verify product behavior
5. **Contract** later only if necessary

Contract steps — dropping columns, tightening `NOT NULL` on populated tables, removing tables, rewriting tables — are Tier 4 by default.

**Cosmetic contract steps should usually be skipped forever.** "Tighten the schema" on a populated table is a contract step. The Apr 27 incident was a contract step framed as cleanup.

---

## Dangerous SQL — Mechanical Flagging

Migration files and scripts must be mechanically scanned for dangerous patterns. Any match fails review unless explicitly approved.

**Patterns to flag:**
- `DROP TABLE`
- `ALTER TABLE ... RENAME`
- `CREATE TABLE ... AS SELECT`
- `DELETE FROM` without bounded `WHERE`
- `UPDATE` on Sacred tables without bounded `WHERE`
- `ON DELETE CASCADE` (any change to)
- `PRAGMA foreign_keys`
- Any migration file touching `documents`, `questions`, `session_answers`, `study_sessions`, `users`, `question_feedback`

**TO BE BUILT**: pre-commit hook + CI check (`npm run lint:migrations`) that scans migration files and `*.sql` blocks in scripts. Fails build on flag without `// SAFETY-OVERRIDE: <reason>` comment in the same file.

Until built: the chat assistant runs this pattern scan manually on any generated migration code before sending to Claude Code.

---

## Sacred Data Collapse Monitor

Post-deploy and post-migration: automated checks that Sacred-tier data has not collapsed.

**TO BE BUILT**: `scripts/sacred-monitor.ts` runs on cron (every 15 min) and after deploys. Checks:

- `questions` count has not dropped unexpectedly (>5% drop = alert)
- `session_answers` count has not dropped unexpectedly
- `study_sessions` count has not dropped unexpectedly
- No orphaned `session_answers` (FK target exists)
- No orphaned `question_feedback`
- Per-user question counts are plausible

Alerts via email/webhook on threshold breach. Even crude thresholds would have caught Apr 27 within minutes instead of 90.

---

## Product Invariants Tests

The invariants in `DATA-SANCTITY.md` must be encoded as automated tests, runnable on demand.

**TO BE BUILT**: `npm run test:invariants` runs queries like:

```sql
-- Every session_answer references existing question
SELECT COUNT(*) FROM session_answers sa
WHERE NOT EXISTS (SELECT 1 FROM questions q WHERE q.id = sa.question_id);
-- Expected: 0

-- Every session_answer references existing study_session
SELECT COUNT(*) FROM session_answers sa
WHERE NOT EXISTS (SELECT 1 FROM study_sessions s WHERE s.id = sa.session_id);
-- Expected: 0

-- Every question references existing document
SELECT COUNT(*) FROM questions q
WHERE NOT EXISTS (SELECT 1 FROM documents d WHERE d.id = q.document_id);
-- Expected: 0
```

Run after every migration on the branch before promoting. Run as part of `verify:migration`.

---

## Environment Variable Safety

Database and auth env var changes are Tier 3 by default.

**Before changing env vars:**
- Export current values to redacted backup (`.env.local.bak.{timestamp}` with secrets scrubbed)
- Change only the intended variable
- Diff before/after on names, not secret values
- Verify required keys still exist after edit
- Test auth and database connection separately, not just one

**Tooling**: Use VS Code (Cmd+P, Cmd+S — visible) over nano. The Apr 27 Clerk corruption happened during terminal-only edit.

Apr 27 lesson: editing `.env.local` to point at the recovery branch corrupted a Clerk key. Recovery operations are themselves risky. Env var safety applies *especially* during incident response, when stress is high and care is tempting to skip.

---

## Auth Safety (Clerk-specific)

Login is Tier-3 critical. Auth failure looks like total app outage from the user's perspective.

**Before any change touching Clerk env vars or middleware:**
- Confirm current Clerk publishable key, secret key, and webhook secret are recorded somewhere safe
- Test login on the local environment with the new config BEFORE deploying
- Have rollback values ready in clipboard or temporary file
- Never edit a Clerk key inline during another operation (the Apr 27 corruption pattern)

**After any deploy that touches auth:**
- Test sign-in
- Test sign-out
- Test that an existing session still works
- Test webhook delivery if applicable

Auth breakage is silent on the agent side. The Two-Clock Rule applies sharply here — only user-clock verification confirms auth.

---

## Recovery as Tier 4

Recovery operations can themselves fail destructively. The Apr 27 recovery had a Clerk env var corruption.

**Recovery is Tier 4 by default,** with these additional rules:

- **Branch-first**: never recover by overwriting. Create a new branch from the restore point, verify on branch, switch env vars, validate, only then consider promoting
- **Forensic preservation**: the original damaged database stays intact until recovery is fully verified
- **Full verification**: recovery uses all four verification levels, including user-clock
- **Env var care**: env var changes during recovery follow the env var safety rules above

A failed recovery is worse than the original incident. Treat with extra friction.

---

## Human Execution Rule for Tier 4

For Tier 4 operations, the agent may:
- Inspect schema
- Prepare scripts
- Run on branch
- Run verification
- Summarize risk

**The final production mutation or branch promotion requires either:**
- Explicit user action (user runs the command), OR
- Explicit user approval immediately before execution (within the same conversational turn)

No unattended Tier 4 production mutation. This is friction by design, exactly where friction is good.

---

## Trust Does Not Accrue

A long string of successful low-risk operations is not evidence of safety on the next high-risk one.

- Risk is per-operation, not per-session
- Verification fatigue grows with successful runs; counter it deliberately
- Tier 4 work in session #50 of the day requires the same friction as Tier 4 work in session #1
- "We've done this before" is not a reason to skip pre-flight

If anything, a long successful streak is the time to be *more* careful. The next operation is the one that breaks the streak, by definition.

---

## Innocent-Operation Pattern

Watch for high-risk operations disguised as low-risk admin. The Apr 27 signature.

**Tells:**
- Framing language: "small," "quick," "cleanup," "close-out," "tighten," "tidy"
- Plan-driven: "the plan said to" rather than "this is currently necessary"
- Cosmetic upside: neater schema, consistency, "elegance"
- Easy-to-write prompt: short, clear, doesn't sound risky

If framing is innocent but classification is Tier 3+: framing is the lie. Trust the classification.

---

## Practical Workflow

At the start of any session involving the data layer:

1. User (or chat assistant) names the planned work
2. Chat assistant runs Section A internally, including live FK verification via safety gate
3. If skip-list applies: proceed normally
4. Otherwise: chat assistant produces plain-language pre-flight per A3 and A5 BEFORE writing any Claude Code prompt
5. User explicitly approves or modifies plan
6. Chat assistant writes Claude Code prompt incorporating Section B + verification artifact requirements
7. Claude Code executes; on Tier 4, on a branch first
8. All four verification levels must pass on branch before production promotion
9. Sacred Data Collapse Monitor runs post-deploy

---

## Non-Negotiables

These cannot be relaxed regardless of conversation context:

- No production DB mutation without backup or branch
- No destructive migration for cosmetic schema tightening (default answer: do not do it)
- No success report without multi-table verification covering full blast radius
- No reliance on Claude Code self-verification alone for Tier 3+
- When user reports data loss: diagnose first, no fixes or reassurance until characterized
- For Tier 4: explicit user approval, plain-language worst case, branch-first
- Asymmetry rule: never trade catastrophic-irreversible for cosmetic-reversible

---

## Build Order for TO BE BUILT items

Suggested order, highest leverage first:

1. **Sacred Data Collapse Monitor** — would have caught Apr 27 in minutes; works on existing schema with zero refactor
2. **Product Invariants Tests** — codifies the contract; cheap to write, runs on every migration
3. **Executable Safety Gate** — replaces manual FK reasoning with live introspection
4. **Verification Artifacts** — formalizes the success-report contract
5. **Dangerous SQL CI check** — catches issues at commit time, before any execution
6. **Cascade audit** (per `DATA-SANCTITY.md`) — converts default-of-convenience cascades to `RESTRICT`. Tier 4 itself; needs the above tooling first.

Items 1–2 are buildable in a few hours each and provide most of the safety lift. Item 6 is the biggest structural improvement but requires the highest care to execute.

---

## Pointer

- One-page session-start enforcement: `SESSION-STARTUP-CONTRACT.md`
- Data classification + cascade policy: `DATA-SANCTITY.md`
- Historical context: `POST-MORTEM-2026-04-27.md`, `LEARNINGS-FROM-INCIDENT-APR27.md`
