import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { getUserContentCounts, getAllDueQuestions, getUserStreak, getCompletedSessionCount, getUpNextDocumentTitles } from "@/lib/db/queries";
import OnboardingCard from "@/components/OnboardingCard";

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

function Card({ href, emoji, title, description, highlight, emojiColor, compact, glow }) {
  return (
    <Link
      href={href}
      className={`block px-6 rounded-2xl transition-colors hover:bg-violet-500/10 ${compact ? 'py-[0.792rem]' : 'py-[1.215rem]'}`}
      style={{
        background: glow ? 'color-mix(in srgb, #7c3aed 8%, var(--color-surface))' : 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        ...(glow && { borderLeftColor: '#7c3aed', borderLeftWidth: '4px' }),
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl leading-none" style={emojiColor ? { color: emojiColor } : undefined}>{emoji}</span>
            <span className="font-semibold text-base">{title}</span>
          </div>
          {highlight && (
            <p className="text-sm font-medium mb-0.5" style={{ color: '#a78bfa' }}>
              {highlight}
            </p>
          )}
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            {description}
          </p>
        </div>
        <span className="shrink-0 mt-0.5" style={{ color: 'var(--color-muted)' }}>→</span>
      </div>
    </Link>
  );
}

export default async function Home() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const [user, { documentCount, questionCount }, { currentStreak, maxStreak }] = await Promise.all([
    currentUser(),
    getUserContentCounts(userId),
    getUserStreak(userId),
  ]);

  const isNewUser = documentCount === 0 && questionCount === 0;
  const firstName = user?.firstName || null;

  if (isNewUser) {
    return (
      <div className="py-10">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-[#EEFF99] mb-2">
            Welcome! Let your epic learning journey begin.
          </h1>
          <p className="text-lg font-medium text-white">
            Head to your Library to browse shared content or upload your own.
          </p>
        </div>

        <div className="space-y-3">
          <Link
            href="/library"
            className="block px-6 py-[0.792rem] rounded-2xl transition-colors hover:bg-violet-500/10"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xl leading-none font-bold" style={{ color: '#EEFF99' }}>+</span>
                  <span className="font-semibold text-base">Add content</span>
                </div>
                <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
                  add your own content or browse others
                </p>
              </div>
              <span className="shrink-0" style={{ color: 'var(--color-muted)' }}>→</span>
            </div>
          </Link>
        </div>
      </div>
    );
  }

  const [dueQuestions, completedSessions, upNextTitles] = await Promise.all([
    getAllDueQuestions(userId),
    getCompletedSessionCount(userId),
    getUpNextDocumentTitles(userId),
  ]);
  const dueCount = dueQuestions.length;
  const level = getLevel(currentStreak);
  const nextLevel = LEVELS[level.number]; // undefined at max level (Immortal)
  const isMaxLevel = !nextLevel;
  const progressPct = isMaxLevel
    ? 1
    : (currentStreak - level.min) / (nextLevel.min - level.min);
  const daysToLevelUp = isMaxLevel ? 0 : nextLevel.min - currentStreak;

  // "Up next" line
  let upNextLine = null;
  if (upNextTitles.length === 1) {
    upNextLine = `Up next: ${upNextTitles[0]}, keep going`;
  } else if (upNextTitles.length >= 2) {
    upNextLine = `Up next: recap questions from ${upNextTitles[0]} and ${upNextTitles[1]}, ready to remember?`;
  }

  return (
    <div className="py-10">
      {completedSessions === 0 && <OnboardingCard completedSessions={completedSessions} />}

      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold text-[#EEFF99] mb-1">
          {firstName ? `Welcome back, ${firstName}! Let's get going!` : "Welcome back! Let's get going!"}
        </h1>

        {/* Streak + progress bar */}
        <div className="mt-4">
          <p className="text-lg font-semibold" style={{ color: 'var(--color-foreground)' }}>
            🔥 <span style={{ color: 'var(--color-accent)' }}>{currentStreak}</span> day streak
            {' · '}
            {level.label} Level
          </p>

          {/* Bar row */}
          <div className="flex items-center justify-center gap-3 mt-2">
            <div
              className="relative h-2 rounded-full"
              style={{ width: '160px', background: 'var(--color-border)' }}
            >
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${Math.round(Math.min(progressPct, 1) * 100)}%`,
                  background: 'var(--color-easy)',
                }}
              />
            </div>
            <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
              {isMaxLevel ? 'Best Streak EVER' : `Level up in ${daysToLevelUp} day${daysToLevelUp !== 1 ? 's' : ''}`}
            </span>
          </div>

          {/* Best streak */}
          {maxStreak > 0 && (
            <p className="mt-1.5 text-xs" style={{ color: 'var(--color-muted)' }}>
              Best: {maxStreak} day{maxStreak !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        {/* Up next */}
        {upNextLine && (
          <p className="mt-5 text-sm italic" style={{ color: 'var(--color-muted)' }}>
            {upNextLine}
          </p>
        )}
      </div>

      <div className="space-y-3">
        {completedSessions > 0 && <OnboardingCard completedSessions={completedSessions} />}
        <Card
          href="/study"
          emoji="📖"
          title="Start Studying"
          highlight={
            dueCount > 0
              ? `${dueCount} question${dueCount !== 1 ? 's' : ''} due — come on!`
              : "You're all caught up!"
          }
          description="Keep memorising what you want"
          glow
        />
        <Link
          href="/library"
          className="block px-6 py-[0.792rem] rounded-2xl transition-colors hover:bg-violet-500/10"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xl leading-none font-bold" style={{ color: '#EEFF99' }}>+</span>
                <span className="font-semibold text-base">Add content</span>
              </div>
              <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
                add your own content or browse others
              </p>
            </div>
            <span className="shrink-0" style={{ color: 'var(--color-muted)' }}>→</span>
          </div>
        </Link>
      </div>

    </div>
  );
}
