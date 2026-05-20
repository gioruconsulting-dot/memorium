// TODO: Rename to lib/word-limits.js. File now also holds
// NOTE_MIN_WORDS for notes; original "upload-limits" name
// is no longer accurate. Defer until a natural sweep across
// all 4 importers (upload route, upload page, notes route,
// notes page).

export const MIN_WORDS = 500;
export const MAX_WORDS = 8000;
export const NOTE_MIN_WORDS = 100;

export function countWords(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}
