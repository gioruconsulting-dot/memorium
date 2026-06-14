# STATE — note-capture build

- current_chunk: NOTES-3 (CRUD skeleton, Steps 2a-2c)
- objective: notes feature skeleton behind hasNotesAccess; middleware gate (Chunk 2.1) and nav gating (2.2) verified and committed
- path tiers: green `app/notes/**`, `app/api/notes/**`; yellow `lib/db/queries.js`; red `middleware.js`; black `.env*`, `migrations/**`, `.agent/**`
- open_risks: RISK-0201
- decisions: DEC-N20 (notes cohort experiment approved), DEC-N22 (notes stored as `documents` rows with `source_type='note'`; Chunk 3 writes limited to owner-scoped note rows — INSERT + guarded UPDATE, no deletes; exact scopes recorded as p1c_preapprovals)
- next_action: CRUD endpoints + list + editor, then AI generation in Chunk 4
