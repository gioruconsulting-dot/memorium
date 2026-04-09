'use client';

import { useState, useEffect, useRef } from 'react';
import CelebrationScene from '@/components/CelebrationScene';

// ── motivational messages ─────────────────────────────────────────────────────

const MOTIVATIONAL_MESSAGES = [
  "The struggle is real. Your learning too.",
  "Feel those neural pathways being built right now.",
  "Rome wasn't memorized in a day.",
  "What doesn't kill you makes your memory stronger.",
  "Your hippocampus just sent a thank-you note.",
  "Forgetting is just your brain asking for a second date.",
  "Neurons that fire together, wire together. You're wiring and firing.",
  "Somewhere, Ebbinghaus is smiling.",
  "Plot twist: the hard ones teach you the most.",
  "Your future self will remember this. Literally.",
  "Spaced repetition: old science, spectacular results.",
  "Every rep is a deposit in your memory bank.",
  "Knowledge compounds. Warren Buffett said that. Probably.",
  "You're not studying. You're stress-testing your future memory.",
  "Spaced repetition doesn't care if you believe in it. It just cooks.",
  "One does not simply remember without repetition.",
  "Your brain is doing push-ups right now.",
  "Recall is a muscle. This is the gym.",
  "The algorithm remembers so you don't have to. Wait—",
  "Fun fact: struggling with recall is literally how memory works.",
  "Repetitio est mater studiorum. That's why we're here.",
  "Know that you know nothing. But less nothing than yesterday. — Socrates…ish",
  "Fall seven times, recall eight. — Japanese proverb…ish",
  "If you're going through hard questions, keep going. — Churchill…ish",
  "Do not dwell on what you forgot. Focus on what you'll remember next. — Buddha…ish",
];

function pickMessage(shownSet) {
  const available = MOTIVATIONAL_MESSAGES.map((_, i) => i).filter(i => !shownSet.has(i));
  const pool = available.length > 0 ? available : MOTIVATIONAL_MESSAGES.map((_, i) => i);
  if (available.length === 0) shownSet.clear();
  const pick = pool[Math.floor(Math.random() * pool.length)];
  shownSet.add(pick);
  return MOTIVATIONAL_MESSAGES[pick];
}

// ── helpers ──────────────────────────────────────────────────────────────────

function timeEstimate(count) {
  const mins = Math.max(1, Math.round(count * 40 / 60));
  return `${mins} minute${mins !== 1 ? 's' : ''}`;
}

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}


// ── completion headline ───────────────────────────────────────────────────────

function pickHeadline(streak, correctCount, incorrectCount) {
  const s = streak ?? 0;

  // Post-30 message pool (takes streak for interpolation)
  function post30Pool(n) {
    const w = Math.floor(n / 7);
    return [
      `Week ${w}. The compound effect is real.`,
      `${n} days. This is no longer a streak — it's just who you are.`,
      `${n} days of showing up. Discipline looks good on you.`,
      `${n} days. Your brain thanks you, even if it doesn't say it.`,
      `Week ${w}. Most apps get abandoned by now. Not this one.`,
      `${n} days and counting. You're built different.`,
    ];
  }
  function randFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  // Priority 1: Anticipation (day before milestone)
  if (s === 6)  return "One more day and it's a full week. Don't break the chain.";
  if (s === 13) return "Tomorrow makes two weeks. You know what to do.";
  if (s === 20) return "One day from 21. The magic number. See you tomorrow.";
  if (s === 29) return "29 days. Tomorrow you hit 30. Don't you dare skip.";
  if (s > 30 && (s + 1) % 7 === 0) return `One more day to week ${Math.floor((s + 1) / 7)}. You got this.`;

  // Priority 2: Milestone (exact day)
  if (s === 1)  return "Day 1 is always the most important day. Well done, now let's get going.";
  if (s === 2)  return "Day 2: coming back is as important as starting. Can you make it to 3?";
  if (s === 3)  return "3 days in a row! Now we are talking. A habit is forming.";
  if (s === 7)  return "One week streak! Consistency is the key.";
  if (s === 14) return "Two weeks straight! Most people quit by now, but not you. Keep going!";
  if (s === 21) return "21 days. They say that's when habits lock in... Just saying.";
  if (s === 30) return "30-day streak! You're elite now!";
  if (s > 30 && s % 7 === 0) return randFrom(post30Pool(s));

  // Priority 3: Post-30, 60% chance
  if (s > 30 && Math.random() < 0.6) return randFrom(post30Pool(s));

  // Priority 4: Performance-based
  const total = correctCount + incorrectCount;
  const accuracy = total > 0 ? correctCount / total : 1;

  if (incorrectCount === 0) {
    return randFrom([
      "Flawless. A true master.",
      "Zero forgotten. Your memory is a vault today.",
      "Clean sweep. Every single one recalled.",
      "Nothing lost. That's the compound effect of showing up.",
    ]);
  }
  if (accuracy > 0.8) {
    return randFrom([
      "The reps are paying off.",
      "Strong session. Your future self just got smarter.",
      "An inch away from perfection. Keep it up.",
      "Very solid. Give yourself a round of applause.",
    ]);
  }
  if (accuracy >= 0.6) {
    return randFrom([
      "Every struggle builds strength.",
      "This is what this app is for. Showing you what to repeat.",
      "The ones you missed? Something you'll remember and learn.",
      "These sessions are where the growth happens.",
    ]);
  }
  return randFrom([
    "Hard day. But you showed up, and that's what matters.",
    "Rough round — every forgotten answer is a future remembered one.",
    "The struggle is the process. You just did the hardest part.",
    "Tough day. Come back and you'll see progress.",
  ]);
}

