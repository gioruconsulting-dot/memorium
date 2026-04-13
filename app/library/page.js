'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const SORT_OPTIONS = [
  { key: 'recent_study', label: 'Recently studied' },
  { key: 'recent_add',   label: 'Recently added' },
  { key: 'most_mastered', label: 'Most mastered' },
];

// Build the sorted dot sequence (column-first fill: green → orange → empty)
function buildMasteryDots(mastered, progressing, newCount) {
  const total = mastered + progressing + newCount;
  if (total === 0) return [];

  const displayCount = Math.min(total, 20);
  let dMastered, dProgressing, dNew;

  if (total <= 20) {
    dMastered = mastered;
    dProgressing = progressing;
    dNew = newCount;
  } else {
    dMastered = Math.round(mastered * 20 / total);
    dProgressing = Math.round(progressing * 20 / total);
    dNew = displayCount - dMastered - dProgressing;
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

  const DOT = 7;
  const GAP = 3;
  const ROWS = 2;
  // Use exactly as many columns as needed — don't show empty trailing columns
  const COLS = Math.ceil(dots.length / ROWS);

  const dotColor = {
    mastered:    'var(--color-easy)',
    progressing: '#f59e0b',
    new:         'rgba(255,255,255,0.12)',
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${COLS}, ${DOT}px)`,
        gridTemplateRows: `repeat(${ROWS}, ${DOT}px)`,
        gridAutoFlow: 'column',
        gap: `${GAP}px`,
        marginTop: 10,
        marginBottom: 6,
      }}
    >
      {dots.map((type, i) => (
        <div
          key={i}
          style={{
            width: DOT,
            height: DOT,
            borderRadius: '50%',
            background: dotColor[type],
          }}
        />
      ))}
    </div>
  );
}

function EffortMeter({ totalReps, total }) {
  if (total === 0 || totalReps === 0) return null;

  const avg = totalReps / total;
  const filledSegments =
    avg < 2 ? 1 :
    avg < 4 ? 2 :
    avg < 7 ? 3 : 4;
  const label = ['Just started', 'Building', 'Strong', 'Deep'][filledSegments - 1];
  const avgRounded = Math.round(avg);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        marginTop: 2,
      }}
    >
      {/* 4-segment bar */}
      <div style={{ display: 'flex', gap: 2 }}>
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            style={{
              width: 10,
              height: 5,
              borderRadius: 2,
              background: i < filledSegments ? '#EEFF99' : 'rgba(255,255,255,0.12)',
            }}
          />
        ))}
      </div>
      <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>
        {label}
        {' · '}
        {totalReps} rep{totalReps !== 1 ? 's' : ''}
        {' · '}
        ~{avgRounded} per Q
      </span>
    </div>
  );
}

function sortDocuments(documents, sortKey) {
  const sorted = [...documents];
  if (sortKey === 'recent_study') {
    sorted.sort((a, b) => {
      const aT = a.last_studied_at ?? 0;
      const bT = b.last_studied_at ?? 0;
      return bT - aT;
    });
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

export default function LibraryPage() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [togglingShare, setTogglingShare] = useState(null); // documentId being toggled
  const [sortIdx, setSortIdx] = useState(0);

  const sortMode = SORT_OPTIONS[sortIdx].key;
  const sortLabel = SORT_OPTIONS[sortIdx].label;

  async function fetchDocuments() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/documents/list');
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
      const res = await fetch(endpoint, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: doc.id }),
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
      const res = await fetch('/api/documents/set-public', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: doc.id, isPublic: nextPublic }),
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

  const heading = (
    <h1 className="text-2xl font-semibold text-center text-[#EEFF99] mb-6">
      Library
    </h1>
  );

  const actionRows = (
    <div className="rounded-2xl overflow-hidden mb-4" style={{ border: '1px solid var(--color-border)' }}>
      <Link
        href="/upload"
        className="flex items-center justify-between px-5 py-3.5 transition-colors hover:bg-violet-500/10"
        style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)' }}
      >
        <span className="text-sm font-medium">Upload your own</span>
        <span style={{ color: 'var(--color-muted)' }}>→</span>
      </Link>
      <Link
        href="/browse"
        className="flex items-center justify-between px-5 py-3.5 transition-colors hover:bg-violet-500/10"
        style={{ background: 'var(--color-surface)' }}
      >
        <span className="text-sm font-medium">Browse shared content</span>
        <span style={{ color: 'var(--color-muted)' }}>→</span>
      </Link>
    </div>
  );

  if (loading) {
    return (
      <div className="py-8">
        {heading}
        {actionRows}
        <div className="space-y-3 mt-6">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-2xl p-5 animate-pulse"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', height: 120 }} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8">
        {heading}
        {actionRows}
        <p className="mb-4" style={{ color: 'var(--color-forgot)' }}>{error}</p>
        <button
          onClick={fetchDocuments}
          className="px-5 py-2.5 rounded-lg font-medium text-sm"
          style={{ background: 'var(--color-foreground)', color: 'var(--color-background)' }}
        >
          Try Again
        </button>
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="py-8">
        {heading}
        {actionRows}
        <p style={{ color: 'var(--color-muted)' }}>
          No documents yet. Upload your first or browse shared content above.
        </p>
      </div>
    );
  }

  const sortedDocs = sortDocuments(documents, sortMode);

  return (
    <div className="py-8">
      {heading}
      {actionRows}

      {/* Sort control */}
      <div className="flex items-center mb-4">
        <button
          onClick={() => setSortIdx((i) => (i + 1) % SORT_OPTIONS.length)}
          style={{ color: 'var(--color-muted)', fontSize: 12 }}
          className="flex items-center gap-1.5"
        >
          <span>Sort:</span>
          <span style={{ color: 'var(--color-foreground)', fontWeight: 500 }}>{sortLabel}</span>
          <span style={{ fontSize: 10 }}>▾</span>
        </button>
      </div>

      <div className="space-y-3">
        {sortedDocs.map((doc) => (
          <div
            key={doc.id}
            className="rounded-2xl p-5"
            style={
              doc.adopted
                ? { background: 'var(--color-surface)', border: '1px solid var(--color-border)' }
                : {
                    background: 'color-mix(in srgb, #7c3aed 8%, var(--color-surface))',
                    border: '1px solid var(--color-border)',
                    borderLeftColor: '#7c3aed',
                    borderLeftWidth: '4px',
                  }
            }
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {/* Badge */}
                <span
                  className="inline-block text-xs font-medium px-2 py-0.5 rounded-md mb-1.5"
                  style={
                    doc.adopted
                      ? { background: 'rgba(124,58,237,0.2)', color: '#a78bfa' }
                      : { background: 'var(--color-surface-hover)', color: 'var(--color-muted)' }
                  }
                >
                  {doc.adopted ? 'Adopted' : 'Uploaded'}
                </span>

                <p className="font-semibold text-base leading-snug mb-1">{doc.title}</p>
                {doc.themes && (
                  <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
                    {doc.themes}
                  </p>
                )}

                <MasteryDots
                  mastered={doc.mastered}
                  progressing={doc.progressing}
                  newCount={doc.new_count}
                />
                <EffortMeter totalReps={doc.total_reps} total={doc.total} />
              </div>

              {doc.adopted ? (
                <button
                  onClick={() => handleDelete(doc)}
                  disabled={deleting === doc.id}
                  className="shrink-0 text-sm font-medium px-3 py-1.5 rounded-lg transition-opacity disabled:opacity-40"
                  style={{ color: 'var(--color-forgot)' }}
                >
                  {deleting === doc.id ? 'Removing…' : 'Remove'}
                </button>
              ) : (
                <div className="shrink-0 flex flex-col items-end gap-0.5">
                  <button
                    onClick={() => handleToggleShare(doc)}
                    disabled={togglingShare === doc.id}
                    className="text-sm font-medium px-3 py-1.5 rounded-lg transition-opacity disabled:opacity-40"
                    style={{ color: 'var(--color-muted)' }}
                  >
                    {togglingShare === doc.id
                      ? '…'
                      : doc.is_public ? 'Stop Sharing' : 'Share'}
                  </button>
                  <button
                    onClick={() => handleDelete(doc)}
                    disabled={deleting === doc.id}
                    className="text-sm font-medium px-3 py-1.5 rounded-lg transition-opacity disabled:opacity-40"
                    style={{ color: 'var(--color-forgot)' }}
                  >
                    {deleting === doc.id ? 'Removing…' : 'Delete'}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
