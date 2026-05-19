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
        if (!res.ok) {
          const code = res.status === 401 || res.status === 403 ? 'auth'
                     : res.status >= 500 ? 'server'
                     : 'unknown';
          router.replace(`/notes?error=${code}`);
          return;
        }
        const data = await res.json();
        if (!data?.id) {
          router.replace('/notes?error=unknown');
          return;
        }
        router.replace(`/notes/${data.id}`);
      } catch (err) {
        console.error('[notes/new] create failed:', err);
        router.replace('/notes?error=network');
      }
    })();
  }, [router]);

  return (
    <main style={{ padding: '24px', maxWidth: '720px', margin: '0 auto' }}>
      <p style={{ color: 'var(--color-muted)', fontSize: '14px' }}>Creating note…</p>
    </main>
  );
}
