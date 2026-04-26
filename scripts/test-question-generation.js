import { generateQuestions } from "../lib/ai/generate-questions.js";

const SAMPLE_CONTENT = `Spaced repetition is a learning technique that involves reviewing information at increasing intervals over time. The spacing effect, discovered by Hermann Ebbinghaus in 1885, shows that we remember information better when study sessions are distributed over time rather than massed together.

The optimal spacing intervals follow a pattern: review after 1 day, then 3 days, then 7 days, then 14 days, and so on. Each successful recall strengthens the memory and extends the next review interval.

Research by Piotr Wozniak led to the SuperMemo algorithm, which dynamically adjusts intervals based on recall performance. If you struggle to recall information (grade it "hard" or "forgot"), the interval resets to keep that information fresh.

The key insight: memory consolidation happens during sleep and time between reviews. Cramming information in one session leads to rapid forgetting, while distributed practice builds long-term retention.

Active recall — the practice of actively retrieving information from memory rather than passively re-reading — is the other critical component. Testing yourself forces deeper processing than simply reviewing notes. The "testing effect" shows that retrieval practice enhances long-term retention more than additional study time.

Interleaving different topics during study sessions also improves learning. Rather than studying one subject in a block, mixing related topics forces the brain to discriminate between concepts, strengthening understanding and transfer to new situations.`;

const REQUIRED_FIELDS = ["question", "type", "correctAnswer", "explanation", "sourceReference"];
const VALID_TYPES = new Set(["recall", "application", "connection"]);

async function run() {
  console.log("Calling Claude API...\n");

  let questions, description, topic;
  try {
    ({ questions, description, topic } = await generateQuestions(
      SAMPLE_CONTENT,
      "Spaced Repetition Basics",
      "Learning, Memory, Study Techniques"
    ));
  } catch (err) {
    console.error("FAILED:", err.message);
    process.exit(1);
  }

  console.log(`Description: ${description}`);
  console.log(`Topic:       ${topic}\n`);

  // Count types
  const typeCounts = { recall: 0, application: 0, connection: 0 };
  for (const q of questions) {
    if (typeCounts[q.type] !== undefined) typeCounts[q.type]++;
  }

  console.log(`Questions generated: ${questions.length}`);
  console.log(`Type distribution:  recall=${typeCounts.recall}  application=${typeCounts.application}  connection=${typeCounts.connection}\n`);

  // Print first 3 samples
  console.log("Sample questions:");
  for (let i = 0; i < Math.min(3, questions.length); i++) {
    const q = questions[i];
    console.log(`\n[${i + 1}] (${q.type}) ${q.question}`);
    console.log(`    Answer: ${q.correctAnswer.slice(0, 100)}...`);
  }

  // Validate all fields
  let allValid = true;
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    for (const field of REQUIRED_FIELDS) {
      if (!q[field] || typeof q[field] !== "string" || !q[field].trim()) {
        console.error(`\nVALIDATION FAIL: question[${i}] missing or empty field: ${field}`);
        allValid = false;
      }
    }
    if (!VALID_TYPES.has(q.type)) {
      console.error(`\nVALIDATION FAIL: question[${i}] has invalid type: ${q.type}`);
      allValid = false;
    }
  }

  if (!allValid) {
    console.error("\nValidation failed.");
    process.exit(1);
  }

  console.log(`\n✓ All ${questions.length} questions passed validation.`);
  process.exit(0);
}

run();
