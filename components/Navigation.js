'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';

const LINKS = [
  { href: '/',         icon: '/icons/icon-home.png',          label: 'Home' },
  { href: '/study',    icon: '/icons/icon-study-book.png',    label: 'Study' },
  { href: '/progress', icon: '/icons/icon-progress-chart.png', label: 'Progress' },
  { href: '/library',  icon: '/icons/icon-library-books.png', label: 'Library' },
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
        {LINKS.map(({ href, icon, label }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className="flex-1 flex flex-col items-center justify-center"
              style={{
                minHeight: '50px',
                paddingBlock: '8px',
                gap: '2px',
                color: active ? 'var(--color-accent)' : 'var(--color-muted)',
              }}
            >
              <img
                src={icon}
                alt={label}
                width={52}
                height={52}
                style={{
                  mixBlendMode: 'lighten',
                  objectFit: 'contain',
                  opacity: active ? 1 : 0.4,
                  filter: active ? 'brightness(3)' : 'grayscale(50%) brightness(3)',
                  display: 'block',
                  border: 'none',
                  outline: 'none',
                  boxShadow: 'none',
                  background: 'transparent',
                }}
              />
              <span style={{ fontSize: '13px', fontWeight: 500 }}>{label}</span>
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
        {LINKS.map(({ href, icon, label }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-1.5 text-sm font-medium"
              style={{ color: active ? 'var(--color-accent)' : 'var(--color-muted)' }}
            >
              <img
                src={icon}
                alt={label}
                width={20}
                height={20}
                style={{
                  mixBlendMode: 'lighten',
                  opacity: active ? 1 : 0.45,
                  filter: active ? 'none' : 'grayscale(40%)',
                }}
              />
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
