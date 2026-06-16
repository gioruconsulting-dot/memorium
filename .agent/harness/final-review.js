// FINAL_REVIEW generation (masterplan §3.6). Generated from real artifacts before
// human acceptance. The bar is not "it rendered" — it is "could a human make a
// real accept/reject decision from this alone." So it states what changed and
// why, what was tested and what was NOT, every open/accepted risk, what to
// inspect by hand, which commands are safe vs gated, and an ACTIVE acceptance
// block (checkboxes + typed P1 confirmation when there is P1 history).
//
// Carries the Proposed-learnings section (informative, never blocking).

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { loadLearnings, renderProposedLearningsSection } from './learnings.js';

const P1_SEVERITIES = new Set(['P0', 'P1A', 'P1B', 'P1C']);
const DIFF_INLINE_MAX_LINES = 400; // inline small diffs; summarize larger ones

// A change touching only test files ships nothing to users — used to mark the
// DEPLOY action N/A (with the reason) rather than listing it as a live step.
const TEST_FILE_RE = /\.(test|spec)\.[mc]?jsx?$|(^|\/)__tests__\//;

// The worktree root, derived from the run dir (.../<worktree>/.agent/runs/<id>),
// so the "verify it yourself" steps can tell the human exactly where to `cd`.
function deriveRepoDir(runsDir) {
  if (!runsDir) return null;
  const marker = `${path.sep}.agent${path.sep}runs${path.sep}`;
  const i = runsDir.indexOf(marker);
  return i >= 0 ? runsDir.slice(0, i) : path.resolve(runsDir, '..', '..', '..');
}

