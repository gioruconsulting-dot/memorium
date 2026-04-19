'use client';

import { useState, useEffect } from 'react';
import StarryBackground from '@/components/StarryBackground';

const wrapperStyle = { position: 'relative', zIndex: 1, paddingTop: '24px', paddingBottom: '40px' };

const browseCardStyle = {
  background:   '#0e0e18',
  border:       '1px solid rgba(96,165,250,0.14)',
  borderRadius: '14px',
  padding:      '14px 16px',
  boxShadow:    '0 0 16px rgba(96,165,250,0.18), 0 0 32px rgba(96,165,250,0.07)',
};

function formatDate(unixSeconds) {
  const date = new Date(Number(unixSeconds) * 1000);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const pageHeader = (
  <div style={{ marginBottom: '24px' }}>
    <h1 style={{
      fontSize:     '1.84rem',
      fontWeight:   700,
      color:        '#ffffff',
      lineHeight:   1.1,
      marginBottom: '6px',
      paddingLeft:  '20px',
    }}>
      Browse
    </h1>
    <p style={{ fontSize: '0.875rem', color: '#8a8880', paddingLeft: '20px' }}>
      Documents shared by other learners
    </p>
  </div>
);

export default function BrowsePage() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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
      setAdoptMessage((prev) => ({ ...prev, [doc.id]: `${data.questionCount} questions added to your library` }));
    } catch (err) {
      setAdoptState((prev) => ({ ...prev, [doc.id]: null }));
      setAdoptMessage((prev) => ({ ...prev, [doc.id]: err.message }));
    }
  }

  if (loading) {
    return (
      <div style={wrapperStyle}>
        <StarryBackground />
        {pageHeader}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="animate-pulse"
              style={{ ...browseCardStyle, height: 88 }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={wrapperStyle}>
        <StarryBackground />
        {pageHeader}
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

  if (documents.length === 0) {
    return (
      <div style={wrapperStyle}>
        <StarryBackground />
        {pageHeader}
        <div style={browseCardStyle}>
          <p style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#e8e6e1', marginBottom: '4px' }}>
            Nothing here yet
          </p>
          <p style={{ fontSize: '0.8125rem', color: '#8a8880', marginBottom: '16px' }}>
            Be the first to upload and share something.
          </p>
          <a
            href="/upload"
            style={{
              display:        'inline-block',
              padding:        '9px 18px',
              borderRadius:   '9px',
              fontWeight:     600,
              fontSize:       '0.8125rem',
              background:     '#7c3aed',
              color:          '#fff',
              textDecoration: 'none',
            }}
          >
            Upload a Document
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={wrapperStyle}>
      <StarryBackground />
      {pageHeader}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {documents.map((doc) => {
          const state   = adoptState[doc.id]   || null;
          const message = adoptMessage[doc.id] || null;
          const isDone  = state === 'done';
          const isAdopting = state === 'loading';

          return (
            <div key={doc.id} style={browseCardStyle}>

              {/* Overline */}
              <div style={{
                fontSize:      '0.64rem',
                fontWeight:    600,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color:         'rgba(96,165,250,0.75)',
                marginBottom:  '6px',
              }}>
                Shared
              </div>

              {/* Title + CTA row */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ fontWeight: 700, fontSize: '1rem', color: '#e8e6e1', lineHeight: 1.35, marginBottom: '3px' }}>
                    {doc.title}
                  </p>
                  {doc.themes && (
                    <p style={{ fontSize: '0.8125rem', color: '#8a8880', marginBottom: '2px' }}>
                      {doc.themes}
                    </p>
                  )}
                  <p style={{ fontSize: '0.8rem', color: '#8a8880' }}>
                    {Number(doc.question_count)} question{Number(doc.question_count) !== 1 ? 's' : ''}
                    {' · '}
                    {formatDate(doc.created_at)}
                  </p>
                </div>

                <button
                  onClick={() => handleAdopt(doc)}
                  disabled={isDone || isAdopting}
                  style={{
                    flexShrink:   0,
                    fontSize:     '0.8125rem',
                    fontWeight:   600,
                    padding:      '7px 14px',
                    borderRadius: '9px',
                    border:       'none',
                    cursor:       isDone || isAdopting ? 'default' : 'pointer',
                    transition:   'opacity 0.15s ease',
                    opacity:      isAdopting ? 0.6 : 1,
                    ...(isDone
                      ? { background: 'rgba(34,197,94,0.12)', color: 'var(--color-easy)' }
                      : { background: '#7c3aed', color: '#fff' }
                    ),
                  }}
                >
                  {isDone ? 'Added ✓' : isAdopting ? 'Adding…' : 'Add to Library'}
                </button>
              </div>

              {/* Feedback */}
              {message && (
                <p style={{
                  marginTop: '8px',
                  fontSize:  '0.8rem',
                  color:     isDone ? 'var(--color-easy)' : 'var(--color-forgot)',
                }}>
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
