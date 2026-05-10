# Repetita — FTUE Deploy & Cosmetic Refinement Handoff Brief

*Generated end of session, May 9, 2026.*

---

## TL;DR

**What's done this session:**
- All FTUE work pushed to production: chunks 3 + 5+6 + lessons doc, plus 2 cosmetic refinement commits.
- `AUTO_ADOPT_ENABLED` flipped to `1` in Vercel production. **FTUE is now LIVE for new users.**
- Chunk 7 (PostHog analytics) **deferred** — see `CHUNK-7-DEFERRED.md` for trigger conditions and revised event spec.

**What's next, in order:**
1. **Passive monitor (24–48h)** — check Vercel error logs + Turso dashboard for FTUE-related anomalies. ~5 min, no Claude needed.
2. (When ready) Pick one task from the priority queue in §5.

**Critical state to remember:**
- Production DB: `memorium-recovery` (Apr 27 cosmetic artifact, defer rename).
- Template doc id (production): `tmpl_doc_98cd16a9`.
- `AUTO_ADOPT_ENABLED=1` in Vercel production. **No longer a kill switch unless flipped back.** Var is read at build-time (Vercel suggested redeploy on flip).
- FTUE flow is live for any new signup. Existing users see no change.

**Read before starting next chat (in this order):**
1. `SESSION-STARTUP-CONTRACT.md`
2. `DATA-SANCTITY.md`, `PRE-MORTEM-CHECKLIST.md`, `LEARNINGS-FROM-INCIDENT-APR27.md`
3. `SCOPE.md`, `BUILD-PLAN.md`, `DATA-MODEL.md`
4. `CHUNK-7-DEFERRED.md` (if doing analytics work — verify it's in the repo first; see §3 debt)
5. `CHUNK-3-AND-5_6-HANDOFF.md` (last session, optional context)
6. This brief

**Re-upload at start of next chat:**
- This brief
- Mockups (`welcome-mockup.html`, `post-celebration-mockup.html`) only if doing more cosmetic work

**Where to start:** Passive monitor first (no Claude needed). Then user picks from §5 priority queue.

---

## Appendix

### 1. What landed this session

**Pushed to `main` and deployed (commit range `38deb86..` to current HEAD):**

| File | Change |
|---|---|
| `components/OnboardingCard.js` | Chunks 3 (locked FTUE copy) + cosmetic pass 1 (calmer card, yellow label, white numbers, removed subhead) |
| `app/page.js` | Chunk 3 (new render branch) + cosmetic pass 1 (removed HOME breadcrumb on FTUE branch) |
| `app/api/sessions/complete/route.js` | Chunks 5+6 (added `summary.isFirstSession`) |
| `app/study/page.js` | Chunks 5+6 (redirect to `/post-celebration` on first-session completion) |
| `app/post-celebration/page.js` | Chunks 5+6 (NEW — server wrapper) + cosmetic pass 2 |
| `app/post-celebration/PostCelebrationView.js` | Chunks 5+6 (NEW — MainView + FarewellView) + cosmetic pass 2 (no breadcrumb, calmer card, tighter spacing) |
| `docs/safety/LEARNINGS-FROM-INCIDENT-APR27.md` | Lessons from chunks 1–3 work |

**Cosmetic refinements (both pushed):**

- **Welcome screen (6 changes):** card style matches StreakCard treatment (no violet glow), removed HOME breadcrumb, removed "Welcome to Repetita!" subhead, "THE IDEA." in warm yellow (same token as "SHOW UP DAILY"), 1)/2)/3) numbers in white at ~70% opacity, increased vertical spacing between IDEA and RULE sections.
- **Post-celebration screen (3 changes):** removed "SESSION COMPLETE" breadcrumb, framing card matches calmer style, tightened spacing between headline and card.

**Production state changes:**
- `AUTO_ADOPT_ENABLED=1` set in Vercel production env vars. Triggered redeploy (var is build-time, not runtime — useful future signal).
- FTUE smoke verified on a fresh production account: full flow works end-to-end (welcome → 5-question session → post-celebration → farewell → returning-user home).
- Returning-user regression verified: existing flow unchanged.

### 2. Decisions locked this session

