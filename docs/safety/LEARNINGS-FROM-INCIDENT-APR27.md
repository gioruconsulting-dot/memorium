# Learnings From the Incident

These are the durable conclusions from the 27 April 2026 questions-table-wipe incident. `POST-MORTEM-2026-04-27.md` captures what happened; this document captures what to carry forward.

---

> **Core product invariant**
>
> Repetita's product is not the documents. It is the algorithm's accumulated knowledge of what the user knows.
>
> The graph — user → question → SR state → session_answer → study_session — is the product. Documents are inputs to that graph. The graph is what users come back for, what produces value, and what cannot be rebuilt from external sources.
>
> Everything in this document flows from this. Every operation should be evaluated by what it could do to the graph.

---

## On the asymmetry rule

The single most important learning, distilled to one sentence:

**Never trade catastrophic-irreversible against cosmetic-reversible.**

The Apr 27 migration's upside was "tidier schema." The downside was "could lose user learning state." That is not a trade-off worth analyzing. The asymmetry is the answer.

This rule alone would have prevented the incident with no other safeguards in place. It belongs above every other rule because it short-circuits all of them.

---

## On data sanctity — questions are sacred even when text is regeneratable

There's a subtle but critical distinction:

- **Question text** (the literal words) is regeneratable from `documents.content` for ~$0.015 per document.
- **Question identity** (the row, its primary key, the relationships it anchors) is NOT regeneratable.

`session_answers` points to specific question IDs. Spaced repetition state is per-question. Streaks, mastery, history — all anchor on question rows. Regenerating questions creates new rows with new IDs. The old `session_answers` become orphaned. The user's accumulated learning is reset.

**Therefore: the questions table is Sacred as a database entity, even though its text content can be reproduced. Regeneration is a disaster-recovery fallback, not a valid rollback strategy.**

This applies generally: do not let "the data could be recreated" become a rationalization for risk. The graph relationships are what matter, not the contents of any single field.

---

## On migrations specifically

- **Additive migrations are safe. Destructive migrations are not.** Adding columns, adding indexes, populating new data: low risk. Dropping anything (column, table, constraint), modifying NOT NULL on populated tables, anything that requires SQLite's table-swap pattern: high risk.

- **SQLite has a peculiar gotcha**: it doesn't support `ALTER COLUMN ... SET NOT NULL` directly, so the standard recipe is the table-swap. This recipe is dangerous in any schema with foreign keys and cascade rules. Every implementation of this recipe must explicitly handle FK enforcement.

- **"Idempotent" doesn't mean "safe to re-run."** The migration script we wrote was idempotent in the sense that re-running it wouldn't double-execute. It was not safe to re-run because the first execution destroyed data. Idempotence and safety are different properties.

- **Verification must cover the full blast radius.** If a migration could affect tables A, B, C through cascade, the verification step must check all three before declaring success. "Rows in A preserved" is not enough.

- **Plain language always.** "Destructive-style migration" is jargon. "This will permanently delete every question linked to these documents" is plain language. The latter triggers the right risk reaction. The former does not.

- **Default to expand-contract.** Add the new shape, deploy code that handles both, backfill, verify, only contract later. Cosmetic contract steps should usually be skipped forever.

---

## On the build process

- **Plans drift into authority.** A 6-prompt build plan written at the start of a project is a hypothesis, not a contract. By Prompt 6 in this build, the plan was being followed past the point where it should have been re-questioned. *"Is this still worth doing given what we know now?"* is a question that should be asked at every prompt, especially close-out prompts that exist because the plan said so.

- **Risk is in the operations, not the prompts.** "Schema close-out" sounded small. The operation it triggered was the largest blast-radius operation in the project. Name and risk-tier the operation (drop + recreate parent table), not the prompt (tighten schema).

- **Pre-existing safety knowledge has to be active to be useful.** The V2 handoff's FK warning was visible in the project files but not consulted at the moment it was needed. Static documentation doesn't enforce itself. A standing pre-flight checklist (`PRE-MORTEM-CHECKLIST.md`) does — but only if read at the right moment, which is what the Session Startup Contract enforces.

- **Verification is part of the action, not after it.** The verification step in a migration script should be designed to detect the worst-case failure of that specific operation. Generic "row count preserved" verification doesn't satisfy this. For a parent table with cascading children, the verification must check children.

---

## On the innocent-operation pattern

Apr 27 has a clear signature worth naming so it can be recognized in the future.

**The pattern**: a high-risk operation arrives in conversation disguised as low-risk admin.

