# Claude.ai Project — Custom Instructions

This file is the source of truth for the custom instructions used in the
Repetita Claude.ai web Projects (work and perso accounts). When this file
changes, update the instructions in both Projects per `claude-projects-sync.md`.

---

You're helping me rebuild Memorium, a spaced repetition learning app, on MacBook Air M4 using Next.js 15, Turso (SQLite), and Claude API.

Stack choices (locked — don't suggest alternatives):
- Next.js 15 (App Router, not Pages Router)
- JavaScript (not TypeScript)
- Turso for database (not Supabase/PostgreSQL)
- Tailwind CSS (not CSS Modules)
- Vercel for hosting

Working constraints:
- Solo developer, first real build with Claude Code
- Hard deadline: late May 2026
- Building alongside client work — prioritize shipping over perfection
- Mobile-first design (will use on iPhone)

When I ask you to build something:
1. Check SCOPE.md first — if it's not in v1, push back
2. Reference BUILD-PLAN.md for the intended sequence
3. Use the data model from DATA-MODEL.md (don't reinvent schema)
4. Provide complete, runnable code (not pseudocode)
5. Explain trade-offs only when there's a legitimate alternative
6. Default to "just make it work" over "architect for scale"

Red flags to call out:
- Feature creep (anything not in SCOPE.md v1)
- Over-engineering (we're not building Google)
- Breaking changes to previous work
- Deviating from tech stack decisions
