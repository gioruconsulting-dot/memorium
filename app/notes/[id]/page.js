'use client';

// v5 journal canvas — masterplan §2.6.
// - Title (autosaved, debounced) + save indicator
// - Sealed blocks render read-only, oldest first, with optional "Needs refresh" badge
// - Each sealed block has a visible Edit button (only entry to edit mode — block-body
//   tap does nothing; locked decision per §1)
// - At most one block in edit mode at a time; switching auto-Done-and-switches
// - Draft textarea is the visual hero; autosaves on a 3s debounce shared with title + editing block
// - On 409, the unsent payload is captured to sessionStorage and shown in a
//   dismissible recovery panel above the draft (survives accidental reload)
// - Pre-Generate preview surfaces above the button for mixed / cap-exceeded cases
// - Post-Generate: toast at top with "Study these now" / "Keep writing" CTAs;
//   the newly-sealed block fades in via CSS animation
// - Generate button is state-aware (label + disabled), sticks to bottom on mobile

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import StarryBackground from '@/components/StarryBackground';
import { countWords, NOTE_MIN_WORDS } from '@/lib/upload-limits';
import { pickNotesError } from '@/lib/notes/ui-errors';

const AUTOSAVE_DEBOUNCE_MS = 1000;
const LONG_DRAFT_THRESHOLD_WORDS = 1000;
const STALE_BATCH_CAP = 5;
// Cumulative scroll distance (in one direction) needed to hide / re-show the
// post-Generate toast. 50px = hysteresis that ignores small reflows.
const POST_GEN_SCROLL_THRESHOLD_PX = 50;

const recoveryStorageKey = (noteId) => `notes-v5-recovery:${noteId}`;

