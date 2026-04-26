const ACRONYMS = new Set([
  'LLM', 'AI', 'API', 'CEO', 'CTO', 'CFO', 'COO', 'NASA', 'FBI', 'CIA',
  'USA', 'UK', 'EU', 'UN', 'GDP', 'GPT', 'ML', 'NLP', 'UX', 'UI',
  'HR', 'PR', 'IT', 'R&D', 'CSS', 'HTML', 'JS', 'TS', 'SQL', 'DB',
  'OS', 'PDF', 'URL', 'HTTP', 'HTTPS', 'JSON', 'XML', 'CSV', 'IDE',
  'MVP', 'KPI', 'ROI', 'B2B', 'B2C', 'SaaS', 'IPO', 'M&A',
]);

export function cleanFilename(filename) {
  // 1. Strip extension
  const stripped = filename.replace(/\.(txt|md|markdown)$/i, '');
  // 2. Replace - and _ with spaces, collapse runs, trim
  const spaced = stripped.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  // 3. Per-token casing
  const tokens = spaced.split(' ');
  return tokens
    .map((token, i) => {
      if (ACRONYMS.has(token.toUpperCase())) return token.toUpperCase();
      if (i === 0) return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
      return token.toLowerCase();
    })
    .join(' ');
}
