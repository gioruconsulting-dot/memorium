# Repetita — Library Reading Mode Handoff

*Generated end of session, May 10, 2026.*

---

## What just shipped this session

FTUE 3-CTA + skip-selector work, two Claude Code chunks:

1. Added "Continue with memory" as 3rd CTA on /post-celebration (between
   "Study something else" violet primary and "Done for today" muted tertiary).
   Cyan-glow visual treatment matching existing "Quick Session" pattern.
2. Skip-selector mechanism on welcome CTA + post-celebration CTA via
   `/study?source=starter` query param.
3. Param cleared via `router.replace('/study')` after session start — one-shot
   intent, no sticky mode.
4. Filter for unreviewed starter-doc questions:
   `id NOT IN (SELECT question_id FROM session_answers WHERE user_id = ?)` —
   robust regardless of skip-grading semantics.
5. Smoke-tested end-to-end on a fresh account. Both surfaces work, no
   repeated questions across sessions, normal flow resumes after session 2.

---

## Pending trivial cleanup

- `lib/db/queries.js` — stale doc comment on `getUnreviewedQuestionsByDocument`
  says "Used by the 'Continue with memory' FTUE path". Should reflect that
  both welcome CTA and post-celebration CTA use it now. One-line fix. Either
  fix manually in 30 seconds or include in the next Claude Code prompt.

---

## Next chunk: Library reading mode

**Storage verified:** `documents.content` is populated across all rows
(918–23k chars range observed). Reading mode is unblocked.

**Decision pending:** which mockup to build.

- **Mockup A:** card expansion (chevron toggle, expands to full screen)
- **Mockup B:** dedicated reading view (`/library/[id]/read` route)
- Both built in `library-reading-mode-mockups.html` (re-upload at start
  of next window)

**My recommendation: B.** Browse uses A and that's right for *glancing*
(scan description + sample question + decide). Library reading is a
*sustained reading* task — different job, deserves a different surface.
B has bigger font, better margins, no chrome competing for attention,
no scroll-trap on mobile, and removing the bottom nav signals "you're
reading now."

The "consistency with Browse" argument cuts both ways: pattern consistency
vs. user-intent consistency. Latter matters more.

---

## Use cases driving this feature

1. **"Look up something I read 6 weeks ago"** — sustained reference reading
2. **"I adopted someone else's doc, want to read it before answering questions"**
   — preview before commit (note: Browse already covers preview-before-adopt;
   this is the post-adoption equivalent)

Both are sustained reading, both favor mockup B.

---

## Open question for next window

Is `documents.content` stored as plain text, markdown, or arbitrary HTML?
The upload flow likely writes plain text with line breaks, but worth a quick
check before building. If markdown: need a renderer. If plain text: just
preserve whitespace.

Quick check:

```sql
SELECT SUBSTR(content, 1, 200) FROM documents LIMIT 3;
```

---

## Bigger context still open (per FTUE handoff brief)

- Cybersecurity check (overdue, flagged in earlier strategic discussion)
- HTTPS for repetita.org
- Test user cleanup (debt from FTUE testing)
- Question-quality probe before any prompt tuning
- Shared content surface (after reading mode lands)

---

## Reading order for next window

1. `SESSION-STARTUP-CONTRACT.md`
2. `DATA-SANCTITY.md`, `PRE-MORTEM-CHECKLIST.md`
3. `SCOPE.md`, `DATA-MODEL.md`
4. `FTUE-DEPLOY-AND-COSMETIC-HANDOFF.md` (last session)
5. This brief
6. `library-reading-mode-mockups.html` (re-upload)

---

## Where to start

1. Run the content-format check query above.
2. Lock A vs B by looking at the mockups.
3. Draft the Claude Code prompt for the chosen approach.
4. Tier 1 build (just a new view + route + nav handler — no schema, no API).

---

*End of brief.*
