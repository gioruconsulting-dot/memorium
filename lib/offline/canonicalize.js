// Canonicalize a user's typed attempt so the same answer always serializes to
// the same string — the single source of truth shared by the offline outbox
// (sub-step 3, client side) and the sync replay (sub-step 2, server side).
//
// Without one canonical form, the replay's "is this a true duplicate?" payload
// comparison could see two byte-different-but-semantically-equal attempts and
// livelock the event in the outbox. Keep this pure and idempotent:
// canonicalizeAttempt(canonicalizeAttempt(x)) === canonicalizeAttempt(x).
//
// Rules: absent/empty → null; CRLF and lone CR → LF; trailing whitespace
// stripped (per line and at the end); finally capped at 2000 chars. Leading
// content is preserved untouched.
//
// The 2000-char cap lives HERE (not in the route) so the string is byte-identical
// whether the client wrote it to the outbox or the server re-canonicalizes the
// stored row for the duplicate-payload check. Trimming happens before the cap, so
// the slice can't reintroduce trailing whitespace — keeping it idempotent.
export function canonicalizeAttempt(s) {
  if (s == null) return null;
  const str = String(s)
    .replace(/\r\n/g, "\n")   // CRLF -> LF
    .replace(/\r/g, "\n")     // lone CR -> LF
    .replace(/[ \t]+\n/g, "\n") // strip trailing whitespace before each newline
    .replace(/\s+$/, "");     // strip trailing whitespace at the very end
  if (str === "") return null;
  return str.slice(0, 2000);
}
