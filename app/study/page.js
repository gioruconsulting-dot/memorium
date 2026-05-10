import { Suspense } from 'react';
import StudyView from './StudyView';

// Fallback mirrors StudyView's phase === 'loading' UI so the
// pre-hydration shell is visually identical to its first paint.
function StudyLoadingFallback() {
  return (
    <div className="min-h-dvh flex items-center justify-center">
      <div className="text-center" style={{ color: 'var(--color-muted)' }}>
        <div
          className="inline-block w-8 h-8 border-2 rounded-full animate-spin mb-4"
          style={{ borderColor: 'var(--color-border)', borderTopColor: '#4ADE80' }}
        />
        <p>Loading your session…</p>
      </div>
    </div>
  );
}

export default function StudyPage() {
  return (
    <Suspense fallback={<StudyLoadingFallback />}>
      <StudyView />
    </Suspense>
  );
}
