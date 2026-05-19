'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

export default function NewNotePage() {
  const router = useRouter();
  // Strict-mode renders effects twice in dev — the ref guard prevents a duplicate
  // create on mount.
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    (async () => {
      try {
        const res = await fetch('/api/notes/create', { method: 'POST' });
        const data = await res.json();
        if (!res.ok || !data?.id) throw new Error(data?.error || 'Create failed');
        router.replace(`/notes/${data.id}`);
      } catch (err) {
        console.error('[notes/new] create failed:', err);
        router.replace('/notes');
      }
    })();
  }, [router]);

  return (
    <main style={{ padding: '24px', maxWidth: '720px', margin: '0 auto' }}>
      <p style={{ color: 'var(--color-muted)', fontSize: '14px' }}>Creating note…</p>
    </main>
  );
}
