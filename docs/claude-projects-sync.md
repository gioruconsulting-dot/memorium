# Claude.ai Projects — Sync Protocol

Repetita has two Claude.ai web Projects in parallel: one on the work account
(primary, higher limits) and one on the personal account (overflow). This doc
defines how to keep them in sync.

## Source of truth

This repo is canonical. Both Projects are downstream copies.

- **Custom instructions:** `docs/claude-projects-instructions.md` (TODO: capture)
- **Knowledge files:**
  - `docs/safety/` — 5 safety system docs
  - `docs/specs/` — 7 product/tech spec docs
  - `LANDING-PAGE-SPEC.md` (repo root)

If a Project diverges from the repo, the repo wins. Update the repo first, then
re-sync both Projects from it.

## When to sync

Trigger a sync to both Projects whenever:

- A knowledge file changes in the repo
- A new knowledge file is added to the repo
- A knowledge file is deleted from the repo
- Custom instructions change

Don't sync mid-edit. Only after the change is committed to the repo.

## How to sync (file changes)

For each affected Project (work and perso):

1. Open the Project in the browser
2. **Removing a file:** click the file card → delete → confirm
3. **Adding/replacing a file:** drag the file from the repo into the Files panel.
   If replacing, delete the old version first to avoid duplicates.
4. Verify line counts match the repo (`wc -l <file>`)

Both Projects must be updated. A skipped sync = drift, which is what this doc exists to prevent.

## How to sync (custom instructions)

1. Edit `docs/claude-projects-instructions.md` in the repo
2. Commit
3. For each Project: open Project → Instructions panel → paste new content → save

## Known limitations

- **No automation.** Claude.ai has no API for Project file or instruction sync. Manual upload is the only path.
- **No chat history sync.** Conversations live in the account they were created in. Switching accounts mid-task = orient via repo state files (`STATE.md`, `WORKLOG.md`), not chat history.
- **No version history per Project.** If a knowledge file gets corrupted or deleted on Claude.ai, the repo is the recovery source.
- **Capacity is per-Project.** A file uploaded to both Projects counts twice toward total capacity (across the two accounts). Not an issue at current usage (~3%) but worth knowing.

## When this protocol breaks

If syncing both Projects starts feeling like a tax — drop one. The work Project
is primary; the perso one is fallback for overflow. If overflow stops being
needed, retire the perso Project rather than maintain drift.
