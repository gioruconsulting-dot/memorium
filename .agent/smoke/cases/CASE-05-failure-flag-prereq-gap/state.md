# STATE — note-capture build

- current_chunk: NOTES-7 (ship to test users)
- objective: first external exposure of the Notes experiment; containment-first rollout discipline applies (no notes-derived data may reach non-flagged or revoked users)
- path tiers: green `scripts/ops/**`, `docs/**`; yellow `lib/**`; red `middleware.js`; black `.env*`, `migrations/**`, `.agent/**`
- open_risks: RISK-0201
- decisions: DEC-N20 (notes cohort experiment approved), DEC-N30 (test cohort: 3 named users, 2-4 week window)
- next_action: verify containment end-to-end, then enable the flag for the named cohort
