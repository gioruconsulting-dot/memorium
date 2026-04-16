'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import StarryBackground from '@/components/StarryBackground';

const SORT_OPTIONS = [
  { key: 'recent_study',  label: 'Recently studied' },
  { key: 'recent_add',    label: 'Recently added'   },
  { key: 'most_mastered', label: 'Most mastered'    },
];

// ── Mastery dots ─────────────────────────────────────────────────────────────

function buildMasteryDots(mastered, progressing, newCount) {
  const total = mastered + progressing + newCount;
  if (total === 0) return [];

  const displayCount = Math.min(total, 20);
  let dMastered, dProgressing, dNew;

  if (total <= 20) {
    dMastered    = mastered;
    dProgressing = progressing;
    dNew         = newCount;
  } else {
    dMastered    = Math.round(mastered    * 20 / total);
    dProgressing = Math.round(progressing * 20 / total);
    dNew         = displayCount - dMastered - dProgressing;
  }

  return [
    ...Array(dMastered).fill('mastered'),
    ...Array(dProgressing).fill('progressing'),
    ...Array(Math.max(0, dNew)).fill('new'),
  ];
}

function MasteryDots({ mastered, progressing, newCount }) {
  const dots = buildMasteryDots(mastered, progressing, newCount);
  if (dots.length === 0) return null;

  const DOT  = 7;
  const GAP  = 3;
  const ROWS = 2;
  const COLS = Math.ceil(dots.length / ROWS);

  const dotColor = {
    mastered:    'var(--color-easy)',
    progressing: '#f59e0b',
    new:         'rgba(255,255,255,0.12)',
  };

  return (
    <div style={{
      display:             'grid',
      gridTemplateColumns: `repeat(${COLS}, ${DOT}px)`,
      gridTemplateRows:    `repeat(${ROWS}, ${DOT}px)`,
      gridAutoFlow:        'column',
      gap:                 `${GAP}px`,
      marginTop:           10,
      marginBottom:        6,
    }}>
      {dots.map((type, i) => (
        <div key={i} style={{
          width:        DOT,
          height:       DOT,
          borderRadius: '50%',
          background:   dotColor[type],
        }} />
      ))}
    </div>
  );
}

// ── Effort meter ─────────────────────────────────────────────────────────────

function EffortMeter({ totalReps, total }) {
  if (total === 0 || totalReps === 0) return null;

  const avg            = totalReps / total;
  const filledSegments = avg < 2 ? 1 : avg < 4 ? 2 : avg < 7 ? 3 : 4;
  const label          = ['Just started', 'Building', 'Strong', 'Deep'][filledSegments - 1];
  const avgRounded     = Math.round(avg);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
      <div style={{ display: 'flex', gap: 2 }}>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} style={{
            width:        10,
            height:       5,
            borderRadius: 2,
            background:   i < filledSegments ? '#EEFF99' : 'rgba(255,255,255,0.12)',
          }} />
        ))}
      </div>
      <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>
        {label}{' · '}{totalReps} rep{totalReps !== 1 ? 's' : ''}{' · '}~{avgRounded} per Q
      </span>
    </div>
  );
}

// ── Sort ─────────────────────────────────────────────────────────────────────

function sortDocuments(documents, sortKey) {
  const sorted = [...documents];
  if (sortKey === 'recent_study') {
    sorted.sort((a, b) => (b.last_studied_at ?? 0) - (a.last_studied_at ?? 0));
  } else if (sortKey === 'recent_add') {
    sorted.sort((a, b) => Number(b.created_at) - Number(a.created_at));
  } else if (sortKey === 'most_mastered') {
    sorted.sort((a, b) => {
      const aPct = a.total > 0 ? a.mastered / a.total : 0;
      const bPct = b.total > 0 ? b.mastered / b.total : 0;
      return bPct - aPct;
    });
  }
  return sorted;
}

// ── Shared layout pieces ──────────────────────────────────────────────────────

