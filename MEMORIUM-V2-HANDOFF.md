# Repetita (formerly Memorium) — Handoff Brief for v2

**Date**: 30 March 2026  
**Status**: v2 Steps 1-2 complete + security fixes + UX improvements + custom domain + rebrand  
**Project location**: `~/Projects/memorium` (repo name unchanged)  
**Production URL**: repetita.org (also accessible via memorium-gold.vercel.app)  
**Domain registrar**: Hostinger (repetita.org)

---

## What's Done

### v1 (Complete — shipped 26 March 2026)

All 15 build steps deployed:

- Project scaffold + routing (Next.js 16, App Router)
- Turso DB connected with full schema (5 tables: users, documents, questions, study_sessions, session_answers)
- Claude API question generation (20 Qs per doc, accepts 15-20)
- Upload document API + UI (paste text or upload .txt/.md, dark theme with purple accent buttons)
- Study session API (smart scheduling, abandoned session handling)
- Grade question API (SR algorithm: Easy doubles interval, Hard stays 1-3 days and does NOT advance streak, Forgot resets to 1 day)
- Study session UI (answer → reveal → grade flow, adaptive length that stops at 10 if 3+ forgot, collapsible explanation/source, question summary table on complete screen)
- Complete session API + motivational message at session start
- Stats dashboard API + UI (4 stat cards: total questions, mastered, accuracy, streak)
- Document library API + UI (list + delete documents)
- Navigation component (bottom on mobile, top on desktop)
- Deployed to Vercel with environment variables configured
- UI polish passes on upload and study pages
- Page titles use accent color across all pages

### v2 Step 1: Clerk Authentication (Complete — 28 March 2026)

- Installed @clerk/nextjs
- Google OAuth sign-in only (no email/password)
- ClerkProvider wraps app in layout.js
- middleware.js protects all routes except /sign-in and /sign-up
- Sign-in page at /sign-in/[[...sign-in]]/page.js
- Sign-up page at /sign-up/[[...sign-up]]/page.js
- All API routes use auth() from @clerk/nextjs/server — no more 'default-user'
- UserButton component in navigation (shows avatar, sign-out)
- v1 data migrated from 'default-user' to real Clerk user ID via Turso shell
- /lib/db/ensure-user.js auto-creates user row on first action (INSERT OR IGNORE)

### v2 Step 2: Shared Document Library (Complete — 28 March 2026)

- Added is_public column to documents table (default 1, all docs public)
- GET /api/documents/browse — returns all public docs from other users, excludes already-adopted
- POST /api/documents/adopt — copies question rows with fresh SR state for current user
- /app/browse/page.js — browse page with "Add to My Library" button per document
- Navigation updated with "Browse" link
- Smart landing page: new users (0 docs + 0 questions) → /browse, existing users → home page with choices
- Library page shows both uploaded and adopted documents with visual distinction:
  - Uploaded docs: violet tint + left border with "Uploaded" badge
  - Adopted docs: plain surface with "Adopted" badge
- Delete behavior is user-scoped:
  - Deleting uploaded doc: removes only YOUR questions. If other users adopted it, document row stays (user_id set to placeholder). If no one else has questions, document row deleted too.
  - Deleting adopted doc: removes only YOUR questions, never touches the original document.

### Security Fixes (28 March 2026)

- sessions/complete: Added auth() + userId scoping (was unprotected)
- questions/grade: Added question ownership check (user_id match → 403 if not owner)
- questions/grade: Added session ownership check (sessionId must belong to caller)
- All DB write queries (getStudySession, completeStudySession, updateSessionCounts, updateQuestionAfterGrade) now include AND user_id = ? scoping
- documents/create: Added 500-char title length cap
- questions/grade: userAttempt truncated to 2,000 chars before insert
- documents/adopt: Removed userId from console.log (privacy)

### UX Improvements (28-30 March 2026)

- **Smart landing page**: Home page (/) shows personalized options:
  - New users (0 docs + 0 questions): Welcome page with Upload and Browse options
  - Returning users: Welcome back with name, Start Studying (shows due count), Upload, Browse
