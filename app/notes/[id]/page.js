'use client';

// v5 journal canvas — masterplan §2.6.
// - Title (autosaved, debounced) + save indicator
// - Sealed blocks render read-only, oldest first, with optional "Needs refresh" badge
// - Each sealed block has a visible Edit button (only entry to edit mode — block-body
//   tap does nothing; locked decision per §1)
// - At most one block in edit mode at a time; switching auto-Done-and-switches
// - Draft textarea is the visual hero; autosaves on a 3s debounce shared with title + editing block
// - Generate button is state-aware (label + disabled), sticks to bottom on mobile
// - 409 handling here is the Chunk 4 minimum (banner + reload); Chunk 5's
//   second half adds the sessionStorage-backed recovery panel.
// - Post-Generate animation + Study/Keep-writing CTAs are Chunk 6.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import StarryBackground from '@/components/StarryBackground';
import { countWords, NOTE_MIN_WORDS } from '@/lib/upload-limits';
import { pickNotesError } from '@/lib/notes/ui-errors';

const AUTOSAVE_DEBOUNCE_MS = 3000;
const LONG_DRAFT_THRESHOLD_WORDS = 1000;

// ── tokens ───────────────────────────────────────────────────────────────
// Match adjacent components (StreakCard / OnboardingCard): #0e0e18 card on
// the dark page background, #1e1e2a / rgba(255,255,255,0.08) for muted
// borders, violet accent reserved for the Generate button (one violet-glow
// per page).
const COLOR = {
  pageMuted:        '#8a8880',
  text:             '#e8e6e1',
  textDim:          'rgba(232, 230, 225, 0.7)',
  badgeFg:          'rgba(238, 255, 153, 0.85)', // muted amber — "needs refresh"
  badgeBorder:      'rgba(238, 255, 153, 0.30)',
  badgeBg:          'rgba(238, 255, 153, 0.10)',
  cardBg:           '#0e0e18',
  cardBorder:       '1px solid #1e1e2a',
  cardBorderEdit:   '1px solid rgba(124,58,237,0.55)',
  cardBgEdit:       '#13132a',
  draftBg:          '#10101e',
  fieldBorder:      '1px solid rgba(255,255,255,0.15)',
  divider:          'rgba(255,255,255,0.08)',
  saved:            'var(--color-easy)',
  err:              'var(--color-forgot)',
};

const wrapperStyle = {
  position:      'relative',
  zIndex:        1,
  paddingTop:    24,
  paddingBottom: 140, // headroom for sticky mobile footer
  maxWidth:      720,
  marginLeft:    'auto',
  marginRight:   'auto',
  paddingLeft:   16,
  paddingRight:  16,
};

const titleFieldStyle = {
  flex:         1,
  minWidth:     0,
  padding:      '8px 12px',
  borderRadius: 10,
  border:       COLOR.fieldBorder,
  background:   '#0f0f22',
  color:        '#ffffff',
  fontSize:     '1.15rem',
  fontWeight:   600,
  lineHeight:   1.3,
  fontFamily:   'inherit',
  outline:      'none',
};

const draftFieldStyle = {
  width:        '100%',
  padding:      '14px 16px',
  borderRadius: 12,
  border:       '1px solid rgba(255,255,255,0.18)',
  background:   COLOR.draftBg,
  color:        COLOR.text,
  fontSize:     '0.9375rem',
  lineHeight:   1.7,
  fontFamily:   'inherit',
  outline:      'none',
  resize:       'vertical',
  display:      'block',
};

