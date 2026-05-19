'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import StarryBackground from '@/components/StarryBackground';
import { countWords } from '@/lib/upload-limits';

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

  // Baseline for dirty tracking. Mirrors the server's current persisted state.
  const [baseline, setBaseline] = useState(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);
  const [contentFocused, setContentFocused] = useState(false);

  const titleInputRef = useRef(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/notes/${id}`);
        if (cancelled) return;
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Failed to load note');

        const t = data.title ?? '';
        const c = data.content ?? '';
        const d = data.note_draft_content ?? '';
        setTitle(t);
        setContent(c);
        setDraft(d);
        setBaseline({ title: t, content: c, note_draft_content: d });

        if (t === '') {
          // Wait for the input to mount before focusing.
          setTimeout(() => titleInputRef.current?.focus(), 0);
        }
      } catch (err) {
        if (!cancelled) setLoadError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Save failed');

      // Server strips divider markers on its side; our local state may now diverge from
      // what was actually persisted. For Chunk 3 this is acceptable — the cost is one
      // extra save click after typing a literal divider. Chunk 5 polish can refetch
      // here or mirror the strip client-side.
      setBaseline({ title, content, note_draft_content: draft });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
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
        placeholder="Give this note a title…"
        style={{
          ...fieldStyle,
          fontSize:     '1.2rem',
          fontWeight:   600,
          marginBottom: 18,
        }}
      />

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
        <span style={{ fontSize: '0.78rem', color: 'var(--color-muted)' }}>
          {draftWords} word{draftWords === 1 ? '' : 's'}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {savedFlash && (
            <span style={{ fontSize: '0.78rem', color: 'var(--color-easy)' }}>Saved ✓</span>
          )}
          {saveError && (
            <span style={{ fontSize: '0.78rem', color: 'var(--color-forgot)' }}>{saveError}</span>
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
        </div>
      </div>
    </div>
  );
}
