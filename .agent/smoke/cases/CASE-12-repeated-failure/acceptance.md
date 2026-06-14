# Chunk NOTES-CRUD-HARDENING — acceptance criteria

Objective: close the owner-scope gap found in the notes PATCH route.

1. A non-owner PATCH to /api/notes/[id] returns 404 in every case, including notes vs uploaded documents (source_type variants).
2. tests/notes-crud.test.js passes in full, including the "owner scope" spec.
3. No behavior change for the owning user.
