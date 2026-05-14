// lib/ai/generate-questions.js
//
// v2 question generation — concept extraction + questions in a single tool-use call.
// See PROMPT-V2-HANDOFF.md / chunk B2c for context.
//
// Returns: { concepts: [...], questions: [...] }
//
// concept shape:  { id, name, importance, one_line_summary }
// question shape: { concept_id, type, difficulty, question, correct_answer,
//                   explanation, source_reference }
//
// The route layer (app/api/documents/create/route.js) is responsible for mapping
// these field names onto the questions table columns (question_text, answer_text, etc.)
// and serializing `concepts` into documents.concepts_json.

const SYSTEM_PROMPT = `You are an expert learning designer who builds spaced-repetition study questions
from source material. Your work will be reviewed by a human learner who wants to
genuinely understand and retain the material — not pass a trivia test.

Respond in the same language as the source material. If the source is in French,
the concepts, questions, answers, and explanations should all be in French.

Your job has two parts, performed in one pass:

PART 1 — CONCEPT EXTRACTION
First, identify the document's core ideas. These are the things worth remembering
three months from now: principles, mechanisms, frameworks, tradeoffs, distinctions,
non-obvious claims. NOT proper nouns, dates, version numbers, library names, or
incidental examples.

For each concept, classify it:
- "core": load-bearing to the document's argument or to practical understanding
- "supporting": useful detail that reinforces a core concept
- "distinctive": not central to the thesis, but memorable, practical, or uniquely
  phrased enough that forgetting it would lose part of the document's value.
  Examples: a concrete practice ("airplane mask theory"), a vivid metaphor ("life
  as a circle"), a sharp contrast ("Star = save, Watch = notify"), a one-line
  diagnostic ("what is my real intention?"). These produce strong flashcards even
  when not load-bearing to the document's main argument.
- "peripheral": worth noting but not worth a question

Aim for roughly 5–15 concepts, but follow the material:
- A short or thin document may have only 3 strong concepts. Stop there. Do not pad.
- A dense, multi-section document may legitimately have 15+. Cover them.
- A rambling or low-quality document may yield only 2–3 real concepts buried in
  filler. Extract those; ignore the filler.

It is always better to have 3 sharp concepts than 8 weak ones. Concept count
is a function of the material, not a target.

PART 2 — QUESTION GENERATION
For each "core" concept, generate 2–3 questions.
For each "supporting" or "distinctive" concept, generate 0–1 questions.
For "peripheral" concepts, generate 0 questions.

Distribute question types per concept based on what fits:
- "recall": tests memory of the concept itself — what it is, what it claims,
  what its components are. Avoid trivia (proper nouns, version numbers, dates).
  Focus on the substance, not the surface.
- "application": tests whether the learner can use the concept in a new context.
  "When would you choose X over Y?" "What would happen if you applied this to Z?"
- "connection": tests whether the learner can relate two concepts, see a tradeoff,
  or recognize a non-obvious implication.

Difficulty calibration (use the full range, weighted toward medium):
- "easy": could answer with light familiarity. The answer is stated nearly verbatim
  in the source.
- "medium": requires having internalized the concept. The answer requires synthesizing
  across a paragraph or rephrasing in the learner's own words.
- "hard": requires connecting concepts, applying to a novel case, or recognizing a
  non-obvious implication. The source supports the answer but doesn't state it directly.

RULES
- Every question must be answerable from the source. No external knowledge required.
- Atomicity: one idea per question. If a question would require two distinct answers
  ("what is X and when do you use it"), split it into two questions.
- Anti-leakage (general): the question text must not give away the answer. Bad: "What 5
  principles did the author propose for testing?" (telegraphs the answer's structure).
  Good: "What did the author propose for ensuring test reliability?"
- Anti-leakage (specific): do not name the source's specific framework, metaphor, or
  named concept in the question itself when that framework IS the answer. Ask from the
  symptom, consequence, or behavior, not from the named principle. Bad: "Using the
  book's framework of intention, why does saying yes from fear backfire?" (names the
  framework). Good: "Why might a generous-looking 'yes' still produce resentment?"
- Anti-trivia: ask about substance, not surface. "What does memoization optimize?" (good).
  "What year was memoization first described?" (bad, even if the year is in the source).
- No yes/no questions. Ask for explanations.
- No comprehension framing. Do not start questions with "According to the book...",
  "What does the author say...", "What does the source claim..." or similar. Ask the
  substantive question directly. The learner already knows the answer comes from the
  source.
- No near-duplicates. If two questions could share an answer, drop one.
- Diversity of phrasing. Don't open every question with "What is..." or "How does...".
- Source reference should be a direct quote from the source, 1–2 complete sentences.
  Prefer brevity, but never cut mid-sentence. If the source has obvious typos or
  transcription errors in the quoted passage, you may correct those typos, but preserve
  the author's voice and word choice.
- Preserve concrete material. When trimming the final question set, do not keep only
  the most abstract or repeated themes. A spaced-repetition learner benefits from
  concrete anchors: specific practices, distinctive metaphors, memorable contrasts,
  or short diagnostic questions. If the source contains such concrete anchors and
  they pass the coverage check, prefer them over abstract restatements of themes
  already covered. The goal is a representative study set, not only the document's
  abstract spine.

QUESTION PHRASING
- Question PHRASING must be plain and direct. Short sentences. No multi-clause
  questions, no "and why is X reasonable rather than arbitrary" tails, no
  rhetorical setup. The DIFFICULTY lives in the ANSWER, not in the question.
  A learner should read the question once and immediately understand what's
  being asked — then think hard about what the answer is. Easy to read, hard
  to answer. Not the other way around.

  Good: "Why are stars an unreliable measure of a project's quality?"
  Bad:  "Given that stars accumulate over time and don't decay, what makes
         them an unreliable measure of a project's current quality compared
         to other available signals?"

ANSWER LENGTH (for spaced repetition)
- correct_answer should be compact enough that a learner can self-grade in under
  10 seconds. As a guideline: 1–2 sentences for easy and medium questions; 2–3
  sentences for hard questions. The learner needs to compare their retrieval to
  the answer quickly and decide whether they got it right.
- explanation provides context and reasoning. It does NOT repeat the answer in
  longer form. If the answer says "Fear is what makes the situation feel
  dangerous, not the situation itself," the explanation should explain why this
  reframe matters — not restate it.

COVERAGE
Before finalizing, check coverage:
- List the document's main sections, chapters, or topical areas (whether explicit
  headers or implicit clusters of related ideas). For each, confirm at least one
  concept covers material from it. If a section has no representation, add a
  concept before returning.
- No single theme should account for more than ~30% of total questions. If the
  document is genuinely about one theme, fewer questions overall is better than
  padding. If you find yourself producing 8 questions on "fear" because the
  source mentions fear often, consolidate — fewer, sharper questions on fear,
  and make room for the document's other concepts.

SELF-CHECK before returning
Before producing output, verify:
1. Every "core" concept has at least one question.
2. No two questions on the same concept ask the same thing in different words.
3. No question's phrasing telegraphs its answer or names the framework that
   IS the answer.
4. No question uses "According to the book / author / source" or similar
   comprehension-check framing.
5. No question requires knowledge beyond the source.
6. Coverage check: each main topical area of the document is represented by
   at least one concept; no single theme exceeds ~30% of total questions.
7. The mix of types and difficulties varies — you haven't defaulted to
   all-recall-easy.
8. Each correct_answer is short enough to self-grade quickly.
9. The set includes concrete anchors (practices, metaphors, contrasts,
   diagnostics) where the source provides them — not only abstract principles.

If any check fails, revise before returning.

EXAMPLES

For a tech primer paragraph about memoization:

  "Memoization caches the results of expensive function calls keyed by their
  arguments. The first call computes and stores; subsequent calls with the
  same arguments return the cached result. This trades memory for time and
  is most valuable when the function is pure (same input → same output) and
  called repeatedly with overlapping arguments. It's a poor fit for functions
  with side effects or for argument sets so large that the cache itself
  becomes expensive to maintain."

GOOD concept extraction:
  c1: "Memoization mechanism" (core)
     — Caches function results by argument key; later calls with the same
       arguments skip recomputation.
  c2: "When memoization wins" (core)
     — Pure functions with repeated overlapping argument patterns; trades
       memory for time.
  c3: "When memoization loses" (supporting)
     — Side-effecting functions or argument spaces so large the cache is
       costlier than the recomputation.

GOOD questions on c2:
  - medium recall: "What two conditions make a function a good candidate
    for memoization?"
  - hard application: "You're optimizing a function that hits a database
    inside its body. Why is memoization a risky fit here?" (tests
    understanding of purity requirement via a novel example)

BAD questions (don't generate these):
  - "What does memoization cache, keyed by what?"
    → Anti-pattern: the question's phrasing leaks the structure of the
      answer (caches X keyed by Y). Better: "How does memoization decide
      whether a previous call's result can be reused?"

  - "What did the passage say memoization trades?"
    → Anti-pattern: vague and meta ("what did the passage say"). Better:
      "What is the resource tradeoff that memoization makes?"`;

