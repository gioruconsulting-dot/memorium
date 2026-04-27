#!/usr/bin/env bash
# .claude/hooks/pre-bash-safety-check.sh
#
# PreToolUse hook for Claude Code. Blocks dangerous database and env operations
# defined in docs/safety/SESSION-STARTUP-CONTRACT.md "Forbidden Patterns".
#
# Setup:
#   1. Save this file as .claude/hooks/pre-bash-safety-check.sh in your repo root
#   2. chmod +x .claude/hooks/pre-bash-safety-check.sh
#   3. Add to .claude/settings.json:
#        {
#          "hooks": {
#            "PreToolUse": [{
#              "matcher": "Bash",
#              "hooks": [{
#                "type": "command",
#                "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/pre-bash-safety-check.sh"
#              }]
#            }]
#          }
#        }
#
# Exit codes:
#   0  = allow command to run
#   2  = block command, surface stderr to Claude (it will see the message and stop)
#
# This hook is mechanical, not memory-based. It fires regardless of what Claude
# Code "remembers" about the rules.

set -euo pipefail

# Read the tool call from stdin (Claude Code passes JSON)
INPUT=$(cat)

# Extract the command being run (jq required; falls back to grep if not installed)
if command -v jq >/dev/null 2>&1; then
  COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // ""')
else
  COMMAND=$(echo "$INPUT" | grep -oP '"command"\s*:\s*"\K[^"]+' || echo "")
fi

# If we couldn't extract a command, fail open with a warning to stderr (don't block)
if [ -z "$COMMAND" ]; then
  echo "[safety-hook] Warning: could not parse command from tool input" >&2
  exit 0
fi

# Sacred and Parent-of-Sacred tables — keep in sync with DATA-SANCTITY.md
SACRED_TABLES="users|questions|study_sessions|session_answers|question_feedback|documents"

block() {
  local reason="$1"
  cat >&2 <<EOF

================================================================
BLOCKED by safety hook (.claude/hooks/pre-bash-safety-check.sh)
================================================================

Command:
  $COMMAND

Reason:
  $reason

This pattern is in the Forbidden Patterns list in
docs/safety/SESSION-STARTUP-CONTRACT.md.

If this block is wrong (false positive), ask Gio to:
  1. Confirm the operation is genuinely needed
  2. Run it manually outside Claude Code, OR
  3. Temporarily disable this hook in .claude/settings.json with
     a documented reason

Do NOT bypass by rewriting the command to avoid pattern detection.
That defeats the safety mechanism and is itself a violation of
the Session Startup Contract.

================================================================
EOF
  exit 2
}

# Normalize for case-insensitive matching
CMD_LOWER=$(echo "$COMMAND" | tr '[:upper:]' '[:lower:]')

# ============================================================
# Pattern 1: DROP TABLE on any Sacred or Parent-of-Sacred table
# ============================================================
if echo "$CMD_LOWER" | grep -qE "drop[[:space:]]+table[[:space:]]+(if[[:space:]]+exists[[:space:]]+)?($SACRED_TABLES)\b"; then
  block "DROP TABLE on a Sacred or Parent-of-Sacred table is forbidden.
  These tables hold or cascade into the user's accumulated learning state."
fi

# ============================================================
# Pattern 2: SQLite table-swap pattern (CREATE new + DROP old)
# Detects 'create table' near 'drop table' targeting a sacred table
# ============================================================
if echo "$CMD_LOWER" | grep -qE "drop[[:space:]]+table" && \
   echo "$CMD_LOWER" | grep -qE "create[[:space:]]+table" && \
   echo "$CMD_LOWER" | grep -qE "($SACRED_TABLES)"; then
  block "SQLite table-swap pattern detected on a Sacred or Parent-of-Sacred table.
  This pattern caused the Apr 27 incident. Use expand-contract migration instead.
  See docs/safety/PRE-MORTEM-CHECKLIST.md → 'Expand-Contract Migration Rule'."
fi

# ============================================================
# Pattern 3: DELETE FROM Sacred table without WHERE clause
# ============================================================
if echo "$CMD_LOWER" | grep -qE "delete[[:space:]]+from[[:space:]]+($SACRED_TABLES)\b" && \
   ! echo "$CMD_LOWER" | grep -qE "delete[[:space:]]+from[[:space:]]+($SACRED_TABLES)[^;]*\bwhere\b"; then
  block "DELETE FROM Sacred table without bounded WHERE clause is forbidden.
  Add a WHERE clause that bounds the deletion."
fi

# ============================================================
# Pattern 4: UPDATE Sacred table without WHERE clause
# ============================================================
if echo "$CMD_LOWER" | grep -qE "update[[:space:]]+($SACRED_TABLES)[[:space:]]+set" && \
   ! echo "$CMD_LOWER" | grep -qE "update[[:space:]]+($SACRED_TABLES)[^;]*\bwhere\b"; then
  block "UPDATE on Sacred table without bounded WHERE clause is forbidden.
  Add a WHERE clause that bounds the update."
fi

# ============================================================
# Pattern 5: Editing .env files (env var safety per Apr 27 lesson)
# ============================================================
if echo "$CMD_LOWER" | grep -qE "(nano|vim|vi|sed[[:space:]]+-i|>[[:space:]]*\.env|>>[[:space:]]*\.env)" && \
   echo "$CMD_LOWER" | grep -qE "\.env"; then
  block "Direct edit of .env file detected.
  Env var changes are Tier 3 by default. Per Apr 27 lesson: editing .env in
  terminal corrupted a Clerk key during recovery. Open the file in VS Code
  (visible diff) and edit there.
  See docs/safety/PRE-MORTEM-CHECKLIST.md → 'Environment Variable Safety'."
fi

# ============================================================
# Pattern 6: Operations against production database URL
# Specifically flags production-pointing turso commands
# ============================================================
if echo "$CMD_LOWER" | grep -qE "turso[[:space:]]+db[[:space:]]+(shell|destroy|rm|delete)" && \
   echo "$COMMAND" | grep -qiE "(memorium|production|prod)" && \
   ! echo "$COMMAND" | grep -qiE "(branch|recovery|test|dev|staging)"; then
  block "Operation appears to target production Turso database.
  Production write operations require:
    1. Visible pre-flight per PRE-MORTEM-CHECKLIST.md
    2. Explicit Gio approval
    3. Branch-first protocol (run on a Turso branch, not production)
  If this is a read-only operation, this is a false positive — confirm with Gio."
fi

# ============================================================
# Pattern 7: PRAGMA foreign_keys (FK enforcement changes)
# ============================================================
if echo "$CMD_LOWER" | grep -qE "pragma[[:space:]]+foreign_keys[[:space:]]*=[[:space:]]*off"; then
  block "PRAGMA foreign_keys = OFF detected.
  This disables FK enforcement and is exactly the kind of operation that needs
  human review. Note: Turso does not support this over remote connections
  (V2 handoff #19). Use Turso shell only, and only after pre-flight approval."
fi

# All checks passed
exit 0
