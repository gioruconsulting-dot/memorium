// lib/ai/generate-concepts.js
//
// Notes-document concept extraction — produces a fresh concept map for the
// whole sealed-notes document. Used at finalize-time by the notes pipeline
// (masterplan §1 / Chunk 4b). Question generation is handled separately
// by generateQuestionsForDelta; this function is concepts-only.
//
// Returns: Array<{ id, name, importance, one_line_summary }>
// Length: at least 1. Throws (generic Error) on empty or malformed output
// after 3 retry attempts. Caller (4b) decides fail-soft behavior: on throw,
// retain prior concepts_json and continue with question insertion.

const SYSTEM_PROMPT = `You are an expert learning designer extracting the conceptual map of a
document for spaced-repetition study. Your output is a clean, deduplicated
list of the document's distinct ideas — not questions, not a summary, not
a topic classification. Concepts only.

Respond in the same language as the source material. If the source is in
French, the concept names and one-line summaries should all be in French.

DOCUMENT SCOPE
The text you are given is the COMPLETE document content. Extract concepts
that span the whole document — its overall argument, its distinct
sub-ideas, its named things — not just one section. The concept list
should read as a faithful map of the document as a whole.

WHAT A CONCEPT IS
A concept is a distinct, atomic, named idea worth remembering three months
from now. Each concept stands on its own: a learner who has internalized
the concept could explain it without needing the surrounding paragraph.

Good concept candidates:
- Principles, mechanisms, frameworks, tradeoffs, distinctions
- Non-obvious claims that the document argues for
- Named techniques, practices, or methods the document advocates
- Specific named things (people, terms, events, tools) that are
  load-bearing to the document's meaning

Not concepts:
- Restatements of the document's title or thesis as a "concept"
- Vague themes ("the importance of X") that don't have a concrete shape
- Lists of bullet points dressed up as one concept

ATOMICITY
One idea per concept. If a candidate concept would require two distinct
one-line summaries to capture, split it into two concepts. If two
candidate concepts collapse into the same idea under any reasonable
rephrasing, merge them.

IMPORTANCE RATINGS
Classify every concept with exactly one of these four values:

- "core": load-bearing. Central to the document's argument or to
  practical understanding of the material. A reader who missed this
  concept missed the point of the document.

- "supporting": helps explain a core concept. Useful detail or
  scaffolding that reinforces a core idea without being the idea itself.
  Often: definitions, mechanisms, or sub-claims that prop up a core
  concept.

- "distinctive": a specific named thing — a person, term, event, named
  technique, tool, or vivid metaphor — that is memorable and worth
  retaining on its own merits even if it isn't load-bearing to the
  central argument. A learner remembering this concept gets value from
  the document's specifics, not just its abstract spine.

- "peripheral": mentioned in the document but minor. Worth listing
  for completeness of the concept map, but not strongly worth
  remembering. Examples: passing references, brief asides, named
  things that appear once without elaboration.

Calibrate the distribution to the material. A short document may have
mostly "core" and "supporting" with one or two "distinctive". A dense
document may have a long tail of "distinctive" and "peripheral". Do not
target a fixed mix — let the material decide.

NAME RULES
- Short label, roughly 2–8 words.
- Specific and concrete. "The four-step Git habit" is better than
  "Git rhythm". "Source code vs. running app" is better than
  "Code distinction".
- Title-case-style for English (capitalize the first word and proper
  nouns); follow source-language conventions otherwise.
- Do not repeat the importance rating in the name
  (e.g., not "Core idea: ...").

ONE-LINE SUMMARY RULES
- Under ~120 characters.
- Written as a complete sentence, ending in a period.
- Captures what makes THIS concept distinct from the others — not a
  generic restatement of the name. The summary should disambiguate the
  concept from neighboring concepts in the same document.
- Plain and factual. No marketing language ("a powerful framework
  for...", "discover the secret to...").
- Do not start with "This concept is about..." or "The idea that...".
  Just state the substance.

ID RULES
- Short, stable string. Use the pattern c1, c2, c3, ... in the order
  the concepts appear in your output.
- Must be unique within the response.
- IDs are referenced by other parts of the system; keep them simple
  ASCII tokens.

CONCEPT COUNT
Aim for roughly 5–15 concepts on a typical document, but follow the
material:
- A short or thin document may yield only 3 strong concepts. Stop there.
- A dense, multi-section document may legitimately need 15+. Cover them.
- A rambling or low-quality document may yield only 2–3 real concepts
  buried in filler. Extract those; ignore the filler.

It is better to have 5 sharp concepts than 12 weak ones. Do not pad to
hit a target. At minimum, return at least one concept — the document is
non-empty, so something is in it worth naming.

SELF-CHECK before returning
Before producing output, verify:
1. Every concept stands on its own as an atomic idea.
2. No two concepts collapse into the same idea under rephrasing.
3. Each one-line summary disambiguates its concept from the others.
4. All ids are unique and follow the c1, c2, ... pattern.
5. The importance distribution reflects the material, not a target
   distribution.
6. The concept list, read top to bottom, is a faithful map of the
   whole document.

If any check fails, revise before returning.`;

