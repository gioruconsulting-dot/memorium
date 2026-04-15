'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';

// ── Inline SVG icons ────────────────────────────────────────────────────────

function HomeIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3,14 L16,3 L29,14 L29,28 L3,28 Z" />
      <path d="M13,28 L13,21 L19,21 L19,28" />
    </svg>
  );
}

function StudyIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16,7 C11,6 5,8 4,11 L4,25 C5,22 11,20 16,22" />
      <path d="M16,7 C21,6 27,8 28,11 L28,25 C27,22 21,20 16,22" />
      <line x1="16" y1="7" x2="16" y2="22" />
    </svg>
  );
}

function ProgressIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2"  y="18" width="7" height="10" rx="1" />
      <rect x="12" y="11" width="7" height="17" rx="1" />
      <rect x="22" y="4"  width="7" height="24" rx="1" />
    </svg>
  );
}

function LibraryIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3"  y="9"  width="7" height="16" rx="1" />
      <rect x="12" y="5"  width="7" height="20" rx="1" />
      <rect x="21" y="12" width="7" height="13" rx="1" />
      <line x1="1" y1="26" x2="31" y2="26" />
    </svg>
  );
}

// ── Nav links ───────────────────────────────────────────────────────────────

const LINKS = [
  { href: '/',         Icon: HomeIcon,     label: 'Home'     },
  { href: '/study',    Icon: StudyIcon,    label: 'Study'    },
  { href: '/progress', Icon: ProgressIcon, label: 'Progress' },
  { href: '/library',  Icon: LibraryIcon,  label: 'Library'  },
];

const ACTIVE_COLOR   = 'rgba(238, 255, 153, 0.75)';
const INACTIVE_COLOR = 'var(--color-muted)';

// ── Component ───────────────────────────────────────────────────────────────

export default function Navigation() {
  const pathname = usePathname();

  if (pathname === '/study' || pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up')) return null;

  return (
    <>
      {/* Mobile: fixed bottom bar */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex"
        style={{
          background: '#0d0d0c',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          paddingTop: '8px',
          paddingBottom: '8px',
        }}
      >
        {LINKS.map(({ href, Icon, label }) => {
          const active = pathname === href;
          const color  = active ? ACTIVE_COLOR : INACTIVE_COLOR;
          return (
            <Link
              key={href}
              href={href}
              className="flex-1 flex flex-col items-center justify-center"
              style={{ gap: '3px', color, transition: 'color 0.2s ease' }}
            >
              <div style={{ filter: active ? 'drop-shadow(0 0 4px rgba(238, 255, 153, 0.3))' : 'none', transition: 'filter 0.2s ease' }}>
                <Icon />
              </div>
              <span style={{ fontSize: '11px', fontWeight: active ? 500 : 400, lineHeight: 1 }}>
                {label}
              </span>
            </Link>
          );
        })}
        {/* User avatar — far right */}
        <div className="flex items-center justify-center" style={{ paddingInline: '12px' }}>
          <UserButton afterSignOutUrl="/sign-in" />
        </div>
      </nav>

      {/* Desktop: fixed top bar */}
      <nav
        className="hidden md:flex fixed top-0 left-0 right-0 z-50 items-center gap-6 px-6 h-14"
        style={{
          background: '#0d0d0c',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        }}
      >
        <span className="font-semibold mr-2 text-[#EEFF99]">Repetita</span>
        {LINKS.map(({ href, Icon, label }) => {
          const active = pathname === href;
          const color  = active ? ACTIVE_COLOR : INACTIVE_COLOR;
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-1.5 text-sm"
              style={{ color, fontWeight: active ? 500 : 400, transition: 'color 0.2s ease' }}
            >
              <Icon />
              <span>{label}</span>
            </Link>
          );
        })}
        <div className="ml-auto">
          <UserButton afterSignOutUrl="/sign-in" />
        </div>
      </nav>
    </>
  );
}
