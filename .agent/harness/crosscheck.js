// Test-evidence cross-check (masterplan §3.2, stress test 12; brief item 3).
//
// A `tests_run` entry claiming `pass` is only believed if its `output_path`
// points to a real, non-empty file that contains the claimed command. The
// executor contract is: every test command's full output is teed to a file
// under .agent/runs/<id>/, command line included. Evidence that fails any of
// these checks downgrades the claim to `not_run` — described-but-unevidenced
// tests did not run.
//
// The downgrade is one-directional and never errors: fake or missing
// evidence quietly weakens the report, it never crashes the loop. `done`
// becomes impossible downstream because the FSM requires every tests_run
// entry to be an evidenced `pass` before accepting a done verdict.

import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';

// runsRoot: directory output_path entries are resolved against (and confined
// to — evidence outside the runs directory is not evidence).
export function crossCheckTests(report, runsRoot) {
  const downgrades = [];
  const checked = report.tests_run.map((entry) => {
    if (entry.result !== 'pass') return { ...entry };

    const downgrade = (reason) => {
      downgrades.push({ command: entry.command, output_path: entry.output_path, reason });
      return { ...entry, result: 'not_run', downgraded_reason: reason };
    };

    if (!entry.output_path || entry.output_path.trim() === '') {
      return downgrade('pass claimed with empty output_path');
    }

    const resolved = path.resolve(runsRoot, entry.output_path);
    if (!resolved.startsWith(path.resolve(runsRoot) + path.sep)) {
      return downgrade(`output_path escapes the runs directory: ${entry.output_path}`);
    }
    if (!existsSync(resolved) || !statSync(resolved).isFile()) {
      return downgrade(`output file missing: ${entry.output_path}`);
    }

    let content;
    try {
      content = readFileSync(resolved, 'utf8');
    } catch (err) {
      return downgrade(`output file unreadable: ${err.message}`);
    }
    if (content.trim() === '') {
      return downgrade('output file is empty');
    }
    if (!content.includes(entry.command.trim())) {
      return downgrade(
        'output does not contain the claimed command — evidence does not match the claim'
      );
    }

    return { ...entry };
  });

  return {
    report: { ...report, tests_run: checked },
    downgrades,
    all_passes_evidenced: downgrades.length === 0,
  };
}