- **Question interleaving**: Study sessions now round-robin across documents instead of clustering by document. Questions from different docs are mixed for better retention.
- **Question feedback/retirement system**:
  - Thumbs-down button on study page to flag bad questions
  - question_feedback table stores all flags
  - is_retired column on questions table
  - Retired questions excluded from study sessions
  - Global retirement threshold: 3 distinct users flagging same question → auto-retire for all
  - GET /api/questions/retired endpoint for manual review
  - Analysis query: SELECT document_id, question_text, COUNT(DISTINCT user_id) as flags, MAX(created_at) as last_flagged FROM question_feedback GROUP BY document_id, question_text ORDER BY flags DESC

### Custom Domain + Rebrand (30 March 2026)

- Purchased repetita.org on Hostinger ($7.99/year, expires 2027-03-30)
- DNS configured: A record → 216.198.79.1, CNAME www → Vercel
- All user-facing text renamed from "Memorium" to "Repetita"
- Clerk application name updated to "Repetita"
- Old URL memorium-gold.vercel.app still works (redirects handled by Vercel)
- Repo name and folder name remain "memorium" (backend only, not user-facing)

---

## Environment Details

- **Node.js**: v25.8.1
- **Next.js**: 16.2.1 (Turbopack)
- **Tailwind**: v4 (uses @import "tailwindcss", CSS variables for theming)
- **Database**: Turso (SQLite)
- **Auth**: Clerk (Google OAuth only, currently in Development mode)
- **Hosting**: Vercel (connected to GitHub, auto-deploys on push to main)
- **Domain**: repetita.org (Hostinger) → Vercel
- **AI Model**: claude-sonnet-4-20250514 (configurable via CLAUDE_MODEL env var)
- **Run migrations**: `node --env-file=.env.local scripts/migrate.js`
- **Dev server**: `npm run dev` on localhost:3000
- **.env.local contains**: `ANTHROPIC_API_KEY`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `CLAUDE_MODEL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
- **Vercel env vars**: Same as above (all 6 keys configured)

---

## Key Files

- lib/db/client.js — singleton getDb()
- lib/db/queries.js — all DB access, every function takes userId as explicit param
- lib/db/schema.js — 5 tables: users, documents, questions, study_sessions, session_answers
- lib/db/ensure-user.js — auto-creates user row on first DB write
- lib/ai/generate-questions.js — calls Anthropic API via fetch, 20 questions, accepts ≥15, retries 3×
- middleware.js — Clerk middleware, protects all routes except /sign-in and /sign-up
- components/Navigation.js — client component, links: Study, Upload, Browse, Progress, Library + UserButton

---

## Decisions Log (Carry Forward)

1. Hard grade does NOT advance correct_streak
2. max_tokens set to 8000 for question generation
3. Accept 15-20 questions (not strictly 20)
4. Scheduling logic is in JavaScript, not SQL
5. session_answers table included in v1
6. Source reference shown after answer reveal
7. /api/export endpoint — still TODO
8. CLAUDE_MODEL is an env variable (not hardcoded)
9. Abandoned sessions are detected and handled when starting new session
10. Adaptive session length — stops at 10 questions if user gets 3+ forgot
11. Question summary table shown on session complete screen
12. Motivational message displayed at session start
13. Google OAuth only — no email/password auth (simplest + most secure)
14. ensureUser(userId) called before any DB write that references user_id
15. Adopted questions share same document_id as original — document row is shared
16. Delete is user-scoped: never deletes other users' questions
17. Browse page shows "Another learner" instead of uploader's real name (privacy)
18. Migration scripts: migrate-user.js, migrate-add-public.js, migrate-feedback.js
19. Turso doesn't support PRAGMA foreign_keys = OFF over remote connections — use Turso shell for FK-sensitive migrations
20. middleware.js deprecation warning in Next.js 16.2.1 — still functional, address later
21. Question interleaving: round-robin across documents in study sessions
22. Retirement threshold: 3 distinct user flags → global retirement
23. App renamed from Memorium to Repetita (30 March 2026). Repo/folder still called "memorium".
24. Clerk is in Development mode — switch to Production keys when ready for public launch

---

## Design Decisions (Current State)

- Dark theme throughout (dark gray backgrounds, not pure black)
- Accent color for page titles (was #E0FF00, may now be #EEFF99 per Claude Code summary)
- Purple/violet (bg-violet-600) for primary action buttons (upload, generate, adopt)
- Electric green (#4ADE80 / green-400) for progress bar, Easy button, positive indicators
- Amber for Hard button, Red for Forgot button
- Rounded corners (rounded-xl, rounded-2xl) on cards and inputs
- bg-gray-800 inputs with subtle borders, violet focus rings
- Collapsible explanation + source on study page
- Mobile-first responsive design
- Library: uploaded docs = violet tint + left border, adopted docs = plain surface
- Browse page: cards with "Add to My Library" purple button, "Added ✓" green state after adopt
- Google Fonts: DM Sans + DM Serif Display via next/font/google
- CSS variables for theming (--color-surface, --color-accent, etc.)

---

## Known Issues / Tech Debt

- React hydration warnings appeared on some pages — were fixed but watch for recurrence
- No /api/export endpoint yet (backup data as JSON)
- No error boundary components (crashes show white screen)
- No loading skeletons (pages flash empty before data loads)
- ON DELETE CASCADE still exists at schema level on questions→documents FK. Application logic handles delete correctly, but raw SQL deletes could still cascade.
- middleware.js convention deprecated in Next.js 16.2.1 (should migrate to "proxy" convention eventually)
- Clerk is in Development mode (shows badge on sign-in page)
- 248 questions currently due for primary user — need to address question volume management

---

## v2 Remaining Build Order

1. ~~Clerk auth~~ ✅
2. ~~Shared document library~~ ✅
3. **Question variants** — Generate 3 phrasings per question at upload time, rotate only on Hard/Forgot. Full prompt and spec in MEMORIUM-V2-PLAN.md. Should be done alongside prompt audit.
4. **Elaboration notes**
5. **Theme filtering**
6. **Session timer**

---

## Future Improvements (Captured, Not Prioritized)

### Question Volume Management (addresses 248-due-questions problem)
- **Interval acceleration**: Questions with correct_streak ≥ 8 jump to 365-day intervals instead of 180 cap
- **Document archiving**: Let users pause a document's questions without deleting
- **Adaptive session length**: Offer "Quick (10)" / "Full (20)" / "Deep (30)" based on queue depth
- **Smart retirement**: Questions with correct_streak ≥ 10 and zero incorrect in last 5 reviews → annual spot-check only

### Prompt Optimization (deferred — revisit after 2+ weeks of daily use)
- Current thumbs-down system collects data on bad questions
- After 2 weeks: run analysis query from question_feedback table to identify patterns
- Only then: tune the prompt based on real data
- Don't build richer feedback categories until patterns are clear from actual data
- Consider adding reason selection to thumbs-down (bad_question vs bad_answer) only after data review

### Other
- Clerk production mode (remove Development badge)
- /api/export endpoint for data backup
- Error boundary components
- Loading skeletons
- Per-document mastery indicator in Library

---

## Open Questions

1. ~~Should adopted documents show the original uploader's name?~~ → No, shows "Another learner" (privacy)
2. ~~Should there be a way to "un-adopt" a document?~~ → Delete from Library handles this
3. When variants are added, should existing users get a "Regenerate with variants" option for old documents? → Decided: no, variants only for new uploads
4. ~~Custom domain?~~ → Done: repetita.org
5. When to switch Clerk to production mode?

---

## How We Work

- **Discuss in Claude (chat)** — for planning, screenshots, design decisions, trade-offs
- **Build with Claude Code** — paste specific prompts, it reads files and makes changes
- **Always tell Claude Code to read files first** before making edits
- **Test after every change** — don't batch too many changes without verifying
- **Commit and push after each working change** — triggers Vercel auto-deploy
- **Data migrations**: run via `node --env-file=.env.local scripts/[script].js` or Turso shell for FK-sensitive operations
- **Claude Code context**: when it hits ~10% until autocompact, start a fresh tab. Ask Claude Code to summarize its context before closing.
