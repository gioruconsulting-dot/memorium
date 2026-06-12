// Layer 1 diff scanner (masterplan §2.6, brief item 8).
//
// Ripgrep is the match engine; the pattern set lives in
// .agent/rules/layer1-patterns.json as data, not code. The scanner reads a
// unified diff, attributes every added line to its file, and reports hits
// with severity and required route.
//
// Doctrine: "no hits" means "no known pattern hit," never "safe." The report
// says so explicitly, and `semantic_review_required` stays true for any diff
// that touches risk-adjacent paths even with zero hits.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RULES_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'rules',
  'layer1-patterns.json'
);

export function loadRules(rulesPath = RULES_PATH) {
  return JSON.parse(readFileSync(rulesPath, 'utf8'));
}

// Parse a unified diff into:
//   files: [paths touched]
//   lineFile: Map(diff line number → file path)   (1-based, only +added lines)
export function parseDiff(diffText) {
  const files = [];
  const lineFile = new Map();
  const lines = diffText.split('\n');
  let currentFile = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('+++ ')) {
      const raw = line.slice(4).trim();
      currentFile = raw === '/dev/null' ? null : raw.replace(/^b\//, '');
      if (currentFile && !files.includes(currentFile)) files.push(currentFile);
      continue;
    }
    if (line.startsWith('+') && !line.startsWith('+++') && currentFile) {
      lineFile.set(i + 1, currentFile);
    }
  }
  return { files, lineFile };
}

// Run ripgrep with one pattern over the diff file; return matching diff line
// numbers that are added lines (per lineFile).
function rgMatches(pattern, diffPath, lineFile) {
  let stdout;
  try {
    stdout = execFileSync('rg', ['--json', '--no-config', '-e', pattern, diffPath], {
      encoding: 'utf8',
    });
  } catch (err) {
    // rg exits 1 on "no matches" — that is a clean empty result.
    if (err.status === 1) return { matches: [], errored: false };
    return { matches: [], errored: true, error: String(err.message || err) };
  }
  const matches = [];
  for (const raw of stdout.split('\n')) {
    if (!raw) continue;
    let event;
    try {
      event = JSON.parse(raw);
    } catch {
      continue;
    }
    if (event.type !== 'match') continue;
    const lineNumber = event.data.line_number;
    if (!lineFile.has(lineNumber)) continue; // not an added line of a tracked file
    matches.push({
      lineNumber,
      file: lineFile.get(lineNumber),
      excerpt: event.data.lines.text.trim().slice(0, 200),
    });
  }
  return { matches, errored: false };
}

// scan(diffPath) → scanner report
export function scan(diffPath, rulesPath = RULES_PATH) {
  const rules = loadRules(rulesPath);
  const diffText = readFileSync(diffPath, 'utf8');
  const { files, lineFile } = parseDiff(diffText);

  const hits = [];
  let anyRuleErrored = false;

  // Content rules: whole diff, added lines only.
  for (const rule of rules.content_rules) {
    const { matches, errored, error } = rgMatches(rule.pattern, diffPath, lineFile);
    if (errored) {
      anyRuleErrored = true;
      hits.push({
        rule_id: `${rule.id}__RULE_ERROR`,
        severity: 'P1A',
        required_route: 'live_human',
        file: '(scanner)',
        line: null,
        excerpt: `rule failed to run: ${error}`,
      });
      continue;
    }
    for (const m of matches) {
      hits.push({
        rule_id: rule.id,
        severity: rule.severity,
        required_route: rule.required_route,
        file: m.file,
        line: m.lineNumber,
        excerpt: m.excerpt,
      });
    }
  }

  // Scoped content rules: added lines, but only in files matching file_pattern.
  for (const rule of rules.scoped_content_rules) {
    const fileRe = new RegExp(rule.file_pattern, 'i');
    const { matches, errored, error } = rgMatches(rule.pattern, diffPath, lineFile);
    if (errored) {
      anyRuleErrored = true;
      hits.push({
        rule_id: `${rule.id}__RULE_ERROR`,
        severity: 'P1A',
        required_route: 'live_human',
        file: '(scanner)',
        line: null,
        excerpt: `rule failed to run: ${error}`,
      });
      continue;
    }
    for (const m of matches) {
      if (!fileRe.test(m.file)) continue;
      hits.push({
        rule_id: rule.id,
        severity: rule.severity,
        required_route: rule.required_route,
        file: m.file,
        line: m.lineNumber,
        excerpt: m.excerpt,
      });
    }
  }

  // Path rules: files touched by the diff. File patterns are matched
  // case-insensitively here in JS (ripgrep-style inline (?i) is not valid
  // JS regex syntax — content rules keep (?i) because rg evaluates those).
  for (const rule of rules.path_rules) {
    const fileRe = new RegExp(rule.file_pattern, 'i');
    for (const file of files) {
      if (fileRe.test(file)) {
        hits.push({
          rule_id: rule.id,
          severity: rule.severity,
          required_route: rule.required_route,
          file,
          line: null,
          excerpt: `file matches ${rule.id}`,
        });
      }
    }
  }

  const riskAdjacentRe = new RegExp(rules.risk_adjacent_paths, 'i');
  const riskAdjacentTouched = files.some((f) => riskAdjacentRe.test(f));

  let scanner_confidence = 'high';
  if (anyRuleErrored) scanner_confidence = 'low';
  else if (files.length === 0) scanner_confidence = 'low'; // nothing parseable
  else if (riskAdjacentTouched) scanner_confidence = 'medium';

  return {
    scanner: 'layer1',
    diff_path: diffPath,
    files_seen: files,
    hits,
    scanner_confidence,
    semantic_review_required: hits.length > 0 || riskAdjacentTouched || files.length === 0,
    doctrine: 'no hits means no known pattern hit, never safe',
  };
}

// Highest severity across hits, in masterplan §5.1 order. Null when no hits.
const SEVERITY_ORDER = ['P0', 'P1A', 'P1B', 'P1C', 'P2', 'P3'];
export function highestSeverity(report) {
  let best = null;
  for (const hit of report.hits) {
    if (best === null || SEVERITY_ORDER.indexOf(hit.severity) < SEVERITY_ORDER.indexOf(best)) {
      best = hit.severity;
    }
  }
  return best;
}
