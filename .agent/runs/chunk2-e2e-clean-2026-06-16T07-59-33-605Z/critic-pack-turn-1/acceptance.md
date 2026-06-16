1. A new file lib/utils/auto-paragraph.test.js exists and uses Node's built-in node:test runner (no vitest/jest).
2. Tests assert: content that already has markdown structure (headings, lists, fences) is returned unchanged; plain prose is the main transform target; the function is pure (same input → same output).
3. Running 'node --test lib/utils/auto-paragraph.test.js' passes with all assertions.
4. lib/utils/auto-paragraph.js is byte-for-byte unchanged.