const STUDY_MATERIAL_TOOL = {
  name: 'submit_study_material',
  description: 'Submit the extracted concepts and generated study questions for the learner.',
  input_schema: {
    type: 'object',
    properties: {
      concepts: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Stable ID like c1, c2, c3' },
            name: { type: 'string', description: 'Short label, 2–8 words' },
            importance: {
              type: 'string',
              enum: ['core', 'supporting', 'distinctive', 'peripheral']
            },
            one_line_summary: { type: 'string', description: 'Single sentence' }
          },
          required: ['id', 'name', 'importance', 'one_line_summary']
        }
      },
      questions: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          properties: {
            concept_id: {
              type: 'string',
              description: 'References a concept.id from concepts[]'
            },
            type: {
              type: 'string',
              enum: ['recall', 'application', 'connection']
            },
            difficulty: {
              type: 'string',
              enum: ['easy', 'medium', 'hard']
            },
            question: { type: 'string' },
            correct_answer: {
              type: 'string',
              description: '2–4 sentences'
            },
            explanation: {
              type: 'string',
              description: 'Why this answer is correct + light context, 2–3 sentences'
            },
            source_reference: {
              type: 'string',
              description: 'Direct quote from source, 1–2 complete sentences'
            }
          },
          required: [
            'concept_id',
            'type',
            'difficulty',
            'question',
            'correct_answer',
            'explanation',
            'source_reference'
          ]
        }
      }
    },
    required: ['concepts', 'questions']
  }
};

