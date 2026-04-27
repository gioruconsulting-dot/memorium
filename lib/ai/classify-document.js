/**
 * Classify a document: return a short description and a topic category.
 *
 * @param {string} content - Document text
 * @param {string} title   - Document title
 * @returns {Promise<{ description: string, topic: string }>}
 */
export async function classifyDocument(content, title) {
  const model  = process.env.CLAUDE_MODEL  || "claude-sonnet-4-6";
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set.");

  const prompt = `You are classifying a document for a learning library. Given the document below, return:

1. A description: 1-2 sentences (max 25 words) explaining what this document is about and what someone would learn from studying it. Plain and factual. No marketing language ("Discover the fascinating world of...", "Embark on a journey...", "Dive into...", etc.). Write as if describing the document to a colleague.

2. A topic: pick the single best fit from this exact list (use the exact spelling):
   - Tech
   - Business (includes finance, marketing, economics, strategy)
   - Science (includes physics, biology, chemistry, math)
   - Humanities (includes history, philosophy, literature, art)
   - Personal Growth (includes self-help, productivity, health, habits)
   - Other

If the document doesn't clearly fit one of the first five, use "Other".

Title: ${title}

Content:
${content}

Respond ONLY with a JSON object (no markdown, no backticks, no preamble):
{"description": "...", "topic": "..."}`;

  const VALID_TOPICS = new Set(["Tech", "Business", "Science", "Humanities", "Personal Growth", "Other"]);

  for (let attempt = 1; attempt <= 2; attempt++) {
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
          max_tokens: 500,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Claude API error ${response.status}: ${err}`);
      }

      const data = await response.json();
      const text = data.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");

      const cleaned = text
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();

      const parsed = JSON.parse(cleaned);

      // Validate description
      let description = parsed.description;
      if (typeof description !== "string" || !description.trim()) {
        console.warn("  ⚠ Missing description, defaulting to null");
        description = null;
      } else {
        description = description.trim();
        if (description.length > 350) console.warn(`[classifyDocument] Description is ${description.length} chars (expected ≤350)`);

      }

      // Validate topic
      let topic = parsed.topic;
      if (!VALID_TOPICS.has(topic)) {
        console.warn(`  ⚠ Invalid topic "${topic}", defaulting to "Other"`);
        topic = "Other";
      }

      return { description, topic };
    } catch (err) {
      if (attempt === 2) throw err;
      await new Promise((res) => setTimeout(res, 1500));
    }
  }
}
