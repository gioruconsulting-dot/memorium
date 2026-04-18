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

## Project rules

This is a v1 — bias towards shipping over perfection. Don't over-engineer, don't gold-plate, don't add abstractions that aren't immediately needed.

The two things that matter most for this app:
1. **Question generation speed** — the upload → questions pipeline is the critical path. Keep it fast; don't add unnecessary async work before returning to the user.
2. **Question quality** — questions must be specific, answerable from the source content, and genuinely useful for long-term retention. If a change touches the prompt or parsing logic in `lib/ai/generate-questions.js`, run `npm run test:api` and manually review the sample output before committing.

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
- **`queries.js`** — all DB access lives here. FK cascades are not reliably enforced by libsql, so `deleteDocument()` manually deletes child rows in order.

### AI (`lib/ai/generate-questions.js`)

Calls Anthropic `/v1/messages` directly via `fetch` (no SDK). Model read from `process.env.CLAUDE_MODEL`, fallback `claude-sonnet-4-6`. Asks for exactly 20 questions, accepts ≥15, retries up to 3× with backoff. Returns objects with fields: `question`, `type` (`recall`|`application`|`connection`), `correctAnswer`, `explanation`, `sourceReference`.

### API routes (`app/api/`)

Routes not yet implemented return `{ message: "Not implemented yet" }` with status 501.

### Spaced repetition grading

Grades are `easy`, `hard`, or `forgot`. In `queries.js`: `easy` and `hard` both increment `correct_count`; `forgot` increments `incorrect_count`. Interval math lives in `POST /api/questions/grade`.

---

## Visual Design System

**Aesthetic**: "calm premium arcade" — dark near-black backgrounds, restrained violet card glow, yellow-green (`#EEFF99`) for key numbers and overlines, white for titles, muted (`#8a8880` / `var(--color-muted)`) for secondary text.

### Page wrapper (all content pages)

```js
// Always use this wrapper + StarryBackground as first child
const wrapperStyle = { position: 'relative', zIndex: 1, paddingTop: '24px', paddingBottom: '40px' };

// StarryBackground is position: fixed, zIndex: 0 — sits behind everything
import StarryBackground from '@/components/StarryBackground';
```

### Page title (Library, Progress, Study)

```js
{
  fontSize: '1.84rem', fontWeight: 700, color: '#ffffff',
  lineHeight: 1.1, marginBottom: '20px', paddingLeft: '20px',
}
```

### Standard card (Library docs, Progress sections)

```js
{
  background:   '#0e0e18',
  border:       '1px solid rgba(255,255,255,0.06)',
  borderRadius: '14px',
  padding:      '14px 16px',
  boxShadow:    '0 0 16px rgba(124,58,237,0.278), 0 0 32px rgba(124,58,237,0.101)',
}
```

### Hero card (Homepage "Start Studying" only — stronger glow)

```js
{
  background:   '#08080f',
  border:       '1px solid #16161e',
  borderRadius: '18px',
  boxShadow:    '0 0 36px rgba(124,58,237,0.6), 0 0 72px rgba(124,58,237,0.25)',
}
```

### Secondary cards (Homepage streak, add content)

```js
{
  background:   '#0e0e18',
  border:       '1px solid #1e1e2a',
  borderRadius: '14px',
  boxShadow:    '0 0 16px rgba(124,58,237,0.22), 0 0 32px rgba(124,58,237,0.08)',
}
```

### Overline label (small caps above section/card headings)

```js
{
  fontSize: '0.64rem', fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.1em',
  color: 'rgba(238, 255, 153, 0.85)',  // yellow-green — use #60A5FA for "Adopted" type only
  marginBottom: '6px',
}
```

### Card title

```js
{ fontWeight: 700, fontSize: '1rem', color: '#e8e6e1', lineHeight: 1.35 }
```

### Card gap

`10px` between cards (flex column with `gap: '10px'`, or `marginTop: 10` on non-first items).

### Rules

- **Use inline styles for all card/card-content styling.** Tailwind only for layout utilities (`flex-1`, `items-center`, `animate-pulse`, hover pseudo-classes via className).
- **Nav icons are inline SVGs** — `strokeWidth: 2.75`, `viewBox: '0 0 32 32'`. Never use PNG or emoji.
- **StarryBackground** must be the first child of the page wrapper on every content page (Library, Progress, Study — not /study flashcard flow, not /sign-in).
- Loading skeletons match card style: same `#0e0e18` bg, same border, same glow, `animate-pulse` className.

### Tailwind v4

Uses `@import "tailwindcss"` (not `@tailwind` directives). CSS custom properties in `app/globals.css`: `--color-accent`, `--color-easy`, `--color-hard`, `--color-forgot`, `--color-muted`, `--color-foreground`, `--color-background`, `--color-surface`, `--color-border`. Dark mode forced permanently.

### Fonts

DM Sans (body) and DM Serif Display (headings) via `next/font/google` in `layout.js`.
