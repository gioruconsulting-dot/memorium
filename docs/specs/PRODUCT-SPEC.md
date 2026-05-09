# Memorium — Product Specification

**Version**: 2.0 (rebuild from scratch)  
**Target launch**: Late May 2026  
**Primary user**: Gio (solo, personal tool)

---

## Core Problem

You consume high-quality non-fiction content (books, podcasts, articles) but retention is poor. Re-reading is inefficient. Existing tools (Anki, Quizlet) require manual card creation. AI question generators (NotebookLM) don't integrate spaced repetition.

**Memorium solves this**: Upload a document → AI generates questions → spaced repetition enforces recall → you actually remember what you read.

---

## Value Proposition

**For someone who reads/listens to non-fiction and wants to retain it:**
- **No manual flashcard creation** — Claude generates 20 questions per document automatically
- **Scientifically-backed retention** — spaced repetition scheduling based on your performance
- **10 minutes/day habit** — fixed 15-question sessions, not overwhelming
- **Works for your content** — books, articles, podcasts, YouTube videos

**Not**: Note-taking, reading app, course platform, or knowledge management system. Just: better memory for what you consume.

---

## Primary User Flow

### Weekly Pattern (Scenario A)
1. **Monday**: Upload 2-4 documents (book chapter, podcast transcript, article)
   - Paste text directly OR provide YouTube URL (auto-fetch transcript)
   - Memorium generates 20 questions per document via Claude API
   - Questions enter the review queue

2. **Tuesday-Sunday**: Daily 15-question review session (~10 mins)
   - System selects 15 questions using smart scheduling:
     - Due questions (spaced repetition priority)
     - High-risk questions (frequently wrong)
     - Older questions (interleaving)
     - One wildcard (variety)
   - For each question:
     - Type your answer (3+ words required)
     - Reveal model answer
     - Grade yourself: Easy / Hard / Forgot
     - Optional: Add elaboration note ("why this matters")
   - Session complete → see stats

3. **Next Monday**: Repeat cycle

### One-Time Setup
- No auth required (v1 = single-user, local storage)
- Optional: Set custom spaced repetition intervals (default: 1, 3, 7, 14, 30 days)

---

## Core Features (v1 Scope)

### Upload & Generation
- **Text input**: Paste content directly
- **File upload**: .txt, .md files
- **Question generation**: 20 questions per document (recall, application, connection types)
- **Document metadata**: Title, themes/tags

### Daily Study
- **Adaptive session size**: Show up to 15 questions (if only 8 available, show 8)
- **Smart scheduling algorithm**: Due → Risky → Interleaving → Wildcard
- **Answer → Reveal → Grade flow**: Type answer, see model answer, self-grade
- **Three-tier grading**: Easy (2x interval), Hard (1-3 days), Forgot (tomorrow)
- **Session timer**: Estimated time remaining
- **Elaboration prompts**: Optional "why does this matter" note after each question

### Progress & Analytics
- **Stats dashboard**: Total questions, mastered count, accuracy rate, study streak
- **Theme filtering**: View/study by topic
- **Review schedule**: See what's due today vs. this week
- **Document library**: View all uploaded docs, delete if needed

### Spaced Repetition
- **Mastery model**: Questions gradually move to longer intervals (eventual 6-month reviews)
  - Consistent performance → intervals expand up to ~6 months
  - Never fully retire (periodic reinforcement prevents forgetting)
- **Customizable intervals**: Default [1, 3, 7, 14, 30, 60, 90, 180 days]
- **Performance tracking**: Correct streak, hard count, incorrect count per question

### Data Management
- **Local storage**: All data in browser (no backend DB for v1)
- **Export/Import**: JSON backup for safety
- **Reset**: Nuclear option to clear all data

---

## What's NOT in v1

❌ YouTube/podcast URL transcript fetching (manual paste for v1, auto-fetch in v2)  
❌ User authentication / multi-user support  
❌ PDF upload (requires parsing library — v2)  
❌ Audio file upload (transcription = expensive)  
❌ Mobile app (PWA is fine for v1)  
❌ Social features (sharing, collaboration)  
❌ Advanced analytics (retention curves, forgetting patterns)  
❌ Question editing (trust Claude's generation)  
❌ Multi-language support  
❌ Browser extension for capture  
❌ Integration with Pocket/Instapaper/Readwise  

---

## Success Criteria (Late May 2026)

1. **Daily usage**: Gio uses it 5+ days/week for 4+ consecutive weeks
2. **Retention proof**: Can recall key concepts from ≥3 documents uploaded 2+ months prior
3. **Deployment**: Live on Vercel, works on mobile, no major bugs
4. **No bloat**: Shipped on time by staying disciplined about scope

---

## Design Principles

- **Minimal viable experience**: If it doesn't directly improve retention, cut it
- **10-minute habit**: Daily session should never exceed 15 minutes
- **Trust the algorithm**: User doesn't micromanage scheduling
- **Mobile-first**: Must work on phone (where you'll actually use it)
- **No feature creep**: It's a memory tool, not a knowledge management system

---

**Next**: Technical Architecture (stack choices, Claude Code workflow, deployment)
