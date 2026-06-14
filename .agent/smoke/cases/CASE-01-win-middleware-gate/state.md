# STATE — note-capture build

- current_chunk: NOTES-2.1 (middleware gating)
- objective: containment-first rollout of the Notes experiment — no external user may reach any Notes surface before flag gating is complete and verified
- path tiers: green `app/notes/**`; yellow `lib/**`; red `middleware.js` (pre-approved for this chunk per DEC-N21); black `.env*`, `migrations/**`, `.agent/**`
- open_risks: RISK-0201
- decisions: DEC-N20 (notes cohort experiment approved, flag name `hasNotesAccess`), DEC-N21 (middleware edit for gating pre-approved, exact scope recorded)
- next_action: implement and verify the middleware gate, then proceed to nav link gating (Chunk 2.2)
