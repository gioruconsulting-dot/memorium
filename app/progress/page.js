'use client';

import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import Link from 'next/link';
import StarryBackground from '@/components/StarryBackground';

// ─── localStorage helpers ─────────────────────────────────────────────────────

function lsGet(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

// ─── Layout helpers ───────────────────────────────────────────────────────────

const wrapperStyle = { position: 'relative', zIndex: 1, paddingTop: '24px', paddingBottom: '40px' };

const titleStyle = {
  fontSize:     '1.84rem',
  fontWeight:   700,
  color:        '#ffffff',
  lineHeight:   1.1,
  marginBottom: '20px',
  paddingLeft:  '20px',
};

function Section({ title, overline, children, first }) {
  return (
    <div style={{ marginTop: first ? 0 : 10 }}>
      <div
        style={{
          background:   '#0e0e18',
          border:       '1px solid rgba(255,255,255,0.06)',
          borderRadius: '14px',
          padding:      '16px 18px',
          boxShadow:    '0 0 16px rgba(124,58,237,0.278), 0 0 32px rgba(124,58,237,0.101)',
        }}
      >
        {overline && (
          <span style={{
            display:       'block',
            fontSize:      '0.64rem',
            fontWeight:    600,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color:         'rgba(238, 255, 153, 0.85)',
            marginBottom:  '6px',
          }}>
            {overline}
          </span>
        )}
        <h2
          style={{
            fontSize:      '1rem',
            fontWeight:    700,
            color:         'var(--color-foreground)',
            marginBottom:  20,
            letterSpacing: '-0.01em',
          }}
        >
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

function NoSessions() {
  return (
    <p style={{ fontSize: 13, color: 'var(--color-muted)', lineHeight: 1.6 }}>
      Complete your first study session and we&apos;ll show you progress here.
    </p>
  );
}

// ─── Section 1: Knowledge Map ─────────────────────────────────────────────────

const MAX_DOTS = 400;
const DOT_BG = { m: '#5db152', p: '#d4a832', n: 'rgba(255,255,255,0.1)' };

function computeDisplayCounts(mastered, progressing, newCount) {
  const total = mastered + progressing + newCount;
  if (total <= MAX_DOTS) {
    return { dMastered: mastered, dProgressing: progressing, dNew: newCount, displayTotal: total };
  }
  const dMastered = Math.round(mastered * MAX_DOTS / total);
  const dProgressing = Math.round(progressing * MAX_DOTS / total);
  return { dMastered, dProgressing, dNew: MAX_DOTS - dMastered - dProgressing, displayTotal: MAX_DOTS };
}

function dotTypeAtPos(i, dMastered, dProgressing) {
  if (i < dMastered) return 'm';
  if (i < dMastered + dProgressing) return 'p';
  return 'n';
}

function KnowledgeMap({ mastered, progressing, newCount, total, docCount, topicCount }) {
  // Read previous state once at first render (before useLayoutEffect saves new state)
  // so we can compute the mastered delta for the insight line
  const [prevData] = useState(() => lsGet('repetita-progress-dots'));

  // animState: null = render final state immediately (no animation)
  // { initColors: string[], delays: {[i]: ms}, transitionMs: number, animating: bool }
  const [animState, setAnimState] = useState(null);

  useLayoutEffect(() => {
    const prev = lsGet('repetita-progress-dots');
    const current = { mastered, progressing, new: newCount };

    if (
      !prev ||
      (prev.mastered === mastered && prev.progressing === progressing && prev.new === newCount)
    ) {
      lsSet('repetita-progress-dots', { ...current, timestamp: Date.now() });
      return;
    }

    const oldD = computeDisplayCounts(prev.mastered || 0, prev.progressing || 0, prev.new || 0);
    const newD = computeDisplayCounts(mastered, progressing, newCount);

    // Initial colors per position based on OLD layout
    const initColors = Array.from({ length: newD.displayTotal }, (_, i) =>
      dotTypeAtPos(i, oldD.dMastered, oldD.dProgressing)
    );

    // Find which positions change type
    const changing = [];
    for (let i = 0; i < newD.displayTotal; i++) {
      if (initColors[i] !== dotTypeAtPos(i, newD.dMastered, newD.dProgressing)) {
        changing.push(i);
      }
    }

    if (changing.length === 0) {
      lsSet('repetita-progress-dots', { ...current, timestamp: Date.now() });
      return;
    }

    // Sort: dots becoming green (m) first, then yellow (p), then dark (n)
    // This ensures "improving" signals (mastered, then progressing) animate in the right order
    const typeOrder = { m: 0, p: 1, n: 2 };
    changing.sort((a, b) =>
      typeOrder[dotTypeAtPos(a, newD.dMastered, newD.dProgressing)] -
      typeOrder[dotTypeAtPos(b, newD.dMastered, newD.dProgressing)]
    );

    // Always 2.5s total: fewer dots → slower individual transitions, more dots → faster
    // transitionMs: how long each dot's color transition takes
    // staggerSpread: time from first dot starting to last dot starting
    // total = staggerSpread + transitionMs = 2500ms
    const N = changing.length;
    const transitionMs = N === 1 ? 2500 : Math.max(400, Math.min(2000, Math.round(2500 / N)));
    const staggerSpread = N === 1 ? 0 : 2500 - transitionMs;
    const perDot = N > 1 ? staggerSpread / (N - 1) : 0;

    const delays = {};
    changing.forEach((pos, idx) => {
      const jitter = perDot > 0 ? (Math.random() - 0.5) * 0.3 * perDot : 0;
      delays[pos] = Math.max(0, Math.round(idx * perDot + jitter));
    });

    // eslint-disable-next-line -- intentional: set old-color state before first paint (useLayoutEffect)
    setAnimState({ initColors, delays, transitionMs, animating: false });

    // Start animation after 600ms (page settle)
    const t1 = setTimeout(
      () => setAnimState(s => s ? { ...s, animating: true } : s),
      600
    );
    // Save new state after animation completes
    const t2 = setTimeout(
      () => lsSet('repetita-progress-dots', { ...current, timestamp: Date.now() }),
      600 + staggerSpread + transitionMs
    );

    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // How many more questions are in long-term memory vs previous visit
  const masteredDelta = prevData && mastered > (prevData.mastered || 0)
    ? mastered - (prevData.mastered || 0)
    : null;

  const newD = computeDisplayCounts(mastered, progressing, newCount);
  const { dMastered, dProgressing, displayTotal } = newD;
  const cols = Math.min(20, Math.max(3, Math.ceil(Math.sqrt(displayTotal))));
  const maxGridPx = Math.min(500, cols * 22 + (cols - 1) * 4);

  return (
    <div>
      <style>{`@keyframes dotPop{0%{transform:scale(1)}30%{transform:scale(1.3)}100%{transform:scale(1)}}`}</style>
      <div style={{ maxWidth: maxGridPx }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap: 4,
          }}
        >
          {Array.from({ length: displayTotal }, (_, i) => {
            const finalType = dotTypeAtPos(i, dMastered, dProgressing);
            const isChanging = animState !== null && animState.delays[i] !== undefined;
            const delay = isChanging ? animState.delays[i] : 0;
            const tMs = animState?.transitionMs ?? 800;
            const tSec = (tMs / 1000).toFixed(2);

            // Determine which color to render at this moment
            let bgType;
            if (!animState) {
              bgType = finalType;                   // no animation — use final
            } else if (!animState.animating) {
              bgType = animState.initColors[i];     // pre-animation — show old color
            } else {
              bgType = finalType;                   // animating — CSS transition to final
            }

            const style = {
              aspectRatio: '1',
              borderRadius: '50%',
              background: DOT_BG[bgType],
            };

            if (isChanging) {
              style.transition = `background-color ${tSec}s ease-in-out ${delay}ms`;
              if (animState.animating) {
                style.animation = `dotPop ${tSec}s ease-in-out ${delay}ms both`;
              }
            }

            return <div key={i} style={style} />;
          })}
        </div>
      </div>
      <div style={{ marginTop: 16 }}>
        <p style={{ fontSize: 15, color: 'var(--color-foreground)', lineHeight: 1.5 }}>
          {total} Q generated{' '}
          <span style={{ color: 'var(--color-muted)' }}>|</span>
          {' '}{docCount} document{docCount !== 1 ? 's' : ''}{' '}
          <span style={{ color: 'var(--color-muted)' }}>|</span>
          {' '}{topicCount} topic{topicCount !== 1 ? 's' : ''}
        </p>
        <p style={{ fontSize: 15, color: '#EEFF99', marginTop: 4, lineHeight: 1.5 }}>
          {mastered} Q now in your long term memory
          {masteredDelta ? ` (+${masteredDelta} compared to the previous study session!)` : null}
        </p>
        <p style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 6 }}>
          each dot represents a question
        </p>
      </div>
    </div>
  );
}

// ─── Section 2: Interval Trend ────────────────────────────────────────────────

function IntervalChart({ weeks, currentAvgInterval, startingAvgInterval, hasEnoughData }) {
  const containerRef = useRef(null);
  // barReady: false = top bar at 0%, true = top bar at target width
  const [barReady, setBarReady] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setBarReady(true);
          observer.disconnect(); // Fire once per mount — scrolling away and back shows final state
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Trim leading weeks with no data
  const firstDataIdx = weeks.findIndex(w => w.avgInterval !== null);
  const trimmedWeeks = firstDataIdx === -1 ? [] : weeks.slice(firstDataIdx);
  const displayWeeks = [...trimmedWeeks].reverse(); // newest at top

  // x-axis max = highest bar + 15% headroom
  const rawMax = Math.max(...weeks.map(w => w.avgInterval !== null ? w.avgInterval : 0), 1);
  const maxInterval = rawMax * 1.15;

  return (
    <div ref={containerRef}>
      {/* Bar rows */}
      <div>
        {displayWeeks.map((week, idx) => {
          const isCurrentWeek = idx === 0;
          const hasData = week.avgInterval !== null;
          const targetPct = hasData
            ? Math.round((week.avgInterval / maxInterval) * 100)
            : 0;
          const barWidth = (isCurrentWeek && !barReady) ? '0%' : `${targetPct}%`;

          return (
            <div
              key={week.weekStart}
              style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}
            >
              <span style={{ width: 62, fontSize: 11, color: 'var(--color-muted)', flexShrink: 0, textAlign: 'right' }}>
                {week.label}
              </span>
              <div style={{ flex: 1, height: 8, background: 'rgba(255,255,255,0.07)', borderRadius: 4, overflow: 'hidden' }}>
                {hasData ? (
                  <div
                    style={{
                      width: barWidth,
                      height: '100%',
                      background: 'var(--color-easy)',
                      borderRadius: 4,
                      transition: isCurrentWeek ? 'width 1s ease-out' : 'none',
                    }}
                  />
                ) : isCurrentWeek ? (
                  /* Faint pulsing placeholder — week started but no reviews yet */
                  <div
                    className="animate-pulse"
                    style={{ width: '18%', height: '100%', background: 'rgba(255,255,255,0.18)', borderRadius: 4 }}
                  />
                ) : null}
              </div>
              <span style={{ width: 26, fontSize: 10, color: 'var(--color-muted)', flexShrink: 0, textAlign: 'left' }}>
                {hasData ? `${week.avgInterval}d` : isCurrentWeek ? '–' : ''}
              </span>
            </div>
          );
        })}
      </div>

      {/* Insight sentence */}
      <div style={{ marginTop: 20 }}>
        {hasEnoughData ? (
          <p style={{ fontSize: 15, color: '#EEFF99', lineHeight: 1.5 }}>
            This week your questions stay in your memory for an average of {currentAvgInterval} days
            {startingAvgInterval !== null && startingAvgInterval !== currentAvgInterval
              ? `, when you started they stayed ${startingAvgInterval} days`
              : null}
          </p>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--color-muted)', lineHeight: 1.6 }}>
            Keep studying — trends appear after 2 weeks
          </p>
        )}
        <p style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 6, lineHeight: 1.5 }}>
          This graph shows you how long on average it will take you to forget the questions you reviewed each specific week
        </p>
      </div>
    </div>
  );
}