const NOTE_CONCEPTS_TOOL = {
  name: 'submit_note_concepts',
  description: 'Submit the extracted concept map for the document.',
  input_schema: {
    type: 'object',
    properties: {
      concepts: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Stable short id like c1, c2, c3. Unique within the response.'
            },
            name: {
              type: 'string',
              description: 'Short label, 2–8 words, specific and concrete.'
            },
            importance: {
              type: 'string',
              enum: ['core', 'supporting', 'distinctive', 'peripheral']
            },
            one_line_summary: {
              type: 'string',
              description: 'Under ~120 chars, single complete sentence that disambiguates this concept from the others.'
            }
          },
          required: ['id', 'name', 'importance', 'one_line_summary']
        }
      }
    },
    required: ['concepts']
  }
};

/**
 * Extract the concept map of a full sealed-notes document via Claude tool-use.
 *
 * @param {string} sealedFullText - The complete document content.
 * @param {string} [title]        - Document title (passed into the user message for context).
 * @returns {Promise<Array<{ id, name, importance, one_line_summary }>>}
 * @throws {Error} On API failure, malformed response, empty concepts, or validation failure,
 *                 after 3 retry attempts. No typed error — caller (4b) is fail-soft on any throw.
 */
export async function generateConcepts(sealedFullText, title = '') {
  const MAX_RETRIES = 3;
  const INITIAL_DELAY_MS = 1000;

  const userMessage =
    `Document title: ${title}\n` +
    `\nDocument content:\n---\n${sealedFullText}\n---\n\n` +
    `Extract the concept map for this document following the system instructions.\n` +
    `Return your output ONLY via the submit_note_concepts tool — do not write\n` +
    `narrative text alongside the tool call.\n\n` +
    `Quality over quantity. If this document yields 4 strong concepts, that's a\n` +
    `better outcome than 12 mediocre ones.`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 20000,
          system: SYSTEM_PROMPT,
          tools: [NOTE_CONCEPTS_TOOL],
          tool_choice: { type: 'tool', name: 'submit_note_concepts' },
          messages: [{ role: 'user', content: userMessage }]
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Claude API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      const toolUseBlock = data.content?.find(
        (block) => block.type === 'tool_use' && block.name === 'submit_note_concepts'
      );

      if (!toolUseBlock) {
        throw new Error('No submit_note_concepts tool_use block in response');
      }

      const { concepts } = toolUseBlock.input || {};

      if (!Array.isArray(concepts) || concepts.length === 0) {
        // Empty concepts on a sealed (whole-document) extraction is treated as
        // a model failure, not a "no distinct material" signal. Retry.
        throw new Error('Tool output missing or empty concepts array');
      }

      const validImportance = ['core', 'supporting', 'distinctive', 'peripheral'];
      const requiredFields = ['id', 'name', 'importance', 'one_line_summary'];
      const seenIds = new Set();

      for (const [i, c] of concepts.entries()) {
        for (const f of requiredFields) {
          if (!c[f] || typeof c[f] !== 'string') {
            throw new Error(`Concept ${i + 1} missing or invalid field: ${f}`);
          }
        }
        if (!validImportance.includes(c.importance)) {
          throw new Error(`Concept ${i + 1} invalid importance: ${c.importance}`);
        }
        if (seenIds.has(c.id)) {
          throw new Error(`Concept ${i + 1} duplicate id: ${c.id}`);
        }
        seenIds.add(c.id);
      }

      console.log('[generate-concepts] success', {
        title: title || '(untitled)',
        contentChars: sealedFullText.length,
        conceptCount: concepts.length,
        importanceBreakdown: concepts.reduce((acc, c) => {
          acc[c.importance] = (acc[c.importance] || 0) + 1;
          return acc;
        }, {}),
        attempt
      });

      return concepts;
    } catch (error) {
      console.error(
        `[generate-concepts] attempt ${attempt}/${MAX_RETRIES} failed:`,
        error.message
      );
      if (attempt === MAX_RETRIES) {
        throw new Error(
          `Failed to generate concepts after ${MAX_RETRIES} attempts: ${error.message}`
        );
      }
      const delay = INITIAL_DELAY_MS * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
