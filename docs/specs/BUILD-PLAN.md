# Memorium — Build Plan

**Target**: Ship v1 by late May 2026  
**Approach**: Sequential steps, each self-contained and testable  
**Tool**: Claude Code on MacBook Air M4  

---

## How to Use This Plan

1. **Work through steps in order** — each builds on the previous
2. **Test after each step** — don't move forward if current step is broken
3. **One step per work session** — resist the urge to combine steps
4. **Commit to git after each step** — makes it easy to roll back if needed
5. **Reference other docs** — SCOPE.md (what's in v1), DATA-MODEL.md (schema), TECH-ARCHITECTURE.md (stack decisions)

---

## Pre-Build Checklist

Before Step 1, ensure you have:
- ✅ Node.js v25+ installed (`node -v`)
- ✅ Git installed and configured
- ✅ Anthropic API key from console.anthropic.com
- ✅ GitHub account (for version control + Vercel deployment)
- ✅ Vercel account (free tier)
- ✅ Turso account (free tier) — create at turso.tech

See ENVIRONMENT-SETUP.md for detailed instructions.

---

## Build Sequence — 15 Steps to v1

### **Step 1: Project Scaffold** (Week 1)

**Goal**: Create Next.js 15 project with basic structure.

**Tasks**:
- Initialize Next.js 15 with App Router: `npx create-next-app@latest memorium`
  - Options: No TypeScript, Yes Tailwind, Yes App Router, No src directory
- Set up project structure:
  ```
  /app
    /api
      /documents
      /questions
      /sessions
      /stats
    /upload
    /study
    /progress
    /library
    layout.js
    page.js (redirect to /study)
  /lib
    /db (database utilities)
    /ai (Claude API utilities)
  /components
  ```
- Install dependencies: `npm install @libsql/client drizzle-orm`
- Create `.env.local` with placeholder variables (see ENVIRONMENT-SETUP.md)
- Initialize git: `git init`, create `.gitignore`, first commit
- Push to GitHub: Create repo, add remote, push

**Test**:
- Run `npm run dev`
- Visit `http://localhost:3000`
- See Next.js default page

**Estimated time**: 1 hour

---

### **Step 2: Database Setup** (Week 1)

**Goal**: Connect to Turso, create schema, verify connection.

**Tasks**:
- Create Turso database (see ENVIRONMENT-SETUP.md for commands)
- Add Turso credentials to `.env.local`:
  ```
  TURSO_DATABASE_URL=libsql://...
  TURSO_AUTH_TOKEN=...
  ```
- Create `/lib/db/schema.js` with full schema from DATA-MODEL.md
  - Use Drizzle ORM syntax (example in DATA-MODEL.md)
  - Include all 4 tables: users, documents, questions, study_sessions
- Create `/lib/db/client.js` to initialize Turso connection
- Create `/lib/db/migrations.js` to run CREATE TABLE statements
- Run migration locally to create tables

**Test**:
- Create simple test script: insert one user row, query it back
- Verify in Turso dashboard that tables exist
- Delete test user row

**Estimated time**: 2 hours

---

### **Step 3: Claude API Integration** (Week 1)

**Goal**: Create utility function to generate questions from text.

**Tasks**:
- Add Anthropic API key to `.env.local`:
  ```
  ANTHROPIC_API_KEY=sk-ant-...
  ```
- Create `/lib/ai/generate-questions.js`:
  - Function signature: `async generateQuestions(content, title, themes)`
  - Uses fetch to call Anthropic API (no SDK needed)
  - Uses prompt template from API-INTEGRATION.md
  - Returns array of 20 questions
  - Includes retry logic (3 attempts, exponential backoff)
  - Handles errors gracefully
- Create test script: pass sample text, verify 20 questions returned

**Test**:
- Run test script with 500-word sample text
- Verify response has 20 questions with correct structure
- Check each question has: question_text, question_type, answer_text, explanation, source_reference

**Estimated time**: 2 hours

---

### **Step 4: Upload Document API** (Week 2)

**Goal**: API endpoint to upload document and generate questions.

**Tasks**:
- Create `/app/api/documents/create/route.js`:
  - POST endpoint
  - Accepts: `{ content, title, themes }` (JSON body)
  - Validates: content not empty, title provided
  - Calls `generateQuestions(content, title, themes)`
  - Inserts document row into DB (with generated doc_id)
  - Inserts 20 question rows into DB (with next_review_at = now, all defaults)
  - Returns: `{ documentId, questionCount }`
  - Error handling: catches API failures, returns 500 with error message
- Uses `userId = 'default-user'` (hardcoded for v1)

**Test**:
- Use curl or Postman to POST sample document
- Verify document + 20 questions appear in Turso dashboard
- Try with empty content → should return 400 error
- Try with invalid API key → should return 500 error

**Estimated time**: 2 hours

---

### **Step 5: Upload UI** (Week 2)

**Goal**: Frontend page to paste text and upload documents.

**Tasks**:
- Create `/app/upload/page.js`:
  - Text area for content (required)
  - Input for title (required, with placeholder)
  - Input for themes (optional, with placeholder "Philosophy, Stoicism")
  - File upload button for .txt/.md (reads file, populates text area + title)
  - "Generate Questions" button
  - Loading state while API is processing (show spinner)
  - Success state: "20 questions generated from [title]"
  - Error state: display API error message
- Style with Tailwind (mobile-first, clean and minimal)
- Character count display below text area

**Test**:
- Paste 500 words, fill title, click Generate
- Wait for loading state (should take ~5-10 seconds)
- See success message
- Check Turso dashboard for new document + questions
- Try on phone (resize browser to mobile width)

**Estimated time**: 3 hours

---

### **Step 6: Study Session API** (Week 3)

**Goal**: API endpoint to fetch questions for daily session.

**Tasks**:
- Create `/app/api/questions/session/route.js`:
  - GET endpoint
  - Fetches questions where `user_id = 'default-user'` AND `next_review_at <= now`
  - Implements smart scheduling algorithm (see DATA-MODEL.md "Key Queries" section):
    1. Due questions (sorted by next_review_at ASC)
    2. High-risk questions (sorted by risk score DESC)
    3. Older questions (sorted by created_at ASC)
  - Returns up to 15 questions (or fewer if not enough available)
  - Returns: `[{ id, question_text, question_type, answer_text, explanation, source_reference }, ...]`
- Create `/app/api/sessions/start/route.js`:
  - POST endpoint
  - Creates new row in `study_sessions` table
  - Returns: `{ sessionId, questions }` (includes questions from /session)

**Test**:
- Use curl to GET /api/questions/session
- Verify returns up to 15 questions
- Verify questions are due (next_review_at <= now)
- Verify sorting order matches algorithm

**Estimated time**: 2 hours

---

### **Step 7: Grade Question API** (Week 3)

**Goal**: API endpoint to record user's grade and update spaced repetition state.

**Tasks**:
- Create `/app/api/questions/grade/route.js`:
  - POST endpoint
  - Accepts: `{ questionId, grade, userAttempt, sessionId }` (JSON body)
  - Validates: grade is one of ['easy', 'hard', 'forgot', 'skipped']
  - Fetches current question state from DB
  - Calculates next interval using algorithm from DATA-MODEL.md:
    - Easy: `min(current_interval × 2, 180)` days
    - Hard: `min(current_interval, 3)` days
    - Forgot: `1` day
    - Skipped: no change
  - Updates question row:
    - Increment review_count
    - Update correct_count, incorrect_count, correct_streak, hard_count
    - Update current_interval_days
    - Update next_review_at (now + interval)
  - Updates study_session row (increment questions_answered, correct_count, incorrect_count, or skipped_count)
  - Returns: `{ success: true, nextReviewAt }`

**Test**:
- Use curl to POST grade for a question
- Verify question row updated in DB
- Verify next_review_at is correct (now + calculated interval)
- Verify study_session row updated
- Try all 4 grades (easy, hard, forgot, skipped)

**Estimated time**: 2 hours

---

### **Step 8: Study Session UI** (Week 4)

**Goal**: Frontend page to complete daily study session.

**Tasks**:
- Create `/app/study/page.js`:
  - On page load: call POST /api/sessions/start to get sessionId + questions
  - Display question 1 of N
  - Text area for user's answer (require 3+ words to enable Reveal button)
  - "Reveal Answer" button (disabled until 3+ words typed)
  - After reveal:
    - Show model answer + explanation
    - Show 3 buttons: Easy (green) / Hard (yellow) / Forgot (red)
    - Show Skip button (gray, secondary style)
  - After grade: POST /api/questions/grade, then load next question
  - After last question: call POST /api/sessions/complete (see Step 9)
  - Show progress: "Question 5 of 15" + progress bar
- Handle edge case: if 0 questions available, show "All caught up!"
- Style with Tailwind (mobile-first, large touch targets)
- Smooth transitions between questions (fade in/out)

**Test**:
- Start session with 15 questions
- Type answer (verify Reveal button enables after 3+ words)
- Reveal answer, grade Easy
- Verify next question loads
- Complete all 15 questions
- Try on phone (resize browser to mobile width)

**Estimated time**: 4 hours

---

### **Step 9: Complete Session API** (Week 4)

**Goal**: API endpoint to finalize session and show summary.

**Tasks**:
- Create `/app/api/sessions/complete/route.js`:
  - POST endpoint
  - Accepts: `{ sessionId }` (JSON body)
  - Updates study_session row:
    - Set completed_at = now
    - Calculate duration_seconds (completed_at - started_at)
  - Fetches session summary:
    - questions_shown, questions_answered, correct_count, incorrect_count
  - Returns: `{ summary: { questionsAnswered, correctCount, incorrectCount, durationSeconds } }`
- Modify `/app/study/page.js`:
  - After last question graded, call POST /api/sessions/complete
  - Show "Session Complete" screen with summary:
    - "X questions reviewed"
    - "Y remembered (Easy/Hard), Z reinforced (Forgot)"
    - "Completed in M minutes"
    - "See you tomorrow!" message
  - Button: "Start Another Session" (redirects to /study)

**Test**:
- Complete full session
- Verify completed_at and duration_seconds updated in DB
- See summary screen with correct stats
- Click "Start Another Session" → loads new session (if questions available)

**Estimated time**: 1.5 hours

---

### **Step 10: Stats Dashboard API** (Week 5)

**Goal**: API endpoint to fetch progress statistics.

**Tasks**:
- Create `/app/api/stats/summary/route.js`:
  - GET endpoint
  - Queries DB for:
    - Total questions: `SELECT COUNT(*) FROM questions WHERE user_id = 'default-user'`
    - Mastered count: `SELECT COUNT(*) WHERE correct_streak >= 5`
    - Accuracy: `SUM(correct_count) / (SUM(correct_count) + SUM(incorrect_count))`
    - Study streak: consecutive days with completed sessions (see DATA-MODEL.md)
  - Returns: `{ totalQuestions, masteredCount, accuracyPercent, studyStreak }`

**Test**:
- Use curl to GET /api/stats/summary
- Verify numbers match manual DB query
- Complete sessions on consecutive days → verify streak increments
- Skip a day → verify streak resets

**Estimated time**: 2 hours

---

### **Step 11: Stats Dashboard UI** (Week 5)

**Goal**: Frontend page to display progress statistics.

**Tasks**:
- Create `/app/progress/page.js`:
  - On page load: call GET /api/stats/summary
  - Display 4 stat cards (2×2 grid on mobile, 4×1 on desktop):
    - Total Questions (with count)
    - Mastered (with count)
    - Accuracy (with percentage)
    - Study Streak (with day count)
  - Style with Tailwind (cards with icons, large numbers, clean layout)
  - Loading state while fetching stats
- Add navigation: link from /study to /progress

**Test**:
- Visit /progress page
- Verify stats match DB
- Try on phone (verify responsive layout)
- Navigate between /study and /progress

**Estimated time**: 2 hours

---

### **Step 12: Document Library API** (Week 5)

**Goal**: API endpoints to list and delete documents.

**Tasks**:
- Create `/app/api/documents/list/route.js`:
  - GET endpoint
  - Fetches all documents for `user_id = 'default-user'`
  - Returns: `[{ id, title, themes, questionCount, createdAt }, ...]`
  - Sorted by createdAt DESC (most recent first)
- Create `/app/api/documents/delete/route.js`:
  - DELETE endpoint
  - Accepts: `{ documentId }` (JSON body or query param)
  - Deletes document row (CASCADE deletes all questions automatically)
  - Returns: `{ success: true }`

**Test**:
- Use curl to GET /api/documents/list
- Verify returns all documents
- Use curl to DELETE a document
- Verify document + questions removed from DB
- Verify GET /api/documents/list no longer includes deleted doc

**Estimated time**: 1.5 hours

---

### **Step 13: Document Library UI** (Week 6)

**Goal**: Frontend page to view and delete uploaded documents.

**Tasks**:
- Create `/app/library/page.js`:
  - On page load: call GET /api/documents/list
  - Display list of documents (one card per document):
    - Title (large, bold)
    - Themes (comma-separated, smaller text)
    - Question count (e.g., "20 questions")
    - Upload date (formatted, e.g., "Jan 15, 2026")
    - Delete button (red, with confirmation dialog)
  - Empty state: "No documents yet. Upload your first document to get started."
  - Style with Tailwind (clean cards, mobile-first)
- Add navigation: link from /upload and /progress to /library

**Test**:
- Visit /library page
- Verify documents display correctly
- Click Delete → confirm → verify document removed
- Upload new document → verify appears in library
- Try on phone

**Estimated time**: 2 hours

---

### **Step 14: Navigation & Polish** (Week 6)

**Goal**: Add global navigation and polish mobile UX.

**Tasks**:
- Create `/components/Navigation.js`:
  - Bottom nav bar on mobile (sticky)
  - Top nav bar on desktop
  - 4 links: Upload / Study / Progress / Library
  - Highlight active page
  - Icons (optional, use emoji or Tailwind icons)
- Update `/app/layout.js`:
  - Include Navigation component
  - Set mobile-first viewport meta tags
  - Add dark mode (if time permits, optional for v1)
- Polish all pages:
  - Consistent spacing and typography
  - Loading states for all API calls
  - Error states for failed API calls
  - Empty states where relevant
  - Touch targets ≥ 44px for mobile

**Test**:
- Navigate between all 4 pages
- Verify navigation highlights active page
- Try on phone (verify bottom nav is usable)
- Deliberately break API connection → verify error states display

**Estimated time**: 3 hours

---

### **Step 15: Deploy to Vercel** (Week 7-8)

**Goal**: Ship to production, test on real devices.

**Tasks**:
- Push all code to GitHub (if not already done)
- Connect GitHub repo to Vercel:
  - Sign in to vercel.com
  - Import project from GitHub
  - Vercel auto-detects Next.js, sets build settings
- Add environment variables in Vercel dashboard:
  - `ANTHROPIC_API_KEY`
  - `TURSO_DATABASE_URL`
  - `TURSO_AUTH_TOKEN`
- Deploy: Vercel builds and deploys automatically
- Test production URL:
  - Upload document
  - Complete study session
  - Check stats
  - View library
  - Delete document
- Add to phone home screen:
  - iPhone: Safari → Share → Add to Home Screen
  - Android: Chrome → Menu → Add to Home screen
- Test for 1 week of real usage:
  - Upload 3+ documents
  - Study daily
  - Look for bugs, UX issues
  - Fix critical issues, redeploy

**Test**:
- Full end-to-end flow on production URL
- Works on phone (Safari and Chrome)
- All features functional (upload, study, stats, library)
- No console errors
- API calls succeed
- Data persists between sessions

**Estimated time**: 2 hours (initial deploy) + ongoing bug fixes

---

## Post-Launch: Week 8+

### Immediate Post-Launch Tasks
- Monitor usage for 1 week
- Fix any critical bugs discovered during daily use
- Adjust spaced repetition intervals if they feel wrong
- Tune Claude API prompt if question quality is low

### When Ready for v2
- Reference SCOPE.md for v2 features
- Prioritize based on what you missed most in v1
- Likely first additions:
  - Theme filtering (study by topic)
  - Elaboration notes ("why this matters")
  - Session timer

---

## Build Milestones

**Week 1-2: Foundation is laid**
- ✅ Next.js project running locally
- ✅ Turso database connected
- ✅ Claude API generating questions
- ✅ Upload document endpoint working

**Week 3-4: Core loop is functional**
- ✅ Can upload document via UI
- ✅ Can complete full study session
- ✅ Questions get rescheduled correctly
- ✅ Session complete screen shows summary

**Week 5-6: Full v1 feature set**
- ✅ Stats dashboard displays progress
- ✅ Document library allows viewing/deleting
- ✅ Navigation works across all pages
- ✅ Mobile-responsive on phone

**Week 7-8: Shipped and validated**
- ✅ Deployed to Vercel
- ✅ Works on iPhone/Android
- ✅ Used daily for 1+ week without major issues
- ✅ v1 complete 🎉

---

## Common Pitfalls & How to Avoid

### 1. Skipping tests between steps
**Problem**: Build 5 steps, realize Step 2 was broken.  
**Solution**: Test thoroughly after each step. Don't move forward if current step is broken.

### 2. Combining steps to "go faster"
**Problem**: "I'll just do Steps 6-8 in one session" → breaks, hard to debug.  
**Solution**: One step per work session. Commit after each step.

### 3. Deviating from the plan
**Problem**: "I'll add theme filtering real quick" → scope creep.  
**Solution**: Reference SCOPE.md. If it's not v1, defer it. No exceptions.

### 4. Not testing on real phone
**Problem**: Looks great on laptop, unusable on phone.  
**Solution**: Test on actual iPhone/Android every Friday. Resize browser constantly during development.

### 5. Over-engineering the API
**Problem**: "Let me add caching/rate limiting/comprehensive error codes..."  
**Solution**: You're the only user. Make it work, ship it, optimize later if needed.

---

## Emergency: If You're Behind Schedule

**Week 4 and behind?** Cut these from v1:
- Document library (just use Turso dashboard to view/delete)
- Stats dashboard (check DB manually)
- Navigation polish (one link at a time is fine)

**Week 6 and behind?** Radical scope cut:
- Keep: Upload, Study Session, Core Loop
- Cut everything else
- Ship minimal version, add features post-launch

**Remember**: A working core loop in Week 6 is better than a feature-complete app that never ships.

---

**Next steps**: 
1. Create the Project in Claude
2. Upload all 7 docs (including this one)
3. Start with Step 1 in a fresh conversation
