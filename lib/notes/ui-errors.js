// User-facing error copy for notes UI handlers. Keep messages here so the
// list/editor/delete/generate flows stay consistent and any future copy
// change happens in one place.

const AUTH = 'Please refresh and sign in.';
const RETRY = 'Please try again.';

export const NOTES_UI_ERRORS = {
  list: {
    auth:    `Couldn't load notes. ${AUTH}`,
    server:  `Couldn't load notes. ${RETRY}`,
    default: "Couldn't load notes.",
  },
  load: {
    auth:    `Couldn't load this note. ${AUTH}`,
    server:  `Couldn't load this note. ${RETRY}`,
    default: "Couldn't load this note.",
  },
  save: {
    auth:       `Couldn't save. ${AUTH}`,
    c413:       "Note is too long to save. Combined content can't exceed 50,000 characters.",
    c422_title: "Title can't exceed 200 characters.",
    server:     `Couldn't save. ${RETRY}`,
    default:    "Couldn't save.",
  },
  delete: {
    auth:    `Couldn't delete this note. ${AUTH}`,
    server:  `Couldn't delete this note. ${RETRY}`,
    default: "Couldn't delete this note.",
  },
  generate: {
    auth:    `Couldn't generate questions. ${AUTH}`,
    c404:    'This note was deleted. Please refresh.',
    server:  `Couldn't generate questions. ${RETRY}`,
    default: "Couldn't generate questions.",
  },
};

// Map a response (status + optional body.error code) to the user-visible string.
// action: 'list' | 'load' | 'save' | 'delete' | 'generate'
export function pickNotesError(action, status, code) {
  const m = NOTES_UI_ERRORS[action] || {};
  if (status === 401 || status === 403) return m.auth || m.default;
  if (action === 'save' && status === 413) return m.c413 || m.default;
  if (action === 'save' && status === 422 && code === 'title_too_long') return m.c422_title || m.default;
  if (action === 'generate' && status === 404) return m.c404 || m.default;
  if (status >= 500) return m.server || m.default;
  return m.default;
}
