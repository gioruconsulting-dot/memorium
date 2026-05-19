'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import StarryBackground from '@/components/StarryBackground';

const wrapperStyle = { position: 'relative', zIndex: 1, paddingTop: '24px', paddingBottom: '40px' };

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

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(Number(ts) * 1000);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function NotesPage() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState(null);

  async function fetchNotes() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/notes/list');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load notes');
      setNotes(Array.isArray(data.notes) ? data.notes : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchNotes(); }, []);

  async function handleDelete(e, note) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm('Delete this note?')) return;

    setDeletingId(note.id);
    try {
      const res = await fetch(`/api/notes/${note.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Delete failed');
      }
      await fetchNotes();
    } catch (err) {
      setError(err.message);
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
        <div style={{ paddingLeft: 20 }}>
          <p style={{ color: 'var(--color-muted)', fontSize: '0.875rem', marginBottom: 16 }}>
            You haven&apos;t created any notes yet.
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
        <NewNoteButton />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {notes.map((note) => {
          const ts = note.updated_at ?? note.created_at;
          const displayTitle = (note.title && note.title.trim()) || 'Untitled';
          const qc = Number(note.question_count) || 0;
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontWeight:    700,
                    fontSize:      '1rem',
                    color:         '#e8e6e1',
                    lineHeight:    1.35,
                    marginBottom:  4,
                    overflow:      'hidden',
                    textOverflow:  'ellipsis',
                    whiteSpace:    'nowrap',
                  }}>
                    {displayTitle}
                  </p>
                  <p style={{ fontSize: '0.78rem', color: '#8a8880' }}>
                    {formatDate(ts)}{' · '}{qc} question{qc === 1 ? '' : 's'}
                  </p>
                </div>
                <button
                  onClick={(e) => handleDelete(e, note)}
                  disabled={deletingId === note.id}
                  style={{
                    flexShrink:   0,
                    fontSize:     '0.725rem',
                    fontWeight:   500,
                    color:        'var(--color-forgot)',
                    background:   'rgba(212,86,74,0.1)',
                    border:       'none',
                    borderRadius: '6px',
                    padding:      '4px 10px',
                    cursor:       deletingId === note.id ? 'not-allowed' : 'pointer',
                    opacity:      deletingId === note.id ? 0.4 : 1,
                    transition:   'opacity 0.15s ease',
                  }}
                >
                  {deletingId === note.id ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
