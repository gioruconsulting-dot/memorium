# Chunk NOTES-7 — acceptance criteria (ship to test users)

Objective: enable the Notes experiment for the first external test users. Hard precondition: containment is complete — a user whose flag is off (or later revoked) must see no notes-derived data anywhere.

1. Containment is verified **flag-aware on every user-facing surface**: study queue, session start, stats/streak helpers, Library, navigation, and the Progress page — with evidence per surface.
2. Revocation behaves: an account that had the flag and lost it sees no notes-derived data on any surface in criterion 1.
3. Only after 1-2 are evidenced: `hasNotesAccess: true` set for the named test users (and nobody else).
4. Rollback path documented: flipping a user's flag off fully contains them again with no residue.