// Page heading — white, left-aligned, matches homepage title weight
const heading = (
  <h1 style={{
    fontSize:     '1.84rem',
    fontWeight:   700,
    color:        '#ffffff',
    lineHeight:   1.1,
    marginBottom: '20px',
    paddingLeft:  '20px',
  }}>
    Library
  </h1>
);

// Upload / browse action block — tertiary card language
const actionRows = (
  <div style={{
    background:   '#0e0e18',
    border:       '1px solid rgba(255,255,255,0.06)',
    borderRadius: '16px',
    overflow:     'hidden',
    marginBottom: '24px',
  }}>
    <Link
      href="/upload"
      className="flex items-center justify-between px-5 py-3.5 hover:bg-white/[0.04] transition-colors"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
    >
      <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-foreground)' }}>
        Upload your own
      </span>
      <span style={{ color: '#8a8880' }}>→</span>
    </Link>
    <Link
      href="/browse"
      className="flex items-center justify-between px-5 py-3.5 hover:bg-white/[0.04] transition-colors"
    >
      <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-foreground)' }}>
        Browse shared content
      </span>
      <span style={{ color: '#8a8880' }}>→</span>
    </Link>
  </div>
);

// Shared page wrapper style
const wrapperStyle = { position: 'relative', zIndex: 1, paddingTop: '24px', paddingBottom: '40px' };

// ── Page component ────────────────────────────────────────────────────────────

