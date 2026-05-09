# Memorium — Technical Architecture

**Version**: 2.0  
**Target**: Solo developer using Claude Code on MacBook Air M4 (16GB RAM)  
**Timeline**: Ship by late May 2026

---

## Stack Overview

| Layer | Choice | Rationale |
|-------|--------|-----------|
| **Frontend** | Next.js 15 (React) | Built-in API routes, file-based routing, excellent Claude Code support |
| **Language** | JavaScript (not TypeScript) | Faster iteration for first build, can add types later |
| **Database** | SQLite (via Turso) | Serverless, free tier, easy migration to multi-device later |
| **Backend API** | Next.js API Routes | Serverless functions, no separate backend needed |
| **AI Integration** | Anthropic Claude API | Direct HTTP calls from API routes (secure) |
| **Hosting** | Vercel | Free tier, zero-config Next.js deployment, edge functions |
| **Styling** | Tailwind CSS | Utility-first, mobile-responsive, works great with Claude Code |
| **Auth (v2)** | Clerk | Drop-in Next.js integration, free tier for solo use |

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js)                    │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Upload     │  │    Study     │  │   Progress   │     │
│  │     Page     │  │    Page      │  │     Page     │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
│         │                  │                  │              │
│         └──────────────────┴──────────────────┘              │
│                            │                                 │
└────────────────────────────┼─────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                   BACKEND (API Routes)                       │
│                                                              │
│  /api/documents/create  ← Upload + Generate Questions       │
│  /api/questions/get     ← Fetch session questions           │
│  /api/questions/grade   ← Record performance                │
│  /api/stats/summary     ← Get analytics                     │
│                                                              │
│  Each route:                                                 │
│  1. Validates request                                        │
│  2. Queries/updates SQLite (Turso)                          │
│  3. Calls Claude API if needed (question generation)        │
│  4. Returns JSON                                             │
└────────────────────────────────────────────────────────────┘
                             │
                ┌────────────┴────────────┐
                │                         │
                ▼                         ▼
    ┌───────────────────┐     ┌──────────────────┐
    │   Turso SQLite    │     │  Claude API      │
    │   (Database)      │     │  (Question Gen)  │
    │                   │     │                  │
    │  - documents      │     │  Sonnet 4        │
    │  - questions      │     │  20 Qs/doc       │
    │  - sessions       │     │                  │
    └───────────────────┘     └──────────────────┘
