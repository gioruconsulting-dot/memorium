# Notes v5 — Chunk 1a calibration notes

Captured immediately after Chunk 1a shipped (2026-05-21). These are
calibration notes, not incident learnings — nothing went wrong with the
migration itself, but the process around it had friction worth naming.

## 1. Match ceremony to risk tier

Branch-first protocol is calibrated for Tier 4 destructive operations.
For Tier 3 additive ops with PITR confirmed available, branch-first adds
more failure surface than it removes. Tonight: the branch DDL worked
fine; the env-switching dance to verify the branch from a local app
caused 30 minutes of friction protecting against a class of failure the
operation couldn't cause anyway.

For the next additive op: apply directly to production, verify counts
unchanged + schema correct + app still loads against production. Use
PITR as the safety net if anything's wrong. Skip the branch.

The Pre-Mortem Checklist's tier rubric already says this implicitly.
Honor it — don't over-apply the heavy protocol.

## 2. Turso branch tokens are per-branch by default

Auth tokens generated for a database (e.g., memorium-recovery) do not
authenticate against new branches with different names. The "same group
token works" intuition is wrong. Generate explicitly:

    turso db tokens create <branch-name>

Treat this as a setup step before pointing any client at a branch, not
an afterthought. Tonight: 401 errors from the dev app masqueraded as
schema or auto-adopt issues; root cause was always the missing
branch-scoped token.

## 3. .env.local backups are fragile

A `cp .env.local .env.local.bak` captures whatever is in the file at
that moment. If the file is mid-edit, in a transient state, or already
modified, the backup is wrong — and you won't know until you try to
restore from it.

Two rules going forward:
- Verify a backup immediately after making it. Read the URL and token
  back, confirm they're the production values you expected.
- One backup at a time. Sequentially-named backups
  (.bak.chunk-1a, .bak.chunk-1a-attempt2, …) create a
  which-one-is-clean confusion surface. If you need a new backup,
  overwrite the old.

## 4. Multi-line env edits double the slip risk

When you have to change both URL and token, you're editing two lines.
The Apr-27 Clerk corruption pattern is exactly that — touching multiple
env vars at once. Run `diff` immediately after every multi-line edit
and confirm only the lines you intended changed.

## 5. Clean agent-clock report is necessary but not sufficient

Levels 1–3 (counts, schema, identity) on the branch were all clean
tonight. The user-clock verification still failed — not because the
schema was wrong, but because the local app couldn't authenticate to
the branch. A clean agent-clock report doesn't mean the user-clock
setup is sound. The user-clock check has its own failure modes, some
of which have nothing to do with the migration being verified.