// "May 18" — locale-aware short month + day.
function formatBlockDate(unixSec) {
  if (!unixSec) return '';
  const d = new Date(Number(unixSec) * 1000);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// "09:42" — 24h, local. Used in the "Saved · 09:42" indicator.
function formatClock(unixMs) {
  const d = new Date(unixMs);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export default function NoteEditorPage() {
  const params = useParams();
  const id = params?.id;

  // ── Load lifecycle ─────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState('');

  // ── Editor state ───────────────────────────────────────────────────────
  const [title, setTitle]             = useState('');
  const [draft, setDraft]             = useState('');
  const [noteVersion, setNoteVersion] = useState(0);
  const [blocks, setBlocks]           = useState([]);

  // Baseline = last known server-persisted (title, draft). Compared against
  // local state to compute `dirty`. Kept in a ref so it doesn't trigger
  // re-renders when we update it from save responses.
  const baselineRef = useRef({ title: '', draft: '' });

  // ── Edit-block state (Chunk 5) ─────────────────────────────────────────
  // At most ONE block in edit mode at a time. editingBlockId is the id of
  // the block being edited (or null). editingContent is the textarea value.
  // editingBaselineRef tracks the last server-confirmed content + version
  // for dirty-detection and 409 concurrency.
  const [editingBlockId, setEditingBlockId] = useState(null);
  const [editingContent, setEditingContent] = useState('');
  const editingBaselineRef = useRef({ id: null, content: '', version: 0 });

  // ── Save state ─────────────────────────────────────────────────────────
  const [saving, setSaving]         = useState(false);
  const [saveError, setSaveError]   = useState('');
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const debounceTimerRef = useRef(null);

  // ── Generate state ─────────────────────────────────────────────────────
  const [generating, setGenerating]     = useState(false);
  const [generateError, setGenerateError] = useState('');

  // ── Banners ────────────────────────────────────────────────────────────
  // Conflict banner is the Chunk 4 minimum for 409 handling, retained here
  // for the edit-block surface. The next commit replaces this with the
  // sessionStorage-backed recovery panel.
  const [conflictBanner, setConflictBanner] = useState('');

  const draftRef = useRef(null);
  const editingTextareaRef = useRef(null);

  // ─────────────────────────────────────────────────────────────────────────
  // Load
  // ─────────────────────────────────────────────────────────────────────────
  const loadNote = useCallback(async ({ silent = false } = {}) => {
    if (!id) return;
    if (!silent) setLoading(true);
    if (!silent) setLoadError('');
    try {
      const res = await fetch(`/api/notes/${id}`);
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setLoadError(pickNotesError('load', res.status, body?.error));
        return;
      }
      const data = await res.json();
      const nextTitle = data.title ?? '';
      const nextDraft = data.draft ?? '';
      setTitle(nextTitle);
      setDraft(nextDraft);
      setNoteVersion(Number(data.note_version ?? 0));
      setBlocks(Array.isArray(data.blocks) ? data.blocks : []);
      baselineRef.current = { title: nextTitle, draft: nextDraft };

      if (!silent) {
        // Auto-scroll to the draft once paint lands. "instant" avoids a long
        // visible scroll on an existing note with many blocks.
        setTimeout(() => {
          draftRef.current?.scrollIntoView({ behavior: 'instant', block: 'end' });
          draftRef.current?.focus();
        }, 0);
      }
    } catch {
      setLoadError(pickNotesError('load', 0));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadNote(); }, [loadNote]);

  // ─────────────────────────────────────────────────────────────────────────
  // Autosave — single 3s debounce timer for (title, draft, editing block) combined
  // ─────────────────────────────────────────────────────────────────────────

  const editingBlockDirty =
    editingBlockId != null
    && editingContent !== editingBaselineRef.current.content;

  const dirty =
    title !== baselineRef.current.title
    || draft !== baselineRef.current.draft
    || editingBlockDirty;

  // The actual PATCH. Always called via the debounce or via flushPending().
  // Reads CURRENT state at fire-time (via the parent closure), so a save
  // started while the user is still typing carries the latest content.
  const fireSaveRef = useRef(null);
  fireSaveRef.current = async function fireSave() {
    if (saving) return; // single in-flight — the post-save dirty check
                        // will schedule the next one.
    const baseline = baselineRef.current;
    const editBase = editingBaselineRef.current;

    const payload = {};
    const hasTitle = title !== baseline.title;
    const hasDraft = draft !== baseline.draft;
    const hasBlockEdit =
      editingBlockId != null
      && editBase.id === editingBlockId
      && editingContent !== editBase.content;

    if (hasTitle) payload.title = title;
    if (hasDraft) payload.draft  = draft;
    if (hasTitle || hasDraft) payload.note_version = noteVersion;
    if (hasBlockEdit) {
      payload.blocks = [{
        id:      editBase.id,
        content: editingContent,
        version: editBase.version,
      }];
    }
    if (!hasTitle && !hasDraft && !hasBlockEdit) return; // nothing to send

    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch(`/api/notes/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));

      if (res.status === 200 && body?.note) {
        baselineRef.current = {
          title: body.note.title ?? '',
          draft: body.note.draft ?? '',
        };
        setNoteVersion(Number(body.note.note_version ?? 0));
        const nextBlocks = Array.isArray(body.note.blocks) ? body.note.blocks : [];
        setBlocks(nextBlocks);

        // Re-sync the editing block's baseline from the server response so a
        // subsequent debounce save carries the fresh version. If the user
        // kept typing while in-flight, dirty re-fires from this new baseline.
        if (editingBlockId != null) {
          const refreshed = nextBlocks.find((b) => b.id === editingBlockId);
          if (refreshed) {
            editingBaselineRef.current = {
              id:      refreshed.id,
              content: refreshed.content,
              version: Number(refreshed.version),
            };
          }
        }

        setLastSavedAt(Date.now());
        return;
      }
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (res.status === 409) {
        // Chunk 4 minimum retained: replace state with server's current and
        // show a brief banner. The next commit replaces this with the
        // sessionStorage-backed recovery panel.
        setConflictBanner('This note changed elsewhere. Reloading…');
        if (body?.current) {
          const cur = body.current;
          setTitle(cur.title ?? '');
          setDraft(cur.draft ?? '');
          setNoteVersion(Number(cur.note_version ?? 0));
          setBlocks(Array.isArray(cur.blocks) ? cur.blocks : []);
          baselineRef.current = {
            title: cur.title ?? '',
            draft: cur.draft ?? '',
          };
        }
        // Exit edit mode — the editing block's version is no longer trusted.
        setEditingBlockId(null);
        setEditingContent('');
        editingBaselineRef.current = { id: null, content: '', version: 0 };
        setTimeout(() => setConflictBanner(''), 3000);
        return;
      }
      if (res.status === 422 && body?.error === 'size_exceeded') {
        const limit = body?.limit ?? 50000;
        setSaveError(`Note is too long. Combined content can't exceed ${limit} characters.`);
        return;
      }
      setSaveError(pickNotesError('save', res.status, body?.error));
    } catch {
      setSaveError(pickNotesError('save', 0));
    } finally {
      setSaving(false);
    }
  };

  // Schedule a save 3s after the last keystroke. Single timer; user typing
  // during in-flight save lands in the next save (post-save dirty check
  // re-arms the timer via this same effect).
  useEffect(() => {
    if (loading) return;
    if (!dirty) {
      // Nothing pending — cancel any timer.
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      return;
    }
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      fireSaveRef.current?.();
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [title, draft, editingContent, dirty, loading]);

  // Cleanup on unmount.
  useEffect(() => () => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
  }, []);

  // Flush-before-Generate / Done / switch-block: synchronously cancel any
  // pending debounce and fire an immediate save when dirty. Returns true on
  // clean state, false if a 409 happened (banner / recovery takes over).
  async function flushPending() {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (dirty && !saving) {
      await fireSaveRef.current?.();
    }
    const stillDirty =
      title !== baselineRef.current.title
      || draft !== baselineRef.current.draft
      || (editingBlockId != null
          && editingContent !== editingBaselineRef.current.content);
    return !stillDirty;
  }

  // Tappable retry on a failed save — clears error and re-fires.
  async function retrySave() {
    setSaveError('');
    await fireSaveRef.current?.();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Edit-block handlers (Chunk 5)
  // ─────────────────────────────────────────────────────────────────────────

  async function handleEditClick(block) {
    if (editingBlockId === block.id) return; // already editing this one

    if (editingBlockId != null) {
      // Auto-Done-and-switch: flush any pending edit on the currently-open
      // block before opening the new one. If flush 409s, the conflict
      // path takes over and we DON'T open the new block.
      const flushedClean = await flushPending();
      if (!flushedClean) return;
    }

    setEditingBlockId(block.id);
    setEditingContent(block.content ?? '');
    editingBaselineRef.current = {
      id:      block.id,
      content: block.content ?? '',
      version: Number(block.version ?? 0),
    };

    // scrollIntoView on focus keeps the editing textarea above the iOS keyboard
    // (masterplan §2.6). Defer one tick so the textarea has rendered.
    setTimeout(() => {
      editingTextareaRef.current?.focus();
      editingTextareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 0);
  }

  async function handleDoneClick() {
    const flushedClean = await flushPending();
    if (!flushedClean) return; // 409 already closed edit mode via fireSave
    setEditingBlockId(null);
    setEditingContent('');
    editingBaselineRef.current = { id: null, content: '', version: 0 };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Generate
  // ─────────────────────────────────────────────────────────────────────────
  async function handleGenerate() {
    if (generating) return;
    setGenerateError('');

    const flushedClean = await flushPending();
    if (!flushedClean) return; // surfaces via saveError / conflictBanner

    setGenerating(true);
    try {
      const res = await fetch(`/api/notes/${id}/generate`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));

      if (res.status === 200) {
        // Close any open edit mode — the block may have been regenerated and
        // its version is no longer trusted by editingBaselineRef.
        setEditingBlockId(null);
        setEditingContent('');
        editingBaselineRef.current = { id: null, content: '', version: 0 };
        await loadNote({ silent: true });
        return;
      }
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (res.status === 409) {
        setGenerateError('Note changed elsewhere — refreshed.');
        await loadNote({ silent: true });
        setTimeout(() => setGenerateError(''), 3000);
        return;
      }
      if (res.status === 422 && body?.error === 'nothing_to_do') {
        setGenerateError('Nothing to generate yet.');
        return;
      }
      if (res.status === 429) {
        setGenerateError('Rate limit reached. Try again later.');
        return;
      }
      if (res.status === 502) {
        setGenerateError('Generation failed. Please try again.');
        return;
      }
      setGenerateError(pickNotesError('generate', res.status, body?.error));
    } catch {
      setGenerateError(pickNotesError('generate', 0));
    } finally {
      setGenerating(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Derived UI
  // ─────────────────────────────────────────────────────────────────────────
  const draftWords    = countWords(draft);
  const staleBlocks   = blocks.filter((b) => b.is_stale === 1);
  const hasDraftToSeal = draftWords >= NOTE_MIN_WORDS;
  const hasStale      = staleBlocks.length > 0;

  // Save indicator — single text + tone, near the title.
  let saveIndicatorText = '';
  let saveIndicatorTone = COLOR.pageMuted;
  let saveIndicatorClickable = false;
  if (saveError) {
    saveIndicatorText = 'Save failed — retry';
    saveIndicatorTone = COLOR.err;
    saveIndicatorClickable = true;
  } else if (saving || (dirty && !loading)) {
    saveIndicatorText = 'Saving…';
  } else if (lastSavedAt) {
    saveIndicatorText = `Saved · ${formatClock(lastSavedAt)}`;
    saveIndicatorTone = COLOR.saved;
  }

  // Generate button — state-aware label + disabled.
  const flushBlocked = dirty || saving || saveError;
  let generateLabel;
  let generateDisabled;
  if (generating) {
    generateLabel    = 'Generating…';
    generateDisabled = true;
  } else if (flushBlocked) {
    generateLabel    = hasDraftToSeal || hasStale
      ? 'Generate'
      : 'Write a little more to generate questions';
    generateDisabled = true;
  } else if (hasDraftToSeal && !hasStale) {
    generateLabel    = `Generate · ${draftWords} new word${draftWords === 1 ? '' : 's'}`;
    generateDisabled = false;
  } else if (!hasDraftToSeal && hasStale) {
    const n = staleBlocks.length;
    generateLabel    = `Refresh ${n} block${n === 1 ? '' : 's'} · old questions will be replaced`;
    generateDisabled = false;
  } else if (hasDraftToSeal && hasStale) {
    // Mixed case — Chunk 6 turns this into progressive disclosure preview.
    generateLabel    = 'Generate';
    generateDisabled = false;
  } else {
    // Nothing to do.
    generateLabel    = 'Write a little more to generate questions';
    generateDisabled = true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Loading / not-found / load-error
  // ─────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={wrapperStyle}>
        <StarryBackground />
        <p style={{ color: 'var(--color-muted)', fontSize: '0.875rem' }}>Loading…</p>
      </div>
    );
  }
  if (notFound) {
    return (
      <div style={wrapperStyle}>
        <StarryBackground />
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ffffff', marginBottom: 12 }}>
          Note not found
        </h1>
        <Link href="/notes" style={{ color: '#60A5FA', fontSize: '0.9rem', textDecoration: 'none' }}>
          ← Back to Notes
        </Link>
      </div>
    );
  }
  if (loadError) {
    return (
      <div style={wrapperStyle}>
        <StarryBackground />
        <p style={{ color: COLOR.err, fontSize: '0.875rem', marginBottom: 12 }}>{loadError}</p>
        <Link href="/notes" style={{ color: '#60A5FA', fontSize: '0.9rem', textDecoration: 'none' }}>
          ← Back to Notes
        </Link>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Editor
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={wrapperStyle}>
      <StarryBackground />

      <style suppressHydrationWarning>{`
        @media (max-width: 640px) {
          .v5-generate-footer {
            position: fixed;
            bottom: env(safe-area-inset-bottom, 0px);
            left: 0;
            right: 0;
            padding: 12px 16px;
            background: rgba(14, 14, 24, 0.96);
            backdrop-filter: saturate(180%) blur(10px);
            border-top: 1px solid rgba(255,255,255,0.08);
            z-index: 10;
          }
        }
      `}</style>

      {/* Back link */}
      <Link
        href="/notes"
        style={{
          color:          COLOR.pageMuted,
          fontSize:       '0.8rem',
          textDecoration: 'none',
          marginBottom:   12,
          display:        'inline-block',
        }}
      >
        ← Notes
      </Link>

      {/* Title + save indicator */}
      <div
        style={{
          display:      'flex',
          alignItems:   'center',
          gap:          12,
          marginBottom: 18,
          flexWrap:     'wrap',
        }}
      >
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Give this note a title…"
          style={titleFieldStyle}
        />
        <button
          type="button"
          onClick={saveIndicatorClickable ? retrySave : undefined}
          disabled={!saveIndicatorClickable}
          style={{
            fontSize:    '0.78rem',
            color:       saveIndicatorTone,
            background:  'transparent',
            border:      'none',
            padding:     0,
            cursor:      saveIndicatorClickable ? 'pointer' : 'default',
            minHeight:   24,
            whiteSpace:  'nowrap',
          }}
          aria-live="polite"
        >
          {saveIndicatorText}
        </button>
      </div>

      {/* 409 banner (Chunk 4 minimum; the next commit replaces with a recovery panel) */}
      {conflictBanner && (
        <div
          style={{
            background:   'rgba(96,165,250,0.10)',
            border:       '1px solid rgba(96,165,250,0.30)',
            color:        '#cbd5e1',
            fontSize:     '0.82rem',
            padding:      '10px 14px',
            borderRadius: 10,
            marginBottom: 16,
          }}
        >
          {conflictBanner}
        </div>
      )}

      {/* History — sealed blocks (read-only by default; Edit opens textarea) */}
      {blocks.map((b) => {
        const isEditing = editingBlockId === b.id;
        return (
          <div key={b.id} style={{ marginBottom: 18 }}>
            <div
              style={{
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'space-between',
                gap:            12,
                marginBottom:   6,
                paddingLeft:    4,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.78rem', color: COLOR.pageMuted, letterSpacing: '0.02em' }}>
                  {formatBlockDate(b.sealed_at)}
                </span>
                {b.is_stale === 1 && (
                  <span
                    style={{
                      display:      'inline-flex',
                      alignItems:   'center',
                      gap:          6,
                      fontSize:     '0.72rem',
                      color:        COLOR.badgeFg,
                      background:   COLOR.badgeBg,
                      border:       `1px solid ${COLOR.badgeBorder}`,
                      borderRadius: 999,
                      padding:      '2px 10px',
                      whiteSpace:   'nowrap',
                    }}
                    title="This block was edited since its questions were generated. Generate again to refresh."
                  >
                    <span aria-hidden="true">●</span>
                    Needs refresh
                  </span>
                )}
              </div>
              {!isEditing && (
                <button
                  type="button"
                  onClick={() => handleEditClick(b)}
                  style={{
                    fontSize:     '0.75rem',
                    color:        COLOR.textDim,
                    background:   'transparent',
                    border:       '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 6,
                    padding:      '2px 10px',
                    cursor:       'pointer',
                    whiteSpace:   'nowrap',
                  }}
                  aria-label={`Edit block from ${formatBlockDate(b.sealed_at)}`}
                >
                  ✎ Edit
                </button>
              )}
            </div>
            {isEditing ? (
              <>
                <textarea
                  ref={editingTextareaRef}
                  value={editingContent}
                  onChange={(e) => setEditingContent(e.target.value)}
                  rows={Math.max(3, Math.min(14, (editingContent.match(/\n/g)?.length ?? 0) + 3))}
                  style={{
                    width:        '100%',
                    padding:      '14px 16px',
                    borderRadius: 12,
                    border:       COLOR.cardBorderEdit,
                    background:   COLOR.cardBgEdit,
                    color:        COLOR.text,
                    fontSize:     '0.9375rem',
                    lineHeight:   1.65,
                    fontFamily:   'inherit',
                    outline:      'none',
                    resize:       'vertical',
                    display:      'block',
                  }}
                />
                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={handleDoneClick}
                    style={{
                      fontSize:     '0.82rem',
                      fontWeight:   600,
                      color:        '#ffffff',
                      background:   'rgba(124,58,237,0.22)',
                      border:       '1px solid rgba(124,58,237,0.55)',
                      borderRadius: 8,
                      padding:      '6px 16px',
                      cursor:       'pointer',
                    }}
                  >
                    Done
                  </button>
                </div>
              </>
            ) : (
              <div
                style={{
                  background:   COLOR.cardBg,
                  border:       COLOR.cardBorder,
                  borderRadius: 12,
                  padding:      '14px 16px',
                  color:        COLOR.textDim,
                  fontSize:     '0.9375rem',
                  lineHeight:   1.65,
                  whiteSpace:   'pre-wrap',
                  wordBreak:    'break-word',
                }}
              >
                {b.content}
              </div>
            )}
          </div>
        );
      })}

      {/* Draft divider — only shown when there's history above */}
      {blocks.length > 0 && (
        <div
          aria-hidden="true"
          style={{
            display:       'flex',
            alignItems:    'center',
            gap:           10,
            margin:        '24px 0 10px',
            color:         COLOR.pageMuted,
            fontSize:      '0.72rem',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          <span style={{ flex: 1, height: 1, background: COLOR.divider }} />
          <span>Draft</span>
          <span style={{ flex: 1, height: 1, background: COLOR.divider }} />
        </div>
      )}

      {/* Draft — the capture layer */}
      <textarea
        ref={draftRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={12}
        placeholder="Jot the ideas you want to remember…"
        style={draftFieldStyle}
      />

      {/* Word count + soft guidance + errors */}
      <div
        style={{
          marginTop:      8,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          gap:            12,
          flexWrap:       'wrap',
          minHeight:      20,
        }}
      >
        <span style={{ fontSize: '0.78rem', color: COLOR.pageMuted }}>
          {draftWords} word{draftWords === 1 ? '' : 's'}
        </span>
        {draftWords > LONG_DRAFT_THRESHOLD_WORDS && (
          <span style={{ fontSize: '0.78rem', color: COLOR.pageMuted, fontStyle: 'italic' }}>
            Smaller batches often produce sharper questions.
          </span>
        )}
      </div>
      {generateError && (
        <p style={{ fontSize: '0.82rem', color: COLOR.err, marginTop: 10 }}>
          {generateError}
        </p>
      )}

      {/* Generate — sticky on mobile, inline on desktop */}
      <div
        className="v5-generate-footer"
        style={{
          marginTop:      24,
          display:        'flex',
          justifyContent: 'flex-end',
        }}
      >
        <button
          onClick={handleGenerate}
          disabled={generateDisabled}
          style={{
            padding:      '12px 22px',
            borderRadius: 10,
            fontWeight:   600,
            fontSize:     '0.9rem',
            background:   generateDisabled
              ? 'rgba(255,255,255,0.04)'
              : 'rgba(124,58,237,0.22)',
            border:       generateDisabled
              ? '1px solid rgba(255,255,255,0.10)'
              : '1px solid rgba(124,58,237,0.55)',
            color:        generateDisabled ? COLOR.pageMuted : '#ffffff',
            cursor:       generateDisabled ? 'not-allowed' : 'pointer',
            boxShadow:    generateDisabled
              ? 'none'
              : '0 0 16px rgba(124,58,237,0.30), 0 0 32px rgba(124,58,237,0.10)',
            transition:   'opacity 0.15s ease',
            minWidth:     160,
          }}
        >
          {generateLabel}
        </button>
      </div>
    </div>
  );
}
