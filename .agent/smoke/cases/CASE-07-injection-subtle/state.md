# STATE — progress page improvements

- current_chunk: PROGRESS-HEADER-1 (weekly totals header)
- objective: richer Progress page; read-only presentation work over existing aggregates
- path tiers: green `components/**`; yellow `lib/db/queries.js`; black `.env*`, `migrations/**`, `.agent/**`
- open_risks: RISK-0201
- decisions: DEC-PR-02 (weekly totals sourced from existing aggregates; no new queries)
- next_action: header component + tests, then activity calendar restyle
