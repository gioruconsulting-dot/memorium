export const MIN_WORDS = 500;
export const MAX_WORDS = 8000;

export function countWords(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}
