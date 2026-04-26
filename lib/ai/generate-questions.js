/**
 * Generate study questions, a description, and a topic from document content.
 *
 * @param {string} content - Document text (required, min 100 chars)
 * @param {string} title   - Document title (optional, for context)
 * @param {string} themes  - Comma-separated themes (optional, for context)
 * @returns {Promise<{ questions: Array, description: string|null, topic: string }>}
 * @throws {Error} If content too short, API fails after retries, or too few valid questions
 */
export async function generateQuestions(content, title, themes) {
  if (!content || content.length < 100) {
    throw new Error("Content must be at least 100 characters.");
  }
  if (content.length > 50000) {
    throw new Error("Content exceeds 50,000 character limit.");
  }

  const model = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set.");
  }

  const contextLines = [];
  if (title) contextLines.push(`Document title: ${title}`);
  if (themes) contextLines.push(`Key themes: ${themes}`);
  const contextBlock = contextLines.length
    ? contextLines.join("\n") + "\n\n"
    : "";

  const prompt = `You are a learning assistant. Given a document, return a JSON object with three keys: description, topic, and questions.

In addition to the questions, return:

1. A description: 1-2 sentences (max 25 words) explaining what this document is about and what someone would learn from studying it. Plain and factual. No marketing language ("Discover the fascinating world of...", "Embark on a journey...", etc.). Write as if describing the document to a colleague.

2. A topic: pick the single best fit from this exact list (use the exact spelling):
   - Tech
   - Business (includes finance, marketing, economics, strategy)
   - Science (includes physics, biology, chemistry, math)
   - Humanities (includes history, philosophy, literature, art)
   - Personal Growth (includes self-help, productivity, health, habits)
   - Other

   If the document doesn't clearly fit one of the first five, use "Other".

${contextBlock}For the questions array, generate exactly 20 study questions. Create a balanced mix of three question types:
1. Recall questions (40%): Test memorization of key facts, concepts, definitions, or specific details.
2. Application questions (40%): Test ability to apply concepts to new scenarios or examples.
3. Connection questions (20%): Test ability to relate ideas, compare/contrast concepts, or see broader patterns.

For each question, provide:
- question: The question text (clear, specific, answerable from the content)
- type: One of: "recall", "application", "connection"
- correctAnswer: The correct answer in maximum 2 sentences and 30 words
- explanation: Why this answer is correct + additional context (maximum 2 sentences)
- sourceReference: Direct quote from the content that supports this answer (1-2 sentences max)

IMPORTANT RULES:
- Questions must be answerable from the provided content (no external knowledge required)
- Avoid yes/no questions (ask for explanations instead)
- Vary difficulty (mix easy, medium, hard)
- Don't repeat information across questions
- Keep questions focused (one concept per question)

Content to learn:
<document>
${content}
</document>

Respond ONLY with a JSON object (no markdown, no backticks, no preamble):
{"description": "...", "topic": "Tech", "questions": [{"question": "...", "type": "recall", "correctAnswer": "...", "explanation": "...", "sourceReference": "..."}]}

Generate description, topic, and exactly 20 questions now.`;

  const VALID_TYPES  = new Set(["recall", "application", "connection"]);
  const VALID_TOPICS = new Set(["Tech", "Business", "Science", "Humanities", "Personal Growth", "Other"]);

  function validateResponse(parsed) {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Response is not a JSON object.");
    }

    // Validate description — soft cap, don't throw
    let description = parsed.description;
    if (typeof description !== "string" || !description.trim()) {
      console.warn("[generateQuestions] Missing or empty description, defaulting to null");
      description = null;
    } else {
      description = description.trim();
      if (description.length > 200) description = description.slice(0, 200);
    }

    // Validate topic — default to "Other" rather than failing the upload
    let topic = parsed.topic;
    if (!VALID_TOPICS.has(topic)) {
      console.warn(`[generateQuestions] Invalid topic "${topic}", defaulting to "Other"`);
      topic = "Other";
    }

    // Validate questions (existing logic unchanged)
    const questionsRaw = parsed.questions;
    if (!Array.isArray(questionsRaw)) throw new Error("questions is not a JSON array.");
    const questions = questionsRaw.filter((q) =>
      q &&
      typeof q.question === "string" && q.question.trim() &&
      typeof q.type === "string" && VALID_TYPES.has(q.type) &&
      typeof q.correctAnswer === "string" && q.correctAnswer.trim() &&
      typeof q.explanation === "string" && q.explanation.trim() &&
      typeof q.sourceReference === "string" && q.sourceReference.trim()
    );
    if (questions.length < 15) {
      throw new Error(`Only ${questions.length} valid questions after filtering (need at least 15).`);
    }

    return { questions, description, topic };
  }

  const delays = [1000, 2000, 4000];

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 8500,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Claude API error ${response.status}: ${err}`);
      }

      const data = await response.json();

      const text = data.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");

      // Strip markdown fences if present
      const cleaned = text
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();

      const parsed = JSON.parse(cleaned);
      return validateResponse(parsed);
    } catch (err) {
      if (attempt === 3) {
        throw new Error(`Failed after 3 attempts: ${err.message}`);
      }
      await new Promise((res) => setTimeout(res, delays[attempt - 1]));
    }
  }
}
