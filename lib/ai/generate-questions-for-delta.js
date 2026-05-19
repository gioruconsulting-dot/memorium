// lib/ai/generate-questions-for-delta.js
//
// Note-delta question generation — generates spaced-repetition questions from
// a freshly-written section of the user's notes. No concept extraction: the
// caller is responsible for any concept tracking (note-questions don't
// reference concepts in v1; see masterplan §1).
//
// Returns: Array<{ type, difficulty, question, correct_answer,
//                  explanation, source_reference }>
// Length is 1–15. The route layer is responsible for mapping these field names
// onto the questions table columns (question_text, answer_text, etc.) and
// providing identity + SR-state fields at insert time.

import { NoDistinctMaterialError } from './errors.js';

const SYSTEM_PROMPT = `You are an expert learning designer who builds spaced-repetition study questions
from source material. Your work will be reviewed by a human learner who wants to
genuinely understand and retain the material — not pass a trivia test.

Respond in the same language as the source material. If the source is in French,
the questions, answers, and explanations should all be in French.

DELTA CONTEXT
You are generating questions from a new section of notes the user just wrote.
They may reference earlier material implicitly — concepts, terms, or framing
introduced in previous sections of the same notes document. Generate questions
ONLY from genuinely distinct concepts in this new section. Do not invent
questions about implied prior material that isn't substantively present here.

Order your output most-useful-first: the strongest, most load-bearing question
first, then in descending order of value to the learner. If the section yields
many candidate questions, the downstream system may keep only the first 15.

QUESTION GENERATION
Generate between 1 and 15 questions, depending on how much genuinely distinct
material the section contains:
- A short or thin section may yield only 1–3 questions. Stop there. Do not pad.
- A dense, multi-idea section may legitimately yield 10–15. Cover the distinct
  ideas without duplicating across them.
- A rambling or low-substance section may yield only 1–2 real questions buried
  in filler. Extract those; ignore the filler.

It is always better to have 3 sharp questions than 8 weak ones. Question count
is a function of the material, not a target.

If the section truly contains no distinct material worth a question (e.g., it's
a one-line note, a heading with no body, pure formatting, or a near-duplicate of
material already covered earlier in the document), return an EMPTY questions
array. The downstream system will handle this as a non-error outcome. Do not
fabricate questions to avoid an empty return.

Distribute question types based on what fits the material:
- "recall": tests memory of an idea itself — what it is, what it claims,
  what its components are. Avoid trivia (proper nouns, version numbers, dates).
  Focus on substance, not surface.
- "application": tests whether the learner can use the idea in a new context.
  "When would you choose X over Y?" "What would happen if you applied this to Z?"
- "connection": tests whether the learner can relate two ideas, see a tradeoff,
  or recognize a non-obvious implication.

Difficulty calibration (use the full range, weighted toward medium):
- "easy": could answer with light familiarity. The answer is stated nearly verbatim
  in the source.
- "medium": requires having internalized the idea. The answer requires synthesizing
  across a paragraph or rephrasing in the learner's own words.
- "hard": requires connecting ideas, applying to a novel case, or recognizing a
  non-obvious implication. The source supports the answer but doesn't state it directly.

RULES
- Every question must be answerable from this section. No external knowledge required.
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
- No comprehension framing. Do not start questions with "According to the notes...",
  "What does the author say...", "What does the source claim..." or similar. Ask the
  substantive question directly. The learner already knows the answer comes from their
  own notes.
- No near-duplicates. If two questions could share an answer, drop one.
- Diversity of phrasing. Don't open every question with "What is..." or "How does...".
- Source reference should be a direct quote from this section, 1–2 complete sentences.
  Prefer brevity, but never cut mid-sentence. If the source has obvious typos or
  transcription errors in the quoted passage, you may correct those typos, but preserve
  the author's voice and word choice.
- Preserve concrete material. A spaced-repetition learner benefits from concrete
  anchors: specific practices, distinctive metaphors, memorable contrasts, or short
  diagnostic questions. If the section contains such concrete anchors, prefer them
  over abstract restatements of themes.

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
Before finalizing, check coverage of this section:
- No single theme should account for more than ~30% of total questions. If the
  section is genuinely about one theme, fewer questions overall is better than
  padding. If you find yourself producing 5 questions on the same idea because
  the section mentions it often, consolidate — fewer, sharper questions, and
  make room for the section's other distinct ideas.

SELF-CHECK before returning
Before producing output, verify:
1. Questions are ordered most-useful-first.
2. No two questions ask the same thing in different words.
3. No question's phrasing telegraphs its answer or names the framework that
   IS the answer.
4. No question uses "According to the notes / author / source" or similar
   comprehension-check framing.
5. No question requires knowledge beyond this section.
6. Coverage check: no single theme exceeds ~30% of total questions.
7. The mix of types and difficulties varies — you haven't defaulted to
   all-recall-easy.
8. Each correct_answer is short enough to self-grade quickly.
9. The set includes concrete anchors (practices, metaphors, contrasts,
   diagnostics) where the section provides them — not only abstract principles.

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

GOOD questions:
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

const NOTE_QUESTIONS_TOOL = {
  name: 'submit_note_questions',
  description: 'Submit study questions generated from a new section of the learner\'s notes.',
  input_schema: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
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
              description: '1–3 sentences, compact enough to self-grade in under 10 seconds'
            },
            explanation: {
              type: 'string',
              description: 'Why this answer is correct + light context, 2–3 sentences. Do not restate the answer.'
            },
            source_reference: {
              type: 'string',
              description: 'Direct quote from this section, 1–2 complete sentences'
            }
          },
          required: [
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
    required: ['questions']
  }
};

const MAX_QUESTIONS = 15;
const HARD_CEILING = 20;

/**
 * Generate study questions from a freshly-written section of notes via Claude tool-use.
 *
 * @param {string} draftText - The new note-section text.
 * @param {string} [title]   - Notes-document title (passed into the user message for context).
 * @returns {Promise<Array<{ type, difficulty, question, correct_answer, explanation, source_reference }>>}
 * @throws {NoDistinctMaterialError} If the model returns a valid response with 0 questions.
 * @throws {Error} On API failure, malformed response, or count > 20, after 3 retry attempts.
 */
export async function generateQuestionsForDelta(draftText, title = '') {
  const MAX_RETRIES = 3;
  const INITIAL_DELAY_MS = 1000;

  if (!draftText || draftText.trim().length < 100) {
    throw new Error('Note section too short (minimum 100 characters)');
  }

  const userMessage =
    `Document title: ${title}\n` +
    `\nNew note section:\n---\n${draftText}\n---\n\n` +
    `Generate study questions following the system instructions.\n` +
    `Use the submit_note_questions tool to return your output.\n\n` +
    `Aim for 1–15 questions, ordered most-useful-first. If the section genuinely\n` +
    `contains no distinct material worth a question, return an empty questions array.\n\n` +
    `A reminder of what to avoid:\n` +
    `- Trivia (proper nouns, dates, version numbers, library names as the answer)\n` +
    `- Near-duplicate questions on the same idea\n` +
    `- Question text that telegraphs its own answer\n` +
    `- Yes/no questions\n` +
    `- Padding to hit a number\n` +
    `- Questions about prior sections of the document that aren't substantively\n` +
    `  present in this section\n\n` +
    `Quality over quantity. If this section yields 3 strong questions, that's a\n` +
    `better outcome than 10 mediocre ones.`;

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
          tools: [NOTE_QUESTIONS_TOOL],
          tool_choice: { type: 'tool', name: 'submit_note_questions' },
          messages: [{ role: 'user', content: userMessage }]
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Claude API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      const toolUseBlock = data.content?.find(
        (block) => block.type === 'tool_use' && block.name === 'submit_note_questions'
      );

      if (!toolUseBlock) {
        throw new Error('No submit_note_questions tool_use block in response');
      }

      const { questions } = toolUseBlock.input || {};

      if (!Array.isArray(questions)) {
        throw new Error('Tool output missing or non-array questions field');
      }

      // 0 questions: model returned a valid response saying "no distinct material".
      // This is a terminal outcome, not a retryable failure.
      if (questions.length === 0) {
        throw new NoDistinctMaterialError();
      }

      if (questions.length > HARD_CEILING) {
        throw new Error(
          `Tool output returned ${questions.length} questions (hard ceiling ${HARD_CEILING})`
        );
      }

      const validTypes = ['recall', 'application', 'connection'];
      const validDifficulties = ['easy', 'medium', 'hard'];
      const requiredFields = [
        'type',
        'difficulty',
        'question',
        'correct_answer',
        'explanation',
        'source_reference'
      ];

      for (const [i, q] of questions.entries()) {
        for (const f of requiredFields) {
          if (!q[f] || typeof q[f] !== 'string') {
            throw new Error(`Question ${i + 1} missing or invalid field: ${f}`);
          }
        }
        if (!validTypes.includes(q.type)) {
          throw new Error(`Question ${i + 1} invalid type: ${q.type}`);
        }
        if (!validDifficulties.includes(q.difficulty)) {
          throw new Error(`Question ${i + 1} invalid difficulty: ${q.difficulty}`);
        }
      }

      // 16–20: model overshot but ordered most-useful-first per the prompt.
      // Keep the strongest 15.
      const originalCount = questions.length;
      const trimmed = questions.length > MAX_QUESTIONS
        ? questions.slice(0, MAX_QUESTIONS)
        : questions;

      console.log('[generate-questions-for-delta] success', {
        title: title || '(untitled)',
        draftChars: draftText.length,
        modelQuestionCount: originalCount,
        returnedQuestionCount: trimmed.length,
        truncated: originalCount > MAX_QUESTIONS,
        attempt
      });

      return trimmed;
    } catch (error) {
      // Terminal outcome — do not retry.
      if (error instanceof NoDistinctMaterialError) {
        console.log('[generate-questions-for-delta] no distinct material', {
          title: title || '(untitled)',
          draftChars: draftText.length,
          attempt
        });
        throw error;
      }

      console.error(
        `[generate-questions-for-delta] attempt ${attempt}/${MAX_RETRIES} failed:`,
        error.message
      );
      if (attempt === MAX_RETRIES) {
        throw new Error(
          `Failed to generate note-delta questions after ${MAX_RETRIES} attempts: ${error.message}`
        );
      }
      const delay = INITIAL_DELAY_MS * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
