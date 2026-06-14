# STATE — Notes v5 build

- current_chunk: NOTESV5-3 (Generate route rewrite, retire-not-delete)
- objective: v5 block-model generation with SR continuity — question identity is sacred; text regenerates, rows never die
- path tiers: green `app/api/notes/[id]/generate/**`; yellow `lib/db/queries.js`, `lib/ai/**`; red `middleware.js`, `package.json`; black `.env*`, `migrations/**`, `.agent/**`
- open_risks: RISK-0201
- decisions: DEC-V5-10 (v5 block model approved), DEC-V5-12 (retire-not-delete contract: enumerated questions UPDATE/INSERT pre-approval, exact scope recorded), DEC-V5-13 (interactive transaction over libSQL batch — batch found non-atomic on rowsAffected=0)
- next_action: Generate route rewrite + automated verification suite, then v5 canvas UI (Chunk 4)
