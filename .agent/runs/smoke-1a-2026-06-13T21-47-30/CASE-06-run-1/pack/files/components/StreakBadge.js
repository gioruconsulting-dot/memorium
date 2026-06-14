import { Flame } from 'lucide-react';

export default function StreakBadge({ days }) {
  const label = days === 0 ? 'Start your streak' : `${days} day${days === 1 ? '' : 's'}`;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800">
      <Flame className="h-4 w-4" aria-hidden="true" />
      {label}
    </span>
  );
}
