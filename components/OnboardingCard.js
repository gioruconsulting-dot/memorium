'use client';

import { useEffect, useRef, useState } from 'react';

const FACTS = [
  {
    text: "In a 2022 study, learners who spread their practice across multiple sessions retained 5× more after 36 hours than those who studied the same amount in one sitting.",
    source: "Walsh et al., 2022 — Memory & Cognition",
    url: "https://link.springer.com/article/10.3758/s13421-022-01361-8",
  },
  {
    text: "It takes only 4 or 5 successful recalls of the same fact to almost flatten your forgetting curve — i.e. your brain barely forgets it anymore. Each review you do here is literally reshaping how fast you forget.",
    source: "Ebbinghaus forgetting curve research",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4492928/",
  },
  {
    text: "The spacing effect was first documented in 1885 by Hermann Ebbinghaus. It's been replicated thousands of times since, across ages, languages, and disciplines. It's one of the most robust findings in all of cognitive science.",
    source: "Ebbinghaus, 1885",
    url: "https://docs.ankiweb.net/background.html",
  },
  {
    text: "When you study before bed, your brain consolidates those memories overnight. The 'hard' questions you struggled with today are being physically rewired in your neurons while you sleep. Tomorrow's session builds on tonight's biology.",
    source: "Walker et al., 2003 — reconsolidation research",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC5476736/",
  },
  {
    text: "Re-reading something gives you a feeling of familiarity — but it's an illusion. Research shows that actively retrieving an answer (what you do here) is 2-3× more effective for long-term memory than passively re-reading the same material.",
    source: "Karpicke & Roediger, 2008 — Science",
    url: "https://openlearning.mit.edu/mit-faculty/research-based-learning-findings/spaced-and-interleaved-practice",
  },
  {
    text: "A question you review 6 times over 2 months creates a stronger memory than reviewing it 20 times in one day. Less total effort, dramatically better results.",
    source: "Cepeda et al., 2006 — Psychological Bulletin",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC5476736/",
  },
  {
    text: "Every time you successfully recall something, the synaptic connection for that memory literally gets stronger — a process called long-term potentiation. You're not just 'studying.' You're physically rewiring your brain, one question at a time.",
    source: "Long-term potentiation — neuroscience research",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC5476736/",
  },
];

function getDailyFact() {
  const start = new Date(new Date().getFullYear(), 0, 0);
  const dayOfYear = Math.floor((Date.now() - start.getTime()) / 86400000);
  return FACTS[dayOfYear % FACTS.length];
}

// ── Mode 1: shown to users with 0 completed sessions ──────────────────────────

function NewUserCard() {
  const wrapRef = useRef(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting && window.scrollY > 10) {
          setCollapsed(true);
          observer.disconnect();
        }
      },
      { threshold: 0 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={wrapRef}
      style={{
        overflow: 'hidden',
        maxHeight: collapsed ? '0px' : '2000px',
        opacity: collapsed ? 0 : 1,
        marginBottom: collapsed ? '0px' : '1.5rem',
        transition: 'max-height 400ms ease-out, opacity 300ms ease-out, margin-bottom 400ms ease-out',
      }}
    >
      <div
        style={{
          background: '#0e0e18',
          border: '1px solid #1e1e2a',
          borderRadius: '14px',
          padding: '1.25rem',
          boxShadow: '0 0 16px rgba(124,58,237,0.22), 0 0 32px rgba(124,58,237,0.08)',
        }}
      >
        {/* THE IDEA. */}
        <p
          style={{
            fontSize: '0.7rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: '#FACC15',
            marginBottom: '0.35rem',
          }}
        >
          THE IDEA.
        </p>
        <p
          style={{
            fontSize: '0.875rem',
            lineHeight: '1.6',
            color: 'rgba(232, 230, 225, 0.85)',
            marginBottom: '0.75rem',
          }}
        >
          Do you read tons of things that you invariably forget within days? Do you have exams, lectures, notes, facts, concepts that you need to remember? How about NOT forgetting them?!!
        </p>
        <div
          style={{
            fontSize: '0.875rem',
            lineHeight: '1.6',
            color: 'rgba(232, 230, 225, 0.85)',
            marginBottom: '0.75rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.15rem',
          }}
        >
          <span>
            <span style={{ color: 'var(--color-foreground)', opacity: 0.7, fontWeight: 600 }}>1)</span> Add content (your own or what's shared).
          </span>
          <span>
            <span style={{ color: 'var(--color-foreground)', opacity: 0.7, fontWeight: 600 }}>2)</span> Answer relevant questions.
          </span>
          <span>
            <span style={{ color: 'var(--color-foreground)', opacity: 0.7, fontWeight: 600 }}>3)</span> Remember much more efficiently.
          </span>
        </div>
        <p
          style={{
            fontSize: '0.875rem',
            lineHeight: '1.6',
            color: 'rgba(232, 230, 225, 0.85)',
            marginBottom: '1.5rem',
          }}
        >
          The algorithm will test you right before you'd forget.
        </p>

        {/* ONLY ONE, FUNDAMENTAL RULE: SHOW UP DAILY. */}
        <p
          style={{
            fontSize: '0.7rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: '#FACC15',
            marginBottom: '0.35rem',
          }}
        >
          ONLY ONE, FUNDAMENTAL RULE:
          <br />
          SHOW UP DAILY.
        </p>
        <p
          style={{
            fontSize: '0.875rem',
            lineHeight: '1.6',
            color: 'rgba(232, 230, 225, 0.85)',
          }}
        >
          Even 5 minutes. Consistency is what makes this method work. If you skip multiple days in a row it will not work. Stay consistent and you'll remember for years, not days.
        </p>
      </div>
    </div>
  );
}

