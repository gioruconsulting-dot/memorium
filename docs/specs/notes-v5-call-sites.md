# Notes v5 — `documents.content` call-site checklist

Every place currently using `documents.content` for notes. Each must be
updated when v5's block model lands (Chunks 2 / 3). Track completion here.

Source: Chunk 0 audit §A7 (read/write inventory of `documents.content` in the
`source_type='note'` context). Verified against the codebase at masterplan v5
commit time.

## Read paths

- [ ] `lib/db/queries.js:118` — `getNoteById` SELECTs `d.content` from `documents`
- [ ] `lib/db/queries.js:132` — `getNoteById` maps `row.content` into the response object
- [ ] `app/api/notes/[id]/generate/route.js:66` — snapshot for optimistic concurrency (`const content = doc.content ?? ""`)
- [ ] `app/api/notes/[id]/generate/route.js:125–152` — `sealedContent` construction (the seal mechanism itself; lines 125 = divider, 152 = concatenation)
- [ ] `app/api/notes/[id]/route.js:82` — 50K combined-char cap calculation reads `doc.content`
- [ ] `app/notes/[id]/page.js:90, 93, 96, 130, 144, 376` — client reads `content` from the GET response, holds it in state, and renders the saved-content textarea

## Write paths

- [ ] `app/api/notes/[id]/route.js:51, 68, 82, 95` — PATCH handler accepts `body.content` (string), strips `DIVIDER_RE`, falls back to `doc.content`, writes via `updateNote({ content })`
- [ ] `lib/db/queries.js` — `updateNote` builds `UPDATE documents SET content = ?` when the `content` arg is provided
- [ ] `app/api/notes/[id]/generate/route.js:219–232` — Step A UPDATE that seals `content` and clears `note_draft_content`. **Biggest single rewrite of Chunk 3.**

## Defenses to remove

These exist only because of the textual-divider seal. They become obsolete
once sealed content lives in `note_blocks`:

- [ ] `app/api/notes/[id]/route.js:9` — `DIVIDER_RE` definition (`/\n\n---\n\[Generated on: \d{4}-\d{2}-\d{2}\]\n/g`)
- [ ] `app/api/notes/[id]/generate/route.js:125` — divider injection in Generate (`const divider = ...`)
- [ ] `app/api/notes/[id]/route.js:68–69` — `DIVIDER_RE` strip in PATCH handler (applied to incoming `content` and `note_draft_content`)

## Out-of-scope but adjacent (do NOT touch in v5)

- `lib/db/queries.js:416` — `getAccessibleDocumentByIdForUser` SELECTs `d.content` but is filtered to `source_type='uploaded'`; uploads-only path, unchanged in v5.
- `documents.content` for `source_type='note'` rows stays in the schema (deprecated in code, set to `''` going forward — see masterplan §1 "`documents.content` deprecation for notes").

## How to use this file

- Chunk 2 ticks the GET/PATCH-related boxes.
- Chunk 3 ticks the Generate-related boxes and removes the divider-defense entries.
- Any new call site discovered during Chunks 2 / 3 is appended here in the same format.
- When all boxes are ticked AND the integration tests in Chunk 3 pass, the
  `documents.content`-for-notes pathway is fully retired.
