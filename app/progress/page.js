'use client';

import { useState, useEffect } from 'react';

function StatCard({ value, label }) {
  return (
    <div
      className="rounded-2xl p-5 flex flex-col"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      <span className="text-4xl font-semibold tracking-tight leading-none mb-2">
        {value}
      </span>
      <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
        {label}
      </span>
    </div>
  );
}

export default function ProgressPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function fetchStats() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/stats/summary');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load stats');
      setStats(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchStats(); }, []);

  if (loading) {
    return (
      <div className="py-8">
        <h1 className="text-2xl font-semibold text-center text-[#EEFF99] mb-8">
          Progress
        </h1>
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl p-5 h-24 animate-pulse"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8">
        <h1 className="text-2xl font-semibold text-center text-[#EEFF99] mb-6">
          Progress
        </h1>
        <p className="mb-4" style={{ color: 'var(--color-forgot)' }}>{error}</p>
        <button
          onClick={fetchStats}
          className="px-5 py-2.5 rounded-lg font-medium text-sm"
          style={{ background: 'var(--color-foreground)', color: 'var(--color-background)' }}
        >
          Try Again
        </button>
      </div>
    );
  }

  if (stats?.totalQuestions === 0) {
    return (
      <div className="py-8">
        <h1 className="text-2xl font-semibold text-center text-[#EEFF99] mb-6">
          Progress
        </h1>
        <p className="mb-5" style={{ color: 'var(--color-muted)' }}>
          No questions yet. Upload your first document to get started.
        </p>
        <a
          href="/upload"
          className="inline-block px-5 py-2.5 rounded-lg font-medium text-sm"
          style={{ background: 'var(--color-foreground)', color: 'var(--color-background)' }}
        >
          Upload a Document
        </a>
      </div>
    );
  }

  return (
    <div className="py-8">
      <h1 className="text-2xl font-semibold text-center text-[#EEFF99] mb-6">
        Progress
      </h1>
      <div className="grid grid-cols-2 gap-3">
        <StatCard value={stats.totalQuestions} label="In your library" />
        <StatCard value={stats.masteredCount} label="Mastered (streak 5+)" />
        <StatCard value={`${stats.accuracyPercent}%`} label="Correct answers" />
        <StatCard value={stats.studyStreak} label="Days this month" />
      </div>
    </div>
  );
}
