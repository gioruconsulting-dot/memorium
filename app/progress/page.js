'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

// ─── Layout helpers ────────────────────────────────────────────────────────────

function Section({ title, children, first }) {
  return (
    <div style={{ marginTop: first ? 0 : 16 }}>
      <div
        className="rounded-2xl p-5"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <h2
          style={{
            fontSize: '1rem',
            fontWeight: 700,
            color: 'var(--color-foreground)',
            marginBottom: 20,
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

// ─── Section 1: Knowledge Map ──────────────────────────────────────────────────

function KnowledgeMap({ mastered, progressing, newCount, total }) {
  const MAX_DOTS = 400;
  let dMastered, dProgressing, dNew, displayTotal;

  if (total <= MAX_DOTS) {
    dMastered   = mastered;
    dProgressing = progressing;
    dNew         = newCount;
    displayTotal = total;
  } else {
    displayTotal = MAX_DOTS;
    dMastered    = Math.round(mastered    * MAX_DOTS / total);
    dProgressing = Math.round(progressing * MAX_DOTS / total);
    dNew         = MAX_DOTS - dMastered - dProgressing;
  }

  const dots = [
    ...Array(dMastered).fill('m'),
    ...Array(dProgressing).fill('p'),
    ...Array(Math.max(0, dNew)).fill('n'),
  ];

  // Roughly square grid; cap at 20 columns
  const cols = Math.min(20, Math.max(3, Math.ceil(Math.sqrt(displayTotal))));
  // Cap dot size at 18px; for large grids let them shrink to fill width
  const maxGridPx = Math.min(340, cols * 18 + (cols - 1) * 3);

  const dotBg = {
    m: '#5db152',
    p: '#d4a832',
    n: 'rgba(255,255,255,0.1)',
  };

  return (
    <div>
      <div style={{ maxWidth: maxGridPx }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap: 3,
          }}
        >
          {dots.map((type, i) => (
            <div
              key={i}
              style={{ aspectRatio: '1', borderRadius: '50%', background: dotBg[type] }}
            />
          ))}
        </div>
      </div>
      <p style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 14 }}>
        {mastered} of {total} in long-term memory
      </p>
    </div>
  );
}

// ─── Section 2: Interval Trend ─────────────────────────────────────────────────

function IntervalChart({ weeks, currentAvgInterval, startingAvgInterval, longTermCount, hasEnoughData }) {
  // Display newest week at top
  const displayWeeks = [...weeks].reverse();
  const maxInterval  = Math.max(...weeks.map(w => w.avgInterval !== null ? w.avgInterval : 0), 1);

  return (
    <div>
      {/* Bar rows */}
      <div>
        {displayWeeks.map((week) => (
          <div
            key={week.weekStart}
            style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}
          >
            {/* Week label */}
            <span
              style={{
                width: 62,
                fontSize: 11,
                color: 'var(--color-muted)',
                flexShrink: 0,
                textAlign: 'right',
              }}
            >
              {week.label}
            </span>

            {/* Bar track */}
            <div
              style={{
                flex: 1,
                height: 8,
                background: 'rgba(255,255,255,0.07)',
                borderRadius: 4,
                overflow: 'hidden',
              }}
            >
              {week.avgInterval !== null && (
                <div
                  style={{
                    width: `${Math.round((week.avgInterval / maxInterval) * 100)}%`,
                    height: '100%',
                    background: 'var(--color-easy)',
                    borderRadius: 4,
                  }}
                />
              )}
            </div>

            {/* Day value */}
            <span
              style={{
                width: 26,
                fontSize: 10,
                color: 'var(--color-muted)',
                flexShrink: 0,
                textAlign: 'left',
              }}
            >
              {week.avgInterval !== null ? `${week.avgInterval}d` : ''}
            </span>
          </div>
        ))}
      </div>

      {/* Insight sentence */}
      <div style={{ marginTop: 20, fontSize: 13, lineHeight: 1.65 }}>
        {hasEnoughData ? (
          <>
            <p style={{ color: 'var(--color-foreground)' }}>
              Your questions now stay in memory an average of{' '}
              <span style={{ color: 'var(--color-easy)', fontWeight: 600 }}>
                {currentAvgInterval} days
              </span>
              {startingAvgInterval !== null && startingAvgInterval !== currentAvgInterval && (
                <>
                  {' '}— up from{' '}
                  <span style={{ fontWeight: 600 }}>{startingAvgInterval} days</span>{' '}
                  when you started
                </>
              )}
            </p>
            <p style={{ color: 'var(--color-muted)', marginTop: 6 }}>
              {longTermCount} question{longTermCount !== 1 ? 's' : ''} on 14+ day intervals
            </p>
          </>
        ) : (
          <>
            <p style={{ color: 'var(--color-muted)' }}>
              Keep studying — trends appear after 2 weeks
            </p>
            {longTermCount > 0 && (
              <p style={{ color: 'var(--color-muted)', marginTop: 6 }}>
                {longTermCount} question{longTermCount !== 1 ? 's' : ''} on 14+ day intervals
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Section 3: Activity Calendar ──────────────────────────────────────────────

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function calCellBg(count) {
  if (count === 0)   return 'rgba(255,255,255,0.07)';
  if (count <= 5)    return 'rgba(238,255,153,0.45)';
  if (count <= 10)   return 'rgba(93,177,82,0.60)';
  return '#5db152';
}

function ActivityCalendar({ days, totalSessions, totalAnswers, daysActive }) {
  // Split 63 days into 9 weeks of 7 (calStart is always a Monday)
  const weeks = [];
  for (let w = 0; w < 9; w++) {
    weeks.push(days.slice(w * 7, w * 7 + 7));
  }

  return (
    <div>
      {/* Day-of-week column headers */}
      <div style={{ display: 'grid', gridTemplateColumns: '26px 1fr', gap: 4, marginBottom: 4 }}>
        <div />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
          {DAY_LABELS.map((d, i) => (
            <div
              key={i}
              style={{ textAlign: 'center', fontSize: 9, color: 'var(--color-muted)' }}
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
            style={{ display: 'grid', gridTemplateColumns: '26px 1fr', gap: 4, marginBottom: 3 }}
          >
            {/* Month label (shows only when month changes) */}
            <div
              style={{
                fontSize: 8,
                color: 'var(--color-muted)',
                textAlign: 'right',
                paddingTop: 3,
                lineHeight: 1,
              }}
            >
              {monthLabel}
            </div>

            {/* 7 day cells */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
              {week.map((day) => (
                <div
                  key={day.date}
                  title={`${day.date}: ${day.count} question${day.count !== 1 ? 's' : ''}`}
                  style={{
                    aspectRatio: '1',
                    borderRadius: 2,
                    background: calCellBg(day.count),
                  }}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* Lifetime summary line */}
      <p style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 14 }}>
        {totalSessions} session{totalSessions !== 1 ? 's' : ''}
        {' · '}
        {totalAnswers} answer{totalAnswers !== 1 ? 's' : ''}
        {' · '}
        {daysActive} day{daysActive !== 1 ? 's' : ''} active
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
      <div className="py-8">
        <h1 className="text-2xl font-semibold text-center text-[#EEFF99] mb-8">Progress</h1>
        <div className="space-y-8">
          {[160, 220, 200].map((h, i) => (
            <div
              key={i}
              className="rounded-2xl animate-pulse"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                height: h,
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
      <div className="py-8 text-center">
        <h1 className="text-2xl font-semibold text-[#EEFF99] mb-6">Progress</h1>
        <p className="mb-4" style={{ color: 'var(--color-forgot)' }}>{error}</p>
        <button
          onClick={fetchData}
          className="px-5 py-2.5 rounded-lg font-medium text-sm"
          style={{ background: 'var(--color-foreground)', color: 'var(--color-background)' }}
        >
          Try Again
        </button>
      </div>
    );
  }

  // ── Empty state (0 questions) ──
  if (!data || data.knowledgeMap.total === 0) {
    return (
      <div className="py-8 text-center">
        <h1 className="text-2xl font-semibold text-[#EEFF99] mb-6">Progress</h1>
        <p className="mb-5" style={{ color: 'var(--color-muted)' }}>
          Upload your first document to start tracking progress.
        </p>
        <Link
          href="/library"
          className="inline-block px-5 py-2.5 rounded-lg font-medium text-sm"
          style={{ background: 'var(--color-foreground)', color: 'var(--color-background)' }}
        >
          Go to Library
        </Link>
      </div>
    );
  }

  const { knowledgeMap, intervalTrend, activityCalendar, hasSessions } = data;

  return (
    <div className="py-8">
      <h1 className="text-2xl font-semibold text-center text-[#EEFF99] mb-8">Progress</h1>

      <Section title="How much more do I know now?" first>
        <KnowledgeMap
          mastered={knowledgeMap.mastered}
          progressing={knowledgeMap.progressing}
          newCount={knowledgeMap.new}
          total={knowledgeMap.total}
        />
      </Section>

      <Section title="Is my memory really improving?">
        {hasSessions ? <IntervalChart {...intervalTrend} /> : <NoSessions />}
      </Section>

      <Section title="How consistent have I been?">
        {hasSessions ? <ActivityCalendar {...activityCalendar} /> : <NoSessions />}
      </Section>
    </div>
  );
}
