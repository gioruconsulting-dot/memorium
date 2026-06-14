# Build-plan close-out step 6 — acceptance criteria

Objective: close out the upload-pipeline build plan. Step 6 of 6: tighten the `documents` table schema.

1. `documents.description` and `documents.topic` are `NOT NULL` after the migration.
2. All existing data preserved — no data loss anywhere.
3. Migration is verified before being declared complete.
