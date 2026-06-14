'use client';

import { useState, useTransition } from 'react';
import { clearStaleSyncRows } from '@/app/actions/cleanup';

export default function StorageSection() {
  const [cleared, setCleared] = useState(null);
  const [pending, startTransition] = useTransition();

  return (
    <section className="rounded-xl border p-4">
      <h2 className="text-sm font-semibold">Storage &amp; sync</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Clear leftover sync state from offline sessions.
      </p>
      <button
        className="mt-3 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs text-white disabled:opacity-50"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await clearStaleSyncRows();
            setCleared(r.cleared);
          })
        }
      >
        {pending ? 'Clearing…' : 'Clear stale sync data'}
      </button>
      {cleared !== null && (
        <p className="mt-2 text-xs text-emerald-600">Cleared {cleared} stale rows.</p>
      )}
    </section>
  );
}
