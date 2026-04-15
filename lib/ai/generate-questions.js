/**
 * Generate study questions from document content using Claude API.
 *
 * @param {string} content - Document text (required, min 100 chars)
 * @param {string} title - Document title (optional, for context)
 * @param {string} themes - Comma-separated themes (optional, for context)
 * @returns {Promise<Array>} Array of 15-20 question objects
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

  const prompt = `You are a learning assistant that creates high-quality study questions. Generate exactly 20 questions from the following content.

${contextBlock}Create a balanced mix of three question types:
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
${content}

Respond ONLY with a JSON array (no markdown, no backticks, no preamble):
[{"question": "...", "type": "recall", "correctAnswer": "...", "explanation": "...", "sourceReference": "..."}]

Generate exactly 20 questions now.`;

  const VALID_TYPES = new Set(["recall", "application", "connection"]);

  function validateQuestions(parsed) {
    if (!Array.isArray(parsed)) throw new Error("Response is not a JSON array.");
    const valid = parsed.filter((q) => {
      return (
        q &&
        typeof q.question === "string" && q.question.trim() &&
        typeof q.type === "string" && VALID_TYPES.has(q.type) &&
        typeof q.correctAnswer === "string" && q.correctAnswer.trim() &&
        typeof q.explanation === "string" && q.explanation.trim() &&
        typeof q.sourceReference === "string" && q.sourceReference.trim()
      );
    });
    if (valid.length < 15) {
      throw new Error(
        `Only ${valid.length} valid questions after filtering (need at least 15).`
      );
    }
    return valid;
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
          max_tokens: 8000,
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
      return validateQuestions(parsed);
    } catch (err) {
      if (attempt === 3) {
        throw new Error(`Failed after 3 attempts: ${err.message}`);
      }
      await new Promise((res) => setTimeout(res, delays[attempt - 1]));
    }
  }
}
