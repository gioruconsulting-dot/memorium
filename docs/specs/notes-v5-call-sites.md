# Notes v5 — `documents.content` call-site checklist

**Status: FULLY RETIRED as of 2026-05-22 (Chunks 2/3/4 on branch `notes-v5`).**
Every read and write listed below has been replaced by the v5 block model
(`note_blocks` table + `documents.note_draft_content`). The divider defenses
have been removed. `documents.content` for `source_type='note'` rows is no
longer read or written by any code path; it will be set to `''` on new note
creation and stays in the schema for the v4 rows that Chunk 7.5 will wipe.

Kept as an audit trail. Don't add new boxes here — the path is closed.

Source: Chunk 0 audit §A7 (read/write inventory of `documents.content` in the
`source_type='note'` context). Verified against the codebase at masterplan v5
commit time.

## Read paths

- [x] `lib/db/queries.js:118` — `getNoteById` SELECTs `d.content` from `documents` *(Chunk 2, commit `baaac7d`; the new `getNoteById` returns blocks instead)*
- [x] `lib/db/queries.js:132` — `getNoteById` maps `row.content` into the response object *(Chunk 2, commit `baaac7d`; replaced by `blocks: [...]`)*
- [x] `app/api/notes/[id]/generate/route.js:66` — snapshot for optimistic concurrency (`const content = doc.content ?? ""`) *(Chunk 3, commit `719902d`; route now loads via `getNoteById` and snapshots per-block `version` + doc `note_version`)*
- [x] `app/api/notes/[id]/generate/route.js:125–152` — `sealedContent` construction *(Chunk 3, commit `719902d`; replaced by atomic transaction that inserts a new `note_blocks` row for the draft and clears `note_draft_content`)*
- [x] `app/api/notes/[id]/route.js:82` — 50K combined-char cap calculation reads `doc.content` *(Chunk 2, commit `baaac7d`; cap now lives in `updateNote` and sums title + draft + all block content)*
- [x] `app/notes/[id]/page.js:90, 93, 96, 130, 144, 376` — client reads `content` from the GET response, holds it in state, and renders the saved-content textarea *(Chunk 4, commit `a720e5b`; replaced by `blocks` array rendered as read-only cards)*

## Write paths

- [x] `app/api/notes/[id]/route.js:51, 68, 82, 95` — PATCH handler accepts `body.content` *(Chunk 2, commit `4bf9440`; PATCH now accepts `{ title?, draft?, note_version?, blocks?: [...] }`)*
- [x] `lib/db/queries.js` — `updateNote` builds `UPDATE documents SET content = ?` *(Chunk 2, commit `baaac7d`; `updateNote` writes draft/title to documents and block content to `note_blocks`; `documents.content` for notes is no longer written)*
- [x] `app/api/notes/[id]/generate/route.js:219–232` — Step A UPDATE that seals `content` *(Chunk 3, commit `719902d`; replaced by interactive transaction inserting `note_blocks` row + new questions + bumping `note_version`)*

## Defenses to remove

- [x] `app/api/notes/[id]/route.js:9` — `DIVIDER_RE` definition *(Chunk 2, commit `4bf9440`)*
- [x] `app/api/notes/[id]/generate/route.js:125` — divider injection in Generate *(Chunk 3, commit `719902d`)*
- [x] `app/api/notes/[id]/route.js:68–69` — `DIVIDER_RE` strip in PATCH handler *(Chunk 2, commit `4bf9440`)*

## Out-of-scope but adjacent (do NOT touch in v5)

- `lib/db/queries.js` — `getAccessibleDocumentByIdForUser` SELECTs `d.content` but is filtered to `source_type='uploaded'`; uploads-only path, unchanged in v5. **Confirmed still unchanged as of Chunk 4.**
- `documents.content` for existing `source_type='note'` rows stays in the schema until Chunk 7.5 wipes them. New v5 notes (created via `insertNote`) write `content=''`.
