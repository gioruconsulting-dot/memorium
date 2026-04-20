import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { getUserContentCounts, getAllDueQuestions, getUserStreak, getCompletedSessionCount, getUpNextDocumentTitles } from "@/lib/db/queries";
import OnboardingCard from "@/components/OnboardingCard";
import StarryBackground from "@/components/StarryBackground";
import StreakCard from "@/components/StreakCard";

const LEVELS = [
  { number: 1, min: 0,   max: 0,        emoji: '🐣', label: 'Baby'        },
  { number: 2, min: 1,   max: 3,        emoji: '🕹️', label: 'Apprentice'  },
  { number: 3, min: 4,   max: 7,        emoji: '⚔️', label: 'Warrior'     },
  { number: 4, min: 8,   max: 14,       emoji: '🛡️', label: 'Veteran'     },
  { number: 5, min: 15,  max: 29,       emoji: '🔥', label: 'Elite'       },
  { number: 6, min: 30,  max: 59,       emoji: '💎', label: 'Master'      },
  { number: 7, min: 60,  max: 89,       emoji: '👑', label: 'Grandmaster' },
  { number: 8, min: 90,  max: 179,      emoji: '🌟', label: 'Legend'      },
  { number: 9, min: 180, max: Infinity, emoji: '☄️', label: 'Immortal'    },
];

function getLevel(streak) {
  return LEVELS.findLast(l => streak >= l.min) || LEVELS[0];
}