```

---

## Stack Decisions — Rationale & Trade-offs

### 1. Next.js 15 (React Framework)

**Why Next.js over alternatives:**
- ✅ **Built-in API routes** — no separate Express server needed
- ✅ **File-based routing** — intuitive for Claude Code to scaffold
- ✅ **Server + client in one repo** — simpler mental model for first build
- ✅ **Vercel deployment** — literally `vercel deploy` and you're live
- ✅ **Industry standard** — best Claude Code training data

**Trade-offs:**
- ❌ More boilerplate than vanilla HTML (but Claude Code handles this)
- ❌ Steeper learning curve than single-file app (mitigated by Claude Code)

**Alternatives considered:**
- **Vanilla HTML/JS** — too brittle for proper rebuild, hard to maintain
- **Vite + React** — requires separate backend (Express/Fastify)
- **Remix** — excellent but less Claude Code training data
- **Svelte/SvelteKit** — less ecosystem support, harder to debug with AI

**Confidence**: 90% — Next.js is the right call for solo dev + Claude Code workflow.

---

### 2. SQLite via Turso (Serverless Database)

**Why Turso over alternatives:**
- ✅ **SQLite compatibility** — can develop locally, deploy globally
- ✅ **Generous free tier** — 9GB storage, 1B row reads/month (you'll use <1%)
- ✅ **Embedded in Next.js** — no separate DB server to manage
- ✅ **Easy migration path** — if you need auth later, data is already in a real DB
- ✅ **Edge-ready** — works with Vercel's serverless functions

**Trade-offs:**
- ❌ Not as simple as localStorage (but you need multi-device eventually)
- ❌ Requires API calls (but imperceptible latency for your use case)

**Alternatives considered:**
- **localStorage** — traps data in browser, no multi-device, fragile
- **PostgreSQL (Supabase/Neon)** — overkill for your data size (<10MB/year)
- **MongoDB Atlas** — document DB makes sense but less Claude Code training data for schema design
- **PlanetScale** — MySQL, good but more complex than SQLite

**Confidence**: 85% — Turso is the right balance of simplicity + future-proofing. Could swap to Supabase later if you want built-in auth, but Turso + Clerk is cleaner separation.

---

### 3. Next.js API Routes (Backend)

**Why API routes over separate backend:**
- ✅ **Colocation** — frontend and backend in same repo, same deploy
- ✅ **Serverless** — no server to maintain, scales to zero
- ✅ **Vercel optimization** — edge functions, automatic HTTPS
- ✅ **Simple auth later** — Clerk middleware just wraps routes

**Trade-offs:**
- ❌ Tied to Vercel (but you're already using it)
- ❌ Cold starts (but <100ms for your traffic)

**Alternatives considered:**
- **Express.js** — requires separate deploy (Railway/Fly.io), more moving parts
- **tRPC** — type-safe APIs but requires TypeScript (you're using JS)
- **GraphQL** — massive overkill for CRUD operations

**Confidence**: 95% — API routes are the obvious choice for Next.js + Vercel.

---

### 4. Anthropic Claude API (Question Generation)

**Implementation approach:**
- API calls happen **server-side only** (API routes)
- API key stored in Vercel environment variables (never exposed to client)
- Model: **Claude Sonnet 4** (balance of speed + quality)
- Prompt engineering: Generate 20 questions per document (recall/application/connection mix)

**Cost estimate:**
- ~$0.015 per document (20 questions)
- 1 doc/week × 52 weeks = **~$0.78/year**
- Negligible cost

**Error handling:**
- Retry logic (exponential backoff)
- Fallback: Manual question creation if API fails (v2 feature)

**Confidence**: 100% — this is the core value prop, non-negotiable.

---

### 5. Tailwind CSS (Styling)

**Why Tailwind:**
- ✅ **Utility-first** — Claude Code excels at generating Tailwind classes
- ✅ **Mobile-responsive** — built-in breakpoints (critical for phone use)
- ✅ **No CSS files** — everything in JSX, easier to iterate
- ✅ **Consistent design system** — spacing, colors, typography scales

**Trade-offs:**
- ❌ Class names get verbose (but readable with good formatting)

**Alternatives considered:**
- **CSS Modules** — more manual work, harder for Claude Code
- **Styled Components** — runtime cost, less Claude Code training data
- **Plain CSS** — too much overhead for a solo project

**Confidence**: 90% — Tailwind is the standard for Next.js + AI-assisted development.

---

### 6. Vercel (Hosting)

**Why Vercel:**
- ✅ **Zero-config Next.js** — `vercel deploy` and done
- ✅ **Free tier** — 100GB bandwidth/month (you'll use <1GB)
- ✅ **Automatic HTTPS** — no cert management
- ✅ **Edge functions** — fast API responses globally
- ✅ **Preview deployments** — every git push = live URL for testing

**Trade-offs:**
- ❌ Vendor lock-in (but easy to migrate if needed)

**Alternatives considered:**
- **Netlify** — similar but worse Next.js support
- **Railway** — good for traditional servers, overkill here
- **Cloudflare Pages** — excellent but less Next.js optimization

**Confidence**: 95% — Vercel is the obvious choice for Next.js.

---

### 7. Clerk (Authentication — v2)

**Why pre-architect for Clerk now:**
- ✅ **Drop-in Next.js integration** — middleware + React components
- ✅ **Free tier** — 10k MAUs (you're 1 user)
- ✅ **Handles everything** — email/password, Google OAuth, session management
- ✅ **No backend code** — Clerk handles auth, you just check `userId`

**v1 implementation:**
- **No auth yet** — just build the data model with a `userId` field (default: 'default-user')
- **v2 flip switch** — add Clerk, populate real `userId` values

**Alternatives considered:**
- **NextAuth.js** — more DIY, good but requires more backend logic
- **Supabase Auth** — ties you to Supabase for DB (possible but less flexible)
- **Roll your own** — never do this

**Confidence**: 80% — Clerk is the right choice *if* you add multi-user later. If you truly stay solo forever, this is over-engineering.

---

## Data Flow Examples

### Example 1: Upload Document

```
User pastes text → Frontend sends POST /api/documents/create
                                      ↓
                     API route validates content
                                      ↓
                     Calls Claude API (generate 20 questions)
                                      ↓
                     Saves document + questions to Turso
                                      ↓
                     Returns success + document ID
                                      ↓
                     Frontend shows "20 questions generated"
