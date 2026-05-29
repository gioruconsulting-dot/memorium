// scripts/test-ai-functions.js
//
// Isolation test for Chunk 4a AI functions:
//   - generateQuestionsForDelta (lib/ai/generate-questions-for-delta.js)
//   - generateConcepts          (lib/ai/generate-concepts.js)
//
// Not committed code; a working session artifact for Step 5.
//
// Usage:
//   node scripts/test-ai-functions.js                          # uses built-in samples
//   node scripts/test-ai-functions.js sample1.txt sample2.txt  # reads from disk
//
// Add --thin to force the thin-input test (verifies NoDistinctMaterialError):
//   node scripts/test-ai-functions.js --thin

import { config } from 'dotenv';
config({ path: '.env.local' });

import { readFileSync } from 'node:fs';
import { generateQuestionsForDelta } from '../lib/ai/generate-questions-for-delta.js';
import { generateConcepts } from '../lib/ai/generate-concepts.js';
import { NoDistinctMaterialError } from '../lib/ai/errors.js';

const FALLBACK_SAMPLE_1 = `Active recall is the practice of retrieving information from memory rather than re-reading it. The act of trying to remember strengthens the memory trace far more than passive review. This is why flashcards beat highlighting: the brain has to do the work of pulling the answer out of nothing, not just recognize it on the page.

Spaced repetition pairs with active recall by timing the retrievals. Reviewing too soon wastes effort on something you already know; reviewing too late lets the memory fade past recovery. The optimal interval grows after each successful recall — what's called expanding rehearsal.

Three failure modes are worth naming. First, "passive review masquerading as study" — reading notes feels productive but builds no retention. Second, "answer recognition" — peeking at the answer before genuinely trying to recall, which trains the brain to recognize rather than retrieve. Third, "interval collapse" — restarting every card to "day 1" after one missed recall, which destroys the schedule's compounding benefit. The fix is graded recall: a partial answer keeps a card mostly on schedule, only a full miss resets it.

The testing effect, demonstrated by Roediger and Karpicke, shows that students who self-tested once retained more a week later than students who re-read the same material four times. Retrieval is the learning event, not the review.`;

const FALLBACK_SAMPLE_2 = `A monorepo holds multiple projects in one version-controlled repository. Google, Meta, and Microsoft all run monorepos at scale. The structural choice carries real consequences: it changes how code is shared, how builds are organized, and what tooling teams need.

The main argument for a monorepo is atomic cross-project changes. If a shared library has a breaking change, the same commit can update every caller. In a multi-repo setup, the same change requires coordinated PRs across repos and a period where some consumers are broken. Monorepos make refactors cheap; multi-repos make them expensive.

The main argument against is build-system complexity. A naive monorepo rebuild touches everything on every push, which is unworkable past a few hundred projects. The fix is a build system that tracks dependencies and only rebuilds what changed — Bazel, Buck, Nx, Turbo. The tooling is the cost; the atomicity is the benefit. Without the tooling, a monorepo is just a slow repo.

A common misconception: monorepos require a single language or framework. They don't. Bazel was built specifically to handle polyglot codebases. What monorepos do require is convention — agreed-upon project layout, shared linting, shared CI config — because the absence of repo boundaries means conventions are the only structure.`;

const THIN_SAMPLE = `This is a short note. It has three sentences. The third sentence is here.`;

function shortStack(err) {
  if (!err.stack) return '(no stack)';
  return err.stack.split('\n').slice(0, 5).join('\n');
}

function distribution(items, key) {
  return items.reduce((acc, x) => {
    acc[x[key]] = (acc[x[key]] || 0) + 1;
    return acc;
  }, {});
}

async function runDelta(label, content) {
  console.log(`\n=== [${label}] generateQuestionsForDelta ===`);
  const t0 = Date.now();
  try {
    const questions = await generateQuestionsForDelta(content, 'Test note title');
    const elapsedMs = Date.now() - t0;
    console.log(JSON.stringify({
      ok: true,
      elapsedMs,
      questionCount: questions.length,
      typeDistribution: distribution(questions, 'type'),
      difficultyDistribution: distribution(questions, 'difficulty'),
      truncatedHint: questions.length === 15 ? 'possibly truncated (returned exactly 15)' : 'no',
      firstQuestion: questions[0],
      lastQuestion: questions[questions.length - 1]
    }, null, 2));
    return { ok: true, elapsedMs };
  } catch (err) {
    const elapsedMs = Date.now() - t0;
    console.log(JSON.stringify({
      ok: false,
      elapsedMs,
      errorClass: err.constructor.name,
      errorMessage: err.message,
      stack: shortStack(err)
    }, null, 2));
    return { ok: false, elapsedMs, err };
  }
}

async function runConcepts(label, content) {
  console.log(`\n=== [${label}] generateConcepts ===`);
  const t0 = Date.now();
  try {
    const concepts = await generateConcepts(content, 'Test note title');
    const elapsedMs = Date.now() - t0;
    console.log(JSON.stringify({
      ok: true,
      elapsedMs,
      conceptCount: concepts.length,
      importanceDistribution: distribution(concepts, 'importance'),
      firstConcept: concepts[0],
      lastConcept: concepts[concepts.length - 1]
    }, null, 2));
    return { ok: true, elapsedMs };
  } catch (err) {
    const elapsedMs = Date.now() - t0;
    console.log(JSON.stringify({
      ok: false,
      elapsedMs,
      errorClass: err.constructor.name,
      errorMessage: err.message,
      stack: shortStack(err)
    }, null, 2));
    return { ok: false, elapsedMs, err };
  }
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY not set (check .env.local)');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const thinOnly = args.includes('--thin');
  const pathArgs = args.filter((a) => !a.startsWith('--'));

  let samples;
  if (thinOnly) {
    samples = [{ label: 'thin', content: THIN_SAMPLE }];
  } else if (pathArgs.length >= 1) {
    samples = pathArgs.map((p, i) => ({
      label: `file:${p}`,
      content: readFileSync(p, 'utf8')
    }));
  } else {
    samples = [
      { label: 'fallback-1 (active recall)', content: FALLBACK_SAMPLE_1 },
      { label: 'fallback-2 (monorepos)', content: FALLBACK_SAMPLE_2 }
    ];
  }

  const results = [];
  for (const s of samples) {
    console.log(`\n############ Sample: ${s.label} (${s.content.length} chars) ############`);
    if (s.label === 'thin') {
      // Thin test: only exercise the delta function — it's the one with the
      // typed-error contract. Concepts has no thin contract (no min-length guard).
      const r = await runDelta(s.label, s.content);
      results.push({ label: s.label, fn: 'delta', ...r });
    } else {
      const dr = await runDelta(s.label, s.content);
      const cr = await runConcepts(s.label, s.content);
      results.push({ label: s.label, fn: 'delta', ...dr });
      results.push({ label: s.label, fn: 'concepts', ...cr });
    }
  }

  const totalMs = results.reduce((acc, r) => acc + r.elapsedMs, 0);
  const successes = results.filter((r) => r.ok).length;
  const failures = results.length - successes;

  console.log('\n############ Summary ############');
  console.log(JSON.stringify({
    totalRuns: results.length,
    successes,
    failures,
    totalElapsedMs: totalMs,
    perRun: results.map((r) => ({
      sample: r.label,
      fn: r.fn,
      ok: r.ok,
      elapsedMs: r.elapsedMs,
      errorClass: r.err?.constructor.name
    }))
  }, null, 2));
}

main().catch((err) => {
  console.error('Top-level failure:', err);
  process.exit(1);
});
