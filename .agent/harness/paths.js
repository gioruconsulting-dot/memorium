// Path-tier classification (masterplan §2.4).
//
// Deterministic glob matching, no dependencies. Supported syntax is exactly
// what TASK_SPEC tiers use: `*` matches within one path segment, `**` matches
// across segments, everything else is literal. Anything fancier should be a
// flagged harness change, not a silent extension.

const GLOB_CACHE = new Map();

export function globToRegExp(glob) {
  if (GLOB_CACHE.has(glob)) return GLOB_CACHE.get(glob);
  let out = '';
  let i = 0;
  while (i < glob.length) {
    const ch = glob[i];
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        out += '.*';
        i += 2;
        if (glob[i] === '/') i += 1; // 'dir/**' also matches 'dir/x' cleanly
      } else {
        out += '[^/]*';
        i += 1;
      }
    } else if ('\\^$.|?+()[]{}'.includes(ch)) {
      out += '\\' + ch;
      i += 1;
    } else {
      out += ch;
      i += 1;
    }
  }
  const re = new RegExp(`^${out}$`);
  GLOB_CACHE.set(glob, re);
  return re;
}

export function matchesAny(filePath, globs) {
  return globs.some((g) => globToRegExp(g).test(filePath));
}

// Classify one file against the spec's tiers. Most-restrictive tier wins:
// a file matching both green and black is black. Files matching no tier are
// 'untiered' — the safe default treats them as out of bounds (unknown = P1).
export function classifyPath(filePath, spec) {
  if (matchesAny(filePath, spec.black_paths)) return 'black';
  if (matchesAny(filePath, spec.red_paths)) return 'red';
  if (matchesAny(filePath, spec.yellow_paths)) return 'yellow';
  if (matchesAny(filePath, spec.green_paths)) return 'green';
  return 'untiered';
}