**Tells**:
- Framing words: "small," "quick," "cleanup," "close-out," "tighten," "tidy"
- Plan-driven justification: "the plan said to" rather than "this is necessary now"
- Cosmetic upside: neater schema, consistency, "elegance"
- Easy-to-write prompt: short, clear, doesn't sound risky

**The lesson**: if the framing is innocent but the underlying classification is Tier 3+, the framing is the lie. Trust the classification.

The framing is sometimes intentional (someone trying to slip a risky change through) and sometimes unintentional (the language of "tidy up" is genuinely how the operation appears at the prompt level). Either way, the agent's job is to look past the framing.

---

## On recovery

- **Turso free tier has point-in-time recovery via dashboard "Create From Point-in-Time."** This is the first move for any data incident. Free tier window appears to be at least 6 hours; verify per incident.

- **Recover into a branch, never overwrite.** Creating `memorium-recovery` and switching env vars is reversible. Restoring directly over `memorium` is not. The branch approach also lets you compare current vs recovered state to understand what was lost.

- **The recovery dance**: Branch → verify counts on all critical tables → update local `.env.local` → test locally → update Vercel env vars → redeploy → verify production. Each step has an out if it fails. Don't skip steps.

- **Recovery is itself Tier 4.** A failed recovery is worse than the original incident. The Apr 27 recovery had a Clerk env var corruption during the env-switch step. Treat recovery operations with the same friction as the operations they're recovering from.

- **Editing `.env.local` is a low-skill, high-risk operation.** Got bitten once during recovery. Use VS Code (Cmd+P, Cmd+S — visible) over nano for env files. Verify all variables are intact after editing, not just the ones you intended to change.

---

## On working with Claude Code (the agent)

- **Claude Code's "all done" verification is shallow.** It runs the steps you specify. If you don't specify a check, it doesn't run one. This is true of any agent — the chat-side Claude has to write more thorough verification steps.

- **Idempotency checks are good, but not a substitute for safety checks.** The migration script had a re-run safety check (detect already-NOT-NULL and skip). It did not have a data-preservation safety check (back up cascade-affected tables before DROP).

- **Time-to-completion is a signal.** Long Claude Code runs (>10 min) are a yellow flag worth watching but not stopping. Short ones on destructive operations are a red flag — fast destruction means thorough safety steps were skipped.

---

## On LLM and agent behavior — the operating principle

Agents verify what they were told to verify, on the happy path of the operation they just executed. They do not, by default, verify the worst plausible failure mode of the operation.

**This is not a flaw to fix in the agent. It's a property to design around.**

**Operating principle**: For Tier 3+ operations, verification must be specified to catch the worst plausible failure of that specific operation, not the success of the intended steps.

For destructive migrations: verify that the data we wanted to keep is still there. Specifically. By table. By count. By identity. By relationship.

Generic "did the operation finish" verification is theater. Specific "did the dependent data survive" verification is real.

**Corollary — the two-clock rule**: the agent verifies what it was told to verify. The user verifies what the user actually experiences. Both must pass before an operation is "done." On Apr 27, only the user clock detected the failure.

---

## On the user-assistant working relationship

- **The user's anger after the incident was correct and proportionate.** It led to better rules. Anger about a data-loss event is information, not noise.

- **The user surfaced something the assistant had not articulated**: *"the algorithm is useless if we lose track of study sessions and progress."* This sentence is now the foundation of the data hierarchy. Listening to user-frustration-as-product-thesis is more valuable than defending the technical decision that caused the frustration.

- **Plain-language risk communication should be standard, not reserved for emergencies.** The user said *"even if you had written 'this migration could cascade' I would have NOT understood the actual risks."* This is the bar — the user must be able to understand the worst case from the assistant's pre-flight description, with no domain knowledge required.

- **Trust is per-operation, not accrued.** A long string of successful low-risk work doesn't license skipping pre-flight on the next high-risk one. If anything, verification fatigue makes the next operation more dangerous, not less.

---

## The summary, in one paragraph

The Apr 27 incident was not caused by a single bad decision but by a stack of small ones that compounded: a cosmetic operation framed as cleanup, a migration script that didn't handle cascades, verification scoped to the wrong table, plain-language risk communication missing, and a pre-existing safety warning that was visible but inert. Defense in depth was zero. Recovery worked only because Turso's free-tier PITR happened to be available. The lessons here translate into mechanical controls (specified in `PRE-MORTEM-CHECKLIST.md`) and active rules (specified in `SESSION-STARTUP-CONTRACT.md`) that together break the failure chain at multiple independent points. The single most important takeaway: never trade catastrophic-irreversible against cosmetic-reversible.