**Chunk 7 (analytics) DEFERRED:**
- Original FTUE handoff recommended PostHog Cloud + 7 events + a new `users.day2_event_fired_at` column.
- Audit during this session revealed: most originally-planned events are queryable from existing Turso data (`study_sessions`, `session_answers`, `users.created_at`). PostHog earns its place ONLY for pre-signup funnel data (landing → signup → FTUE completion), which is irrelevant until the public link is shared more widely.
- `SCOPE.md` v1 explicitly excludes "detailed session analytics."
- Decision: defer chunk 7 entirely. Documented in `CHUNK-7-DEFERRED.md` with trigger conditions and a revised event spec (drops `ftue_day2_returned`, adds `landing_page_viewed`, replaces schema-column dedupe with PostHog `$set_once`).
- Side benefit: avoided a Tier 3 schema modification on a Sacred table for analytics support — exactly the kind of asymmetry-rule violation the post-mortem culture pushes back on.

**Cosmetic pattern: "single violet-glow per page":**
- Both welcome and post-celebration screens previously had a violet-glow framing card AND a violet-glow CTA stacked. Two focal points = no focal point.
- New pattern: framing card uses calmer StreakCard treatment. CTA owns the violet glow as the singular action point.
- Worth carrying forward as a design heuristic across the app.

### 3. Outstanding debt

**Carrying forward from previous sessions (still open):**
- Test user `user_3DLyywWuDBEbcaSp2pEIyN5RJGR` in production. Cleanup: `DELETE FROM users WHERE id = 'user_3DLyywWuDBEbcaSp2pEIyN5RJGR'` (cascades to docs, questions, sessions, answers).
- Template doc `tmpl_doc_98cd16a9` has millisecond timestamps in question rows. Cosmetic.
- `repetita.org` served over HTTP — Chrome shows "Not Secure". Will hurt sign-up conversion at public launch. Likely DNS/SSL config in Vercel domains UI.
- `scripts/seed-starter-template.mjs` uses `Date.now()` directly. Cosmetic.
- `isNewUser` branch in `app/page.js` (search anchor: `ISNEWUSER-CLEANUP-DEBT`). Wait ~1–2 weeks of stable FTUE before removing.
- FarewellView duplication between `app/post-celebration/PostCelebrationView.js` and `app/study/page.js`. Refactor opportunity post-launch.

**New from this session:**
- Test users from this session's local FTUE testing — sweep before any public launch.
- Test user from this session's production FTUE smoke (the fresh email account just used).
- **`CHUNK-7-DEFERRED.md` commit status uncertain.** File was generated mid-session but the user opted to skip the commit step. **Next session: run `ls CHUNK-7-DEFERRED.md` from repo root.** If absent, regenerate from this brief's §2 + the previous CHUNK-3-AND-5_6 brief's §5 ("Chunk 7 — readiness") and commit fresh.

**Untracked files in working directory (left alone, eventually need decisions):**
- `CLAUDE.md.bak` (probably delete)
- `Mockup.png`, `WhatsApp Image 2026-04-04 at 14.07.27.jpeg` (move out of repo or `.gitignore`)
- `"docs/safety/# Repetita — Strategic Conversation Brie.md"` (weird filename — investigate)
- `scripts/chunk-0-inspect.mjs` (commit or delete)
- `scripts/seed-template-report-2026-05-05T15-31-50-809Z.md` (probably `.gitignore` generated reports)

### 4. Lessons learned

(Previous lessons in `LEARNINGS-FROM-INCIDENT-APR27.md` remain valid. The new ones below should be merged into that file early next session.)

**New from this session:**

