'use client';

import { useState, useEffect, useRef } from 'react';
import StarryBackground from '@/components/StarryBackground';

const MAX_CHARS = 50000;
const MIN_CHARS = 100;

// ── CSS for pseudo-states that can't be done with inline styles ──────────────
const STYLES = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  .u-field {
    width: 100%;
    padding: 10px 14px;
    border-radius: 10px;
    border: 1px solid rgba(255,255,255,0.15);
    background: #0f0f22;
    color: #e8e6e1;
    font-size: 0.9375rem;
    line-height: 1.5;
    font-family: inherit;
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .u-field:focus {
    border-color: rgba(124,58,237,0.75);
    box-shadow: 0 0 0 3px rgba(124,58,237,0.15);
  }
  .u-field::placeholder {
    color: rgba(155,153,148,0.65);
  }
  .u-field:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .u-upload-btn:hover:not(:disabled) {
    background: rgba(124,58,237,0.38);
    border-color: rgba(124,58,237,0.75);
  }
  .u-ghost-btn:hover {
    background: rgba(255,255,255,0.06);
  }
  .u-cta:hover:not(:disabled) {
    background: #6d28d9;
  }
`;

// ── Shared style tokens ───────────────────────────────────────────────────────
const card = {
  background:   '#0e0e18',
  border:       '1px solid rgba(255,255,255,0.06)',
  borderRadius: '14px',
  boxShadow:    '0 0 16px rgba(124,58,237,0.278), 0 0 32px rgba(124,58,237,0.101)',
};

const overline = {
  display:       'block',
  fontSize:      '0.64rem',
  fontWeight:    600,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  color:         'rgba(238, 255, 153, 0.85)',
  marginBottom:  '6px',
};

const labelStyle = {
  display:       'block',
  fontSize:      '0.72rem',
  fontWeight:    600,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color:         '#a09e9a',
  marginBottom:  '8px',
};

export default function UploadPage() {
  const [content,      setContent]      = useState('');
  const [title,        setTitle]        = useState('');
  const [themes,       setThemes]       = useState('');
  const [status,       setStatus]       = useState('idle'); // idle | loading | success | error
  const [result,       setResult]       = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isDragging,   setIsDragging]   = useState(false);
  const [progress,     setProgress]     = useState(0);
  const fileInputRef  = useRef(null);
  const dragCounterRef = useRef(0);

  // Simulated progress: animates to ~85% while loading, jumps to 100 on success
  useEffect(() => {
    if (status === 'success') { setProgress(100); return; }
    if (status !== 'loading') { setProgress(0); return; }
    setProgress(0);
    let current = 0;
    const interval = setInterval(() => {
      const increment = Math.max(0.1, (85 - current) * 0.0133);
      current = Math.min(current + increment, 85);
      setProgress(Math.round(current));
    }, 250);
    return () => clearInterval(interval);
  }, [status]);

  const charCount = content.length;
  const canSubmit =
    status !== 'loading' &&
    title.trim().length > 0 &&
    charCount >= MIN_CHARS &&
    charCount <= MAX_CHARS;

  function processFile(file) {
    if (!file) return;
    const validExtensions = ['.txt', '.md'];
    const extension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!validExtensions.includes(extension)) {
      setErrorMessage('Only .txt and .md files are supported');
      setStatus('error');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      setContent(text);
      if (!title.trim()) {
        const nameWithoutExt = file.name.replace(/\.(txt|md)$/i, '');
        setTitle(nameWithoutExt);
      }
      setStatus('idle');
      setErrorMessage('');
    };
    reader.onerror = () => {
      setErrorMessage('Failed to read file');
      setStatus('error');
    };
    reader.readAsText(file);
  }

  function handleFileUpload(e) {
    const file = e.target.files?.[0];
    processFile(file);
    e.target.value = '';
  }

  function handleDragEnter(e) {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.items?.length > 0) setIsDragging(true);
  }

  function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) setIsDragging(false);
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;
    const file = e.dataTransfer.files?.[0];
    processFile(file);
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setStatus('loading');
    setErrorMessage('');
    setResult(null);
    try {
      const response = await fetch('/api/documents/create', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          content: content.trim(),
          title:   title.trim(),
          themes:  themes.trim() || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Server error (${response.status})`);
      setStatus('success');
      setResult(data);
    } catch (err) {
      setStatus('error');
      setErrorMessage(err.message || 'Something went wrong');
    }
  }

  function handleReset() {
    setContent('');
    setTitle('');
    setThemes('');
    setStatus('idle');
    setResult(null);
    setErrorMessage('');
  }

  // ── Success state ─────────────────────────────────────────────────────────
  if (status === 'success' && result) {
    return (
      <div style={{
        position:       'relative',
        zIndex:         1,
        paddingTop:     '24px',
        paddingBottom:  '40px',
        minHeight:      '70vh',
        display:        'flex',
        flexDirection:  'column',
        justifyContent: 'center',
      }}>
        <style suppressHydrationWarning>{STYLES}</style>
        <StarryBackground />

        <div style={{ ...card, padding: '32px 24px', textAlign: 'center' }}>

          {/* Check icon */}
          <div style={{
            width:          '52px',
            height:         '52px',
            borderRadius:   '50%',
            background:     'rgba(74,222,128,0.1)',
            border:         '1px solid rgba(74,222,128,0.25)',
            display:        'inline-flex',
            alignItems:     'center',
            justifyContent: 'center',
            marginBottom:   '18px',
          }}>
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="#4ADE80" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <span style={overline}>Done</span>

          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ffffff', lineHeight: 1.2, marginBottom: '10px' }}>
            Questions Generated
          </h1>

          <p style={{ color: 'var(--color-muted)', fontSize: '0.9rem', marginBottom: '4px' }}>
            <span style={{ color: '#e8e6e1', fontWeight: 600 }}>{result.questionCount} questions</span> created from
          </p>
          <p style={{ color: '#e8e6e1', fontWeight: 500, fontSize: '0.9rem', marginBottom: '6px' }}>
            &ldquo;{result.title}&rdquo;
          </p>
          <p style={{ color: 'var(--color-muted)', fontSize: '0.8rem', marginBottom: '28px' }}>
            Ready for review in your study queue.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <a
              href="/study"
              style={{
                display:        'block',
                width:          '100%',
                padding:        '11px 24px',
                background:     '#7c3aed',
                color:          '#ffffff',
                fontWeight:     600,
                fontSize:       '0.9375rem',
                borderRadius:   '10px',
                textDecoration: 'none',
                textAlign:      'center',
                boxShadow:      '0 0 16px rgba(124,58,237,0.4)',
              }}
            >
              Study Now
            </a>
            <button
              onClick={handleReset}
              className="u-ghost-btn"
              style={{
                width:        '100%',
                padding:      '11px 24px',
                background:   'rgba(255,255,255,0.04)',
                border:       '1px solid rgba(255,255,255,0.08)',
                borderRadius: '10px',
                color:        'var(--color-muted)',
                fontWeight:   500,
                fontSize:     '0.9375rem',
                cursor:       'pointer',
                transition:   'background 0.15s',
              }}
            >
              Upload Another
            </button>
          </div>

        </div>
      </div>
    );
  }

  // ── Form state (idle | loading | error) ──────────────────────────────────
  return (
    <div style={{ position: 'relative', zIndex: 1, paddingTop: '24px', paddingBottom: '40px' }}>
      <style suppressHydrationWarning>{STYLES}</style>
      <StarryBackground />

      {/* Page header */}
      <div style={{ marginBottom: '20px', paddingLeft: '20px' }}>
        <span style={overline}>Upload</span>
        <h1 style={{ fontSize: '1.84rem', fontWeight: 700, color: '#ffffff', lineHeight: 1.1 }}>
          Add Content
        </h1>
      </div>

      {/* Form card */}
      <div style={{ ...card, padding: '20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>

        {/* ── File upload trigger ── */}
        <div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={status === 'loading'}
            className="u-upload-btn"
            style={{
              width:          '100%',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              gap:            '8px',
              background:     'rgba(124,58,237,0.28)',
              border:         '1.5px solid rgba(124,58,237,0.6)',
              borderRadius:   '10px',
              padding:        '10px 16px',
              color:          '#ddd6fe',
              fontSize:       '0.875rem',
              fontWeight:     600,
              cursor:         status === 'loading' ? 'not-allowed' : 'pointer',
              opacity:        status === 'loading' ? 0.4 : 1,
              boxShadow:      '0 0 14px rgba(124,58,237,0.22)',
              transition:     'background 0.15s, border-color 0.15s, box-shadow 0.15s',
            }}
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Upload .txt / .md file
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,text/plain,text/markdown"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>

        {/* ── Title ── */}
        <div>
          <label htmlFor="title" style={labelStyle}>
            Title{' '}
            <span style={{ color: 'rgba(238,255,153,0.75)', textTransform: 'none', letterSpacing: 0 }}>*</span>
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Meditations — Book 2"
            disabled={status === 'loading'}
            className="u-field"
          />
        </div>

        {/* ── Themes ── */}
        <div>
          <label htmlFor="themes" style={labelStyle}>
            Themes{' '}
            <span style={{ color: 'var(--color-muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: '0.72rem' }}>(optional)</span>
          </label>
          <input
            id="themes"
            type="text"
            value={themes}
            onChange={(e) => setThemes(e.target.value)}
            placeholder="e.g., Philosophy, Stoicism, Self-Reflection"
            disabled={status === 'loading'}
            className="u-field"
          />
        </div>

        {/* ── Content textarea + drag-and-drop ── */}
        <div>
          <label htmlFor="content" style={labelStyle}>
            Content{' '}
            <span style={{ color: 'rgba(238,255,153,0.75)', textTransform: 'none', letterSpacing: 0 }}>*</span>
          </label>
          <div
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            style={{ position: 'relative' }}
          >
            {/* Drop overlay */}
            {isDragging && (
              <div style={{
                position:       'absolute',
                inset:          0,
                zIndex:         10,
                borderRadius:   '10px',
                background:     'rgba(12,12,24,0.93)',
                border:         '2px dashed rgba(124,58,237,0.65)',
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                pointerEvents:  'none',
              }}>
                <div style={{ textAlign: 'center' }}>
                  <svg
                    width="28" height="28" fill="none" viewBox="0 0 24 24"
                    stroke="rgba(196,181,253,0.85)" strokeWidth={1.5}
                    style={{ display: 'block', margin: '0 auto 8px' }}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  <p style={{ color: '#c4b5fd', fontWeight: 500, fontSize: '0.875rem' }}>Drop .txt or .md file</p>
                </div>
              </div>
            )}
            <textarea
              id="content"
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                if (status === 'error') { setStatus('idle'); setErrorMessage(''); }
              }}
              placeholder={`Paste the text you want to learn from — a book chapter, article, podcast transcript, notes...\n\nOr drag and drop a .txt / .md file here.`}
              disabled={status === 'loading'}
              className="u-field"
              style={{ resize: 'vertical', minHeight: '180px', lineHeight: '1.6' }}
            />
          </div>

          {/* Character count */}
          <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem' }}>
            <span style={{
              color: charCount === 0       ? 'var(--color-muted)'
                   : charCount < MIN_CHARS ? '#d4a832'
                   : charCount > MAX_CHARS ? '#d4564a'
                   :                         'var(--color-muted)',
            }}>
              {charCount.toLocaleString()} / {MAX_CHARS.toLocaleString()}
            </span>
            {charCount > 0 && charCount < MIN_CHARS && (
              <span style={{ color: '#d4a832' }}>— need at least {MIN_CHARS}</span>
            )}
            {charCount > MAX_CHARS && (
              <span style={{ color: '#d4564a' }}>— too long</span>
            )}
          </div>
        </div>

        {/* ── Short content warning ── */}
        {charCount >= MIN_CHARS && charCount < 500 && (
          <div style={{
            padding:      '12px 14px',
            borderRadius: '10px',
            background:   'rgba(212,168,50,0.07)',
            border:       '1px solid rgba(212,168,50,0.2)',
          }}>
            <p style={{ color: '#d4a832', fontSize: '0.8rem', lineHeight: 1.55 }}>
              Content seems short — questions work best with 500+ characters of substantive text.
            </p>
          </div>
        )}

        {/* ── Error banner ── */}
        {status === 'error' && errorMessage && (
          <div style={{
            padding:      '12px 14px',
            borderRadius: '10px',
            background:   'rgba(212,86,74,0.07)',
            border:       '1px solid rgba(212,86,74,0.2)',
          }}>
            <p style={{ color: '#d4564a', fontSize: '0.8rem', lineHeight: 1.55 }}>{errorMessage}</p>
          </div>
        )}

        {/* ── Generate Questions CTA ── */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="u-cta"
          style={{
            width:        '100%',
            padding:      '12px 24px',
            borderRadius: '10px',
            border:       canSubmit ? 'none' : '1px solid rgba(124,58,237,0.28)',
            fontWeight:   600,
            fontSize:     '0.9375rem',
            cursor:       canSubmit ? 'pointer' : 'not-allowed',
            transition:   'background 0.15s, box-shadow 0.15s',
            background:   canSubmit ? '#7c3aed' : 'rgba(124,58,237,0.16)',
            color:        canSubmit ? '#ffffff'  : 'rgba(196,181,253,0.5)',
            boxShadow:    canSubmit ? '0 0 20px rgba(124,58,237,0.55), 0 0 44px rgba(124,58,237,0.2)' : 'none',
          }}
        >
          {status === 'loading' ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <svg
                style={{ animation: 'spin 1s linear infinite', width: '18px', height: '18px', flexShrink: 0 }}
                viewBox="0 0 24 24" fill="none"
              >
                <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Generating Questions…
            </span>
          ) : (
            'Generate Questions'
          )}
        </button>

        {/* ── Progress bar ── */}
        {status === 'loading' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '7px', color: 'var(--color-muted)' }}>
              <span>Generating questions…</span>
              <span style={{ color: '#4ADE80' }}>{progress}%</span>
            </div>
            <div style={{ height: '3px', borderRadius: '999px', background: 'rgba(255,255,255,0.06)' }}>
              <div style={{
                height:     '3px',
                borderRadius: '999px',
                transition: 'width 0.3s ease',
                width:      `${progress}%`,
                background: 'linear-gradient(90deg, #7c3aed 0%, #4ADE80 100%)',
              }} />
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
