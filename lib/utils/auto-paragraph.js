const ABBREVS = [
  'Dr', 'Mr', 'Mrs', 'Ms', 'Inc', 'Ltd', 'Co', 'Corp', 'vs', 'etc', 'St', 'Jr',
  'Sr', 'Prof', 'e.g', 'i.e', 'U.S', 'U.K', 'Ph.D', 'M.D', 'B.A', 'M.A', 'No',
  'vol', 'Vol', 'pg', 'pp',
];
const ABBREV_PATTERN = new RegExp(
  '\\b(' + ABBREVS.join('|').replace(/\./g, '\\.') + ')\\.$'
);

function hasMarkdownStructure(content) {
  const lines = content.split('\n');
  return lines.some((line) => {
    const trimmed = line.trim();
    return (
      /^#{1,6}\s/.test(trimmed) ||
      /^[-*+]\s/.test(trimmed) ||
      /^\d+\.\s/.test(trimmed) ||
      /^>/.test(trimmed) ||
      /^```/.test(trimmed) ||
      /^(---+|\*\*\*+|===+)$/.test(trimmed) ||
      /^\|.*\|/.test(trimmed)
    );
  });
}

function cleanBadParagraphBreaks(content) {
  return content.replace(/\n[ \t]*\n+/g, (match, offset) => {
    let i = offset - 1;
    while (i >= 0 && /[ \t]/.test(content[i])) i--;
    if (i < 0) return match;

    let prev = content[i];
    if (/["')\]’”]/.test(prev)) {
      i--;
      if (i < 0) return ' ';
      prev = content[i];
    }

    if (/[.!?]/.test(prev)) return match;
    return ' ';
  });
}

function splitIntoSentences(text) {
  const sentences = [];
  let current = '';
  for (let i = 0; i < text.length; i++) {
    current += text[i];
    if (/[.!?]/.test(text[i])) {
      let j = i + 1;
      while (j < text.length && text[j] === ' ') j++;
      const next = text[j];
      if (next && /[A-Z]/.test(next)) {
        if (!ABBREV_PATTERN.test(current.trim())) {
          sentences.push(current.trim());
          current = '';
        }
      }
    }
  }
  if (current.trim()) sentences.push(current.trim());
  return sentences;
}

function subParagraphLongBlock(text, maxSentences = 5, groupSize = 4) {
  const sentences = splitIntoSentences(text);
  if (sentences.length <= maxSentences) return text;
  const paragraphs = [];
  for (let i = 0; i < sentences.length; i += groupSize) {
    paragraphs.push(sentences.slice(i, i + groupSize).join(' '));
  }
  return paragraphs.join('\n\n');
}

export function maybeAutoParagraph(content) {
  if (!content) return content;
  if (hasMarkdownStructure(content)) return content;

  const cleaned = cleanBadParagraphBreaks(content);
  const paragraphs = cleaned
    .split(/\n[ \t]*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const result = paragraphs.map((p) => subParagraphLongBlock(p));
  return result.join('\n\n');
}
