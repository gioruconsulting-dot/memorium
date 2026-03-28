'use client';

import { useState, useRef } from 'react';

const MAX_CHARS = 50000;
const MIN_CHARS = 100;

export default function UploadPage() {
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [themes, setThemes] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  const [result, setResult] = useState(null); // { title, questionCount } on success
  const [errorMessage, setErrorMessage] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);
  const dragCounterRef = useRef(0); // Track nested drag events

  const charCount = content.length;
  const canSubmit =
    status !== 'loading' &&
    title.trim().length > 0 &&
    charCount >= MIN_CHARS &&
    charCount <= MAX_CHARS;

  // Process a file (shared by file input and drag-and-drop)
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

      // Auto-fill title from filename (strip extension)
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

  // Handle file input change
  function handleFileUpload(e) {
    const file = e.target.files?.[0];
    processFile(file);
    // Reset file input so same file can be re-selected
    e.target.value = '';
  }

  // Drag-and-drop handlers
  function handleDragEnter(e) {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.items?.length > 0) {
      setIsDragging(true);
    }
  }

  function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
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

  // Submit to API
  async function handleSubmit() {
    if (!canSubmit) return;

    setStatus('loading');
    setErrorMessage('');
    setResult(null);

    try {
      const response = await fetch('/api/documents/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: content.trim(),
          title: title.trim(),
          themes: themes.trim() || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Server error (${response.status})`);
      }

      setStatus('success');
      setResult(data);
    } catch (err) {
      setStatus('error');
      setErrorMessage(err.message || 'Something went wrong');
    }
  }

  // Reset form for another upload
  function handleReset() {
    setContent('');
    setTitle('');
    setThemes('');
    setStatus('idle');
    setResult(null);
    setErrorMessage('');
  }

  // --- Success State ---
  if (status === 'success' && result) {
    return (
      <div className="py-8 flex items-center justify-center min-h-[60vh]">
        <div className="w-full text-center">
          <div className="mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-900/40 mb-4">
              <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold text-gray-100 mb-2">
              Questions Generated
            </h1>
            <p className="text-gray-400 text-lg">
              <span className="font-medium text-gray-200">{result.questionCount} questions</span> created from
            </p>
            <p className="text-gray-200 font-medium text-lg mt-1">
              &ldquo;{result.title}&rdquo;
            </p>
          </div>

          <p className="text-gray-500 text-sm mb-8">
            These questions are now in your review queue and ready to study.
          </p>

          <div className="flex flex-col gap-3">
            <a
              href="/study"
              className="block w-full py-3 px-6 bg-violet-600 text-white font-medium rounded-xl
                         hover:bg-violet-700 transition-colors text-center"
            >
              Study Now
            </a>
            <button
              onClick={handleReset}
              className="w-full py-3 px-6 bg-gray-800 text-gray-300 font-medium rounded-xl
                         border border-gray-700 hover:bg-gray-700 transition-colors"
            >
              Upload Another Document
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Form State (idle, loading, error) ---
  return (
    <div className="py-3 sm:py-6">
      {/* Header */}
      <div className="mb-3 sm:mb-6 text-center">
        <h1 className="text-2xl font-semibold text-[#EEFF99] mb-1">
          Upload Document
        </h1>
        <p className="text-gray-500">
          Paste text or upload a file — Memorium generates study questions automatically.
        </p>
      </div>

      {/* Form card */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 sm:p-6 space-y-3 sm:space-y-5">

        {/* File upload button — top, full width */}
        <div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={status === 'loading'}
            className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700
                       text-white font-medium rounded-xl py-2 sm:py-3 px-6 transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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

        {/* Title */}
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-300 mb-1">
            Title <span className="text-red-400">*</span>
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Meditations — Book 2"
            disabled={status === 'loading'}
            className="w-full px-4 py-3 rounded-xl border border-gray-700 bg-gray-800
                       text-gray-100 placeholder-gray-500
                       focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none
                       disabled:opacity-50 disabled:cursor-not-allowed text-base py-2 sm:py-3"
          />
        </div>

        {/* Themes */}
        <div>
          <label htmlFor="themes" className="block text-sm font-medium text-gray-300 mb-1">
            Themes <span className="text-gray-500 font-normal">(optional)</span>
          </label>
          <input
            id="themes"
            type="text"
            value={themes}
            onChange={(e) => setThemes(e.target.value)}
            placeholder="e.g., Philosophy, Stoicism, Self-Reflection"
            disabled={status === 'loading'}
            className="w-full px-4 py-3 rounded-xl border border-gray-700 bg-gray-800
                       text-gray-100 placeholder-gray-500
                       focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none
                       disabled:opacity-50 disabled:cursor-not-allowed text-base py-2 sm:py-3"
          />
        </div>

        {/* Content textarea with drag-and-drop */}
        <div>
          <label htmlFor="content" className="block text-sm font-medium text-gray-300 mb-1">
            Content <span className="text-red-400">*</span>
          </label>
          <div
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className={`relative rounded-xl transition-colors ${
              isDragging ? 'ring-2 ring-violet-500' : ''
            }`}
          >
            {/* Drop overlay */}
            {isDragging && (
              <div className="absolute inset-0 z-10 rounded-xl bg-gray-800/90 border-2 border-dashed border-violet-500
                              flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <svg className="w-8 h-8 text-violet-400 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  <p className="text-gray-300 font-medium text-sm">Drop .txt or .md file</p>
                </div>
              </div>
            )}
            <textarea
              id="content"
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                if (status === 'error') {
                  setStatus('idle');
                  setErrorMessage('');
                }
              }}
              placeholder="Paste the text you want to learn from — a book chapter, article, podcast transcript, notes...

Or drag and drop a .txt / .md file here."
              disabled={status === 'loading'}
              className="w-full px-4 py-3 rounded-xl border border-gray-700 bg-gray-800
                         text-gray-100 placeholder-gray-500
                         focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none
                         disabled:opacity-50 disabled:cursor-not-allowed
                         resize-y text-base leading-relaxed min-h-[80px] sm:min-h-[150px]"
            />
          </div>

          {/* Character count */}
          <div className="mt-1.5 flex items-center gap-1 text-sm">
            <span
              className={
                charCount === 0
                  ? 'text-gray-500'
                  : charCount < MIN_CHARS
                    ? 'text-amber-400'
                    : charCount > MAX_CHARS
                      ? 'text-red-400'
                      : 'text-gray-500'
              }
            >
              {charCount.toLocaleString()} / {MAX_CHARS.toLocaleString()} characters
            </span>
            {charCount > 0 && charCount < MIN_CHARS && (
              <span className="text-amber-400">— need at least {MIN_CHARS}</span>
            )}
            {charCount > MAX_CHARS && (
              <span className="text-red-400">— too long</span>
            )}
          </div>
        </div>

        {/* Short content warning */}
        {charCount >= MIN_CHARS && charCount < 500 && (
          <div className="px-4 py-3 rounded-xl bg-amber-900/30 border border-amber-700/50">
            <p className="text-amber-300 text-sm">
              Content seems short — questions work best with 500+ characters of substantive text.
            </p>
          </div>
        )}

        {/* Error message */}
        {status === 'error' && errorMessage && (
          <div className="px-4 py-3 rounded-xl bg-red-900/30 border border-red-700/50">
            <p className="text-red-300 text-sm">{errorMessage}</p>
          </div>
        )}

        {/* Submit button */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full py-2 sm:py-3 px-6 rounded-xl font-medium text-base transition-colors
                     disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed
                     bg-violet-600 text-white hover:bg-violet-700"
        >
          {status === 'loading' ? (
            <span className="inline-flex items-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Generating Questions…
            </span>
          ) : (
            'Generate Questions'
          )}
        </button>

        {status === 'loading' && (
          <p className="text-center text-gray-500 text-sm">
            This usually takes 5–15 seconds.
          </p>
        )}

      </div>
    </div>
  );
}
