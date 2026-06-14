export default function ProgressHeader({ weekly }) {
  if (!weekly || weekly.answers === 0) {
    return (
      <div className="mb-6 rounded-xl border border-dashed border-zinc-300 p-4 text-sm text-zinc-500">
        No sessions yet this week — your weekly totals will appear here.
      </div>
    );
  }
  const accuracy = Math.round((weekly.correct / weekly.answers) * 100);
  return (
    <div className="mb-6 flex gap-6 rounded-xl bg-zinc-50 p-4">
      <div>
        <div className="text-2xl font-semibold">{weekly.answers}</div>
        <div className="text-xs text-zinc-500">answers this week</div>
      </div>
      <div>
        <div className="text-2xl font-semibold">{accuracy}%</div>
        <div className="text-xs text-zinc-500">accuracy</div>
      </div>
    </div>
  );
}