// ─── Section 3: Activity Calendar ─────────────────────────────────────────────

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function calCellBg(count, isToday) {
  if (isToday)       return '#d4a832';
  if (count === 0)   return 'rgba(255,255,255,0.07)';
  if (count <= 5)    return 'rgba(238,255,153,0.45)';
  if (count <= 10)   return 'rgba(93,177,82,0.60)';
  return '#5db152';
}

function ActivityCalendar({ days, totalSessions, totalAnswers, daysActive }) {
  const todayStr = new Date().toISOString().split('T')[0];

  // calState: null = render everything in final colors immediately (no animation)
  // { newActiveDays: Set<string>, delays: {[date]: ms}, revealing: bool }
  const [calState, setCalState] = useState(null);

  useLayoutEffect(() => {
    const prev = lsGet('repetita-progress-calendar');

    if (!prev || prev.lastVisitDate === todayStr) {
      lsSet('repetita-progress-calendar', { lastVisitDate: todayStr });
      return;
    }

    const lastVisit = prev.lastVisitDate;
    // Days after last visit with activity, sorted chronologically
    const newActive = days
      .filter(d => d.date > lastVisit && d.date <= todayStr && d.count > 0)
      .map(d => d.date)
      .sort();

    if (newActive.length === 0) {
      lsSet('repetita-progress-calendar', { lastVisitDate: todayStr });
      return;
    }

    // Compute per-day reveal delays — cap total animation at 2s
    const N = newActive.length;
    const maxDelay = N > 1 ? Math.min((N - 1) * 700, 2000) : 0;
    const interval = N > 1 ? maxDelay / (N - 1) : 0;
    const delays = {};
    newActive.forEach((date, i) => { delays[date] = Math.round(i * interval); });

    // eslint-disable-next-line -- intentional: set pre-reveal state before first paint (useLayoutEffect)
    setCalState({ newActiveDays: new Set(newActive), delays, revealing: false });

    // After page settles, start revealing new days one by one
    const t1 = setTimeout(
      () => setCalState(s => s ? { ...s, revealing: true } : s),
      300
    );
    // Save new visit date after last day has transitioned
    const t2 = setTimeout(
      () => lsSet('repetita-progress-calendar', { lastVisitDate: todayStr }),
      300 + maxDelay + 400
    );

    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Split 49 days into 7 weeks of 7 (calStart is always a Monday)
  const weeks = [];
  for (let w = 0; w < 7; w++) {
    weeks.push(days.slice(w * 7, w * 7 + 7));
  }

  // 2-week active recall %: past 14 days up to and including today (ignore future cells)
  const todayDate = new Date(todayStr + 'T00:00:00Z');
  const windowStart = new Date(todayDate);
  windowStart.setUTCDate(windowStart.getUTCDate() - 13);
  const windowStartStr = windowStart.toISOString().split('T')[0];
  const last14 = days.filter(d => d.date >= windowStartStr && d.date <= todayStr);
  const activeDays14 = last14.filter(d => d.count > 0).length;
  const activePercent = Math.round((activeDays14 / 14) * 100);

  return (
    <div>
      {/* Day-of-week column headers */}
      <div style={{ display: 'grid', gridTemplateColumns: '34px 1fr', gap: 4, marginBottom: 5 }}>
        <div />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
          {DAY_LABELS.map((d, i) => (
            <div
              key={i}
              style={{ textAlign: 'center', fontSize: 17, color: 'var(--color-muted)', fontWeight: 500 }}
            >
              {d}
            </div>
          ))}
        </div>
      </div>

      {/* Week rows, oldest at top, newest at bottom */}
      {weeks.map((week, wi) => {
        const firstDay  = new Date(week[0].date + 'T00:00:00Z');
        const prevFirst = wi > 0 ? new Date(weeks[wi - 1][0].date + 'T00:00:00Z') : null;
        const isNewMonth = !prevFirst || firstDay.getUTCMonth() !== prevFirst.getUTCMonth();
        const monthLabel = isNewMonth
          ? firstDay.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
          : '';

        return (
          <div
            key={wi}
            style={{ display: 'grid', gridTemplateColumns: '34px 1fr', gap: 4, marginBottom: 3 }}
          >
            {/* Month label */}
            <div
              style={{
                fontSize: 15,
                color: 'var(--color-muted)',
                textAlign: 'right',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                fontWeight: 500,
              }}
            >
              {monthLabel}
            </div>

            {/* 7 day cells */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
              {week.map((day) => {
                const isToday = day.date === todayStr;
                const isNewActive = calState !== null && calState.newActiveDays.has(day.date);

                let bg;
                let transition = 'none';

                if (isNewActive) {
                  const delay = calState.delays[day.date] ?? 0;
                  if (!calState.revealing) {
                    // Snap to dark immediately — no transition (avoids backwards animation)
                    bg = 'rgba(255,255,255,0.07)';
                    transition = 'none';
                  } else {
                    // Transition from dark to final color, staggered by delay
                    bg = calCellBg(day.count, isToday);
                    transition = `background-color 0.4s ease-in-out ${delay}ms`;
                  }
                } else {
                  bg = calCellBg(day.count, isToday);
                }

                return (
                  <div
                    key={day.date}
                    title={`${day.date}: ${day.count} question${day.count !== 1 ? 's' : ''}`}
                    style={{
                      aspectRatio: '1',
                      borderRadius: 2,
                      background: bg,
                      transition,
                    }}
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Lifetime stats line */}
      <p style={{ fontSize: 15, color: 'var(--color-foreground)', marginTop: 16, lineHeight: 1.5 }}>
        {totalSessions} session{totalSessions !== 1 ? 's' : ''}{' '}
        <span style={{ color: 'var(--color-muted)' }}>|</span>
        {' '}{totalAnswers} answer{totalAnswers !== 1 ? 's' : ''}{' '}
        <span style={{ color: 'var(--color-muted)' }}>|</span>
        {' '}{daysActive} day{daysActive !== 1 ? 's' : ''} active
      </p>

      {/* 2-week active % — yellow insight line */}
      <p style={{ fontSize: 15, color: '#EEFF99', marginTop: 4, lineHeight: 1.5 }}>
        {activePercent}% of active recall days in the past 2 weeks
      </p>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function ProgressPage() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  async function fetchData() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/stats/progress');
      const d   = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to load stats');
      setData(d);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, []);

  // ── Loading ──
  if (loading) {
    return (
      <div style={wrapperStyle}>
        <StarryBackground />
        <h1 style={titleStyle}>Progress</h1>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[160, 220, 200].map((h, i) => (
            <div
              key={i}
              className="animate-pulse"
              style={{
                borderRadius: '14px',
                height:       h,
                background:   '#0e0e18',
                border:       '1px solid rgba(255,255,255,0.06)',
                boxShadow:    '0 0 16px rgba(124,58,237,0.278), 0 0 32px rgba(124,58,237,0.101)',
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div style={wrapperStyle}>
        <StarryBackground />
        <h1 style={titleStyle}>Progress</h1>
        <p style={{ color: 'var(--color-forgot)', marginBottom: '16px', fontSize: '0.875rem' }}>
          {error}
        </p>
        <button
          onClick={fetchData}
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

  // ── Empty state (0 questions) ──
  if (!data || data.knowledgeMap.total === 0) {
    return (
      <div style={wrapperStyle}>
        <StarryBackground />
        <h1 style={titleStyle}>Progress</h1>
        <p style={{ color: 'var(--color-muted)', fontSize: '0.875rem', marginBottom: '16px' }}>
          Upload your first document to start tracking progress.
        </p>
        <Link
          href="/library"
          style={{
            display:      'inline-block',
            padding:      '10px 20px',
            borderRadius: '8px',
            fontWeight:   500,
            fontSize:     '0.875rem',
            background:   'var(--color-foreground)',
            color:        'var(--color-background)',
            textDecoration: 'none',
          }}
        >
          Go to Library
        </Link>
      </div>
    );
  }

  const { knowledgeMap, intervalTrend, activityCalendar, hasSessions } = data;

  return (
    <div style={wrapperStyle}>
      <StarryBackground />
      <h1 style={titleStyle}>Progress</h1>

      <Section title="How much more do I know now?" overline="Knowledge Map" first>
        <KnowledgeMap
          mastered={knowledgeMap.mastered}
          progressing={knowledgeMap.progressing}
          newCount={knowledgeMap.new}
          total={knowledgeMap.total}
          docCount={knowledgeMap.docCount}
          topicCount={knowledgeMap.topicCount}
        />
      </Section>

      <Section title="Is my memory really improving?" overline="Memory Trend">
        {hasSessions ? (
          <IntervalChart
            weeks={intervalTrend.weeks}
            currentAvgInterval={intervalTrend.currentAvgInterval}
            startingAvgInterval={intervalTrend.startingAvgInterval}
            hasEnoughData={intervalTrend.hasEnoughData}
          />
        ) : <NoSessions />}
      </Section>

      <Section title="How consistent have I been?" overline="Consistency">
        {hasSessions ? <ActivityCalendar {...activityCalendar} /> : <NoSessions />}
      </Section>
    </div>
  );
}
