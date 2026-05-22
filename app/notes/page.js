'use client';

// Notes list — v5 Chunk 6 redesign.
// - Sort by COALESCE(updated_at, created_at) DESC (server-side).
// - Each card surfaces: title, relative time, "Draft in progress" (no word
//   count — masterplan changelog item 32), N blocks needing refresh, N due
//   questions. Only the chips with a non-zero / true value render.
// - Delete moved to a per-card overflow menu so the destructive action
//   doesn't compete with the habit-forming card-click → open-note action.
// - Empty state copy teaches the loop (§1 / Chunk 6 "Empty states").

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import StarryBackground from '@/components/StarryBackground';
import { pickNotesError } from '@/lib/notes/ui-errors';

const wrapperStyle = { position: 'relative', zIndex: 1, paddingTop: '24px', paddingBottom: '40px' };

// Maps the ?error= code that /notes/new appends when create fails. Codes are
// produced in app/notes/new/page.js; keep these tables in sync.
const CREATE_ERROR_MESSAGES = {
  auth:    "Couldn't create a new note. Please refresh and sign in.",
  server:  "Couldn't create a new note. Please try again.",
  network: "Couldn't create a new note. Check your connection and try again.",
  unknown: "Couldn't create a new note.",
};

const heading = (
  <h1 style={{
    fontSize:     '1.84rem',
    fontWeight:   700,
    color:        '#ffffff',
    lineHeight:   1.1,
    marginBottom: '20px',
    paddingLeft:  '20px',
  }}>
    Notes
  </h1>
);

function NewNoteButton() {
  return (
    <Link
      href="/notes/new"
      style={{
        display:        'inline-block',
        padding:        '10px 18px',
        borderRadius:   '10px',
        background:     'rgba(124,58,237,0.18)',
        border:         '1px solid rgba(124,58,237,0.45)',
        color:          '#ffffff',
        fontSize:       '0.9rem',
        fontWeight:     500,
        textDecoration: 'none',
      }}
    >
      + New note
    </Link>
  );
}

// "updated 12 min ago" / "updated yesterday" / "updated Mar 14"
function formatRelative(unixSec) {
  if (!unixSec) return '';
  const now = Math.floor(Date.now() / 1000);
  const diff = Math.max(0, now - Number(unixSec));
  if (diff < 60) return 'just now';
  if (diff < 3600) {
    const m = Math.floor(diff / 60);
    return `${m} min ago`;
  }
  if (diff < 86400) {
    const h = Math.floor(diff / 3600);
    return `${h} hr ago`;
  }
  if (diff < 86400 * 2) return 'yesterday';
  if (diff < 86400 * 7) {
    const d = Math.floor(diff / 86400);
    return `${d} days ago`;
  }
  return new Date(Number(unixSec) * 1000).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric',
  });
}

function OverflowMenu({ noteId, onDelete, busy }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDoc(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: 'relative', flexShrink: 0 }} onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
      <button
        type="button"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
        style={{
          width:        28,
          height:       28,
          borderRadius: 6,
          background:   open ? 'rgba(255,255,255,0.08)' : 'transparent',
          border:       'none',
          color:        '#8a8880',
          cursor:       'pointer',
          fontSize:     '1.05rem',
          lineHeight:   1,
          display:      'flex',
          alignItems:   'center',
          justifyContent: 'center',
        }}
      >
        ⋯
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position:     'absolute',
            top:          32,
            right:        0,
            minWidth:     140,
            background:   '#13131f',
            border:       '1px solid rgba(255,255,255,0.10)',
            borderRadius: 10,
            boxShadow:    '0 8px 24px rgba(0,0,0,0.45)',
            padding:      4,
            zIndex:       5,
          }}
        >
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); onDelete(noteId); }}
            style={{
              display:      'block',
              width:        '100%',
              textAlign:    'left',
              padding:      '8px 12px',
              borderRadius: 6,
              background:   'transparent',
              border:       'none',
              color:        'var(--color-forgot)',
              fontSize:     '0.85rem',
              fontWeight:   500,
              cursor:       busy ? 'not-allowed' : 'pointer',
              opacity:      busy ? 0.5 : 1,
            }}
          >
            {busy ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      )}
    </div>
  );
}