```

### Example 2: Daily Study Session

```
User clicks "Start Session" → Frontend sends GET /api/questions/session
                                              ↓
                               API route runs smart scheduling algorithm:
                               1. Fetch all questions from Turso
                               2. Filter: not mastered, has answer
                               3. Sort: due → risky → old → wildcard
                               4. Take top 15 (or fewer if not available)
                                              ↓
                               Returns questions array
                                              ↓
                               Frontend displays Q1, starts timer
```

### Example 3: Grade Question

```
User grades "Easy" → Frontend sends POST /api/questions/grade
                     { questionId: 123, grade: "easy", attempt: "..." }
                                      ↓
                     API route updates question in Turso:
                     - correctStreak++
                     - nextReview = now + (interval × 2)
                                      ↓
                     Returns updated question
                                      ↓
                     Frontend shows next question
```

---

## Local Development Workflow

1. **Clone repo** (after initial Claude Code scaffold)
2. **Install dependencies**: `npm install`
3. **Set up environment variables**:
   ```bash
   # .env.local
   ANTHROPIC_API_KEY=sk-ant-...
   TURSO_DATABASE_URL=libsql://...
   TURSO_AUTH_TOKEN=...
   ```
4. **Run dev server**: `npm run dev` (localhost:3000)
5. **Claude Code workflow**:
   - Ask Claude Code to implement one feature at a time
   - Test in browser
   - Commit to git
   - Push to GitHub
   - Vercel auto-deploys

---

## Deployment Strategy

### Initial Deploy
1. Push code to GitHub
2. Connect GitHub repo to Vercel
3. Add environment variables in Vercel dashboard
4. Vercel auto-builds and deploys
5. Access at `memorium.vercel.app`

### Continuous Deployment
- Every push to `main` branch → auto-deploy to production
- Every PR → preview deployment (unique URL for testing)

---

## Security Considerations

1. **API key protection**: Claude API key only in serverless functions (never in client code)
2. **CORS**: API routes only accept requests from your domain
3. **Rate limiting**: Implement simple rate limiting on `/api/documents/create` (max 10 docs/hour)
4. **Input validation**: Sanitize user text before sending to Claude API
5. **SQL injection**: Use Turso's parameterized queries (prevents injection)

---

## Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| **Page load** | <2s | Next.js SSR + Vercel edge |
| **Question generation** | <10s | Claude API latency |
| **Study session start** | <500ms | DB query + scheduling |
| **Question grading** | <200ms | Simple DB update |

---

## What's NOT in This Architecture

❌ **Real-time sync** (WebSockets) — not needed for daily batch usage  
❌ **Offline-first** (PWA with service workers) — defer to v2  
❌ **CDN for assets** — Next.js + Vercel handles this  
❌ **Caching layer** (Redis) — premature optimization  
❌ **Microservices** — monolith is fine for solo project  
❌ **Monitoring/logging** (Sentry, LogRocket) — add after v1 ships if needed  

---

## Migration Path (v1 → v2)

If you need to add features later:

1. **Multi-device sync**: Already handled (Turso is cloud-based)
2. **Authentication**: Add Clerk, update API routes to check `userId`
3. **PDF upload**: Add `pdf-parse` library, pre-process in API route
4. **YouTube transcripts**: Add YouTube API integration or use third-party service
5. **Mobile app**: Next.js already mobile-responsive, can wrap in Capacitor if needed

---

## Open Questions / Decisions Needed

None — architecture is locked based on your constraints and Claude Code workflow.

---

**Next**: Data Model (database schema)