// ── sub-components ────────────────────────────────────────────────────────────

function ProgressBar({ current, total }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="mb-3 sm:mb-6">
      <div className="flex justify-between text-sm mb-1.5" style={{ color: 'var(--color-muted)' }}>
        <span>Question {current + 1} of {total}</span>
        <span style={{ color: '#4ADE80' }}>{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full" style={{ background: 'var(--color-border)' }}>
        <div
          className="h-1.5 rounded-full transition-all duration-300"
          style={{ width: `${pct}%`, background: '#4ADE80' }}
        />
      </div>
    </div>
  );
}

function GradeButton({ label, sublabel, onClick, bgClass, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 flex flex-col items-center justify-center py-3 sm:py-5 px-2 rounded-xl font-medium text-white transition-all active:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed ${bgClass}`}
      style={{ minHeight: '48px' }}
    >
      <span className="text-base sm:text-lg leading-tight">{label}</span>
      {sublabel && <span className="text-xs mt-0.5 opacity-70 hidden sm:block">{sublabel}</span>}
    </button>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function StudyPage() {
  const [phase, setPhase] = useState('loading'); // loading | picker | empty | studying | complete | error
  const [dueCount, setDueCount] = useState(0);
  const [sessionId, setSessionId] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [userAttempt, setUserAttempt] = useState('');
  const [summary, setSummary] = useState(null);
  const [endedEarly, setEndedEarly] = useState(false);
  const [gradeHistory, setGradeHistory] = useState([]); // [{ question, grade }]
  const [forgotCount, setForgotCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [grading, setGrading] = useState(false);
  const [fading, setFading] = useState(false);
  const [retireConfirm, setRetireConfirm] = useState(false);
  const [retiring, setRetiring] = useState(false);
  const [isHeroic, setIsHeroic] = useState(false);
  const [motivationalMsg, setMotivationalMsg] = useState(null);
  const [reviewExpanded, setReviewExpanded] = useState(false);
  const textareaRef = useRef(null);
  const cardRef = useRef(null);
  const shownMsgsRef = useRef(new Set());
  const recentGradesRef = useRef([]);
  const pendingAdvanceRef = useRef(null);
  const msgTimerRef = useRef(null);

  // On mount: fetch due count only, then show picker
  useEffect(() => {
    fetchDueCount();
  }, []);

  useEffect(() => {
    if (phase === 'studying' && !revealed) {
      window.scrollTo(0, 0);
      textareaRef.current?.focus();
    }
  }, [phase, index, revealed]);

  useEffect(() => {
    if (phase !== 'farewell') return;
    const timer = setTimeout(() => { window.location.href = '/'; }, 2000);
    return () => clearTimeout(timer);
  }, [phase]);


  async function fetchDueCount() {
    setPhase('loading');
    setErrorMsg('');
    try {
      const res = await fetch('/api/questions/session');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setDueCount(data.dueCount);
      setPhase(data.dueCount === 0 ? 'empty' : 'picker');
    } catch (err) {
      setErrorMsg(err.message);
      setPhase('error');
    }
  }

  async function startSession(limit) {
    setPhase('loading');
    setErrorMsg('');
    setForgotCount(0);
    setGradeHistory([]);
    setEndedEarly(false);
    setShowDetail(false);
    setIsHeroic(limit === null);
    setMotivationalMsg(null);
    shownMsgsRef.current.clear();
    recentGradesRef.current = [];
    clearTimeout(msgTimerRef.current);
    pendingAdvanceRef.current = null;
    try {
      const res = await fetch('/api/sessions/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: limit ?? null }),
      });
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

    const newForgotCount = forgotCount + (grade === 'forgot' ? 1 : 0);
    const totalAnswered = index + 1;
    const isLast = index === questions.length - 1;
    const earlyEnd = newForgotCount >= 3 && totalAnswered >= 10;

    // Update rolling window of last 4 grades
    const newRecentGrades = [...recentGradesRef.current, grade].slice(-4);
    recentGradesRef.current = newRecentGrades;

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

      setForgotCount(newForgotCount);
      setGradeHistory((prev) => [...prev, { question, grade }]);

      // Decide whether to show a motivational message
      const forgotInWindow = newRecentGrades.filter(g => g === 'forgot').length;
      const isStruggling = forgotInWindow >= 2;
      const noMsgYet = shownMsgsRef.current.size === 0;
      const showMsg = !isLast && !earlyEnd && grade !== 'skipped' && (
        // Guarantee: at least one message after Q10 if none shown yet
        (noMsgYet && totalAnswered >= 10) ||
        // Normal chance: Hard/Forgot after Q5
        ((grade === 'hard' || grade === 'forgot')
          && totalAnswered >= 5
          && Math.random() < (isStruggling ? 0.5 : 0.25))
      );

      // Fade out current screen
      setFading(true);
      await new Promise((r) => setTimeout(r, 200));

      if (isLast || earlyEnd) {
        if (earlyEnd && !isLast) setEndedEarly(true);
        await completeSession();
      } else if (showMsg) {
        // Show message, then advance after 2s or tap
        const msg = pickMessage(shownMsgsRef.current);
        const doAdvance = async () => {
          setFading(true);
          await new Promise((r) => setTimeout(r, 200));
          setMotivationalMsg(null);
          setIndex((i) => i + 1);
          setRevealed(false);
          setShowDetail(false);
          setUserAttempt('');
          setRetireConfirm(false);
          setFading(false);
        };
        pendingAdvanceRef.current = doAdvance;
        setMotivationalMsg(msg);
        setFading(false);
        msgTimerRef.current = setTimeout(() => {
          pendingAdvanceRef.current?.();
          pendingAdvanceRef.current = null;
        }, 10000);
      } else {
        setIndex((i) => i + 1);
        setRevealed(false);
        setShowDetail(false);
        setUserAttempt('');
        setRetireConfirm(false);
        setFading(false);
      }
    } catch (err) {
      setErrorMsg(err.message);
      setPhase('error');
    } finally {
      setGrading(false);
    }
  }

  function handleMsgTap() {
    clearTimeout(msgTimerRef.current);
    pendingAdvanceRef.current?.();
    pendingAdvanceRef.current = null;
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

  async function handleRetire() {
    if (retiring) return;
    setRetiring(true);
    const question = questions[index];
    try {
      const res = await fetch('/api/questions/retire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: question.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove question');

      setFading(true);
      await new Promise((r) => setTimeout(r, 200));

      const remaining = questions.filter((_, i) => i !== index);
      if (remaining.length === 0) {
        await completeSession();
      } else {
        setQuestions(remaining);
        if (index >= remaining.length) setIndex(remaining.length - 1);
        setRevealed(false);
        setShowDetail(false);
        setUserAttempt('');
        setRetireConfirm(false);
        setFading(false);
      }
    } catch (err) {
      setErrorMsg(err.message);
      setPhase('error');
    } finally {
      setRetiring(false);
    }
  }

  // ── render states ───────────────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="text-center" style={{ color: 'var(--color-muted)' }}>
          <div className="inline-block w-8 h-8 border-2 rounded-full animate-spin mb-4"
            style={{ borderColor: 'var(--color-border)', borderTopColor: '#4ADE80' }} />
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
    const headline = pickHeadline(summary.currentStreak, remembered, summary.incorrectCount);
    const toRevisit = gradeHistory.filter(({ grade }) => grade === 'hard' || grade === 'forgot');
    const hasMore = summary.remainingDueCount > 0;
    return (
      <>
        <style suppressHydrationWarning>{`
          @keyframes completeReveal { from { opacity: 0; } to { opacity: 1; } }
        `}</style>
        <div className="min-h-dvh py-8 px-4">
          <div className="w-full max-w-sm mx-auto">

            {/* Progress bar at 100% — visible immediately during the 0.3s pause */}
            <div className="mb-2">
              <div className="flex justify-between text-sm mb-1.5" style={{ color: 'var(--color-muted)' }}>
                <span>Session complete</span>
                <span style={{ color: '#4ADE80' }}>100%</span>
              </div>
              <div className="h-1.5 rounded-full" style={{ background: 'var(--color-border)' }}>
                <div className="h-1.5 rounded-full" style={{ width: '100%', background: '#4ADE80' }} />
              </div>
            </div>

            {/* Celebration scene — fades in at 0.3s */}
            <div style={{ animation: 'completeReveal 0.3s ease 0.3s both' }}>
              <CelebrationScene />
            </div>

            {/* Headline — fades in at 0.5s */}
            <div className="text-center mb-6 px-2" style={{ animation: 'completeReveal 0.3s ease 0.5s both' }}>
              <p className="font-semibold leading-snug" style={{
                color: '#EEFF99',
                fontSize: 'clamp(1.15rem, 5vw, 1.4rem)',
              }}>
                {headline}
              </p>
              {endedEarly && (
                <p className="mt-2 text-sm" style={{ color: 'var(--color-muted)' }}>
                  Session ended early — take a break, you'll see these again tomorrow.
                </p>
              )}
            </div>

            {/* Stats row — fades in at 0.6s */}
            <p className="text-center text-sm mb-6" style={{
              color: 'var(--color-muted)',
              animation: 'completeReveal 0.2s ease 0.6s both',
            }}>
              {summary.questionsAnswered} reviewed · {remembered} recalled · {Math.max(1, Math.round(summary.durationSeconds / 60))} min
            </p>

            {/* Review section + CTAs — fade in together at 0.7s */}
            <div style={{ animation: 'completeReveal 0.3s ease 0.7s both' }}>

              {/* Review before you go */}
              {toRevisit.length > 0 && (
                <div className="mb-5 rounded-2xl overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
                  <button
                    onClick={() => setReviewExpanded(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium"
                    style={{ background: 'var(--color-surface)', color: 'var(--color-foreground)' }}
                  >
                    <span>{toRevisit.length} question{toRevisit.length !== 1 ? 's' : ''} to revisit</span>
                    <span style={{ color: 'var(--color-muted)' }}>{reviewExpanded ? '▲' : '▼'}</span>
                  </button>
                  {reviewExpanded && (
                    <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
                      {toRevisit.map(({ question }) => (
                        <div
                          key={question.id}
                          className="px-4 py-3"
                          style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
                        >
                          <p className="text-xs leading-snug mb-1" style={{ color: 'var(--color-foreground)' }}>
                            {question.question_text}
                          </p>
                          <p className="text-xs leading-snug" style={{ color: 'var(--color-muted)' }}>
                            {question.answer_text}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* CTAs */}
              <div className="space-y-3 pb-8">
                <a
                  href={hasMore ? '/study' : '/progress'}
                  className="block w-full py-3.5 rounded-xl font-medium text-center text-white"
                  style={{ background: '#7c3aed' }}
                >
                  {hasMore ? 'Keep going' : 'See your progress'}
                </a>
                <a
                  href={hasMore ? '/progress' : '/upload'}
                  className="block w-full py-3.5 rounded-xl font-medium text-center text-white"
                  style={{ background: 'var(--color-accent)' }}
                >
                  {hasMore ? 'See your progress' : 'Upload new material'}
                </a>
                <button
                  onClick={() => setPhase('farewell')}
                  className="w-full py-3.5 rounded-xl font-medium text-center"
                  style={{ background: 'transparent', border: '1px solid #4b5563', color: 'var(--color-foreground)' }}
                >
                  Done for today
                </button>
              </div>

            </div>
          </div>
        </div>
      </>
    );
  }

  // ── farewell screen ─────────────────────────────────────────────────────────

  if (phase === 'farewell') {
    return (
      <>
        <style suppressHydrationWarning>{`
          @keyframes farewellFadeIn { from { opacity: 0; } to { opacity: 1; } }
        `}</style>
        <div
          onClick={() => { window.location.href = '/'; }}
          style={{
            position: 'fixed', inset: 0,
            background: '#000',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            animation: 'farewellFadeIn 2s ease forwards',
            cursor: 'pointer',
            zIndex: 50,
          }}
        >
          <div className="text-7xl mb-5">🐊</div>
          <p className="font-semibold text-center px-8" style={{
            color: '#EEFF99',
            fontSize: 'clamp(1.3rem, 6vw, 1.7rem)',
            lineHeight: 1.3,
          }}>
            See you lateeeer, alligator
          </p>
        </div>
      </>
    );
  }

  // ── picker phase ────────────────────────────────────────────────────────────

  if (phase === 'picker') {
    const totalTime = timeEstimate(dueCount);
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">

          {/* Header */}
          <div className="text-center mb-8">
            <div className="text-[1.6rem] font-bold text-[#EEFF99] leading-tight">
              <p>{dueCount} question{dueCount !== 1 ? 's' : ''} due</p>
              <p className="mt-0.5">{totalTime} total</p>
            </div>
          </div>

          {/* Buttons */}
          <div className="space-y-3">
            {dueCount <= 5 ? (
              /* 1–5: single "Review all" button */
              <button
                onClick={() => startSession(dueCount)}
                className="w-full py-4 px-6 rounded-xl font-semibold text-white bg-violet-600 hover:bg-violet-700 transition-colors flex flex-col items-center gap-0.5"
              >
                <span className="text-[1.1rem] font-bold">Review all</span>
                <span className="text-[0.95rem] font-normal">{dueCount} question{dueCount !== 1 ? 's' : ''} | {totalTime}</span>
              </button>
            ) : (
              <>
                {/* Quick session — always shown for 6+ */}
                <button
                  onClick={() => startSession(5)}
                  className="w-full py-4 px-6 rounded-xl font-semibold transition-colors flex flex-col items-center gap-0.5"
                  style={{
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-foreground)',
                    background: 'transparent',
                  }}
                >
                  <span className="text-[1.1rem] font-bold">Quick Session</span>
                  <span className="text-[0.95rem] font-normal">5 questions | {timeEstimate(5)}</span>
                </button>

                {/* Normal session — always shown for 6+ */}
                <button
                  onClick={() => startSession(15)}
                  className="w-full py-4 px-6 rounded-xl font-semibold text-white bg-violet-600 hover:bg-violet-700 transition-colors flex flex-col items-center gap-0.5"
                >
                  <span className="text-[1.1rem] font-bold">Normal Session</span>
                  <span className="text-[0.95rem] font-normal">15 questions | {timeEstimate(15)}</span>
                </button>

                {/* Heroic — only shown for 15+ */}
                {dueCount >= 15 && (
                  <button
                    onClick={() => startSession(null)}
                    className="w-full py-4 px-6 rounded-xl font-semibold text-white transition-colors flex flex-col items-center gap-0.5"
                    style={{ background: '#ea580c' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#c2410c'}
                    onMouseLeave={e => e.currentTarget.style.background = '#ea580c'}
                  >
                    <span className="text-[1.1rem] font-bold">🔥 Heroic Session</span>
                    <span className="text-[0.95rem] font-normal">as many as you can handle</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── studying phase ──────────────────────────────────────────────────────────

  const question = questions[index];
  const canReveal = wordCount(userAttempt) >= 3;

  // ── MOTIVATIONAL MESSAGE ────────────────────────────────────────────────────
  if (motivationalMsg) {
    return (
      <div
        className="h-dvh flex flex-col items-center justify-center px-6 transition-opacity duration-200"
        style={{ opacity: fading ? 0 : 1 }}
        onClick={handleMsgTap}
      >
        <div className="w-full max-w-sm text-center relative">
          {/* Outer glow ring */}
          <div style={{
            position: 'absolute', inset: '-3px', borderRadius: '1.75rem',
            background: 'linear-gradient(135deg, #EEFF99, #7c3aed, #60A5FA, #EEFF99)',
            padding: '2px',
            zIndex: 0,
          }} />
          {/* Card */}
          <div className="relative z-10 rounded-[1.625rem] px-6 py-8" style={{
            background: 'var(--color-background)',
            boxShadow: '0 0 40px rgba(238,255,153,0.15), 0 0 80px rgba(124,58,237,0.15)',
          }}>
            <p className="font-bold leading-snug" style={{
              fontSize: 'clamp(1.2rem, 5vw, 1.6rem)',
              color: '#EEFF99',
              textShadow: '0 0 24px rgba(238,255,153,0.5)',
              letterSpacing: '-0.01em',
            }}>
              {motivationalMsg}
            </p>
          </div>
        </div>
        <p className="mt-8 text-sm" style={{ color: 'var(--color-muted)' }}>tap to continue</p>
      </div>
    );
  }

  // ── PRE-REVEAL: everything fits in one screen, no scrolling needed ──────────
  if (!revealed) {
    return (
      <div
        className="h-dvh flex flex-col px-4 transition-opacity duration-200"
        style={{ opacity: fading ? 0 : 1 }}
      >
        <div className="w-full max-w-xl mx-auto flex flex-col flex-1 min-h-0">

          {/* Top: progress bar + question */}
          <div className="shrink-0 pt-3 space-y-3">
            <ProgressBar current={index} total={questions.length} />

            {index === 0 && (
              <p className="text-base text-center text-green-400">
                {isHeroic ? 'Ready. Set. Go. Be Heroic' : `🔒 ${questions.length} questions. No other choice. Complete.`}
              </p>
            )}

            <div
              ref={cardRef}
              className="rounded-2xl p-3 sm:p-5"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
            >
              <div className="text-xs uppercase tracking-wider text-gray-500 mb-2">
                {question.question_type}
              </div>
              <p className="text-base sm:text-xl font-semibold leading-snug">
                {question.question_text}
              </p>
            </div>
          </div>

          {/* Textarea + reveal button */}
          <div className="shrink-0 pb-6 space-y-3 mt-2">
            <textarea
              ref={textareaRef}
              value={userAttempt}
              onChange={(e) => setUserAttempt(e.target.value)}
              placeholder="Type your answer… (3+ words to unlock Reveal)"
              rows={4}
              className="w-full rounded-xl px-4 py-3 text-base leading-relaxed resize-none focus:outline-none"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-foreground)',
              }}
            />
            <button
              onClick={() => setRevealed(true)}
              disabled={!canReveal}
              className="w-full py-4 rounded-xl font-medium text-base transition-opacity disabled:opacity-40 disabled:cursor-not-allowed bg-violet-600 text-white hover:bg-violet-700"
            >
              Reveal Answer
            </button>
          </div>

        </div>
      </div>
    );
  }

  // ── POST-REVEAL: sticky header, answer content scrolls below ────────────────
  return (
    <div
      className="min-h-dvh px-4 transition-opacity duration-200"
      style={{ opacity: fading ? 0 : 1 }}
    >
      <div className="w-full max-w-xl mx-auto">

        {/* Sticky: progress bar + question card */}
        <div
          className="sticky top-0 z-10 pt-3 pb-2 space-y-3"
          style={{ background: 'var(--color-background)' }}
        >
          <ProgressBar current={index} total={questions.length} />

          <div
            ref={cardRef}
            className="rounded-2xl p-3 sm:p-5"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            <div className="text-xs uppercase tracking-wider text-gray-500 mb-2">
              {question.question_type}
            </div>
            <p className="text-sm sm:text-lg font-semibold leading-snug">
              {question.question_text}
            </p>
            <div className="flex justify-end mt-3">
              {!retireConfirm ? (
                <button
                  onClick={() => setRetireConfirm(true)}
                  disabled={grading || retiring}
                  className="flex items-center gap-1.5 text-sm transition-colors hover:text-red-400 disabled:opacity-40"
                  style={{ color: 'var(--color-muted)' }}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
                  </svg>
                  <span>Bad question</span>
                </button>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-xs" style={{ color: 'var(--color-muted)' }}>Remove this question?</span>
                  <button
                    onClick={handleRetire}
                    disabled={retiring}
                    className="text-xs px-3 py-1 rounded-lg transition-opacity disabled:opacity-40"
                    style={{ color: '#EF4444', border: '1px solid #EF4444' }}
                  >
                    {retiring ? 'Removing…' : 'Remove'}
                  </button>
                  <button
                    onClick={() => setRetireConfirm(false)}
                    disabled={retiring}
                    className="text-xs transition-colors hover:text-gray-300"
                    style={{ color: 'var(--color-muted)' }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Scrollable: answer content */}
        <div className="space-y-3 pt-3 pb-8">

          {userAttempt.trim() && (
            <div className="rounded-xl px-3 py-1.5 bg-gray-800/40">
              <div className="text-xs uppercase tracking-wider text-gray-500 mb-0.5">Your answer</div>
              <p className="text-sm text-gray-400 leading-snug">{userAttempt}</p>
            </div>
          )}

          <div>
            <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">Answer</div>
            <p className="text-base font-medium leading-snug">{question.answer_text}</p>
          </div>

          <div>
            <button
              onClick={() => setShowDetail((v) => !v)}
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-300 transition-colors"
            >
              <span>{showDetail ? 'Hide' : 'Show'} explanation & source</span>
              <svg
                className={`w-4 h-4 transition-transform duration-200 ${showDetail ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showDetail && (
              <div className="mt-3 space-y-3">
                <div>
                  <div className="text-xs uppercase tracking-wider text-gray-500 mb-1.5">Explanation</div>
                  <p className="text-sm text-gray-400 leading-relaxed">{question.explanation}</p>
                </div>
                {question.source_reference && (
                  <div>
                    <div className="text-xs uppercase tracking-wider text-gray-500 mb-1.5">Source</div>
                    <blockquote className="text-sm text-gray-400 leading-relaxed pl-3 italic border-l-2 border-gray-700">
                      {question.source_reference}
                    </blockquote>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <GradeButton
              label="Easy"
              sublabel="Knew it"
              onClick={() => handleGrade('easy')}
              bgClass="bg-green-400 hover:bg-green-300"
              disabled={grading}
            />
            <GradeButton
              label="Hard"
              sublabel="Struggled"
              onClick={() => handleGrade('hard')}
              bgClass="bg-amber-600 hover:bg-amber-700"
              disabled={grading}
            />
            <GradeButton
              label="Forgot"
              sublabel="Missed it"
              onClick={() => handleGrade('forgot')}
              bgClass="bg-red-600 hover:bg-red-700"
              disabled={grading}
            />
          </div>

          <button
            onClick={() => handleGrade('skipped')}
            disabled={grading}
            className="w-full py-2 rounded-xl text-sm font-medium transition-opacity disabled:opacity-40"
            style={{ color: 'var(--color-muted)', border: '1px solid var(--color-border)' }}
          >
            Skip
          </button>

          {isHeroic && index > 0 && (
            <button
              onClick={completeSession}
              disabled={grading}
              className="w-full py-2 rounded-xl text-sm font-medium transition-opacity disabled:opacity-40"
              style={{ color: '#EF4444', border: '1px solid #EF4444' }}
            >
              Stop the session
            </button>
          )}

        </div>
      </div>
    </div>
  );
}
