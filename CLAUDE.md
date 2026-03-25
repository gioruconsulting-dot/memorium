# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev            # Start dev server (localhost:3000)
npm run build          # Production build
npm run lint           # ESLint
npm run db:migrate     # Run schema SQL against Turso (requires .env.local)
npm run db:test        # CRUD smoke test against live Turso DB
npm run test:api       # Call Claude API and validate question generation output
```

All `db:*` and `test:*` scripts require `.env.local` with `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, and `ANTHROPIC_API_KEY`. Copy `.env.example` to get started.

## Architecture

**Stack:** Next.js 16 (App Router, JavaScript — no TypeScript), Tailwind CSS v4, Turso (libsql/SQLite), deployed on Vercel. `"type": "module"` is set in `package.json` — use ESM imports everywhere.

### Data flow

```
Upload page  →  POST /api/documents/create
                  → generateQuestions() (Claude API, 3 retries)
                  → insertDocument() + insertQuestion() × N
                  → returns { documentId, title, questionCount }

Study page   →  GET  /api/questions/session   (getDueQuestions, next_review_at ≤ now)
             →  POST /api/sessions/start
             →  POST /api/questions/grade      (updateQuestionAfterGrade + spaced-rep math)
             →  POST /api/sessions/complete
```

### Database (`lib/db/`)

- **`client.js`** — singleton `getDb()`, throws if `TURSO_DATABASE_URL` missing, enables `PRAGMA foreign_keys = ON`
- **`schema.js`** — `SCHEMA_SQL` array run by `scripts/migrate.js`; 5 tables: `users`, `documents`, `questions`, `study_sessions`, `session_answers`. All timestamps are Unix epoch integers (`strftime('%s', 'now')`).
- **`queries.js`** — all DB access lives here. Hardcodes `USER_ID = 'default-user'` (solo-user app). FK cascades are not reliably enforced by libsql, so `deleteDocument()` manually deletes child rows in order.

### AI (`lib/ai/generate-questions.js`)

Calls Anthropic `/v1/messages` directly via `fetch` (no SDK). Model read from `process.env.CLAUDE_MODEL`, fallback `claude-sonnet-4-20250514`. Asks for exactly 20 questions, accepts ≥15, retries up to 3× with backoff. Returns objects with fields: `question`, `type` (`recall`|`application`|`connection`), `correctAnswer`, `explanation`, `sourceReference`.

### API routes (`app/api/`)

Routes not yet implemented return `{ message: "Not implemented yet" }` with status 501. Implemented so far: `POST /api/documents/create` (full upload + question generation pipeline).

### Spaced repetition grading

Grades are `easy`, `hard`, or `forgot`. In `queries.js`: `easy` and `hard` both increment `correct_count`; `forgot` increments `incorrect_count`. The interval math (updating `next_review_at` and `current_interval_days`) is the responsibility of `POST /api/questions/grade` — not yet implemented.

### Styling

Tailwind v4 with `@import "tailwindcss"` (not `@tailwind` directives). CSS custom properties defined in `app/globals.css` for the full colour system (`--color-accent`, `--color-easy`, `--color-hard`, `--color-forgot`, etc.) with automatic dark mode via `@media (prefers-color-scheme: dark)`. Google Fonts DM Sans (body) and DM Serif Display (headings) loaded via `next/font/google` in `layout.js`.
