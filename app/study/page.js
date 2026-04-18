'use client';

import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import CelebrationScene from '@/components/CelebrationScene';
import StarryBackground from '@/components/StarryBackground';

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

// Semi-transparent tinted grade buttons with press feedback
function GradeButton({ label, sublabel, onClick, colorRgb, disabled }) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      onTouchStart={() => setPressed(true)}
      onTouchEnd={() => setPressed(false)}
      className="flex-1 flex flex-col items-center justify-center rounded-xl font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        minHeight:  '56px',
        padding:    '12px 8px',
        background: pressed ? `rgba(${colorRgb}, 0.22)` : `rgba(${colorRgb}, 0.1)`,
        color:      `rgb(${colorRgb})`,
        border:     `1px solid rgba(${colorRgb}, 0.28)`,
        transition: 'background 0.1s ease',
      }}
    >
      <span style={{ fontSize: '1rem', lineHeight: 1.2 }}>{label}</span>
      {sublabel && <span className="hidden sm:block" style={{ fontSize: '0.75rem', marginTop: '2px', opacity: 0.7 }}>{sublabel}</span>}
    </button>
  );
}

// ── farewell sub-component ────────────────────────────────────────────────────

const FAREWELL_STAR_PALETTE = [
  '#FF1F8E', '#FF6EB4', '#3B82F6', '#60C8FF',
  '#8B5CF6', '#C084FC', '#22C55E', '#4ADE80',
  '#EEF200', '#FFE066', '#FF6B35', '#ffffff',
];

function generateFarewellStars() {
  return Array.from({ length: 45 }, (_, id) => ({
    id,
    x:        Math.random() * 100,
    y:        Math.random() * 100,
    size:     Math.random() < 0.2 ? 2 : 1,
    color:    FAREWELL_STAR_PALETTE[Math.floor(Math.random() * FAREWELL_STAR_PALETTE.length)],
    duration: 2 + Math.random() * 3,
    delay:    Math.random() * 5,
  }));
}

// ── insight helpers ───────────────────────────────────────────────────────────

function computeMasteryMilestone(masteryGained, documentStats) {
  for (const [docId, gained] of Object.entries(masteryGained)) {
    const stats = documentStats[docId];
    if (!stats || stats.total === 0) continue;
    const prePct = stats.mastered / stats.total;
    const postPct = (stats.mastered + gained) / stats.total;
    for (const threshold of [1.0, 0.75, 0.5, 0.25]) {
      if (prePct < threshold && postPct >= threshold) {
        return { docTitle: stats.title, pct: Math.round(postPct * 100) };
      }
    }
  }
  return null;
}

function computeInsightMessage(insightData, documentStats) {
  function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  const tiers = {};

  // Tier 1 — Recovery Story
  if (insightData.recovered.length > 0) {
    const title = insightData.recovered[0].docTitle || 'This topic';
    tiers[1] = rand([
      `${title} — you'd forgotten this one many times before. Not today.`,
      `Remember when ${title} kept tripping you up? You just recalled it.`,
      `${title}: from "not a clue" to "easy". That's what showing up does.`,
    ]);
  }

  // Tier 2 — Interval Growth
  if (insightData.intervalGrowthCount > 0) {
    const n = insightData.intervalGrowthCount;
    const title = insightData.intervalGrowthDocTitle || 'Your questions';
    tiers[2] = rand([
      `${n} question${n !== 1 ? 's' : ''} just landed on longer intervals. Your brain is holding this info for longer!`,
      `The algorithm just pushed ${n} question${n !== 1 ? 's' : ''} further out. You're starting to master these things.`,
      `${title}: ${n} question${n !== 1 ? 's' : ''} are now on 2-week+ intervals. That's what remembering looks like.`,
    ]);
  }

  // Tier 3 — Mastery Milestone
  const milestone = computeMasteryMilestone(insightData.masteryGained, documentStats);
  if (milestone) {
    const { docTitle, pct } = milestone;
    if (pct === 100) {
      tiers[3] = `${docTitle}: fully mastered. Every single question. 🏆`;
    } else if (pct >= 50 && pct < 75) {
      tiers[3] = `Half of ${docTitle} is now in your long-term memory. Halfway there.`;
    } else {
      tiers[3] = `${docTitle}: ${pct}% mastered. That knowledge is sticking around.`;
    }
  }

  // Tier 4 — Fallback (always available)
  const n = insightData.totalAnswered;
  tiers[4] = rand([
    `${n} question${n !== 1 ? 's' : ''} reinforced. Every rep counts, even the quiet sessions.`,
    `Another session banked. Consistency beats intensity — always.`,
    `${n} answer${n !== 1 ? 's' : ''} today. Your future self will thank you for this one.`,
  ]);

  // Rotation: walk 1→4, pick first available that isn't lastTier
  const available = [1, 2, 3, 4].filter(t => tiers[t] !== undefined);
  const lastTier = parseInt(localStorage.getItem('lastInsightTier') || '0');
  let selected = available.find(t => t !== lastTier) ?? available[0];
  localStorage.setItem('lastInsightTier', String(selected));

  return tiers[selected];
}

