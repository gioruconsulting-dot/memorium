#!/usr/bin/env bash
set -euo pipefail

# Notes v5 personal-use local runner — masterplan §3 Chunk 7.
#
# Starts the Next.js dev server against the local SQLite DB
# (.data/memorium-local.db). The TURSO_DATABASE_URL / TURSO_AUTH_TOKEN
# overrides below force the app off the production Turso DB even though
# .env.local also has the production values; inline env always beats
# .env.local in Next.js's load order.
#
# Other secrets (Clerk dev keys, ANTHROPIC_API_KEY) are NOT touched here —
# Next.js loads them from .env.local automatically.
#
# Lifecycle: leave this Terminal window open for the week. Next.js dev
# runs as a foreground process; Ctrl-C in this window stops it. Laptop
# sleep/wake does not kill it. Restart only on Mac reboot or if the
# Terminal window closes.

cd "$(dirname "$0")/.."

exec env \
  TURSO_DATABASE_URL=file:.data/memorium-local.db \
  TURSO_AUTH_TOKEN= \
  npm run dev
