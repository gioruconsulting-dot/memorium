import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { getUserContentCounts, getAllDueQuestions } from "@/lib/db/queries";

function Card({ href, emoji, title, description, highlight }) {
  return (
    <Link
      href={href}
      className="block p-6 rounded-2xl transition-colors hover:bg-violet-500/10"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl leading-none">{emoji}</span>
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

  const [user, { documentCount, questionCount }] = await Promise.all([
    currentUser(),
    getUserContentCounts(userId),
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
            Upload what you want to remember, or browse what others are learning.
          </p>
        </div>

        <div className="space-y-3">
          <Card
            href="/upload"
            emoji="➕"
            title="Upload"
            description="Paste text and generate study questions automatically"
          />
          <Card
            href="/browse"
            emoji="🌐"
            title="Browse"
            description="Discover documents shared by other learners"
          />
        </div>
      </div>
    );
  }

  const dueQuestions = await getAllDueQuestions(userId);
  const dueCount = dueQuestions.length;

  return (
    <div className="py-10">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold text-[#EEFF99] mb-1">
          {firstName ? `Welcome back, ${firstName}.` : 'Welcome back!'}
        </h1>
        <p className="text-lg font-medium text-white">
          What shall we do today?
        </p>
      </div>

      <div className="space-y-3">
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
        />
        <Card
          href="/upload"
          emoji="➕"
          title="Upload"
          description="Paste text and generate new study questions"
        />
        <Card
          href="/browse"
          emoji="🌐"
          title="Browse"
          description="Discover documents shared by other learners"
        />
      </div>
    </div>
  );
}
