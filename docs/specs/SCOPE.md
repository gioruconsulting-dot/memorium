# Memorium — Scope Definition

**Target**: Ship v1 by late May 2026  
**Constraint**: Building alongside client work and consulting practice  
**Philosophy**: Ambitious feature set, but sequenced to ship a working core fast, then layer on polish

---

## v1 — Minimum Viable Product (Ship by Late May 2026)

### Core Loop (Non-Negotiable)
✅ **Upload document** (.txt, .md, paste text)  
✅ **Generate 20 questions** via Claude API (recall, application, connection)  
✅ **Daily study session** (up to 15 questions)  
✅ **Answer → Reveal → Grade** (Easy/Hard/Forgot)  
✅ **Smart spaced repetition** (algorithm auto-adjusts intervals based on performance)  
✅ **Document library** (view uploaded docs, delete if needed)  
✅ **Basic stats dashboard** (total questions, mastered count, accuracy, streak)  

### What Makes It "Shippable"
- You can upload content every Monday
- You can study 15 questions daily Tuesday-Sunday
- Questions get scheduled intelligently (you're not re-reviewing what you know cold)
- You can see progress over time
- It works on your phone

### What's Explicitly CUT from v1
❌ **Elaboration notes** ("why does this matter" prompt) — defer to v2  
❌ **Theme filtering** (study by topic) — nice-to-have, defer to v2  
❌ **Session timer** ("~8 minutes remaining") — defer to v2  
❌ **Custom interval settings UI** (manual adjustment of [1, 3, 7...] days) — system decides automatically  
❌ **YouTube transcript fetching** (paste manually for v1)  
❌ **PDF upload** (convert to .txt manually for v1)  
❌ **Question editing** (trust Claude's generation)  
❌ **Detailed session analytics** (time per question, abandonment rate)  
❌ **Multi-device sync UI** (works on one device, but DB is already cloud-based via Turso)  

---

## v1 Feature Breakdown — Priority Order

### P0: Core Study Loop (Must Ship)

**Upload & Generation**
- Paste text OR upload .txt/.md file
- Required fields: title (auto-filled from filename, editable)
- Optional field: themes (comma-separated, for v2 filtering)
- Click "Generate Questions" → loading state → 20 questions created
- Success message: "20 questions generated from [title]"
- Questions immediately enter review queue with `next_review_at = now`

**Daily Study Session**
- Click "Start Session" → loads up to 15 questions using smart algorithm:
  1. **Due questions** (next_review_at <= now) — earliest first
  2. **High-risk questions** (high incorrect_count, low correct_streak)
  3. **Older questions** (created_at ASC, for interleaving)
- If fewer than 15 available, show what's available (e.g., 8 questions)
- For each question:
  - Display question text
  - Text input: "Type your answer (3+ words required to unlock Reveal)"
  - Button disabled until 3+ words typed
  - Click "Reveal Answer" → show model answer + explanation
  - Three buttons: Easy / Hard / Forgot
  - Click grade → question updates, next question loads
  - Skip button available (marks as skipped, doesn't update spaced repetition state)
- After last question → "Session Complete" screen with summary

**Spaced Repetition (Dynamic Intervals)**
- System automatically adjusts intervals based on performance
- **Easy**: `next_review_at = now + (current_interval × 2)`, cap at 180 days
- **Hard**: `next_review_at = now + min(current_interval, 3 days)`
- **Forgot**: `next_review_at = now + 1 day`, reset correct_streak to 0
- **Skip**: No change to next_review_at
- Intervals: [1, 3, 7, 14, 30, 60, 90, 180 days]
- Algorithm uses `correct_streak` to index into intervals array

---

### P1: Progress Visibility (Must Ship)

**Stats Dashboard**
- Total questions in system
- Questions with high mastery (correct_streak >= 5)
- Overall accuracy % (correct / (correct + incorrect))
- Study streak (consecutive days with completed sessions)

**Document Library**
- List all uploaded documents
- Show: title, themes, question count, upload date
- Delete button per document (deletes doc + all its questions)
- Sorted by upload date (most recent first)

---

### P2: Polish & UX (Nice-to-Have for v1, but cut if time-constrained)

**Upload UX**
- Drag-and-drop file upload zone
- Character count for pasted text (warn if <500 chars: "Content seems short, questions may be low quality")
- Preview first 200 chars of content after paste/upload

**Study Session UX**
- Progress bar: "Question 5 of 15" with visual bar
- Keyboard shortcuts: Enter to reveal, 1/2/3 for Easy/Hard/Forgot
- Smooth transitions between questions (fade in/out)

**Visual Design**
- Mobile-first responsive design (works on phone)
- Dark mode (easier on eyes for daily use)
- Consistent color system for grading (green=Easy, yellow=Hard, red=Forgot)

**Empty States**
- No documents yet: "Upload your first document to get started"
- No questions due: "All caught up! Check back tomorrow or upload more content."
- Session complete: "Great work! X questions reviewed. See you tomorrow."

---

## v2 — Post-Launch Enhancements (After Late May 2026)

### Phase 1: Enhanced Study Experience
- ✅ **Elaboration notes** ("why does this matter" prompt, saved with question)
- ✅ **Theme filtering** (study questions from specific topics)
- ✅ **Session timer** (estimated time remaining)
- ✅ **Question history** (see all past attempts for a single question)
- ✅ **Review mode** (re-study questions without affecting spaced repetition)

### Phase 2: Content Ingestion
- ✅ **YouTube transcript fetching** (paste URL → auto-fetch)
- ✅ **PDF upload** (with text extraction via pdf-parse)
- ✅ **Browser extension** (save articles directly from web)
- ✅ **Podcast RSS integration** (auto-fetch transcripts from favorite shows)

### Phase 3: Advanced Features
- ✅ **Question editing** (fix AI mistakes, add custom questions)
- ✅ **Custom question sets** (manually curate a session)
- ✅ **Spaced repetition insights** (forgetting curve visualization)
- ✅ **Export/Import** (backup data, migrate devices)
- ✅ **Multi-device sync UI** (explicit "sync now" button, conflict resolution)

### Phase 4: Multi-User (If Desired)
- ✅ **Authentication** (Clerk integration)
- ✅ **User accounts** (email/password or Google OAuth)
- ✅ **Data migration** (assign existing data to new user account)
- ✅ **Shared question banks** (optional: share questions with others)

---

## Decision Framework: What Goes in v1?

Use this checklist for any feature debate:

### Must be YES to all three:
1. **Does it enable the core loop?** (Upload → Generate → Study → Remember)
2. **Can you test it yourself within 2 weeks of building it?**
3. **Would you use the app daily without this feature?**

### If NO to any, defer to v2.

**Examples:**
- **Document library**: YES (need to see what you've uploaded, delete mistakes)
- **Theme filtering**: NO (you'll still study daily without it)
- **Elaboration notes**: NO (nice-to-have, doesn't break core loop)
- **Stats dashboard**: YES (need feedback that it's working)

---

## Build Sequence Strategy

### Week 1-2: Foundation
- Next.js project scaffold
- Turso database setup + schema
- Basic routing (Upload / Study / Progress pages)
- Claude API integration (question generation)

### Week 3-4: Core Study Loop
- Upload document flow (paste text, generate questions)
- Study session UI (display question, reveal answer, grade)
- Spaced repetition algorithm (update next_review_at on grade)
- Session complete screen

### Week 5-6: Progress & Polish
- Stats dashboard (queries for total, mastered, accuracy, streak)
- Document library (list, delete)
- Mobile-responsive styling (Tailwind)
- Empty states, loading states, error states

### Week 7-8: Testing & Deploy
- End-to-end testing (upload → study → stats)
- Bug fixes from your own usage
- Deploy to Vercel
- Add to phone home screen

**Total**: ~8 weeks calendar time, accounting for client work

---

## Risk Mitigation: What Could Derail v1?

### High-Risk Areas

1. **Claude API reliability**
   - Risk: API fails during question generation
   - Mitigation: Implement retry logic (3 attempts with exponential backoff)
   - Fallback: Show error, let user retry manually

2. **Spaced repetition algorithm complexity**
   - Risk: Over-engineering the scheduling logic
   - Mitigation: Use proven algorithm from original build, don't reinvent
   - Validation: Test with your own usage for 2 weeks before considering "done"

3. **Mobile UX on real device**
   - Risk: Looks good on laptop, unusable on phone
   - Mitigation: Test on actual iPhone/Android from Week 1
   - Checkpoint: Every Friday, pull up on phone and try full flow

4. **Scope creep**
   - Risk: "Just one more feature" syndrome
   - Mitigation: This document is the contract — any addition requires cutting something else
   - Accountability: Review scope weekly, cut ruthlessly if behind schedule

### Low-Risk Areas (Don't Worry About These)

- Database performance (your data is tiny)
- Hosting costs (Vercel + Turso free tiers are generous)
- Scaling (solo user = no scaling concerns)
- SEO (personal tool, not a public product)

---

## Success Criteria for v1 Launch (Late May 2026)

### Functional Requirements
✅ Upload 10+ documents without errors  
✅ Generate 20 questions per document consistently  
✅ Complete 15-question study session in under 15 minutes  
✅ See accurate stats (total, mastered, accuracy, streak)  
✅ Works on phone (iPhone or Android)  
✅ Data persists between sessions (Turso working correctly)  

### Quality Bars
✅ No crashes during normal usage  
✅ AI-generated questions are coherent (90%+ pass your "would I study this" test)  
✅ Spaced repetition feels right (not too aggressive, not too passive)  
✅ UI is usable on phone without zooming/squinting  

### Usage Validation
✅ You use it 5+ days/week for 4+ consecutive weeks  
✅ You can recall content from ≥3 documents uploaded 1+ month ago  
✅ You prefer using Memorium over re-reading source material  

---

## What "Ambitious but Fast" Means

**Ambitious**: Full-featured v1 (upload, study, stats, library)  
**Fast**: No perfectionism on non-core features

### Cut Without Guilt
- Advanced analytics (defer to v2)
- Beautiful animations (functional > flashy)
- Comprehensive error messages (basic validation is fine)
- Onboarding tutorial (you're the only user, you know how it works)
- Keyboard shortcuts (nice-to-have)
- Undo/redo (just delete and re-upload)

### Invest Time Here
- Spaced repetition algorithm (this is the core value)
- Mobile responsiveness (you'll use it on phone)
- Question generation quality (tune the Claude prompt)
- Data integrity (don't lose user progress)

---

## Open Questions / Decisions Needed

None — scope is locked based on your "ambitious + fast" directive.

**Cut from original plan:**
- Elaboration notes
- Theme filtering
- Session timer
- Custom interval settings UI (system decides dynamically)

**Kept for v1:**
- Full core loop
- Stats dashboard
- Document library
- Mobile-first design

---

**Next**: Build Plan (step-by-step sequence for Claude Code)