// ── farewell screen ───────────────────────────────────────────────────────────

function FarewellScreen({ insightData, documentStats }) {
  const [stars, setStars] = useState([]);
  const [mounted, setMounted] = useState(false);
  const [insightMsg, setInsightMsg] = useState('');

  useEffect(() => {
    setStars(generateFarewellStars());
    setMounted(true);
    setInsightMsg(computeInsightMessage(insightData, documentStats));
  }, []);

  return (
    <>
      <style suppressHydrationWarning>{`
        @keyframes farewellFadeIn  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes farewellGatorIn {
          from { opacity: 0; transform: scale(0.8); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes farewellTwinkle {
          0%, 100% { opacity: 0.15; }
          50%       { opacity: 0.9; }
        }
      `}</style>
      <div
        onClick={() => { window.location.href = '/'; }}
        style={{
          position:      'fixed',
          inset:         0,
          background:    '#121210',
          display:       'flex',
          flexDirection: 'column',
          alignItems:    'center',
          justifyContent:'center',
          cursor:        'pointer',
          zIndex:        50,
          overflow:      'hidden',
        }}
      >
        {/* Stars — behind everything */}
        {mounted && stars.map(s => (
          <div key={s.id} style={{
            position:      'absolute',
            left:          `${s.x}%`,
            top:           `${s.y}%`,
            width:         `${s.size}px`,
            height:        `${s.size}px`,
            borderRadius:  '50%',
            background:    s.color,
            pointerEvents: 'none',
            zIndex:        0,
            animation:     `farewellTwinkle ${s.duration}s ${s.delay}s ease-in-out infinite`,
          }} />
        ))}

        {/* Alligator image — 25% smaller than before */}
        <img
          src="/alligator.png"
          alt=""
          style={{
            width:        'clamp(240px, 66vw, 480px)',
            height:       'auto',
            display:      'block',
            marginBottom: '20px',
            position:     'relative',
            zIndex:       1,
            animation:    'farewellGatorIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both',
          }}
        />

        {/* Insight message */}
        {insightMsg && (
          <p
            style={{
              color:        '#EEFF99',
              fontSize:     'clamp(1.1rem, 5vw, 1.35rem)',
              fontWeight:   600,
              textAlign:    'center',
              lineHeight:   1.5,
              maxWidth:     '300px',
              marginBottom: '20px',
              position:     'relative',
              zIndex:       1,
              animation:    'farewellFadeIn 0.5s ease 0.15s both',
            }}
          >
            {insightMsg}
          </p>
        )}

        {/* See you lateeeer */}
        <p
          className="font-semibold text-center px-8"
          style={{
            color:      '#ffffff',
            fontSize:   'clamp(1.2rem, 5.5vw, 1.55rem)',
            lineHeight: 1.3,
            position:   'relative',
            zIndex:     1,
            animation:  'farewellFadeIn 0.5s ease 0.3s both',
          }}
        >
          See you lateeeer, alligator
        </p>

        {/* Tap to close hint */}
        <p
          style={{
            position:  'absolute',
            bottom:    '28px',
            fontSize:  '12px',
            opacity:   0.5,
            color:     'var(--color-muted)',
            zIndex:    1,
          }}
        >
          tap anywhere to close
        </p>
      </div>
    </>
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
  const headerRef = useRef(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const shownMsgsRef = useRef(new Set());
  const recentGradesRef = useRef([]);
  const pendingAdvanceRef = useRef(null);
  const msgTimerRef = useRef(null);
  const insightDataRef = useRef({ recovered: [], intervalGrowthCount: 0, intervalGrowthDocTitle: null, masteryGained: {}, totalAnswered: 0 });
  const documentStatsRef = useRef({});

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

  // Measure fixed header height so scrollable content below is correctly offset
  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    setHeaderHeight(el.offsetHeight);
    const ro = new ResizeObserver(() => setHeaderHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [phase, revealed]);

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
      insightDataRef.current = { recovered: [], intervalGrowthCount: 0, intervalGrowthDocTitle: null, masteryGained: {}, totalAnswered: 0 };
      documentStatsRef.current = data.documentStats || {};
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

      // Accumulate insight data for farewell screen
      if (grade !== 'skipped') {
        const d = insightDataRef.current;
        const prevInterval = question.current_interval_days || 0;
        const newInterval = data.newIntervalDays || 0;
        d.totalAnswered++;
        if (grade === 'easy' && (question.incorrect_count || 0) > 0) {
          d.recovered.push({ docTitle: question.document_title, docId: question.document_id });
        }
        if (newInterval > prevInterval) {
          d.intervalGrowthCount++;
          if (!d.intervalGrowthDocTitle) d.intervalGrowthDocTitle = question.document_title;
        }
        if (prevInterval < 14 && newInterval >= 14) {
          const docId = question.document_id;
          d.masteryGained[docId] = (d.masteryGained[docId] || 0) + 1;
        }
      }

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
        {/* Fixed full-screen layout — no page scroll */}
        <div style={{
          position:   'fixed',
          inset:      0,
          background: '#121210',
          display:    'flex',
          flexDirection: 'column',
          overflow:   'hidden',
        }}>

          {/* Celebration scene — flush to top, fades in */}
          <div style={{ flexShrink: 0, animation: 'completeReveal 0.3s ease 0.3s both' }}>
            <CelebrationScene />
          </div>

          {/* Content below the scene — scrollable internally if needed */}
          <div style={{
            flex:       1,
            overflowY:  'auto',
            padding:    '16px 16px 0',
            display:    'flex',
            flexDirection: 'column',
          }}>
            <div className="w-full max-w-sm mx-auto" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>

              {/* Headline — fades in at 0.5s */}
              <div className="text-center mb-3 px-2" style={{ animation: 'completeReveal 0.3s ease 0.5s both' }}>
                <p className="font-semibold leading-snug" style={{
                  color:    '#EEFF99',
                  fontSize: 'clamp(1.1rem, 5vw, 1.35rem)',
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
              <p className="text-center text-sm mb-4" style={{
                color:     'var(--color-muted)',
                animation: 'completeReveal 0.2s ease 0.6s both',
              }}>
                {summary.questionsAnswered} reviewed · {remembered} recalled · {Math.max(1, Math.round(summary.durationSeconds / 60))} min
              </p>

              {/* Review + CTAs — fade in at 0.7s */}
              <div style={{ animation: 'completeReveal 0.3s ease 0.7s both', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>

                {/* Review before you go */}
                {toRevisit.length > 0 && (
                  <div className="mb-3 rounded-2xl overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
                    <button
                      onClick={() => setReviewExpanded(v => !v)}
                      className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium"
                      style={{ background: 'var(--color-surface)', color: 'var(--color-foreground)' }}
                    >
                      <span>{toRevisit.length} question{toRevisit.length !== 1 ? 's' : ''} to revisit</span>
                      <span style={{ color: 'var(--color-muted)' }}>{reviewExpanded ? '▲' : '▼'}</span>
                    </button>
                    {reviewExpanded && (
                      <div style={{ maxHeight: '140px', overflowY: 'auto' }}>
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
                <div className="space-y-3 pb-6">
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
        </div>
      </>
    );
  }

  // ── farewell screen ─────────────────────────────────────────────────────────

  if (phase === 'farewell') {
    return <FarewellScreen insightData={insightDataRef.current} documentStats={documentStatsRef.current} />;
  }

  // ── picker phase ────────────────────────────────────────────────────────────

  if (phase === 'picker') {
    const totalTime = timeEstimate(dueCount);
    const cardOverline = {
      fontSize: '0.64rem', fontWeight: 600,
      textTransform: 'uppercase', letterSpacing: '0.1em',
      marginBottom: '6px',
    };
    return (
      <div style={{
        position:       'relative',
        zIndex:         1,
        minHeight:      '100dvh',
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        padding:        '48px 20px',
      }}>
        <StarryBackground />

        <div style={{ width: '100%', maxWidth: '360px' }}>

          {/* Status header */}
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <div style={{
              fontSize: '0.64rem', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.1em',
              color: 'rgba(238,255,153,0.85)',
              marginBottom: '10px',
            }}>
              Ready to study
            </div>
            <h1 style={{
              fontSize: '1.75rem', fontWeight: 700,
              color: '#ffffff', lineHeight: 1.15,
              marginBottom: '8px',
            }}>
              Pick your session
            </h1>
            <p style={{ fontSize: '0.8125rem', color: 'var(--color-muted)' }}>
              {dueCount} question{dueCount !== 1 ? 's' : ''} due · ~{totalTime}
            </p>
          </div>

          {/* Session option cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

            {dueCount <= 5 ? (
              /* 1–5: single "Review all" — violet anchor treatment */
              <button
                onClick={() => startSession(dueCount)}
                style={{
                  width:        '100%',
                  background:   '#08080f',
                  border:       '1px solid rgba(124,58,237,0.35)',
                  borderRadius: '14px',
                  padding:      '22px 20px',
                  boxShadow:    '0 0 28px rgba(124,58,237,0.45), 0 0 56px rgba(124,58,237,0.18)',
                  cursor:       'pointer',
                  textAlign:    'left',
                }}
              >
                <div style={{ ...cardOverline, color: 'rgba(238,255,153,0.85)' }}>Standard</div>
                <p style={{ fontSize: '1rem', fontWeight: 700, color: '#e8e6e1', marginBottom: '4px' }}>Review all</p>
                <p style={{ fontSize: '0.8125rem', color: 'var(--color-muted)' }}>{dueCount} question{dueCount !== 1 ? 's' : ''} · ~{totalTime}</p>
              </button>
            ) : (
              <>
                {/* Quick session — subtle cool cyan energy */}
                <button
                  onClick={() => startSession(5)}
                  style={{
                    width:        '100%',
                    background:   '#0e0e18',
                    border:       '1px solid rgba(96,165,250,0.18)',
                    borderRadius: '14px',
                    padding:      '18px 20px',
                    boxShadow:    '0 0 16px rgba(96,165,250,0.12), 0 0 32px rgba(96,165,250,0.05)',
                    cursor:       'pointer',
                    textAlign:    'left',
                  }}
                >
                  <div style={{ ...cardOverline, color: 'rgba(96,165,250,0.75)' }}>Quick</div>
                  <p style={{ fontSize: '1rem', fontWeight: 700, color: '#e8e6e1', marginBottom: '4px' }}>Quick Session</p>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--color-muted)' }}>5 questions · ~{timeEstimate(5)}</p>
                </button>

                {/* Normal session — violet anchor, default choice */}
                <button
                  onClick={() => startSession(15)}
                  style={{
                    width:        '100%',
                    background:   '#08080f',
                    border:       '1px solid rgba(124,58,237,0.35)',
                    borderRadius: '14px',
                    padding:      '22px 20px',
                    boxShadow:    '0 0 28px rgba(124,58,237,0.45), 0 0 56px rgba(124,58,237,0.18)',
                    cursor:       'pointer',
                    textAlign:    'left',
                  }}
                >
                  <div style={{ ...cardOverline, color: 'rgba(238,255,153,0.85)' }}>Standard</div>
                  <p style={{ fontSize: '1rem', fontWeight: 700, color: '#e8e6e1', marginBottom: '4px' }}>Normal Session</p>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--color-muted)' }}>15 questions · ~{timeEstimate(15)}</p>
                </button>

                {/* Heroic — warm ember energy, 15+ only */}
                {dueCount >= 15 && (
                  <button
                    onClick={() => startSession(null)}
                    style={{
                      width:        '100%',
                      background:   '#0e0e18',
                      border:       '1px solid rgba(234,88,12,0.22)',
                      borderRadius: '14px',
                      padding:      '18px 20px',
                      boxShadow:    '0 0 16px rgba(234,88,12,0.2), 0 0 32px rgba(234,88,12,0.08)',
                      cursor:       'pointer',
                      textAlign:    'left',
                    }}
                  >
                    <div style={{ ...cardOverline, color: 'rgba(251,146,60,0.8)' }}>Challenge</div>
                    <p style={{ fontSize: '1rem', fontWeight: 700, color: '#e8e6e1', marginBottom: '4px' }}>Heroic Session</p>
                    <p style={{ fontSize: '0.8125rem', color: 'var(--color-muted)' }}>All {dueCount} — as many as you can handle</p>
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

  // ── shared question card style ──────────────────────────────────────────────
  const questionCardStyle = {
    borderRadius: '14px',
    padding:      '12px 14px',
    background:   '#0e0e18',
    border:       '1px solid rgba(255,255,255,0.06)',
  };

  const typeOverlineStyle = {
    fontSize:      '0.64rem',
    fontWeight:    600,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color:         '#EEFF99',
    marginBottom:  '6px',
  };

  // ── PRE-REVEAL: everything fits in one screen, no scrolling needed ──────────
  if (!revealed) {
    return (
      <div className="transition-opacity duration-200" style={{ opacity: fading ? 0 : 1 }}>

        {/* Fixed header: progress bar + question */}
        <div
          ref={headerRef}
          style={{
            position:     'fixed',
            top:          0,
            left:         0,
            right:        0,
            zIndex:       20,
            background:   '#0d0d0c',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div className="max-w-2xl mx-auto px-4">
            <div className="px-4">
              <div className="w-full max-w-xl mx-auto pt-3 pb-2 space-y-3">
                <ProgressBar current={index} total={questions.length} />

                {index === 0 && (
                  <p className="text-base text-center" style={{ color: '#4ADE80' }}>
                    {isHeroic ? 'Ready. Set. Go. Be Heroic' : `🔒 ${questions.length} questions. No other choice. Complete.`}
                  </p>
                )}

                <div ref={cardRef} style={questionCardStyle}>
                  <div style={typeOverlineStyle}>{question.question_type}</div>
                  <p className="text-base sm:text-xl font-semibold leading-snug">
                    {question.question_text}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Normal flow: textarea + reveal button, offset below fixed header */}
        <div className="px-4" style={{ paddingTop: headerHeight }}>
          <div className="w-full max-w-xl mx-auto pt-2 pb-6 space-y-3">
            <textarea
              ref={textareaRef}
              value={userAttempt}
              onChange={(e) => setUserAttempt(e.target.value)}
              placeholder="Type your answer… (3+ words to unlock Reveal)"
              rows={4}
              className="w-full rounded-xl px-4 py-3 text-base leading-relaxed resize-none focus:outline-none focus:border-[rgba(124,58,237,0.55)]"
              style={{
                background:  '#0e0e18',
                border:      '1px solid rgba(255,255,255,0.08)',
                color:       'var(--color-foreground)',
                transition:  'border-color 0.15s ease',
              }}
            />
            <button
              onClick={() => setRevealed(true)}
              disabled={!canReveal}
              className="w-full py-4 rounded-xl font-medium text-base disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: '#7c3aed',
                color:      '#ffffff',
                boxShadow:  canReveal ? '0 0 20px rgba(124,58,237,0.55), 0 0 40px rgba(124,58,237,0.2)' : 'none',
                transition: 'box-shadow 0.2s ease',
              }}
            >
              Reveal Answer
            </button>
          </div>
        </div>

      </div>
    );
  }

  // ── POST-REVEAL: fixed header, answer content scrolls below ────────────────
  return (
    <div className="transition-opacity duration-200" style={{ opacity: fading ? 0 : 1 }}>

      {/* Fixed header: progress bar + question card */}
      <div
        ref={headerRef}
        style={{
          position:     'fixed',
          top:          0,
          left:         0,
          right:        0,
          zIndex:       20,
          background:   '#0d0d0c',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div className="max-w-2xl mx-auto px-4">
          <div className="px-4">
            <div className="w-full max-w-xl mx-auto pt-3 pb-2 space-y-3">
              <ProgressBar current={index} total={questions.length} />

              <div ref={cardRef} style={questionCardStyle}>
                <div style={typeOverlineStyle}>{question.question_type}</div>
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
          </div>
        </div>
      </div>

      {/* Scrollable content — offset by measured fixed header height */}
      <div className="min-h-dvh px-4" style={{ paddingTop: headerHeight }}>
        <div className="w-full max-w-xl mx-auto space-y-3 pt-3 pb-8">

          {/* Your answer — subtle inset card */}
          {userAttempt.trim() && (
            <div style={{
              background:   'rgba(255,255,255,0.03)',
              border:       '1px solid rgba(255,255,255,0.06)',
              borderRadius: '10px',
              padding:      '10px 14px',
            }}>
              <div style={{ fontSize: '0.64rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-muted)', marginBottom: '4px' }}>
                Your answer
              </div>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', lineHeight: 1.55 }}>{userAttempt}</p>
            </div>
          )}

          {/* Answer */}
          <div>
            <div style={{ fontSize: '0.64rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#EEFF99', marginBottom: '6px' }}>
              Answer
            </div>
            <p style={{ fontSize: '1rem', fontWeight: 600, color: '#e8e6e1', lineHeight: 1.45 }}>{question.answer_text}</p>
          </div>

          {/* Explanation & source toggle */}
          <div>
            <button
              onClick={() => setShowDetail((v) => !v)}
              className="flex items-center gap-1.5 text-sm transition-colors"
              style={{ color: 'var(--color-muted)' }}
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
                  <div style={{ fontSize: '0.64rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-muted)', marginBottom: '6px' }}>
                    Explanation
                  </div>
                  <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', lineHeight: 1.6 }}>{question.explanation}</p>
                </div>
                {question.source_reference && (
                  <div>
                    <div style={{ fontSize: '0.64rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-muted)', marginBottom: '6px' }}>
                      Source
                    </div>
                    <blockquote style={{ fontSize: '0.875rem', color: 'var(--color-muted)', lineHeight: 1.6, paddingLeft: '12px', fontStyle: 'italic', borderLeft: '2px solid rgba(255,255,255,0.12)' }}>
                      {question.source_reference}
                    </blockquote>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Grade buttons */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <GradeButton
              label="Easy"
              sublabel="Knew it"
              onClick={() => handleGrade('easy')}
              colorRgb="74, 222, 128"
              disabled={grading}
            />
            <GradeButton
              label="Hard"
              sublabel="Struggled"
              onClick={() => handleGrade('hard')}
              colorRgb="217, 119, 6"
              disabled={grading}
            />
            <GradeButton
              label="Forgot"
              sublabel="Missed it"
              onClick={() => handleGrade('forgot')}
              colorRgb="239, 68, 68"
              disabled={grading}
            />
          </div>

          {/* Skip button */}
          <button
            onClick={() => handleGrade('skipped')}
            disabled={grading}
            className="w-full py-2 rounded-xl text-sm font-medium transition-opacity disabled:opacity-40"
            style={{
              color:      '#8a8880',
              background: 'transparent',
              border:     '1px solid rgba(255,255,255,0.06)',
            }}
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