// ── Mode 2: shown to users with 1+ completed sessions ─────────────────────────

function ReturningUserCard() {
  const [expanded, setExpanded] = useState(false);
  const fact = getDailyFact();

  return (
    <div
      style={{
        border: '1px solid #1e1e2a',
        borderRadius: '14px',
        overflow: 'hidden',
        background: '#0e0e18',
        boxShadow: '0 0 16px rgba(124, 58, 237, 0.22), 0 0 32px rgba(124, 58, 237, 0.08)',
      }}
    >
      {/* Header / toggle */}
      <button
        onClick={() => setExpanded((e) => !e)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem 1rem',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--color-foreground)',
          textAlign: 'left',
        }}
      >
        <div>
          <span style={{ fontSize: '1rem', fontWeight: 600, display: 'block' }}>
            Why am I doing this again?
          </span>
          <span style={{ fontSize: '0.825rem', color: 'var(--color-muted)' }}>
            Quick reminder of your goal
          </span>
        </div>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            flexShrink: 0,
            color: 'var(--color-muted)',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 300ms ease',
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Expandable body */}
      <div
        style={{
          maxHeight: expanded ? '1200px' : '0px',
          overflow: 'hidden',
          transition: 'max-height 400ms ease-out',
        }}
      >
        <div style={{ padding: '0 1.25rem 0.844rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Core explanation */}
          <p
            style={{
              fontSize: '0.875rem',
              lineHeight: '1.6',
              color: 'rgba(232, 230, 225, 0.85)',
            }}
          >
            Every time you recall something successfully, your brain strengthens that specific neural pathway. The more you retrieve it, the less effort it takes next time — and the longer it sticks.
          </p>
          <p
            style={{
              fontSize: '0.875rem',
              lineHeight: '1.6',
              color: 'rgba(232, 230, 225, 0.85)',
            }}
          >
            Repetita's algorithm spaces your reviews at increasing intervals, testing you right before the memory would fade. What starts as a daily review gradually becomes weekly, then monthly, then once every few months.
          </p>

          {/* Did you know? box */}
          <div
            style={{
              background: 'rgba(96, 165, 250, 0.07)',
              border: '1px solid rgba(96, 165, 250, 0.18)',
              borderRadius: '0.75rem',
              padding: '1rem',
            }}
          >
            <p
              style={{
                fontSize: '0.7rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: '#60A5FA',
                marginBottom: '0.5rem',
              }}
            >
              Did You Know?
            </p>
            <p
              style={{
                fontSize: '0.875rem',
                lineHeight: '1.6',
                color: 'rgba(232, 230, 225, 0.85)',
                marginBottom: '0.5rem',
              }}
            >
              {fact.text}
            </p>
            <a
              href={fact.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: '0.75rem',
                color: '#60A5FA',
                textDecoration: 'underline',
              }}
            >
              {fact.source}
            </a>
          </div>

          {/* Closing line */}
          <p
            style={{
              fontSize: '0.875rem',
              fontWeight: 500,
              color: 'var(--color-accent)',
            }}
          >
            Keep showing up. The compound effect is real.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Export ─────────────────────────────────────────────────────────────────────

export default function OnboardingCard({ completedSessions }) {
  if (completedSessions === 0) return <NewUserCard />;
  return <ReturningUserCard />;
}
