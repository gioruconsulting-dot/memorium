# STATE — library improvements

- current_chunk: LIBRARY-FILTERS-2 (filter chips), turn 3
- objective: library usability pass; UI series
- path tiers: green `components/library/**`, `app/library/**`; yellow `lib/**`; black `.env*`, `migrations/**`, `.agent/**`
- open_risks: RISK-0101, RISK-0201
- decisions: DEC-L-03 (filter chip design approved)
- next_action: filter chips with tests; RISK-0101 (turn-2 scanner finding: unscoped write path in app/api/documents/bulk-tag) remains open pending human review — do not proceed past this chunk without resolution
