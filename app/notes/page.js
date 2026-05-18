import { currentUser } from '@clerk/nextjs/server';

export default async function NotesPage() {
  const user = await currentUser();
  const identifier = user?.emailAddresses?.[0]?.emailAddress ?? user?.id ?? 'unknown';

  return (
    <main style={{ padding: '24px', maxWidth: '720px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 600 }}>You have notes access ✓</h1>
      <p style={{ color: 'var(--color-muted)', fontSize: '14px', marginTop: '12px' }}>
        Signed in as {identifier}
      </p>
    </main>
  );
}
