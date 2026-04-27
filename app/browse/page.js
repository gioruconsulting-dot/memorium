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

const TOPICS = ['All', 'Tech', 'Business', 'Science', 'Humanities', 'Personal Growth', 'Other'];

function formatDate(unixSeconds) {
  const date = new Date(Number(unixSeconds) * 1000);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const pageHeader = (
  <div style={{ marginBottom: '20px' }}>
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
  const [documents, setDocuments]             = useState([]);
  const [loading, setLoading]                 = useState(true);
  const [error, setError]                     = useState('');
  const [adoptState, setAdoptState]           = useState({});
  const [adoptMessage, setAdoptMessage]       = useState({});
  const [prioritizeState, setPrioritizeState] = useState({});
  const [searchQuery, setSearchQuery]         = useState('');
  const [activeTopic, setActiveTopic]         = useState('all');
  const [expandedDocId, setExpandedDocId]     = useState(null);
  const [searchFocused, setSearchFocused]     = useState(false);

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
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ documentId: doc.id }),
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

  async function handleStudyThis(documentId) {
    if (prioritizeState[documentId] === 'loading') return;
    setPrioritizeState((prev) => ({ ...prev, [documentId]: 'loading' }));
    try {
      await fetch('/api/questions/prioritize', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ documentId, mode: 'queue-front' }),
      });
    } finally {
      window.location.href = '/study';
    }
  }

  function toggleExpand(docId) {
    setExpandedDocId((prev) => (prev === docId ? null : docId));
  }

  const filteredDocs = documents.filter(doc => {
    const matchesTopic = activeTopic === 'all' || doc.topic === activeTopic;
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch = !q ||
      doc.title?.toLowerCase().includes(q) ||
      doc.topic?.toLowerCase().includes(q) ||
      doc.description?.toLowerCase().includes(q);
    return matchesTopic && matchesSearch;
  });

  if (loading) {
    return (
      <div style={wrapperStyle}>
        <StarryBackground />
        {pageHeader}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="animate-pulse" style={{ ...browseCardStyle, height: 88 }} />
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

      <style suppressHydrationWarning>{`
        .browse-pills-row::-webkit-scrollbar { display: none; }
        .browse-search-input::placeholder { color: rgba(148,163,184,0.45); }
      `}</style>

      {pageHeader}

      {/* Search bar — Tweak 1: no extra horizontal padding; Tweak 4: stronger border + lighter fill */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{
          display:      'flex',
          alignItems:   'center',
          gap:          '10px',
          background:   '#1e1e30',
          border:       searchFocused
            ? '1px solid rgba(160,130,255,0.66)'
            : '1px solid rgba(120,100,200,0.42)',
          borderRadius: '10px',
          padding:      '9px 14px',
          transition:   'border-color 0.18s ease',
        }}>
          {/* Magnifying glass */}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round"
            style={{ width: '16px', height: '16px', flexShrink: 0, color: 'rgba(148,163,184,0.55)' }}>
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="Search documents"
            className="browse-search-input"
            style={{
              flex:       1,
              background: 'transparent',
              border:     'none',
              outline:    'none',
              color:      '#e8e6e1',
              fontSize:   '0.875rem',
              lineHeight: 1.4,
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                background: 'none',
                border:     'none',
                cursor:     'pointer',
                color:      'rgba(148,163,184,0.55)',
                padding:    0,
                lineHeight: 1,
                fontSize:   '0.875rem',
                flexShrink: 0,
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Topic pills — Tweak 1: no extra horizontal padding; Tweak 4: stronger border + lighter fill */}
      <div
        className="browse-pills-row"
        style={{
          marginBottom:    '16px',
          overflowX:       'auto',
          scrollbarWidth:  'none',
          msOverflowStyle: 'none',
        }}
      >
        <div style={{ display: 'flex', gap: '8px', width: 'max-content' }}>
          {TOPICS.map((topic) => {
            const topicKey = topic === 'All' ? 'all' : topic;
            const isActive = activeTopic === topicKey;
            return (
              <button
                key={topic}
                onClick={() => setActiveTopic(topicKey)}
                style={{
                  padding:      '7px 15px',
                  borderRadius: '999px',
                  fontSize:     '0.8125rem',
                  fontWeight:   isActive ? 600 : 500,
                  cursor:       'pointer',
                  border:       isActive
                    ? '1px solid rgba(124,58,237,0.6)'
                    : '1px solid rgba(120,100,200,0.32)',
                  background:   isActive ? 'rgba(124,58,237,0.22)' : '#1a1a28',
                  color:        isActive ? '#c4b5fd' : '#bbbbcc',
                  transition:   'all 0.15s ease',
                  whiteSpace:   'nowrap',
                }}
              >
                {topic}
              </button>
            );
          })}
        </div>
      </div>

      {/* Card list — Tweak 1: no extra horizontal padding */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {filteredDocs.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#8a8880', fontSize: '0.875rem', padding: '40px 0' }}>
            No documents match.
          </div>
        ) : (
          filteredDocs.map((doc) => {
            const isOpen     = expandedDocId === doc.id;
            const state      = adoptState[doc.id]   || null;
            const message    = adoptMessage[doc.id] || null;
            const isDone     = state === 'done';
            const isAdopting = state === 'loading';

            return (
              <div
                key={doc.id}
                style={{ ...browseCardStyle, cursor: 'pointer' }}
                onClick={() => toggleExpand(doc.id)}
              >
                {/* Overline + chevron */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{
                    fontSize:      '0.64rem',
                    fontWeight:    600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    color:         'rgba(96,165,250,0.75)',
                  }}>
                    Shared
                  </div>
                  <svg
                    viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    style={{
                      width:      '16px',
                      height:     '16px',
                      flexShrink: 0,
                      color:      'rgba(96,165,250,0.5)',
                      transition: 'transform 0.28s ease',
                      transform:  isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>

                {/* Title + meta */}
                <p style={{ fontWeight: 700, fontSize: '1rem', color: '#e8e6e1', lineHeight: 1.35, marginBottom: '3px' }}>
                  {doc.title}
                </p>
                {doc.topic && (
                  <p style={{ fontSize: '0.8125rem', color: '#8a8880', marginBottom: '2px' }}>
                    {doc.topic}
                  </p>
                )}
                <p style={{ fontSize: '0.8rem', color: '#8a8880' }}>
                  {Number(doc.question_count)} question{Number(doc.question_count) !== 1 ? 's' : ''}
                  {' · '}
                  {formatDate(doc.created_at)}
                </p>

                {/* Expandable panel — stopPropagation so button clicks don't toggle the card */}
                <div
                  style={{
                    overflow:   'hidden',
                    maxHeight:  isOpen ? '480px' : '0',
                    opacity:    isOpen ? 1 : 0,
                    marginTop:  isOpen ? '14px' : '0',
                    transition: 'max-height 0.32s ease, opacity 0.28s ease, margin-top 0.28s ease',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Divider */}
                  <div style={{ borderTop: '1px solid rgba(96,165,250,0.12)', marginBottom: '12px' }} />

                  {/* Description — Tweak 2: primary text, larger and brighter */}
                  {doc.description && (
                    <p style={{
                      fontSize:     '0.9375rem',
                      fontWeight:   400,
                      lineHeight:   1.55,
                      color:        '#e8e6e1',
                      marginBottom: '14px',
                    }}>
                      {doc.description}
                    </p>
                  )}

                  {/* Sample question — Tweak 2: secondary text, smaller and muted */}
                  {doc.sample_question_text && (
                    <div style={{ marginBottom: '16px' }}>
                      {/* Tweak 3: yellow label */}
                      <div style={{
                        fontSize:      '0.625rem',
                        fontWeight:    600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.1em',
                        color:         '#EEFF99',
                        marginBottom:  '5px',
                      }}>
                        Sample Question
                      </div>
                      <p style={{ fontSize: '0.8125rem', lineHeight: 1.5, color: '#a8a8b8', fontWeight: 400 }}>
                        {doc.sample_question_text}
                      </p>
                    </div>
                  )}

                  {/* Add to Library */}
                  <button
                    onClick={() => handleAdopt(doc)}
                    disabled={isDone || isAdopting}
                    style={{
                      width:        '100%',
                      fontSize:     '0.875rem',
                      fontWeight:   600,
                      padding:      '9px 16px',
                      borderRadius: '9px',
                      cursor:       isDone || isAdopting ? 'default' : 'pointer',
                      transition:   'opacity 0.15s ease',
                      opacity:      isAdopting ? 0.6 : 1,
                      ...(isDone
                        ? { background: 'rgba(34,197,94,0.1)', color: 'var(--color-easy)', border: '1px solid rgba(34,197,94,0.2)' }
                        : { background: 'rgba(124,58,237,0.24)', color: '#d0c4ff', border: '1px solid rgba(124,58,237,0.42)' }
                      ),
                    }}
                  >
                    {isDone ? 'Added ✓' : isAdopting ? 'Adding…' : 'Add to Library'}
                  </button>

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

                  {/* Study THIS — appears only after successful adoption */}
                  {isDone && (
                    <button
                      onClick={() => handleStudyThis(doc.id)}
                      disabled={prioritizeState[doc.id] === 'loading'}
                      style={{
                        marginTop:      '10px',
                        width:          '100%',
                        padding:        '9px 16px',
                        background:     prioritizeState[doc.id] === 'loading' ? 'rgba(124,58,237,0.5)' : '#7c3aed',
                        color:          '#ffffff',
                        fontWeight:     600,
                        fontSize:       '0.875rem',
                        borderRadius:   '9px',
                        border:         'none',
                        cursor:         prioritizeState[doc.id] === 'loading' ? 'not-allowed' : 'pointer',
                        boxShadow:      '0 0 16px rgba(124,58,237,0.45)',
                        transition:     'background 0.15s',
                        display:        'flex',
                        alignItems:     'center',
                        justifyContent: 'center',
                        gap:            '7px',
                      }}
                    >
                      {prioritizeState[doc.id] === 'loading' ? (
                        <>
                          <svg
                            className="animate-spin"
                            style={{ width: '14px', height: '14px', flexShrink: 0 }}
                            viewBox="0 0 24 24" fill="none"
                          >
                            <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Starting…
                        </>
                      ) : 'Study THIS'}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
