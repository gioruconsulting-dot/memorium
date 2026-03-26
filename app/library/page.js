'use client';

import { useState, useEffect } from 'react';

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
    const confirmed = window.confirm(
      `Are you sure you want to delete "${doc.title}"? This will also delete all its questions.`
    );
    if (!confirmed) return;

    setDeleting(doc.id);
    try {
      const res = await fetch('/api/documents/delete', {
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

  if (loading) {
    return (
      <div className="py-8">
        {heading}
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
        <p className="mb-5" style={{ color: 'var(--color-muted)' }}>
          No documents yet. Upload your first document to get started.
        </p>
        <a
          href="/upload"
          className="inline-block px-5 py-2.5 rounded-lg font-medium text-sm"
          style={{ background: 'var(--color-foreground)', color: 'var(--color-background)' }}
        >
          Upload a Document
        </a>
      </div>
    );
  }

  return (
    <div className="py-8">
      {heading}
      <div className="space-y-3">
        {documents.map((doc) => (
          <div
            key={doc.id}
            className="rounded-2xl p-5"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
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
                {deleting === doc.id ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
