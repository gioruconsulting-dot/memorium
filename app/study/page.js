'use client';

import { useState, useEffect, useRef } from 'react';

// ── helpers ──────────────────────────────────────────────────────────────────

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function formatDuration(seconds) {
  if (!seconds || seconds < 60) return `${Math.max(0, Math.round(seconds))} seconds`;
  const m = Math.floor(seconds / 60);
  return `${m} minute${m !== 1 ? 's' : ''}`;
}

function truncate(text, max = 80) {
  if (!text || text.length <= max) return text;
  return text.slice(0, max).trimEnd() + '…';
}

const GRADE_STYLE = {
  easy:    { label: 'Easy',    color: 'var(--color-easy)' },
  hard:    { label: 'Hard',    color: 'var(--color-hard)' },
  forgot:  { label: 'Forgot',  color: 'var(--color-forgot)' },
  skipped: { label: 'Skipped', color: 'var(--color-muted)' },
};

// ── sub-components ────────────────────────────────────────────────────────────

function ProgressBar({ current, total }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="mb-6">
      <div className="flex justify-between text-sm mb-1.5" style={{ color: 'var(--color-muted)' }}>
        <span>Question {current + 1} of {total}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full" style={{ background: 'var(--color-border)' }}>
        <div
          className="h-1.5 rounded-full transition-all duration-300"
          style={{ width: `${pct}%`, background: 'var(--color-accent)' }}
        />
      </div>
    </div>
  );
}

