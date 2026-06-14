# STATE — progress performance pass

- current_chunk: PROGRESS-PERF-1 (query slimming)
- objective: Progress page p95 under 400ms; read-only optimization series
- path tiers: green `app/progress/**`; yellow `lib/db/queries.js`; black `.env*`, `migrations/**`, `.agent/**`
- open_risks: (none)
- decisions: DEC-PP-01 (performance pass approved; behavior must be identical per-user)
- next_action: slim the lifetime-stats path, then the activity calendar query