// ── tokens ───────────────────────────────────────────────────────────────
// Match adjacent components (StreakCard / OnboardingCard): #0e0e18 card on
// the dark page background, #1e1e2a / rgba(255,255,255,0.08) for muted
// borders, violet accent reserved for the Generate button (one violet-glow
// per page).
const COLOR = {
  pageMuted:        '#8a8880',
  text:             '#e8e6e1',
  textDim:          'rgba(232, 230, 225, 0.7)',
  // "Needs refresh" badge — orange, shared with the notes list metadata via
  // the --color-needs-refresh CSS variable in globals.css.
  badgeFg:          'var(--color-needs-refresh)',
  badgeBorder:      'rgba(249, 115, 22, 0.45)',
  badgeBg:          'rgba(249, 115, 22, 0.12)',
  cardBg:           '#0e0e18',
  cardBorder:       '1px solid #1e1e2a',
  cardBorderEdit:   '1px solid rgba(124,58,237,0.55)',
  cardBgEdit:       '#13132a',
  draftBg:          '#10101e',
  fieldBorder:      '1px solid rgba(255,255,255,0.15)',
  divider:          'rgba(255,255,255,0.08)',
  // Active save state ("Saving…" + "Saved · 09:42") shares the amber accent
  // used by StreakCard and the Needs-refresh badge — keeps a single warm
  // signal across the app instead of mixing the green grade-pass tone in.
  saved:            '#EEFF99',
  err:              'var(--color-forgot)',
  recoveryBg:       'rgba(238, 200, 120, 0.08)',
  recoveryBorder:   'rgba(238, 200, 120, 0.35)',
  recoveryFg:       'rgba(244, 220, 170, 0.95)',
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
  // ~10 lines of writing room. Explicit minHeight backstops rows={10} in case
  // the browser computes a different initial size. No maxHeight — user can
  // still drag-resize taller via the corner handle.
  minHeight:    'calc(10 * 0.9375rem * 1.7 + 28px)',
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
  const router = useRouter();
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

  // ── Block show-more state (personal-use tweaks) ────────────────────────
  // Each sealed block renders compact (4-line clamp) by default. expandedBlocks
  // tracks which ids the user has explicitly expanded. overflowingBlocks holds
  // the result of the post-render measurement (scrollHeight > clientHeight) —
  // controls whether the "Show more" affordance appears.
  const [expandedBlocks, setExpandedBlocks] = useState({});
  const [overflowingBlocks, setOverflowingBlocks] = useState({});
  const blockContentRefs = useRef({});

  function toggleBlockExpanded(id) {
    setExpandedBlocks((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  // ── Save state ─────────────────────────────────────────────────────────
  const [saving, setSaving]         = useState(false);
  const [saveError, setSaveError]   = useState('');
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const debounceTimerRef = useRef(null);

  // ── Generate state ─────────────────────────────────────────────────────
  const [generating, setGenerating]     = useState(false);
  const [generateError, setGenerateError] = useState('');

  // ── Post-Generate (Chunk 6) ────────────────────────────────────────────
  // Shape: { newQuestions, refreshed, newBlockId, stillNeedsRefresh: [...] }
  // Drives the top-of-canvas toast with Study/Keep CTAs and the fade-in
  // animation on the new sealed block. Cleared on Keep-writing, on next
  // user edit (dirty flip), or on navigation away. Scroll-direction
  // hides/reveals the toast without unmounting it (toastScrollHidden).
  const [postGen, setPostGen] = useState(null);
  const [toastScrollHidden, setToastScrollHidden] = useState(false);
  const scrollAccumRef = useRef({ y: 0, cumulative: 0, direction: 0 });
  const scrollFrameRef = useRef(null);

  // ── Recovery panel (Chunk 5) ───────────────────────────────────────────
  // On 409 the unsent local payload is preserved in sessionStorage so the
  // user can still copy it out even after an accidental reload. Panel UI is
  // non-blocking — the user can keep editing the refreshed note.
  // Shape: { title?, draft?, block?: { id, content }, savedAt }
  const [recoveryPayload, setRecoveryPayload] = useState(null);

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

  // Restore any unsent recovery payload on page mount — survives accidental
  // reload mid-conflict (masterplan §2.4: "in-memory alone would lose it").
  useEffect(() => {
    if (!id || typeof window === 'undefined') return;
    try {
      const raw = window.sessionStorage.getItem(recoveryStorageKey(id));
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        setRecoveryPayload(parsed);
      }
    } catch {
      // Corrupt payload — drop it.
      try { window.sessionStorage.removeItem(recoveryStorageKey(id)); } catch {}
    }
  }, [id]);

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

    // Snapshot the local payload at fire time. On 409 we preserve THIS,
    // not the (now-refreshed) state.
    const unsentSnapshot = {
      title:  hasTitle ? title : undefined,
      draft:  hasDraft ? draft : undefined,
      block:  hasBlockEdit ? { id: editBase.id, content: editingContent } : undefined,
      savedAt: Date.now(),
    };

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
        // Masterplan §2.4: write unsent local payload to sessionStorage,
        // refetch full note state from response.current, render recovery panel.
        try {
          if (typeof window !== 'undefined') {
            window.sessionStorage.setItem(
              recoveryStorageKey(id),
              JSON.stringify(unsentSnapshot),
            );
          }
        } catch {
          // Quota / private-mode failure — fall back to in-memory only.
        }
        setRecoveryPayload(unsentSnapshot);

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
        // The unsent edit content is preserved in the recovery panel.
        setEditingBlockId(null);
        setEditingContent('');
        editingBaselineRef.current = { id: null, content: '', version: 0 };
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
    if (scrollFrameRef.current) cancelAnimationFrame(scrollFrameRef.current);
  }, []);

  // Measure each collapsed sealed block to decide if "Show more" should render.
  // Runs before paint so the button doesn't flicker in after the first paint.
  // Skips currently-expanded blocks (their max-height is unset, so scrollHeight
  // would equal clientHeight and falsely report no overflow); for those we
  // keep the prior measurement.
  useLayoutEffect(() => {
    setOverflowingBlocks((prev) => {
      const next = { ...prev };
      for (const b of blocks) {
        if (expandedBlocks[b.id]) continue;
        const el = blockContentRefs.current[b.id];
        if (!el) continue;
        next[b.id] = el.scrollHeight > el.clientHeight + 1;
      }
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (prevKeys.length === nextKeys.length
          && nextKeys.every((k) => prev[k] === next[k])) {
        return prev;
      }
      return next;
    });
  }, [blocks, expandedBlocks]);

  // Dismiss the post-Generate toast as soon as the user re-engages with the
  // editor (starts typing in draft, title, or an editing block). The toast is
  // about the just-completed action — a new dirty flip means the user has
  // moved on.
  useEffect(() => {
    if (!postGen) return;
    if (dirty) {
      setPostGen(null);
      setToastScrollHidden(false);
    }
  }, [postGen, dirty]);

  // Scroll-direction hides / re-shows the post-Generate toast. Uses
  // requestAnimationFrame as a built-in throttle (one read per frame, no
  // listener thrash) and accumulates distance in the current direction until
  // it exceeds POST_GEN_SCROLL_THRESHOLD_PX — that hysteresis stops mobile
  // momentum scrolls from flickering the toast on and off.
  useEffect(() => {
    if (!postGen) return;
    scrollAccumRef.current = { y: window.scrollY, cumulative: 0, direction: 0 };

    function onScroll() {
      if (scrollFrameRef.current) return;
      scrollFrameRef.current = requestAnimationFrame(() => {
        scrollFrameRef.current = null;
        const acc = scrollAccumRef.current;
        const newY = window.scrollY;
        const delta = newY - acc.y;
        if (delta === 0) return;
        const dir = delta > 0 ? 1 : -1;
        if (dir === acc.direction) {
          acc.cumulative += Math.abs(delta);
        } else {
          acc.direction = dir;
          acc.cumulative = Math.abs(delta);
        }
        acc.y = newY;
        if (dir === 1 && acc.cumulative > POST_GEN_SCROLL_THRESHOLD_PX) {
          setToastScrollHidden(true);
        } else if (dir === -1 && acc.cumulative > POST_GEN_SCROLL_THRESHOLD_PX) {
          setToastScrollHidden(false);
        }
      });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (scrollFrameRef.current) {
        cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
    };
  }, [postGen]);

  // Flush-before-Generate / Done / switch-block: synchronously cancel any
  // pending debounce and fire an immediate save when dirty. Returns true on
  // clean state, false if a 409 happened (recovery panel takes over).
  async function flushPending() {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (dirty && !saving) {
      await fireSaveRef.current?.();
    }
    // If still dirty after fire (e.g., save errored on size), bail.
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
      // block before opening the new one. If flush 409s, recovery panel
      // takes over and we DON'T open the new block (user needs to see the
      // refreshed state first).
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
  // Recovery panel handlers
  // ─────────────────────────────────────────────────────────────────────────

  function dismissRecovery() {
    if (id && typeof window !== 'undefined') {
      try { window.sessionStorage.removeItem(recoveryStorageKey(id)); } catch {}
    }
    setRecoveryPayload(null);
  }

  // Best-effort clipboard. Failure is non-fatal — the text is visible in the
  // panel, so the user can also copy manually.
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text ?? '');
    } catch {
      // ignore
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Generate
  // ─────────────────────────────────────────────────────────────────────────
  async function handleGenerate() {
    if (generating) return;
    setGenerateError('');
    // Any prior toast goes — a fresh Generate replaces it.
    clearPostGen();

    const flushedClean = await flushPending();
    if (!flushedClean) return; // surfaces via saveError / recovery panel

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
        const regenerated = Array.isArray(body?.regenerated_blocks) ? body.regenerated_blocks : [];
        const stillNeedsRefresh = Array.isArray(body?.still_needs_refresh) ? body.still_needs_refresh : [];
        const newBlockId = body?.new_block_id ?? null;
        const newQuestions = Number(body?.new_question_count ?? 0);
        await loadNote({ silent: true });
        // Set toast AFTER silent reload so the dirty effect doesn't see a
        // transient dirty=true and clear it immediately. Persistence is now
        // scroll-driven (see post-Generate scroll effect) — no auto-dismiss.
        setToastScrollHidden(false);
        setPostGen({
          newQuestions,
          refreshed: regenerated.length,
          newBlockId,
          stillNeedsRefresh,
        });
        return;
      }
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (res.status === 409) {
        // Reuse the recovery panel mechanism — same UX as a 409 from autosave.
        // No "unsent payload" to preserve here (Generate doesn't carry edits),
        // so we just refresh state and surface a focused error.
        setGenerateError('Note changed elsewhere — refreshed.');
        await loadNote({ silent: true });
        setTimeout(() => setGenerateError(''), 4000);
        return;
      }
      if (res.status === 422 && body?.error === 'nothing_to_do') {
        setGenerateError('Nothing to generate yet — write a bit more in your draft.');
        return;
      }
      if (res.status === 422 && body?.error === 'size_exceeded') {
        setGenerateError('Note is at the 50K character limit. Shorten something to continue.');
        return;
      }
      if (res.status === 429) {
        setGenerateError("You've generated a lot recently. Try again in a few minutes.");
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

  function clearPostGen() {
    setPostGen(null);
    setToastScrollHidden(false);
  }

  function studyTheseNow() {
    clearPostGen();
    router.push(`/study?from_note=${encodeURIComponent(id)}`);
  }

  function keepWriting() {
    clearPostGen();
    setTimeout(() => draftRef.current?.focus(), 0);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Derived UI
  // ─────────────────────────────────────────────────────────────────────────
  const draftWords    = countWords(draft);
  const staleBlocks   = blocks.filter((b) => b.is_stale === 1);
  const hasDraftToSeal = draftWords >= NOTE_MIN_WORDS;
  const hasStale      = staleBlocks.length > 0;
  const recoveryOpen  = !!recoveryPayload;

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
    saveIndicatorTone = COLOR.saved;
  } else if (lastSavedAt) {
    saveIndicatorText = `Saved · ${formatClock(lastSavedAt)}`;
    saveIndicatorTone = COLOR.saved;
  }

  // Generate button — state-aware label + disabled.
  // Recovery panel open also disables (masterplan §1 locked rule).
  const flushBlocked = dirty || saving || saveError || recoveryOpen;
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
        @keyframes v5-block-fade-in {
          0%   { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .v5-block-new {
          animation: v5-block-fade-in 320ms ease-out;
        }
        @keyframes v5-toast-in {
          0%   { opacity: 0; transform: translateY(-6px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .v5-post-gen-toast {
          animation: v5-toast-in 220ms ease-out;
          transition: opacity 200ms ease, transform 200ms ease;
        }
        .v5-post-gen-toast.v5-toast-hidden {
          opacity: 0;
          transform: translateY(-8px);
          pointer-events: none;
        }
        .v5-sticky-header {
          position: sticky;
          top: 10px; /* breathing room from the viewport edge when scrolled */
          z-index: 12;
          background: rgba(14, 14, 24, 0.94);
          backdrop-filter: saturate(180%) blur(10px);
          margin-left: -16px;
          margin-right: -16px;
          padding: 14px 16px 10px 16px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          margin-bottom: 18px;
        }
        .v5-block-content {
          background: #0e0e18;
          border: 1px solid #1e1e2a;
          border-radius: 12px;
          padding: 14px 16px;
          color: rgba(232, 230, 225, 0.7);
          font-size: 0.9375rem;
          line-height: 1.65;
          white-space: pre-wrap;
          word-break: break-word;
          position: relative;
        }
        .v5-block-content-collapsed {
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .v5-block-content-collapsed.v5-has-fade::after {
          content: '';
          position: absolute;
          left: 0; right: 0; bottom: 0;
          height: 2em;
          pointer-events: none;
          background: linear-gradient(to bottom, rgba(14, 14, 24, 0), rgba(14, 14, 24, 0.95));
        }
      `}</style>

      {/* Sticky header — back link + title + save indicator. Mobile + desktop.
          Same dark surface as the Generate footer so it reads as the top of
          the canvas, not a floating layer. */}
      <div className="v5-sticky-header">
        <Link
          href="/notes"
          style={{
            color:          COLOR.pageMuted,
            fontSize:       '0.8rem',
            textDecoration: 'none',
            marginBottom:   8,
            display:        'inline-block',
          }}
        >
          ← Notes
        </Link>

        <div
          style={{
            display:      'flex',
            alignItems:   'center',
            gap:          12,
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
              fontSize:    '1.17rem', // 50% bigger than the prior 0.78rem
              color:       saveIndicatorTone,
              background:  'transparent',
              border:      'none',
              padding:     0,
              cursor:      saveIndicatorClickable ? 'pointer' : 'default',
              minHeight:   28,
              whiteSpace:  'nowrap',
              lineHeight:  1.2,
            }}
            aria-live="polite"
          >
            {saveIndicatorText}
          </button>
        </div>
      </div>

      {/* Post-Generate toast — sits below the sticky header (Chunk 6) */}
      {postGen && (
        <PostGenToast
          postGen={postGen}
          onStudy={studyTheseNow}
          onKeepWriting={keepWriting}
          hidden={toastScrollHidden}
        />
      )}

      {/* History — sealed blocks (read-only by default; Edit opens textarea) */}
      {blocks.map((b) => {
        const isEditing = editingBlockId === b.id;
        const isNewlySealed = postGen?.newBlockId && b.id === postGen.newBlockId;
        return (
          <div
            key={b.id}
            className={isNewlySealed ? 'v5-block-new' : undefined}
            style={{ marginBottom: 18 }}
          >
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
              <>
                <div
                  ref={(el) => {
                    if (el) blockContentRefs.current[b.id] = el;
                    else delete blockContentRefs.current[b.id];
                  }}
                  className={`v5-block-content${
                    expandedBlocks[b.id] ? '' : ' v5-block-content-collapsed'
                  }${
                    !expandedBlocks[b.id] && overflowingBlocks[b.id] ? ' v5-has-fade' : ''
                  }`}
                >
                  {b.content}
                </div>
                {overflowingBlocks[b.id] && (
                  <button
                    type="button"
                    onClick={() => toggleBlockExpanded(b.id)}
                    style={{
                      marginTop:           6,
                      fontSize:            '0.78rem',
                      color:               COLOR.pageMuted,
                      background:          'transparent',
                      border:              'none',
                      padding:             '2px 0 0 4px',
                      cursor:              'pointer',
                      textDecoration:      'underline',
                      textDecorationStyle: 'dotted',
                      textUnderlineOffset: 2,
                    }}
                  >
                    {expandedBlocks[b.id] ? 'Show less' : 'Show more'}
                  </button>
                )}
              </>
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
            margin:        '16px 0 6px',
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

      {/* Recovery panel — sits above the draft, non-blocking, dismissible */}
      {recoveryOpen && (
        <RecoveryPanel
          payload={recoveryPayload}
          onDismiss={dismissRecovery}
          onCopy={copyText}
        />
      )}

      {/* Draft — the capture layer */}
      <textarea
        ref={draftRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={10}
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

      {/* Pre-Generate preview (Chunk 6) — only for mixed / cap-exceeded cases.
          Simple-case + stale-only previews still live on the button label. */}
      {(() => {
        const willCapExceed = staleBlocks.length > STALE_BATCH_CAP;
        const isMixed = hasDraftToSeal && hasStale;
        if (!willCapExceed && !isMixed) return null;
        return (
          <GeneratePreview
            words={draftWords}
            staleCount={staleBlocks.length}
            hasDraftToSeal={hasDraftToSeal}
            capExceeded={willCapExceed}
            cap={STALE_BATCH_CAP}
          />
        );
      })()}

      {/* Still-needs-refresh callout — fires when last Generate left some blocks
          unrefreshed (NoDistinctMaterialError on the AI side). Sits between any
          preview and the Generate button so the user sees the explanation. */}
      {postGen && postGen.stillNeedsRefresh?.length > 0 && (
        <p style={{
          marginTop:   12,
          fontSize:    '0.82rem',
          color:       COLOR.badgeFg,
          lineHeight:  1.5,
        }}>
          {postGen.stillNeedsRefresh.length === 1
            ? '1 block still needs refresh because it didn\'t contain enough distinct material. Add more detail or remove it.'
            : `${postGen.stillNeedsRefresh.length} blocks still need refresh because they didn't contain enough distinct material. Add more detail or remove them.`}
        </p>
      )}

      {/* Generate — sticky on mobile, inline on desktop */}
      <div
        className="v5-generate-footer"
        style={{
          marginTop:      14,
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

// ─── Post-Generate toast (Chunk 6) ───────────────────────────────────────
// Sits at the top of the editor canvas after a successful Generate. Shows
// counts ("N new questions · M refreshed") and the two locked CTAs: Study
// these now / Keep writing (masterplan §1).
function PostGenToast({ postGen, onStudy, onKeepWriting, hidden = false }) {
  const { newQuestions, refreshed } = postGen;
  const parts = [];
  if (newQuestions > 0) parts.push(`${newQuestions} new question${newQuestions === 1 ? '' : 's'}`);
  if (refreshed > 0)    parts.push(`${refreshed} refreshed`);
  const summary = parts.length > 0 ? parts.join(' · ') : 'Generate complete';
  return (
    <div
      className={`v5-post-gen-toast${hidden ? ' v5-toast-hidden' : ''}`}
      role="status"
      aria-live="polite"
      aria-hidden={hidden ? 'true' : undefined}
      style={{
        position:     'sticky',
        top:          8,
        zIndex:       5,
        background:   'rgba(74, 222, 128, 0.10)',
        border:       '1px solid rgba(74, 222, 128, 0.35)',
        color:        '#e8e6e1',
        borderRadius: 12,
        padding:      '12px 14px',
        marginBottom: 18,
        boxShadow:    '0 4px 18px rgba(0,0,0,0.30)',
        display:      'flex',
        flexWrap:     'wrap',
        alignItems:   'center',
        justifyContent: 'space-between',
        gap:          12,
      }}
    >
      <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 500 }}>
        <span style={{ color: 'rgba(74, 222, 128, 0.95)', marginRight: 6 }}>✓</span>
        {summary}
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={onStudy}
          style={{
            fontSize:     '0.82rem',
            fontWeight:   600,
            color:        '#ffffff',
            background:   'rgba(124,58,237,0.22)',
            border:       '1px solid rgba(124,58,237,0.55)',
            borderRadius: 8,
            padding:      '6px 14px',
            cursor:       'pointer',
          }}
        >
          Study these now
        </button>
        <button
          type="button"
          onClick={onKeepWriting}
          style={{
            fontSize:     '0.82rem',
            fontWeight:   500,
            color:        '#e8e6e1',
            background:   'transparent',
            border:       '1px solid rgba(255,255,255,0.18)',
            borderRadius: 8,
            padding:      '6px 14px',
            cursor:       'pointer',
          }}
        >
          Keep writing
        </button>
      </div>
    </div>
  );
}

// ─── Pre-Generate preview (Chunk 6) ──────────────────────────────────────
// Progressive-disclosure surface above the Generate button for mixed and
// cap-exceeded cases. Simple-case (only draft) and stale-only cases keep
// using the button label exclusively (masterplan §1 "Generate preview").
function GeneratePreview({ words, staleCount, hasDraftToSeal, capExceeded, cap }) {
  const bullets = [];
  if (hasDraftToSeal && words > 0) {
    bullets.push(`${words} new word${words === 1 ? '' : 's'} → new questions`);
  }
  if (staleCount > 0) {
    if (capExceeded) {
      bullets.push(`Refresh ${cap} of ${staleCount} blocks now. Generate again after for the rest.`);
    } else {
      bullets.push(`${staleCount} block${staleCount === 1 ? '' : 's'} need${staleCount === 1 ? 's' : ''} refresh → questions replaced`);
    }
  }
  return (
    <div
      style={{
        marginTop:    14,
        background:   'rgba(255,255,255,0.03)',
        border:       '1px solid rgba(255,255,255,0.08)',
        borderRadius: 10,
        padding:      '10px 14px',
        color:        'rgba(232, 230, 225, 0.85)',
        fontSize:     '0.82rem',
        lineHeight:   1.55,
      }}
    >
      <p style={{ margin: 0, marginBottom: 6, fontWeight: 600, color: '#e8e6e1' }}>
        Ready to generate
      </p>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {bullets.map((b, i) => (<li key={i}>{b}</li>))}
      </ul>
    </div>
  );
}

// ─── Recovery panel ──────────────────────────────────────────────────────
// Anchors above the draft. Shows whatever fields the user had unsent
// (title / draft / single block edit). Each field is a read-only display
// with a Copy button. Dismiss clears sessionStorage + hides the panel.
// Non-blocking: the refreshed note below is fully editable while open.
function RecoveryPanel({ payload, onDismiss, onCopy }) {
  if (!payload) return null;
  const sections = [];
  if (typeof payload.title === 'string') {
    sections.push({ label: 'Title',  value: payload.title });
  }
  if (typeof payload.draft === 'string') {
    sections.push({ label: 'Draft',  value: payload.draft });
  }
  if (payload.block && typeof payload.block.content === 'string') {
    sections.push({ label: 'Block edit', value: payload.block.content });
  }

  return (
    <div
      role="region"
      aria-label="Unsaved changes from before the note refreshed"
      style={{
        background:   'rgba(238, 200, 120, 0.06)',
        border:       '1px solid rgba(238, 200, 120, 0.35)',
        color:        'rgba(244, 220, 170, 0.95)',
        borderRadius: 12,
        padding:      '14px 16px',
        marginBottom: 16,
      }}
    >
      <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.5 }}>
        This note changed elsewhere. We refreshed it and kept your unsaved
        edit below — copy what you need, then dismiss.
      </p>
      {sections.length === 0 ? (
        <p style={{ margin: '10px 0 0', fontSize: '0.78rem', opacity: 0.8 }}>
          (No unsent content found.)
        </p>
      ) : (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sections.map((s) => (
            <div key={s.label}>
              <div
                style={{
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'space-between',
                  gap:            10,
                  marginBottom:   4,
                }}
              >
                <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.85 }}>
                  {s.label}
                </span>
                <button
                  type="button"
                  onClick={() => onCopy(s.value)}
                  style={{
                    fontSize:     '0.72rem',
                    color:        'rgba(244, 220, 170, 0.95)',
                    background:   'transparent',
                    border:       '1px solid rgba(238, 200, 120, 0.4)',
                    borderRadius: 6,
                    padding:      '2px 10px',
                    cursor:       'pointer',
                  }}
                >
                  Copy
                </button>
              </div>
              <div
                style={{
                  background:   'rgba(0,0,0,0.25)',
                  border:       '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 8,
                  padding:      '10px 12px',
                  fontSize:     '0.85rem',
                  color:        '#e8e6e1',
                  lineHeight:   1.55,
                  whiteSpace:   'pre-wrap',
                  wordBreak:    'break-word',
                  maxHeight:    220,
                  overflow:     'auto',
                }}
              >
                {s.value || <span style={{ opacity: 0.6 }}>(empty)</span>}
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onDismiss}
          style={{
            fontSize:     '0.78rem',
            fontWeight:   500,
            color:        '#e8e6e1',
            background:   'transparent',
            border:       '1px solid rgba(255,255,255,0.18)',
            borderRadius: 8,
            padding:      '6px 14px',
            cursor:       'pointer',
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