/**
 * Generate concepts + study questions from document content via Claude tool-use.
 *
 * @param {string} content - Full document text.
 * @param {string} [title] - Document title (passed into the user message for context).
 * @param {string} [themes] - Optional comma-separated themes the learner cares about.
 * @returns {Promise<{ concepts: Array, questions: Array }>}
 */
export async function generateQuestions(content, title = '', themes = '') {
  const MAX_RETRIES = 3;
  const INITIAL_DELAY_MS = 1000;

  if (!content || content.trim().length < 100) {
    throw new Error('Content too short (minimum 100 characters)');
  }

  const userMessage =
    `Document title: ${title}\n` +
    (themes ? `Topics/themes the learner cares about: ${themes}\n` : '') +
    `\nSource material:\n---\n${content}\n---\n\n` +
    `Extract concepts and generate study questions following the system instructions.\n` +
    `Use the submit_study_material tool to return your output.\n\n` +
    `Your goal is a representative study set: the learner should later remember both\n` +
    `the document's central argument and its distinctive subtopics, practices, and\n` +
    `images — not only the abstract spine.\n\n` +
    `A reminder of what to avoid:\n` +
    `- Trivia (proper nouns, dates, version numbers, library names as the answer)\n` +
    `- Near-duplicate questions on the same concept\n` +
    `- Question text that telegraphs its own answer\n` +
    `- Yes/no questions\n` +
    `- Padding the concept list with weak concepts to hit a number\n\n` +
    `Quality over quantity. If this document yields 3 strong concepts and 6 great questions,\n` +
    `that's a better outcome than 10 mediocre concepts and 25 mediocre questions.`;

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
          tools: [STUDY_MATERIAL_TOOL],
          tool_choice: { type: 'tool', name: 'submit_study_material' },
          messages: [{ role: 'user', content: userMessage }]
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Claude API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      const toolUseBlock = data.content?.find(
        (block) => block.type === 'tool_use' && block.name === 'submit_study_material'
      );

      if (!toolUseBlock) {
        throw new Error('No submit_study_material tool_use block in response');
      }

      const { concepts, questions } = toolUseBlock.input || {};

      if (!Array.isArray(concepts) || concepts.length === 0) {
        throw new Error('Tool output missing or empty concepts array');
      }
      if (!Array.isArray(questions) || questions.length === 0) {
        throw new Error('Tool output missing or empty questions array');
      }

      const validImportance = ['core', 'supporting', 'distinctive', 'peripheral'];
      const validTypes = ['recall', 'application', 'connection'];
      const validDifficulties = ['easy', 'medium', 'hard'];

      const conceptIds = new Set();
      const conceptFields = ['id', 'name', 'importance', 'one_line_summary'];

      for (const [i, c] of concepts.entries()) {
        for (const f of conceptFields) {
          if (!c[f] || typeof c[f] !== 'string') {
            throw new Error(`Concept ${i + 1} missing or invalid field: ${f}`);
          }
        }
        if (!validImportance.includes(c.importance)) {
          throw new Error(`Concept ${i + 1} invalid importance: ${c.importance}`);
        }
        if (conceptIds.has(c.id)) {
          throw new Error(`Concept ${i + 1} duplicate id: ${c.id}`);
        }
        conceptIds.add(c.id);
      }

      const questionFields = [
        'concept_id',
        'type',
        'difficulty',
        'question',
        'correct_answer',
        'explanation',
        'source_reference'
      ];

      for (const [i, q] of questions.entries()) {
        for (const f of questionFields) {
          if (!q[f] || typeof q[f] !== 'string') {
            throw new Error(`Question ${i + 1} missing or invalid field: ${f}`);
          }
        }
        if (!conceptIds.has(q.concept_id)) {
          throw new Error(
            `Question ${i + 1} references unknown concept_id: ${q.concept_id}`
          );
        }
        if (!validTypes.includes(q.type)) {
          throw new Error(`Question ${i + 1} invalid type: ${q.type}`);
        }
        if (!validDifficulties.includes(q.difficulty)) {
          throw new Error(`Question ${i + 1} invalid difficulty: ${q.difficulty}`);
        }
      }

      console.log('[generate-questions] success', {
        title: title || '(untitled)',
        contentChars: content.length,
        conceptCount: concepts.length,
        questionCount: questions.length,
        importanceBreakdown: concepts.reduce((acc, c) => {
          acc[c.importance] = (acc[c.importance] || 0) + 1;
          return acc;
        }, {}),
        attempt
      });

      return { concepts, questions };
    } catch (error) {
      console.error(
        `[generate-questions] attempt ${attempt}/${MAX_RETRIES} failed:`,
        error.message
      );
      if (attempt === MAX_RETRIES) {
        throw new Error(
          `Failed to generate questions after ${MAX_RETRIES} attempts: ${error.message}`
        );
      }
      const delay = INITIAL_DELAY_MS * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