- **Question analytics work BEFORE doing analytics work.** The chunk-7 deferral saved ~90 min of build time and avoided a Sacred-table schema modification for purely cosmetic dedupe needs. Pattern: when instrumentation is on the agenda, first ask *"could a SQL query against existing data answer this?"* PostHog (or any analytics tool) earns its place when there's data the DB can't see — primarily pre-signup funnel. Otherwise, the DB usually answers it. Don't add infrastructure to track things you already have.
- **"Two competing focal points" is a generalizable cosmetic anti-pattern.** When two elements on a page have the same visual weight (e.g., both violet-glow card + violet-glow CTA), neither is a focal point. Fix: pick which element should own the action attention; recede the other to a calmer container style. Worth applying as a check across other multi-element screens.
- **Read existing styles before replicating them.** Telling Claude Code to inspect `components/OnboardingCard.js` before writing post-celebration card styles produced pixel-matched output without guessing. Pattern: when matching a visual element, name the source-of-truth file in the prompt explicitly. *"Match X"* without a file pointer = approximation. *"Read Y for the values, then match"* = exact.
- **Small cosmetic units beat big-bang cosmetic passes.** Welcome cosmetic → look → post-celebration cosmetic → look = two clean iterations. Bundled, would have been harder to evaluate each independently. Carry forward: cosmetic work in small, lookable units.
- **"Watch-fors" in Claude Code prompts catch drift.** Listing 3–4 specific things NOT to change before running kept the agent in scope on both cosmetic passes. Worth keeping for any prompt where scope discipline matters (most of them).

### 5. What to do next session — priority queue

Pick one based on what's bothering you most. None are urgent.

1. **PASSIVE MONITOR (recommended first, no Claude session needed).** Check Vercel error logs + Turso dashboard for FTUE-related anomalies in the last 24–48h. ~5 min.

2. **Test user cleanup (Tier 3, well-bounded debt clearing).** Identify and `DELETE` test users created during chunk-1 testing, this session's local FTUE testing, and prod FTUE smoke. Run through `PRE-MORTEM-CHECKLIST.md` pre-flight (touches `users` → cascades into Sacred tables). ~30 min.

3. **More cosmetic alignment with mockups (Tier 0, optional).** If gaps remain between current FTUE screens and `welcome-mockup.html` / `post-celebration-mockup.html`, do another small pass. Mockups have staggered entrance animations and a few minor touches not yet implemented. ~30 min.

4. **`isNewUser` branch removal (Tier 1).** Wait ~1–2 weeks of stable FTUE in prod first. Search anchor: `ISNEWUSER-CLEANUP-DEBT`. ~15 min.

5. **HTTPS for `repetita.org` (separate workstream).** DNS/SSL config in Vercel domains UI. May need DNS provider involvement. Time TBD.

6. **Feature work (per `SCOPE.md` v2).** v1 is technically shipped (FTUE was post-launch refinement). v2 candidates: theme filtering, elaboration notes, session timer, YouTube transcripts.

### 6. Session-startup ritual for the next chat

**Reading order:**
1. `SESSION-STARTUP-CONTRACT.md`
2. `DATA-SANCTITY.md`, `PRE-MORTEM-CHECKLIST.md`, `LEARNINGS-FROM-INCIDENT-APR27.md`
3. `SCOPE.md`, `BUILD-PLAN.md`, `DATA-MODEL.md`
4. `CHUNK-7-DEFERRED.md` (if doing analytics work)
5. `CHUNK-3-AND-5_6-HANDOFF.md` (last session, optional context)
6. This brief

**Re-upload at start:**
- This brief
- Mockups (only if doing more cosmetic work)

**Working pattern (kept from previous sessions):**
- Pre-flight before code; eyeball user-clock before declaring done.
- Tier 3+ chunks: multi-stage (build isolated → propose wiring → apply + smoke test → cleanup).
- Tier 0–1 chunks: single-stage, but DO restart dev server explicitly after `lib/*` edits.
- Tier 2 chunks: visible plan inside the prompt.
- New timestamps: `Math.floor(Date.now() / 1000)` — seconds, not milliseconds.
- Always paste outputs verbatim — let Claude see the data, not summaries.
- Split Claude Code prompts and user manual test steps into clearly-labeled sections.
- Include "watch-fors" in prompts where scope discipline matters.

**Two housekeeping asks for the new chat to make early:**
1. Confirm whether `CHUNK-7-DEFERRED.md` is in the repo (run `ls CHUNK-7-DEFERRED.md` from repo root). If absent, regenerate and commit before any other work.
2. Confirm `AUTO_ADOPT_ENABLED=1` is still set in Vercel (defensive — no reason it would have changed, but worth verifying once).

**Where to begin:**
Default = passive monitor (no Claude). Then user picks from §5 priority queue.

---

*End of brief.*