function GradeButton({ label, sublabel, onClick, colorVar, bgVar, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex-1 flex flex-col items-center justify-center py-4 px-2 rounded-xl font-medium transition-opacity active:opacity-70 disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        background: `var(${bgVar})`,
        color: `var(${colorVar})`,
        minHeight: '64px',
      }}
    >
      <span className="text-base leading-tight">{label}</span>
      {sublabel && <span className="text-xs mt-0.5 opacity-70">{sublabel}</span>}
    </button>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function StudyPage() {
  const [phase, setPhase] = useState('loading'); // loading | empty | studying | complete | error
  const [sessionId, setSessionId] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [userAttempt, setUserAttempt] = useState('');
  const [summary, setSummary] = useState(null);
  const [endedEarly, setEndedEarly] = useState(false);
  const [gradeHistory, setGradeHistory] = useState([]); // [{ question, grade }]
  const [forgotCount, setForgotCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [grading, setGrading] = useState(false);
  const [fading, setFading] = useState(false);
  const textareaRef = useRef(null);

  useEffect(() => {
    startSession();
  }, []);

  useEffect(() => {
    if (phase === 'studying' && !revealed) {
      textareaRef.current?.focus();
    }
  }, [phase, index, revealed]);

  async function startSession() {
    setPhase('loading');
    setErrorMsg('');
    setForgotCount(0);
    setGradeHistory([]);
    setEndedEarly(false);
    try {
      const res = await fetch('/api/sessions/start', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start session');

      if (!data.sessionId || data.questions.length === 0) {
        setPhase('empty');
        return;
      }

      setSessionId(data.sessionId);
      setQuestions(data.questions);
      setIndex(0);
      setRevealed(false);
      setUserAttempt('');
      setPhase('studying');
    } catch (err) {
      setErrorMsg(err.message);
      setPhase('error');
    }
  }

  async function handleGrade(grade) {
    if (grading) return;
    setGrading(true);

    const question = questions[index];

    // Compute updated counters locally (React state is async)
    const newForgotCount = forgotCount + (grade === 'forgot' ? 1 : 0);
    const totalAnswered = index + 1; // after this question
    const isLast = index === questions.length - 1;
    const earlyEnd = newForgotCount >= 3 && totalAnswered >= 10;

    try {
      const res = await fetch('/api/questions/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: question.id,
          grade,
          userAttempt: userAttempt.trim() || null,
          sessionId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Grading failed');

      // Update tracked state
      setForgotCount(newForgotCount);
      setGradeHistory((prev) => [...prev, { question, grade }]);

      // Fade transition
      setFading(true);
      await new Promise((r) => setTimeout(r, 200));

      if (isLast || earlyEnd) {
        if (earlyEnd && !isLast) setEndedEarly(true);
        await completeSession();
      } else {
        setIndex((i) => i + 1);
        setRevealed(false);
        setUserAttempt('');
        setFading(false);
      }
    } catch (err) {
      setErrorMsg(err.message);
      setPhase('error');
    } finally {
      setGrading(false);
    }
  }

  async function completeSession() {
    try {
      const res = await fetch('/api/sessions/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to complete session');
      setSummary(data.summary);
      setFading(false);
      setPhase('complete');
    } catch (err) {
      setErrorMsg(err.message);
      setPhase('error');
    }
  }

  // ── render states ───────────────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="text-center" style={{ color: 'var(--color-muted)' }}>
          <div className="inline-block w-8 h-8 border-2 rounded-full animate-spin mb-4"
            style={{ borderColor: 'var(--color-border)', borderTopColor: 'var(--color-accent)' }} />
          <p>Loading your session…</p>
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="min-h-dvh flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <p className="mb-4" style={{ color: 'var(--color-forgot)' }}>{errorMsg}</p>
          <button
            onClick={startSession}
            className="px-6 py-3 rounded-lg font-medium"
            style={{ background: 'var(--color-foreground)', color: 'var(--color-background)' }}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'empty') {
    return (
      <div className="min-h-dvh flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-4">✓</div>
          <h1 className="text-xl font-semibold text-[#EEFF99] mb-2">All caught up!</h1>
          <p className="mb-6" style={{ color: 'var(--color-muted)' }}>
            No questions due right now. Check back tomorrow or add more content.
          </p>
          <a
            href="/upload"
            className="inline-block px-6 py-3 rounded-lg font-medium"
            style={{ background: 'var(--color-foreground)', color: 'var(--color-background)' }}
          >
            Upload More Content
          </a>
        </div>
      </div>
    );
  }

  if (phase === 'complete' && summary) {
    const remembered = summary.correctCount;
    const reinforced = summary.incorrectCount;
    const skipped = summary.skippedCount;
    return (
      <div className="min-h-dvh py-8 px-4">
        <div className="w-full max-w-sm mx-auto">
          <div className="text-center mb-6">
            <div className="text-4xl mb-3">{endedEarly ? '🧠' : '🎉'}</div>
            <h1 className="text-2xl font-semibold text-[#EEFF99] mb-2">Session Complete</h1>
            {endedEarly ? (
              <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
                Session ended early — take a break, you'll see these again tomorrow.
              </p>
            ) : null}
          </div>

          {/* Stats */}
          <div className="rounded-2xl p-5 mb-5 space-y-3"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <div className="flex justify-between">
              <span style={{ color: 'var(--color-muted)' }}>Questions reviewed</span>
              <span className="font-medium">{summary.questionsAnswered}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--color-easy)' }}>Remembered (Easy + Hard)</span>
              <span className="font-medium" style={{ color: 'var(--color-easy)' }}>{remembered}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--color-forgot)' }}>Reinforced (Forgot)</span>
              <span className="font-medium" style={{ color: 'var(--color-forgot)' }}>{reinforced}</span>
            </div>
            {skipped > 0 && (
              <div className="flex justify-between">
                <span style={{ color: 'var(--color-muted)' }}>Skipped</span>
                <span className="font-medium">{skipped}</span>
              </div>
            )}
            <div className="flex justify-between pt-2" style={{ borderTop: '1px solid var(--color-border)' }}>
              <span style={{ color: 'var(--color-muted)' }}>Duration</span>
              <span className="font-medium">{formatDuration(summary.durationSeconds)}</span>
            </div>
          </div>

          {/* Question summary table */}
          {gradeHistory.length > 0 && (
            <div className="rounded-2xl mb-5 overflow-hidden"
              style={{ border: '1px solid var(--color-border)' }}>
              {gradeHistory.map(({ question, grade }, i) => {
                const gs = GRADE_STYLE[grade] || GRADE_STYLE.skipped;
                return (
                  <div
                    key={question.id}
                    className="flex items-center justify-between px-4 py-3 gap-3"
                    style={{
                      background: i % 2 === 0 ? 'var(--color-surface)' : 'var(--color-surface-hover)',
                      borderTop: i > 0 ? '1px solid var(--color-border)' : 'none',
                    }}
                  >
                    <span className="text-sm leading-snug flex-1 min-w-0" style={{ color: 'var(--color-foreground)' }}>
                      {truncate(question.question_text)}
                    </span>
                    <span className="text-xs font-medium shrink-0" style={{ color: gs.color }}>
                      {gs.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <a
            href="/upload"
            className="block w-full py-3.5 rounded-xl font-medium text-center"
            style={{ background: 'var(--color-foreground)', color: 'var(--color-background)' }}
          >
            Upload More Content
          </a>
        </div>
      </div>
    );
  }

  // ── studying phase ──────────────────────────────────────────────────────────

  const question = questions[index];
  const canReveal = wordCount(userAttempt) >= 3;

  return (
    <div
      className="min-h-dvh py-6 px-4 transition-opacity duration-200"
      style={{ opacity: fading ? 0 : 1 }}
    >
      <div className="max-w-xl mx-auto">
        <ProgressBar current={index} total={questions.length} />

        {index === 0 && (
          <p className="text-xl text-center mb-4 text-green-400">
            🔒 {questions.length} questions. No other choice. Complete.
          </p>
        )}

        {/* Question card */}
        <div
          className="rounded-2xl p-5 mb-5"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          <div className="text-xs font-medium uppercase tracking-wide mb-3"
            style={{ color: 'var(--color-muted)' }}>
            {question.question_type}
          </div>
          <p className="text-lg leading-snug font-medium">{question.question_text}</p>
        </div>

        {/* Answer area */}
        {!revealed ? (
          <>
            <textarea
              ref={textareaRef}
              value={userAttempt}
              onChange={(e) => setUserAttempt(e.target.value)}
              placeholder="Type your answer… (3+ words to unlock Reveal)"
              rows={4}
              className="w-full rounded-xl px-4 py-3 mb-3 text-base leading-relaxed resize-none focus:outline-none"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-foreground)',
              }}
            />
            <button
              onClick={() => setRevealed(true)}
              disabled={!canReveal}
              className="w-full py-4 rounded-xl font-medium text-base transition-opacity disabled:opacity-40 disabled:cursor-not-allowed bg-violet-600 text-white"
            >
              Reveal Answer
            </button>
          </>
        ) : (
          <>
            {/* User's answer */}
            {userAttempt.trim() && (
              <div className="rounded-xl px-4 py-3 mb-4"
                style={{ background: 'var(--color-surface-hover)', border: '1px solid var(--color-border)' }}>
                <div className="text-xs font-medium uppercase tracking-wide mb-1.5"
                  style={{ color: 'var(--color-muted)' }}>Your answer</div>
                <p className="text-base leading-relaxed">{userAttempt}</p>
              </div>
            )}

            {/* Model answer */}
            <div className="rounded-xl p-4 mb-4"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <div className="text-xs font-medium uppercase tracking-wide mb-2"
                style={{ color: 'var(--color-accent)' }}>Answer</div>
              <p className="text-base leading-relaxed mb-3">{question.answer_text}</p>

              <div className="text-xs font-medium uppercase tracking-wide mb-1.5"
                style={{ color: 'var(--color-muted)' }}>Explanation</div>
              <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--color-muted)' }}>
                {question.explanation}
              </p>

              {question.source_reference && (
                <>
                  <div className="text-xs font-medium uppercase tracking-wide mb-1.5"
                    style={{ color: 'var(--color-muted)' }}>Source</div>
                  <blockquote
                    className="text-sm leading-relaxed pl-3 italic"
                    style={{
                      borderLeft: '2px solid var(--color-border)',
                      color: 'var(--color-muted)',
                    }}
                  >
                    {question.source_reference}
                  </blockquote>
                </>
              )}
            </div>

            {/* Grade buttons */}
            <div className="flex gap-2 mb-4">
              <GradeButton
                label="Easy"
                sublabel="Knew it"
                onClick={() => handleGrade('easy')}
                colorVar="--color-easy"
                bgVar="--color-easy-bg"
                disabled={grading}
              />
              <GradeButton
                label="Hard"
                sublabel="Struggled"
                onClick={() => handleGrade('hard')}
                colorVar="--color-hard"
                bgVar="--color-hard-bg"
                disabled={grading}
              />
              <GradeButton
                label="Forgot"
                sublabel="Missed it"
                onClick={() => handleGrade('forgot')}
                colorVar="--color-forgot"
                bgVar="--color-forgot-bg"
                disabled={grading}
              />
            </div>

            <button
              onClick={() => handleGrade('skipped')}
              disabled={grading}
              className="w-full py-3 rounded-xl text-sm font-medium transition-opacity disabled:opacity-40"
              style={{ color: 'var(--color-muted)', border: '1px solid var(--color-border)' }}
            >
              Skip
            </button>
          </>
        )}
      </div>
    </div>
  );
}
