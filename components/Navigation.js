'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';

const LINKS = [
  { href: '/',         emoji: '🏠', label: 'Home' },
  { href: '/study',    emoji: '📖', label: 'Study' },
  { href: '/upload',   emoji: '+',  label: 'Upload' },
  { href: '/browse',   emoji: '🌐', label: 'Browse' },
  { href: '/progress', emoji: '📊', label: 'Progress' },
  { href: '/library',  emoji: '📚', label: 'Library' },
];

export default function Navigation() {
  const pathname = usePathname();

  // Hide during study sessions and on auth pages
  if (pathname === '/study' || pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up')) return null;

  return (
    <>
      {/* Mobile: sticky bottom bar */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex"
        style={{
          background: 'var(--color-surface)',
          borderTop: '1px solid var(--color-border)',
        }}
      >
        {LINKS.map(({ href, emoji, label }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className="flex-1 flex flex-col items-center justify-center gap-0.5"
              style={{
                minHeight: '56px',
                color: active ? 'var(--color-accent)' : 'var(--color-muted)',
              }}
            >
              <span className="text-xl leading-none font-medium" style={href === '/upload' ? { color: '#EEFF99', fontSize: '1.375rem' } : undefined}>{emoji}</span>
              <span className="text-xs font-medium">{label}</span>
            </Link>
          );
        })}
        {/* User avatar — far right on mobile bottom bar */}
        <div className="flex items-center justify-center" style={{ minHeight: '56px', paddingInline: '12px' }}>
          <UserButton afterSignOutUrl="/sign-in" />
        </div>
      </nav>

      {/* Desktop: fixed top bar */}
      <nav
        className="hidden md:flex fixed top-0 left-0 right-0 z-50 items-center gap-6 px-6 h-14"
        style={{
          background: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <span className="font-semibold mr-2 text-[#EEFF99]">Repetita</span>
        {LINKS.map(({ href, emoji, label }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-1.5 text-sm font-medium"
              style={{ color: active ? 'var(--color-accent)' : 'var(--color-muted)' }}
            >
              <span>{emoji}</span>
              <span>{label}</span>
            </Link>
          );
        })}
        {/* User avatar — pushed to far right */}
        <div className="ml-auto">
          <UserButton afterSignOutUrl="/sign-in" />
        </div>
      </nav>
    </>
  );
}