// Wrapped in <Suspense> below because useSearchParams() forces dynamic rendering
// — without the boundary, Next.js 15 fails the static prerender of /notes.
function NotesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const createErrorCode = searchParams?.get('error') ?? null;
  const createErrorMessage = createErrorCode
    ? (CREATE_ERROR_MESSAGES[createErrorCode] || CREATE_ERROR_MESSAGES.unknown)
    : null;
  const [createErrorDismissed, setCreateErrorDismissed] = useState(false);

  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState(null);

  function dismissCreateError() {
    setCreateErrorDismissed(true);
    // Strip the query param so a reload doesn't resurface the banner.
    router.replace('/notes');
  }

  const createErrorBanner = createErrorMessage && !createErrorDismissed ? (
    <div
      role="alert"
      style={{
        background:     'rgba(212,86,74,0.10)',
        border:         '1px solid rgba(212,86,74,0.30)',
        color:          '#e8e6e1',
        padding:        '10px 14px',
        borderRadius:   '8px',
        marginBottom:   16,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        gap:            12,
        maxWidth:       600,
      }}
    >
      <span style={{ fontSize: '0.875rem' }}>{createErrorMessage}</span>
      <button
        type="button"
        onClick={dismissCreateError}
        aria-label="Dismiss"
        style={{
          background:  'transparent',
          border:      'none',
          color:       'var(--color-muted)',
          cursor:      'pointer',
          fontSize:    '1rem',
          lineHeight:  1,
          padding:     '2px 6px',
        }}
      >
        ✕
      </button>
    </div>
  ) : null;

  async function fetchNotes() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/notes/list');
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        setError(pickNotesError('list', res.status, errBody?.error));
        return;
      }
      const data = await res.json();
      setNotes(Array.isArray(data.notes) ? data.notes : []);
    } catch {
      setError(pickNotesError('list', 0));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchNotes(); }, []);

  async function handleDelete(noteId) {
    const note = notes.find((n) => n.id === noteId);
    const qc = Number(note?.question_count) || 0;
    const msg = qc === 0
      ? 'Delete this note?'
      : `Delete this note? This will also delete ${qc} question${qc === 1 ? '' : 's'} generated from it.`;
    if (!window.confirm(msg)) return;

    setDeletingId(noteId);
    try {
      const res = await fetch(`/api/notes/${noteId}`, { method: 'DELETE' });
      // 404 = already gone (deleted in another tab). Treat as success and refetch
      // so the stale card disappears without an error flash.
      if (res.ok || res.status === 404) {
        await fetchNotes();
        return;
      }
      const errBody = await res.json().catch(() => ({}));
      setError(pickNotesError('delete', res.status, errBody?.error));
    } catch {
      setError(pickNotesError('delete', 0));
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <div style={wrapperStyle}>
        <StarryBackground />
        {heading}
        <div style={{ paddingLeft: 20 }}>
          <p style={{ color: 'var(--color-muted)', fontSize: '0.875rem' }}>Loading…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={wrapperStyle}>
        <StarryBackground />
        {heading}
        <div style={{ paddingLeft: 20 }}>
          <p style={{ color: 'var(--color-forgot)', marginBottom: 12, fontSize: '0.875rem' }}>{error}</p>
          <button
            onClick={fetchNotes}
            style={{
              padding:      '10px 20px',
              borderRadius: '8px',
              fontWeight:   500,
              fontSize:     '0.875rem',
              background:   'var(--color-foreground)',
              color:        'var(--color-background)',
              border:       'none',
              cursor:       'pointer',
            }}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <div style={wrapperStyle}>
        <StarryBackground />
        {heading}
        <div style={{ paddingLeft: 20, maxWidth: 560 }}>
          {createErrorBanner}
          <p style={{
            color:        'var(--color-muted)',
            fontSize:     '0.95rem',
            lineHeight:   1.55,
            marginBottom: 18,
          }}>
            Start capturing what you want to remember. Write rough notes while
            reading, listening, or watching. When you have enough material,
            generate study questions.
          </p>
          <NewNoteButton />
        </div>
      </div>
    );
  }

  return (
    <div style={wrapperStyle}>
      <StarryBackground />
      {heading}

      <div style={{ paddingLeft: 20, marginBottom: 16 }}>
        {createErrorBanner}
        <NewNoteButton />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {notes.map((note) => {
          const ts = note.updated_at ?? note.created_at;
          const displayTitle = (note.title && note.title.trim()) || 'Untitled';
          const staleCount = Number(note.stale_block_count) || 0;
          const dueCount   = Number(note.due_question_count) || 0;
          const metaParts = [`updated ${formatRelative(ts)}`];
          if (note.has_draft) metaParts.push('Draft in progress');
          if (staleCount > 0) metaParts.push(`${staleCount} block${staleCount === 1 ? '' : 's'} need${staleCount === 1 ? 's' : ''} refresh`);
          if (dueCount > 0)   metaParts.push(`${dueCount} due`);
          return (
            <Link
              key={note.id}
              href={`/notes/${note.id}`}
              style={{
                display:        'block',
                textDecoration: 'none',
                color:          'inherit',
                background:     '#0e0e18',
                border:         '1px solid rgba(255,255,255,0.06)',
                borderRadius:   '14px',
                padding:        '14px 16px',
                boxShadow:      '0 0 16px rgba(124,58,237,0.278), 0 0 32px rgba(124,58,237,0.101)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontWeight:   700,
                    fontSize:     '1rem',
                    color:        '#e8e6e1',
                    lineHeight:   1.35,
                    marginBottom: 4,
                    overflow:     'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace:   'nowrap',
                  }}>
                    {displayTitle}
                  </p>
                  <p style={{
                    fontSize:    '0.78rem',
                    color:       '#8a8880',
                    lineHeight:  1.5,
                    wordBreak:   'break-word',
                  }}>
                    {metaParts.join(' · ')}
                  </p>
                </div>
                <OverflowMenu
                  noteId={note.id}
                  onDelete={handleDelete}
                  busy={deletingId === note.id}
                />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function NotesLoadingFallback() {
  return (
    <div style={wrapperStyle}>
      <StarryBackground />
      {heading}
      <div style={{ paddingLeft: 20 }}>
        <p style={{ color: 'var(--color-muted)', fontSize: '0.875rem' }}>Loading…</p>
      </div>
    </div>
  );
}

export default function NotesPage() {
  return (
    <Suspense fallback={<NotesLoadingFallback />}>
      <NotesPageContent />
    </Suspense>
  );
}