export default async function Home() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const [user, { documentCount, questionCount }, streakData] = await Promise.all([
    currentUser(),
    getUserContentCounts(userId),
    getUserStreak(userId),
  ]);
  const { currentStreak, maxStreak, streakCards, cardUsedAt, cardEarnedAt } = streakData;

  const isNewUser = documentCount === 0 && questionCount === 0;
  const firstName = user?.firstName || null;

  // ── New user (no content yet) ──────────────────────────────────────────────
  if (isNewUser) {
    return (
      <div style={{ position: 'relative', zIndex: 1, padding: '24px 0 16px' }}>
        <StarryBackground />
        <div style={{ marginBottom: '24px' }}>
          <p style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--color-muted)', marginBottom: '6px' }}>
            HOME
          </p>
          <h1 style={{ fontSize: '2.25rem', fontWeight: 700, color: '#ffffff', lineHeight: 1.15, marginBottom: '4px' }}>
            {firstName ? `Welcome, ${firstName}` : 'Welcome!'}
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)' }}>
            Let your epic learning journey begin.
          </p>
        </div>
        <OnboardingCard completedSessions={0} />
        <Link
          href="/library"
          style={{
            display: 'block',
            textDecoration: 'none',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: '14px',
            padding: '12px 16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-foreground)', marginBottom: '2px' }}>
                <span style={{ color: '#EEFF99', marginRight: '6px' }}>+</span>Add content
              </p>
              <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>
                add your own content or browse others
              </p>
            </div>
            <span style={{ color: 'var(--color-muted)' }}>→</span>
          </div>
        </Link>
      </div>
    );
  }

  // ── Returning user ─────────────────────────────────────────────────────────
  const [dueQuestions, completedSessions, upNextTitles] = await Promise.all([
    getAllDueQuestions(userId),
    getCompletedSessionCount(userId),
    getUpNextDocumentTitles(userId),
  ]);

  const dueCount = dueQuestions.length;
  const level = getLevel(currentStreak);
  const nextLevel = LEVELS[level.number];
  const isMaxLevel = !nextLevel;
  const progressPct = isMaxLevel
    ? 1
    : (currentStreak - level.min) / (nextLevel.min - level.min);
  const daysToLevelUp = isMaxLevel ? 0 : nextLevel.min - currentStreak;

  // Hero card description — italic doc titles
  let heroDescription = null;
  if (upNextTitles.length === 1) {
    heroDescription = <><em>{upNextTitles[0]}</em>, keep going.</>;
  } else if (upNextTitles.length >= 2) {
    heroDescription = <>Recap questions from <em>{upNextTitles[0]}</em> and <em>{upNextTitles[1]}</em>.</>;
  }

  return (
    <div style={{ position: 'relative', zIndex: 1, padding: '24px 0 8px' }}>
      <StarryBackground />

      {/* Onboarding for users who have content but haven't studied yet */}
      {completedSessions === 0 && <OnboardingCard completedSessions={0} />}

      {/* ── GREETING ─────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: '16px', paddingLeft: '16px' }}>
        <h1 style={{ fontSize: '1.9rem', fontWeight: 700, color: '#ffffff', lineHeight: 1.1, marginBottom: '2px' }}>
          {firstName ? `Welcome back, ${firstName}` : 'Welcome back'}
        </h1>
        <p style={{ fontSize: '1.035rem', color: 'var(--color-muted)' }}>
          Ready for today's run?
        </p>
      </div>

      {/* ── STREAK CARD ──────────────────────────────────────────────────── */}
      <StreakCard
        currentStreak={currentStreak}
        maxStreak={maxStreak}
        level={level}
        isMaxLevel={isMaxLevel}
        progressPct={progressPct}
        daysToLevelUp={daysToLevelUp}
        streakCards={streakCards ?? 0}
        cardUsedAt={cardUsedAt ?? null}
        cardEarnedAt={cardEarnedAt ?? null}
      />

      {/* ── HERO CARD — START STUDYING ───────────────────────────────────── */}
      <Link href="/study" style={{ display: 'block', textDecoration: 'none', marginBottom: '10px' }}>
        <div style={{
          background: '#08080f',
          border: '1px solid #16161e',
          borderRadius: '18px',
          padding: '16px',
          boxShadow: '0 0 36px rgba(124, 58, 237, 0.6), 0 0 72px rgba(124, 58, 237, 0.25)',
        }}>
          {/* UP NEXT overline + due pill */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
            <span style={{
              fontSize: '0.65rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'rgba(238, 255, 153, 0.8)',
            }}>
              Up Next
            </span>
            {dueCount > 0 && (
              <span style={{
                fontSize: '0.715rem',
                fontWeight: 500,
                color: 'var(--color-muted)',
                background: 'rgba(124, 58, 237, 0.12)',
                borderRadius: '999px',
                padding: '2px 8px',
              }}>
                {dueCount} due
              </span>
            )}
          </div>
          {/* Title */}
          <h2 style={{ fontSize: '1.65rem', fontWeight: 700, color: '#ffffff', lineHeight: 1.2, marginBottom: '4px' }}>
            Start Studying
          </h2>
          {/* Description */}
          <p style={{ fontSize: '0.95rem', color: '#9a9896', marginBottom: '10px', lineHeight: 1.5 }}>
            {heroDescription || (dueCount > 0
              ? `${dueCount} question${dueCount !== 1 ? 's' : ''} ready for review`
              : "You're all caught up!")}
          </p>
          {/* Bottom row: label + circle arrow */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.88rem', color: '#9a9896' }}>
              Keep memorising what you want
            </span>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: '#7c3aed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </div>
          </div>
        </div>
      </Link>

      {/* ── TERTIARY CARDS ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {completedSessions > 0 && <OnboardingCard completedSessions={completedSessions} />}
        <Link href="/library" style={{ display: 'block', textDecoration: 'none' }}>
          <div style={{
            background: '#0e0e18',
            border: '1px solid #1e1e2a',
            borderRadius: '14px',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 0 16px rgba(124, 58, 237, 0.22), 0 0 32px rgba(124, 58, 237, 0.08)',
          }}>
            <div>
              <p style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--color-foreground)', marginBottom: '2px' }}>
                <span style={{ color: '#EEFF99', marginRight: '6px' }}>+</span>Add content
              </p>
              <p style={{ fontSize: '0.825rem', color: 'var(--color-muted)' }}>
                Add your own content or browse others
              </p>
            </div>
            <span style={{ color: 'var(--color-muted)' }}>→</span>
          </div>
        </Link>
      </div>
    </div>
  );
}