// Parse the authoritative test counts from the HARNESS re-run output (node:test
// "ℹ tests N" / "# tests N" form) — never the executor's self-reported number.
function parseCounts(text) {
  const grab = (re) => {
    const m = text.match(re);
    return m ? m[1] : null;
  };
  return {
    tests: grab(/(?:ℹ|#)\s*tests\s+(\d+)/),
    pass: grab(/(?:ℹ|#)\s*pass\s+(\d+)/),
    fail: grab(/(?:ℹ|#)\s*fail\s+(\d+)/),
  };
}

// Inline the diff when small enough to read in place; otherwise a structured
// summary (file + hunk headers) and a pointer to the full artifact.
function renderDiffSection(runsDir, report) {
  const rel = report.git_diff_path || 'executor.diff';
  const diffPath = path.join(runsDir, rel);
  const out = ['## Changed files — diff', ''];
  if (!existsSync(diffPath)) {
    out.push(`_Diff artifact not found at \`${rel}\`._`);
    return out;
  }
  const diff = readFileSync(diffPath, 'utf8').replace(/\n$/, '');
  const lines = diff.split('\n');
  if (lines.length <= DIFF_INLINE_MAX_LINES) {
    out.push('```diff', diff, '```');
  } else {
    const heads = lines.filter((l) => /^(diff --git|@@|\+\+\+ |--- )/.test(l));
    out.push(`_Diff is ${lines.length} lines — structure shown; full diff at \`${rel}\`. Inspect the risky hunks._`, '');
    out.push('```diff', heads.join('\n'), '```');
  }
  return out;
}

export function generateFinalReview({
  spec,
  report,
  register,
  downgrades = [],
  runsDir,
  learningsRegisterPath,
  safeCommands = [],
}) {
  const risks = register?.risks ?? [];
  const openRisks = risks.filter((r) => r.status === 'open');
  const acceptedRisks = risks.filter((r) => r.status === 'accepted');
  const p1History = risks.some((r) => P1_SEVERITIES.has(r.severity));
  const hasAnyRisk = openRisks.length + acceptedRisks.length > 0;

  const testsRun = report.tests_run ?? [];
  const notRun = testsRun.filter((t) => t.result !== 'pass');

  // Harness-measured headline + bounds, for the plain-English lead.
  const firstEv = testsRun[0]?.output_path ? path.join(runsDir, testsRun[0].output_path) : null;
  const hc = parseCounts(firstEv && existsSync(firstEv) ? readFileSync(firstEv, 'utf8') : '');
  const changed = report.files_changed ?? [];
  const greenPaths = spec.green_paths ?? [];
  const inBounds = changed.length > 0 && changed.every((f) => greenPaths.includes(f));
  // Test-only change → nothing ships to users → DEPLOY is N/A, not a live step.
  const testOnly = changed.length > 0 && changed.every((f) => TEST_FILE_RE.test(f));
  const attention = [];
  if (openRisks.length) attention.push(`${openRisks.length} open risk(s)`);
  if (notRun.length) attention.push(`${notRun.length} test(s) not evidenced as pass`);
  if (downgrades.length) attention.push(`${downgrades.length} downgraded test claim(s)`);
  if (!inBounds) attention.push('changes outside the declared editable paths');

  const L = [];
  L.push(`# FINAL REVIEW`, '');
  L.push('## Summary (plain English — read this first)');
  L.push(`- **Asked to:** ${spec.objective}`);
  L.push(
    `- **Actually did:** changed ${changed.length} file(s)${changed.length ? ' — ' + changed.map((f) => `\`${f}\``).join(', ') : ''}.` +
      (hc.tests !== null ? ` The harness independently re-ran the tests: **${hc.pass}/${hc.tests} passed, ${hc.fail} failed.**` : '')
  );
  L.push(
    `- **Stayed in bounds:** ${inBounds ? 'yes — only the declared editable path(s) changed; nothing out of scope was touched.' : '**NO** — files outside the declared editable paths changed (see the diff below).'}`
  );
  L.push(
    `- **Needs your attention:** ${attention.length ? '**' + attention.join('; ') + '** (details below).' : 'nothing beyond the human-only actions reserved for you at the end.'}`
  );
  L.push('');

  L.push('## What changed');
  if (report.files_changed?.length) {
    for (const f of report.files_changed) L.push(`- \`${f}\``);
  } else {
    L.push('_No files changed._');
  }
  L.push('', `**Summary (executor's claim — verify against the harness-measured sections below):** ${report.summary}`, '');

  L.push(...renderDiffSection(runsDir, report));
  L.push('');

  L.push('## Why');
  for (const c of spec.acceptance_criteria) L.push(`- ${c}`);
  L.push('');

  L.push("## Tests run (harness-measured — independent re-run, not the executor's claim)");
  if (testsRun.length) {
    for (const t of testsRun) {
      const evPath = t.output_path ? path.join(runsDir, t.output_path) : null;
      const evText = evPath && existsSync(evPath) ? readFileSync(evPath, 'utf8') : '';
      const c = parseCounts(evText);
      const counts = c.tests !== null ? `${c.tests} tests, ${c.pass} pass, ${c.fail} fail` : '(count not parseable from evidence)';
      L.push(`- \`${t.command}\` → **${t.result}** — harness-measured: **${counts}** (evidence: \`${t.output_path || '(none)'}\`)`);
      if (evText) {
        const excerpt = evText
          .split('\n')
          .filter((l) => /(?:ℹ|#)\s*(tests|suites|pass|fail|skipped|todo)\s/.test(l))
          .join('\n');
        if (excerpt) {
          L.push('', 'Excerpt of the harness re-run output:', '```', excerpt, '```');
        }
      }
    }
  } else {
    L.push('_No tests run._');
  }
  L.push('');

  L.push('## Tests NOT run / waived');
  if (notRun.length === 0 && downgrades.length === 0) {
    L.push('_None — every test claim is an evidenced pass._');
  } else {
    for (const t of notRun) L.push(`- \`${t.command}\` → ${t.result}`);
    for (const d of downgrades) L.push(`- downgraded: \`${d.command}\` — ${d.reason}`);
  }
  L.push('');

  L.push('## Risks (from the register)');
  if (openRisks.length === 0 && acceptedRisks.length === 0) {
    L.push('_No open or accepted risks._');
  } else {
    for (const r of openRisks) L.push(`- **OPEN** ${r.id} [${r.severity}] ${r.type} — ${r.status}`);
    for (const r of acceptedRisks) L.push(`- accepted ${r.id} [${r.severity}] ${r.type}`);
  }
  L.push('');

  L.push('## Files requiring manual inspection');
  for (const f of report.files_changed ?? []) L.push(`- \`${f}\` (full diff inlined above)`);
  L.push('');

  // ── Zone 1: approval — "do I understand this?" Answerable from this document.
  L.push('## What happened — approve or correct');
  L.push('_These confirm you UNDERSTAND and approve the change. Every box is answerable from the summary, diff, and harness-measured result above — no other files needed._');
  L.push('```');
  L.push('[ ] I read the diff above and understand what changed');
  L.push(`[ ] I reviewed the harness-measured test result${hc.tests !== null ? ` (${hc.pass}/${hc.tests} pass, ${hc.fail} fail)` : ''}`);
  L.push('[ ] I understand which tests were not run / waived');
  if (hasAnyRisk) {
    L.push('[ ] I approve any remaining P2/P3 risks by ID');
    L.push('[ ] I confirm no P0/P1 risks remain open');
  }
  L.push('```');
  if (!hasAnyRisk) L.push('', '_Risk approval N/A — the register has no open or accepted risks for this change._');
  L.push('');

  // ── Zone 2: human-only actions, split by WHEN they can happen.
  const userFacing = spec.user_facing !== false; // absent → conservative (user-facing)
  const verifyCmds = safeCommands.length ? safeCommands : testsRun.map((t) => t.command);

  // Stage 1 — verification you can do NOW (the artifacts exist at this gate).
  // Spelled out as literal steps: which directory, the exact command, and what a
  // pass looks like — a checkbox you can't act on without asking how isn't a gate.
  const repoDir = deriveRepoDir(runsDir);
  const expectedFor = (cmd) => {
    const t = testsRun.find((x) => x.command === cmd);
    const ev = t?.output_path ? path.join(runsDir, t.output_path) : null;
    return parseCounts(ev && existsSync(ev) ? readFileSync(ev, 'utf8') : '');
  };

  L.push('## Verify it yourself — now (the artifacts exist at this gate)');
  L.push('_Literal steps. You do not need to know anything beyond this block._');
  L.push('');
  L.push('1. Open a terminal.');
  L.push('2. Go to the worktree directory (copy-paste this):');
  L.push('```');
  L.push(`cd ${repoDir ?? '<worktree root>'}`);
  L.push('```');
  let stepN = 3;
  const verifyBoxes = [];
  for (const c of verifyCmds) {
    const ec = expectedFor(c);
    L.push(`${stepN}. Run the verification (copy-paste this):`);
    L.push('```');
    L.push(c);
    L.push('```');
    if (ec.tests !== null) {
      L.push(`   A pass looks like: \`tests ${ec.tests}\` · \`pass ${ec.pass}\` · \`fail ${ec.fail}\` — the **fail** line must read **0**.`);
      verifyBoxes.push(`[ ] I ran \`${c}\` from the worktree and saw tests ${ec.tests}, pass ${ec.pass}, fail 0`);
    } else {
      L.push('   A pass looks like: the run finishes with `fail 0` and no error.');
      verifyBoxes.push(`[ ] I ran \`${c}\` from the worktree and it passed (fail 0)`);
    }
    stepN += 1;
  }
  L.push('');
  L.push('```');
  for (const b of verifyBoxes) L.push(b);
  L.push('[ ] I read the diff above');
  L.push('```');
  L.push('');

  // Real-life test — tailored to the change. Pure-logic has no UI to exercise, so
  // it is marked N/A with the reason, not listed as a live (or held-open) step.
  L.push('## Real-life test — does it actually work in the product?');
  if (!userFacing) {
    L.push('**N/A — pure-logic change, no UI to exercise.** Running the verification above *is* the full real-life check; there is no separate on-device step and nothing is held open here.');
  } else {
    L.push('_This **cannot** be done at this gate — nothing with this change is deployed yet. It is a DISTINCT step performed AFTER you manually deploy to preview (below). Do not tick it here:_');
    L.push('```');
    L.push('[ ] (post-deploy) I exercised the change on-device in preview and it behaves correctly');
    L.push('```');
  }
  L.push('');

  // Reserved for you — post-acceptance, human-only. Each item is tailored: a live
  // action becomes a checkbox; an item that does not apply to THIS change is marked
  // N/A with a one-line why, never listed as if it were live.
  L.push('## Reserved for you — post-acceptance, human-only (the loop never does these)');
  L.push('_Applicable actions are checkboxes; anything not applicable to this change is marked N/A with the reason — do not tick those._');
  L.push('');
  const reserved = [];
  const reservedNA = [];
  // PUSH is human-only but conditional — this branch may never go up, so it is an
  // optional action, not an acceptance gate.
  reserved.push('[ ] PUSH (optional) — if/when you decide this branch should go up, run `git push` yourself; it triggers CI/Vercel. Not required to accept this chunk.');
  // DEPLOY only applies if something actually ships to users.
  if (testOnly) {
    reservedNA.push('**DEPLOY to preview — N/A:** adds a test file only, nothing ships to users.');
  } else if (userFacing) {
    reserved.push('[ ] DEPLOY to preview — manual; after it deploys, perform the real-life test above.');
  } else {
    reserved.push('[ ] DEPLOY to preview — manual (ships with the next deploy; no user-facing behavior to exercise).');
  }
  if (p1History) reserved.push('[ ] P1 history present — type `APPROVE P1 HISTORY` to accept.');
  L.push('```');
  for (const r of reserved) L.push(r);
  L.push('```');
  for (const na of reservedNA) L.push('', na);
  L.push('');

  if (learningsRegisterPath) {
    L.push(renderProposedLearningsSection(loadLearnings(learningsRegisterPath)));
    L.push('');
  }

  const md = L.join('\n');
  if (runsDir) writeFileSync(path.join(runsDir, 'FINAL_REVIEW.md'), md);
  return md;
}
