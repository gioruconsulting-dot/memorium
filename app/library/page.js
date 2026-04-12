'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

function formatDate(unixSeconds) {
  const date = new Date(Number(unixSeconds) * 1000);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function LibraryPage() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(null); // documentId being deleted

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

  const heading = (
    <h1 className="text-2xl font-semibold text-center text-[#EEFF99] mb-6">
      Library
    </h1>
  );

  const actionRows = (
    <div className="rounded-2xl overflow-hidden mb-6" style={{ border: '1px solid var(--color-border)' }}>
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
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-2xl p-5 h-24 animate-pulse"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }} />
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

  return (
    <div className="py-8">
      {heading}
      {actionRows}
      <div className="space-y-3">
        {documents.map((doc) => (
          <div
            key={doc.id}
            className={`rounded-2xl p-5 ${doc.adopted ? 'border-l-4' : ''}`}
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
                  <p className="text-sm mb-1" style={{ color: 'var(--color-muted)' }}>
                    {doc.themes}
                  </p>
                )}
                <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
                  {Number(doc.question_count)} question{Number(doc.question_count) !== 1 ? 's' : ''}
                  {' · '}
                  {formatDate(doc.created_at)}
                </p>
              </div>
              <button
                onClick={() => handleDelete(doc)}
                disabled={deleting === doc.id}
                className="shrink-0 text-sm font-medium px-3 py-1.5 rounded-lg transition-opacity disabled:opacity-40"
                style={{ color: 'var(--color-forgot)' }}
              >
                {deleting === doc.id ? 'Removing…' : doc.adopted ? 'Remove' : 'Delete'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
