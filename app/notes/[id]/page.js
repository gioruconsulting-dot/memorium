'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import StarryBackground from '@/components/StarryBackground';
import { countWords, NOTE_MIN_WORDS } from '@/lib/upload-limits';
import { pickNotesError } from '@/lib/notes/ui-errors';

const MAX_TITLE_CHARS = 200;
const MAX_COMBINED_CHARS = 50000;
const SOFT_WARN_THRESHOLD = 45000;  // 90% of 50000
const HARD_WARN_THRESHOLD = 47500;  // 95% of 50000

const wrapperStyle = { position: 'relative', zIndex: 1, paddingTop: '24px', paddingBottom: '40px' };

function todayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const fieldStyle = {
  width:        '100%',
  padding:      '10px 14px',
  borderRadius: '10px',
  border:       '1px solid rgba(255,255,255,0.15)',
  background:   '#0f0f22',
  color:        '#e8e6e1',
  fontSize:     '0.9375rem',
  lineHeight:   1.5,
  fontFamily:   'inherit',
  outline:      'none',
  resize:       'vertical',
  display:      'block',
};

export default function NoteEditorPage() {
  const params = useParams();
  const id = params?.id;

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [draft, setDraft] = useState('');
  const [questionCount, setQuestionCount] = useState(0);

  // Baseline for dirty tracking. Mirrors the server's current persisted state.
  const [baseline, setBaseline] = useState(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);
  const [contentFocused, setContentFocused] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [generateFlash, setGenerateFlash] = useState('');
  const [generatingMessage, setGeneratingMessage] = useState('Generating…');

  const [prioritizing, setPrioritizing] = useState(false);
  const [prioritizeDone, setPrioritizeDone] = useState(false);
  const [prioritizeError, setPrioritizeError] = useState('');

  const titleInputRef = useRef(null);

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
        const errBody = await res.json().catch(() => ({}));
        setLoadError(pickNotesError('load', res.status, errBody?.error));
        return;
      }
      const data = await res.json();

      const t = data.title ?? '';
      const c = data.content ?? '';
      const d = data.note_draft_content ?? '';
      setTitle(t);
      setContent(c);
      setDraft(d);
      setQuestionCount(Number(data.question_count ?? 0));
      setBaseline({ title: t, content: c, note_draft_content: d });

      if (!silent && t === '') {
        // Wait for the input to mount before focusing.
        setTimeout(() => titleInputRef.current?.focus(), 0);
      }
    } catch {
      setLoadError(pickNotesError('load', 0));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadNote();
  }, [loadNote]);

  // Rotating status while generating. Interval ticks every 1s and updates
  // the message based on elapsed time. handleGenerate resets to 'Generating…'
  // before flipping generating=true so a previous "Almost there…" doesn't leak in.
  useEffect(() => {
    if (!generating) return;
    const startedAt = Date.now();
    const interval = setInterval(() => {
      const elapsedSec = (Date.now() - startedAt) / 1000;
      if (elapsedSec < 15) setGeneratingMessage('Generating…');
      else if (elapsedSec < 45) setGeneratingMessage('Reading your draft…');
      else setGeneratingMessage('Almost there…');
    }, 1000);
    return () => clearInterval(interval);
  }, [generating]);

  const dirty = !!baseline && (
    title !== baseline.title ||
    content !== baseline.content ||
    draft !== baseline.note_draft_content
  );

  async function handleSave() {
    if (!dirty || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch(`/api/notes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          content,
          note_draft_content: draft,
        }),
      });
      if (res.status === 404) {
        // Note was deleted in another tab. Swap to the not-found screen
        // (same UX as initial loadNote → 404) rather than showing "Not found"
        // as an inline saveError.
        setNotFound(true);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(pickNotesError('save', res.status, data?.error));
        return;
      }

      await loadNote({ silent: true });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    } catch {
      setSaveError(pickNotesError('save', 0));
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerate() {
    setGenerateError('');
    setGeneratingMessage('Generating…');
    setGenerating(true);
    try {
      const res = await fetch(`/api/notes/${id}/generate`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));

      if (res.status === 200) {
        setGenerateFlash(`${data.questionsAdded} questions added ✓`);
        setTimeout(() => setGenerateFlash(''), 3000);
        await loadNote({ silent: true });
      } else if (res.status === 401 || res.status === 403) {
        setGenerateError(pickNotesError('generate', res.status));
      } else if (res.status === 404) {
        setGenerateError(pickNotesError('generate', 404));
      } else if (res.status === 409) {
        setGenerateError('Your note changed while generating. Refreshing…');
        await loadNote({ silent: true });
        setGenerateError('');
      } else if (res.status === 422 && data?.error === 'draft_too_short') {
        setGenerateError(`Add more content — at least ${data.minWords} words needed.`);
      } else if (res.status === 422 && data?.error === 'no_distinct_material') {
        setGenerateError('Not enough new material to generate questions. Add more content.');
      } else if (res.status === 422 && data?.error === 'size_exceeded') {
        setGenerateError(`Note is too long to generate from. Cap is ${data.cap} characters.`);
      } else if (res.status === 429) {
        setGenerateError('Hourly limit reached. Try again in an hour.');
      } else if (res.status === 502) {
        setGenerateError('Generation failed. Please try again.');
      } else {
        setGenerateError(pickNotesError('generate', res.status));
      }
    } catch {
      setGenerateError(pickNotesError('generate', 0));
    } finally {
      setGenerating(false);
    }
  }

  async function handleReviewFirst() {
    if (prioritizing) return;
    setPrioritizeError('');
    setPrioritizing(true);
    try {
      const res = await fetch('/api/questions/prioritize', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ documentId: id, mode: 'queue-front' }),
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          setPrioritizeError('Please refresh and sign in.');
        } else {
          setPrioritizeError("Couldn't queue this note. Try again.");
        }
        return;
      }
      setPrioritizeDone(true);
    } catch {
      setPrioritizeError("Couldn't queue this note. Try again.");
    } finally {
      setPrioritizing(false);
    }
  }

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={wrapperStyle}>
        <StarryBackground />
        <p style={{ color: 'var(--color-muted)', fontSize: '0.875rem' }}>Loading…</p>
      </div>
    );
  }

  // ── Not found ──────────────────────────────────────────────────────────────

  if (notFound) {
    return (
      <div style={wrapperStyle}>
        <StarryBackground />
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ffffff', marginBottom: 12 }}>
          Note not found
        </h1>
        <Link
          href="/notes"
          style={{ color: '#60A5FA', fontSize: '0.9rem', textDecoration: 'none' }}
        >
          ← Back to Notes
        </Link>
      </div>
    );
  }

  // ── Load error ─────────────────────────────────────────────────────────────

  if (loadError) {
    return (
      <div style={wrapperStyle}>
        <StarryBackground />
        <p style={{ color: 'var(--color-forgot)', fontSize: '0.875rem', marginBottom: 12 }}>
          {loadError}
        </p>
        <Link
          href="/notes"
          style={{ color: '#60A5FA', fontSize: '0.9rem', textDecoration: 'none' }}
        >
          ← Back to Notes
        </Link>
      </div>
    );
  }

  // ── Editor ─────────────────────────────────────────────────────────────────

  const draftWords = countWords(draft);
  const combinedChars = content.length + draft.length;
  // Brand-new notes have empty saved content. The textarea and the
  // "Draft · YYYY-MM-DD" divider only make sense once at least one
  // generate cycle has sealed something into content.
  const hasSavedContent = content.trim() !== '';
  const showCapWarning = combinedChars >= SOFT_WARN_THRESHOLD;
  const isHardWarning = combinedChars >= HARD_WARN_THRESHOLD;

  const generateDisabled =
    !baseline || dirty || saving || generating || draftWords < NOTE_MIN_WORDS;

  const prioritizeDisabled =
    !baseline || dirty || saving || generating || prioritizing || questionCount === 0;

  // Single consolidated footer hint. At most one hint visible at any time, by
  // priority — the highest-priority blocked action wins, not every disabled
  // button. Mid-flight actions (saving/generating/prioritizing) suppress all
  // hints; the active button label conveys the state.
  //
  // 1. dirty + has words           → save first so the next generate is clean
  // 2. draft below NOTE_MIN_WORDS  → keep writing (count is in the hint, so the
  //                                  standalone word counter is suppressed too)
  // 3. generate enabled, no Q's    → nudge toward generate so review can act
  const footerHint = (() => {
    if (!baseline) return '';
    if (saving || generating || prioritizing) return '';
    if (dirty && draftWords > 0) return 'Save before generating.';
    if (draftWords < NOTE_MIN_WORDS) return `Draft needs ${NOTE_MIN_WORDS - draftWords} more words.`;
    if (questionCount === 0) return 'Generate questions first to prioritize them.';
    return '';
  })();

  return (
    <div style={wrapperStyle}>
      <StarryBackground />

      <Link
        href="/notes"
        style={{
          color:          '#8a8880',
          fontSize:       '0.8rem',
          textDecoration: 'none',
          marginBottom:   16,
          display:        'inline-block',
        }}
      >
        ← Notes
      </Link>

      {/* Title */}
      <input
        ref={titleInputRef}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={MAX_TITLE_CHARS}
        placeholder="Give this note a title…"
        style={{
          ...fieldStyle,
          fontSize:     '1.2rem',
          fontWeight:   600,
          marginBottom: 18,
        }}
      />

      {hasSavedContent && (
        <>
          {/* Focus-banner for saved-content edits */}
          {contentFocused && (
            <div
              style={{
                background:   'rgba(96,165,250,0.08)',
                border:       '1px solid rgba(96,165,250,0.25)',
                color:        '#cbd5e1',
                fontSize:     '0.78rem',
                padding:      '8px 12px',
                borderRadius: '8px',
                marginBottom: 8,
              }}
            >
              Editing previous content. Questions already generated from this section won&apos;t change.
            </div>
          )}

          {/* Saved content */}
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onFocus={() => setContentFocused(true)}
            onBlur={() => setContentFocused(false)}
            rows={10}
            placeholder=""
            style={{ ...fieldStyle, marginBottom: 18 }}
          />

          {/* Draft boundary marker — visual divider with today's date */}
          <div
            aria-hidden="true"
            style={{
              display:       'flex',
              alignItems:    'center',
              gap:           10,
              marginBottom:  10,
              color:         '#8a8880',
              fontSize:      '0.72rem',
              letterSpacing: '0.04em',
            }}
          >
            <span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.10)' }} />
            <span>Draft · {todayYMD()}</span>
          </div>
        </>
      )}

      {/* Draft */}
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={12}
        placeholder="Start typing your notes here..."
        style={{ ...fieldStyle, marginBottom: 12 }}
      />

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {draftWords >= NOTE_MIN_WORDS && (
            <span style={{ fontSize: '0.78rem', color: 'var(--color-muted)' }}>
              {draftWords} word{draftWords === 1 ? '' : 's'}
            </span>
          )}
          {showCapWarning && (
            <span style={{
              fontSize: '0.78rem',
              color:    isHardWarning ? 'var(--color-forgot)' : 'var(--color-hard)',
            }}>
              {combinedChars} / {MAX_COMBINED_CHARS} chars{isHardWarning ? ' · approaching cap' : ''}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {footerHint && (
            <span style={{
              fontSize:  '0.78rem',
              color:     'var(--color-muted)',
              maxWidth:  220,
              textAlign: 'right',
            }}>
              {footerHint}
            </span>
          )}
          {savedFlash && (
            <span style={{ fontSize: '0.78rem', color: 'var(--color-easy)' }}>Saved ✓</span>
          )}
          {saveError && (
            <span style={{ fontSize: '0.78rem', color: 'var(--color-forgot)' }}>{saveError}</span>
          )}
          {generateFlash && (
            <span style={{ fontSize: '0.78rem', color: 'var(--color-easy)' }}>{generateFlash}</span>
          )}
          {generateError && (
            <span style={{ fontSize: '0.78rem', color: 'var(--color-forgot)' }}>{generateError}</span>
          )}
          {prioritizeError && (
            <span style={{ fontSize: '0.78rem', color: 'var(--color-forgot)' }}>{prioritizeError}</span>
          )}
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            style={{
              padding:      '8px 18px',
              borderRadius: '8px',
              fontWeight:   600,
              fontSize:     '0.875rem',
              background:   dirty && !saving ? 'rgba(124,58,237,0.22)' : 'rgba(255,255,255,0.06)',
              border:       dirty && !saving ? '1px solid rgba(124,58,237,0.5)' : '1px solid rgba(255,255,255,0.10)',
              color:        dirty && !saving ? '#ffffff' : 'var(--color-muted)',
              cursor:       !dirty || saving ? 'not-allowed' : 'pointer',
              opacity:      saving ? 0.6 : 1,
              transition:   'opacity 0.15s ease',
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={handleReviewFirst}
            disabled={prioritizeDisabled}
            style={{
              padding:      '8px 14px',
              borderRadius: '8px',
              fontWeight:   600,
              fontSize:     '0.875rem',
              background:   'rgba(124,58,237,0.15)',
              border:       '1px solid rgba(124,58,237,0.3)',
              color:        prioritizeDone ? 'var(--color-easy)' : '#ffffff',
              cursor:       prioritizing ? 'progress' : prioritizeDisabled ? 'not-allowed' : 'pointer',
              opacity:      prioritizeDisabled && !prioritizing ? 0.5 : 1,
              transition:   'opacity 0.15s ease',
            }}
          >
            {prioritizing ? '…' : prioritizeDone ? 'Queued ✓' : 'Review this first'}
          </button>
          <button
            onClick={handleGenerate}
            disabled={generateDisabled}
            style={{
              padding:      '8px 18px',
              borderRadius: '8px',
              fontWeight:   600,
              fontSize:     '0.875rem',
              background:   generating || !generateDisabled ? 'rgba(124,58,237,0.22)' : 'rgba(255,255,255,0.06)',
              border:       generating || !generateDisabled ? '1px solid rgba(124,58,237,0.5)' : '1px solid rgba(255,255,255,0.10)',
              color:        generating || !generateDisabled ? '#ffffff' : 'var(--color-muted)',
              cursor:       generating ? 'progress' : generateDisabled ? 'not-allowed' : 'pointer',
            }}
          >
            {generating ? generatingMessage : 'Generate'}
          </button>
        </div>
      </div>
    </div>
  );
}
