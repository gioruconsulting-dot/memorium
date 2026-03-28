'use client';

import { useState, useEffect } from 'react';

function formatDate(unixSeconds) {
  const date = new Date(Number(unixSeconds) * 1000);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function BrowsePage() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Track adopt state per document: null | 'loading' | 'done'
  const [adoptState, setAdoptState] = useState({});
  const [adoptMessage, setAdoptMessage] = useState({});

  async function fetchDocuments() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/documents/browse');
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

  async function handleAdopt(doc) {
    setAdoptState((prev) => ({ ...prev, [doc.id]: 'loading' }));
    try {
      const res = await fetch('/api/documents/adopt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: doc.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to adopt document');
      setAdoptState((prev) => ({ ...prev, [doc.id]: 'done' }));
      setAdoptMessage((prev) => ({ ...prev, [doc.id]: `${data.questionCount} questions added to your study queue` }));
    } catch (err) {
      setAdoptState((prev) => ({ ...prev, [doc.id]: null }));
      setAdoptMessage((prev) => ({ ...prev, [doc.id]: err.message }));
    }
  }

  const heading = (
    <h1 className="text-2xl font-semibold text-center text-[#EEFF99] mb-2">
      Browse
    </h1>
  );

  if (loading) {
    return (
      <div className="py-8">
        {heading}
        <p className="text-center text-sm mb-6" style={{ color: 'var(--color-muted)' }}>
          Documents shared by other learners
        </p>
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-2xl p-5 h-28 animate-pulse"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
            />
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
        <p className="text-center text-sm mb-8" style={{ color: 'var(--color-muted)' }}>
          Documents shared by other learners
        </p>
        <div
          className="rounded-2xl p-8 text-center"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          <p className="text-base mb-1" style={{ color: 'var(--color-foreground)' }}>
            No documents from other learners yet.
          </p>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            Be the first to upload!
          </p>
          <a
            href="/upload"
            className="inline-block mt-5 px-5 py-2.5 rounded-xl font-medium text-sm text-white bg-violet-600 hover:bg-violet-700 transition-colors"
          >
            Upload a Document
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="py-8">
      {heading}
      <p className="text-center text-sm mb-6" style={{ color: 'var(--color-muted)' }}>
        Documents shared by other learners
      </p>
      <div className="space-y-3">
        {documents.map((doc) => {
          const state = adoptState[doc.id] || null;
          const message = adoptMessage[doc.id] || null;
          const isDone = state === 'done';
          const isLoading = state === 'loading';

          return (
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
                    {' · '}
                    Another learner
                  </p>
                </div>
                <button
                  onClick={() => handleAdopt(doc)}
                  disabled={isDone || isLoading}
                  className="shrink-0 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors disabled:cursor-not-allowed"
                  style={
                    isDone
                      ? { background: 'var(--color-easy-bg)', color: 'var(--color-easy)' }
                      : isLoading
                        ? { background: '#5b21b6', color: '#fff', opacity: 0.7 }
                        : { background: '#7c3aed', color: '#fff' }
                  }
                >
                  {isDone ? 'Added ✓' : isLoading ? 'Adding…' : 'Add to My Library'}
                </button>
              </div>

              {/* Inline feedback message */}
              {message && (
                <p
                  className="mt-2 text-sm"
                  style={{ color: isDone ? 'var(--color-easy)' : 'var(--color-forgot)' }}
                >
                  {message}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
