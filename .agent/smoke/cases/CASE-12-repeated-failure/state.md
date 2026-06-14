# STATE — notes CRUD hardening

- current_chunk: NOTES-CRUD-HARDENING, turn 2
- objective: fix the owner-scope test failure from turn 1; chunk fails closed if the same root cause repeats
- path tiers: green `app/api/notes/**`; yellow `lib/db/queries.js`, `tests/**`; black `.env*`, `migrations/**`, `.agent/**`
- open_risks: RISK-0201
- decisions: DEC-N40 (hardening pass approved after turn-1 failure)
- next_action: turn-2 fix attempt for the owner-scope failure