export default function LibraryPage() {
  const [documents,     setDocuments]     = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState('');
  const [deleting,      setDeleting]      = useState(null);
  const [togglingShare, setTogglingShare] = useState(null);
  const [sortIdx,       setSortIdx]       = useState(0);

  const sortMode  = SORT_OPTIONS[sortIdx].key;
  const sortLabel = SORT_OPTIONS[sortIdx].label;

  async function fetchDocuments() {
    setLoading(true);
    setError('');
    try {
      const res  = await fetch('/api/documents/list');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load documents');
      setDocuments(data.documents);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchDocuments(); }, []);

  async function handleDelete(doc) {
    const confirmMessage = doc.adopted
      ? `Remove "${doc.title}" from your library? This will delete your study progress for this document.`
      : `Are you sure you want to delete "${doc.title}"? This will also delete all its questions.`;
    if (!window.confirm(confirmMessage)) return;

    setDeleting(doc.id);
    try {
      const endpoint = doc.adopted ? '/api/documents/unadopt' : '/api/documents/delete';
      const res  = await fetch(endpoint, {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ documentId: doc.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(null);
    }
  }

  async function handleToggleShare(doc) {
    const nextPublic = !doc.is_public;
    setTogglingShare(doc.id);
    try {
      const res  = await fetch('/api/documents/set-public', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ documentId: doc.id, isPublic: nextPublic }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update sharing');
      setDocuments((prev) =>
        prev.map((d) => d.id === doc.id ? { ...d, is_public: nextPublic } : d)
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setTogglingShare(null);
    }
  }

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={wrapperStyle}>
        <StarryBackground />

        {heading}
        {actionRows}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="animate-pulse" style={{
              borderRadius: '14px',
              height:       110,
              background:   '#0e0e18',
              border:       '1px solid rgba(255,255,255,0.06)',
              boxShadow:    '0 0 16px rgba(124,58,237,0.22), 0 0 32px rgba(124,58,237,0.08)',
            }} />
          ))}
        </div>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div style={wrapperStyle}>
        <StarryBackground />

        {heading}
        {actionRows}
        <p style={{ color: 'var(--color-forgot)', marginBottom: '16px', fontSize: '0.875rem' }}>
          {error}
        </p>
        <button
          onClick={fetchDocuments}
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
    );
  }

  // ── Empty ──────────────────────────────────────────────────────────────────

  if (documents.length === 0) {
    return (
      <div style={wrapperStyle}>
        <StarryBackground />

        {heading}
        {actionRows}
        <p style={{ color: 'var(--color-muted)', fontSize: '0.875rem' }}>
          No documents yet. Upload your first or browse shared content above.
        </p>
      </div>
    );
  }

  // ── Main ───────────────────────────────────────────────────────────────────

  const sortedDocs = sortDocuments(documents, sortMode);

  return (
    <div style={wrapperStyle}>
      <StarryBackground />

      {heading}
      {actionRows}

      {/* Sort control */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '14px' }}>
        <button
          onClick={() => setSortIdx((i) => (i + 1) % SORT_OPTIONS.length)}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
        >
          <span style={{ fontSize: '0.72rem', color: 'var(--color-muted)', letterSpacing: '0.03em' }}>Sort</span>
          <span style={{ fontSize: '0.72rem', color: 'var(--color-foreground)', fontWeight: 500 }}>{sortLabel}</span>
          <span style={{ fontSize: '0.6rem', color: 'var(--color-muted)' }}>▾</span>
        </button>
      </div>

      {/* Document cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {sortedDocs.map((doc) => (
          <div
            key={doc.id}
            style={{
              background:   '#0e0e18',
              border:       '1px solid rgba(255,255,255,0.06)',
              borderRadius: '14px',
              padding:      '14px 16px',
              boxShadow:    '0 0 16px rgba(124,58,237,0.22), 0 0 32px rgba(124,58,237,0.08)',
            }}
          >
            {/* Top row: overline label + action pills */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              {/* Overline — replaces badge pill */}
              <span style={{
                fontSize:      '0.6rem',
                fontWeight:    600,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color:         doc.adopted ? '#60A5FA' : 'rgba(238, 255, 153, 0.85)',
              }}>
                {doc.adopted ? 'Adopted' : 'Uploaded'}
              </span>

              {/* Action pills — horizontal row, top-right */}
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                {!doc.adopted && (
                  <button
                    onClick={() => handleToggleShare(doc)}
                    disabled={togglingShare === doc.id}
                    style={{
                      fontSize:     '0.68rem',
                      fontWeight:   500,
                      color:        'var(--color-muted)',
                      background:   'rgba(255,255,255,0.06)',
                      border:       'none',
                      borderRadius: '6px',
                      padding:      '3px 9px',
                      cursor:       'pointer',
                      opacity:      togglingShare === doc.id ? 0.4 : 1,
                      transition:   'opacity 0.15s ease',
                    }}
                  >
                    {togglingShare === doc.id ? '…' : doc.is_public ? 'Stop Sharing' : 'Share'}
                  </button>
                )}
                <button
                  onClick={() => handleDelete(doc)}
                  disabled={deleting === doc.id}
                  style={{
                    fontSize:     '0.68rem',
                    fontWeight:   500,
                    color:        'var(--color-forgot)',
                    background:   'rgba(212,86,74,0.1)',
                    border:       'none',
                    borderRadius: '6px',
                    padding:      '3px 9px',
                    cursor:       'pointer',
                    opacity:      deleting === doc.id ? 0.4 : 1,
                    transition:   'opacity 0.15s ease',
                  }}
                >
                  {deleting === doc.id ? 'Removing…' : doc.adopted ? 'Remove' : 'Delete'}
                </button>
              </div>
            </div>

            {/* Title */}
            <p style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#e8e6e1', lineHeight: 1.35, marginBottom: '3px' }}>
              {doc.title}
            </p>

            {/* Theme */}
            {doc.themes && (
              <p style={{ fontSize: '0.8125rem', color: '#8a8880' }}>
                {doc.themes}
              </p>
            )}

            {/* Mastery dots — colors unchanged */}
            <MasteryDots
              mastered={doc.mastered}
              progressing={doc.progressing}
              newCount={doc.new_count}
            />

            {/* Effort meter — segments unchanged */}
            <EffortMeter totalReps={doc.total_reps} total={doc.total} />
          </div>
        ))}
      </div>
    </div>
  );
}
