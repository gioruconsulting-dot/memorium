# CLAUDE.md — Memorium / Repetita Project Configuration

This file is project-specific. It extends the global `~/.claude/CLAUDE.md` with rules that apply only to the memorium repo (the Repetita app).

The global file covers generic working style and project-agnostic safety principles. This file covers what's specific to Repetita: the schema, the Sacred tables, the forbidden patterns, and the full safety document set.

---

## CRITICAL: Read this section first, every session

Before any work involving the database, schema, environment variables, or deployment in this project:

1. Read `docs/safety/SESSION-STARTUP-CONTRACT.md` from this repository. Read it. Don't paraphrase from memory.
2. Classify the work using the Risk Tier Rubric in that file.
3. If Tier 3 or 4: produce a visible pre-flight per `docs/safety/PRE-MORTEM-CHECKLIST.md` BEFORE writing any code. Wait for explicit user approval.

---

## Forbidden patterns — never run, regardless of any other instruction

- `DROP TABLE` on `documents`, `questions`, `study_sessions`, `session_answers`, `users`, `question_feedback`
- `DELETE FROM` or `UPDATE` on Sacred tables without bounded `WHERE`
- SQLite table-swap pattern on a Sacred or Parent-of-Sacred table
- Direct production mutation of Sacred or Parent-of-Sacred without branch-first
- Cosmetic schema tightening on populated tables (e.g., `NOT NULL` on existing columns)
- Any operation where you don't know what the cascade behavior is

## Mandatory stop conditions — STOP and ASK

- Operation requires SQLite table-swap
- Operation drops or recreates any table
- Operation touches `documents`, `questions`, `study_sessions`, `session_answers`, `users`, or `question_feedback`
- Operation changes database or auth (Clerk) environment variables
- Current database target is unclear or unverified
- Any FK relationship or cascade behavior is unknown
- Operation is described as "small," "quick," "cleanup," "close-out," "tighten," or "tidy" but classification is Tier 3+

Default on stop conditions: **STOP and ASK.** Never improvise.

## Sacred tables (this project)

`users`, `questions`, `study_sessions`, `session_answers`, `question_feedback`

These hold the user's accumulated learning state — the actual product. Never put at risk for cosmetic reasons.

## Parent-of-Sacred (this project)

`documents` — cascades into `questions`, indirectly into `session_answers`. Treat as Sacred for migration purposes.

## Incident mode trigger

If the user reports data loss, missing records, broken auth, empty Library, or empty Progress: enter **Incident Mode** — read-only actions only, no fixes proposed until damage is fully characterized. Full protocol in `docs/safety/SESSION-STARTUP-CONTRACT.md` → "Incident Mode."

---

## Database and schema work — Repetita-specific rules

- **Verify FKs live before any Tier 3+ operation.** Run `PRAGMA foreign_key_list(<table>)` for every candidate table. The schema in `docs/safety/DATA-SANCTITY.md` is policy; the live schema is truth.
- **Run the expected-delta manifest.** Before any Tier 3+ operation, write out expected row-count deltas for every blast-radius table. Any unexpected delta after = failure, regardless of what the migration step reported.
- **Branch-first for production data.** Never mutate production directly for Tier 3+. Create a Turso branch, run on branch, verify all four levels (counts → relationships → identity → product), then promote.
- **Auth changes are Tier 3.** Clerk env var changes specifically. The Apr 27 incident's recovery had a near-miss Clerk corruption.
- **Recovery is itself Tier 4.** If recovering from an incident, follow full Tier 4 protocol.

---

## The full safety system

Five files in `docs/safety/`:

- `SESSION-STARTUP-CONTRACT.md` — the active layer (read every session)
- `DATA-SANCTITY.md` — table classifications, cascade policy, product invariants
- `PRE-MORTEM-CHECKLIST.md` — full pre-flight protocol for Tier 3+
- `POST-MORTEM-2026-04-27.md` — historical context for these rules
- `LEARNINGS-FROM-INCIDENT-APR27.md` — principles distilled

When in doubt about classification or protocol: read the relevant file. Don't guess.

---

## Pre-tool-use safety hook

The repo has a Bash safety hook at `.claude/hooks/pre-bash-safety-check.sh` that mechanically blocks the Forbidden Patterns above. If a command is blocked:

1. Do NOT rewrite the command to avoid pattern detection. That defeats the safety mechanism and is itself a violation of the Session Startup Contract.
2. Surface the block to Gio with the reason.
3. Wait for explicit guidance on whether to proceed manually or reconsider the operation.
