'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';

// ── Shared icon constants ────────────────────────────────────────────────────

const ICON_PROPS = {
  width: 24,
  height: 24,
  viewBox: '0 0 32 32',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.75,           // slightly heavier — less fragile at mobile size
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

// ── Icon components ──────────────────────────────────────────────────────────

// Home — pentagon with a single centered ring mark.
// Ring replaces the diamond for a cleaner one-element interior.
function HomeIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M3,13 L16,3 L29,13 L29,27 L3,27 Z" />
      <circle cx="16" cy="19" r="3" />
    </svg>
  );
}

// Study — two cards with increased offset so both reads are distinct.
// More air between them → stronger "deck" silhouette at mobile scale.
function StudyIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="9"  y="3"  width="18" height="14" rx="2.5" />
      <rect x="4"  y="9"  width="18" height="14" rx="2.5" />
    </svg>
  );
}

// Progress — three ascending vertical pillars (short → medium → tall).
// Reads instantly as "leveling up" or "game progression."
// No nodes, no diagonal, no analytics feeling.
function ProgressIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="3"  y="19" width="7" height="9"  rx="2" />
      <rect x="13" y="12" width="7" height="16" rx="2" />
      <rect x="23" y="5"  width="7" height="23" rx="2" />
    </svg>
  );
}

// Library — three uniform-width horizontal slabs.
// Equal widths give a strong, stable block silhouette — clearly an archive.
function LibraryIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="3" y="4"  width="26" height="6" rx="2" />
      <rect x="3" y="13" width="26" height="6" rx="2" />
      <rect x="3" y="22" width="26" height="6" rx="2" />
    </svg>
  );
}

// ── Nav data ─────────────────────────────────────────────────────────────────

const LINKS = [
  { href: '/',         Icon: HomeIcon,     label: 'Home'     },
  { href: '/study',    Icon: StudyIcon,    label: 'Study'    },
  { href: '/progress', Icon: ProgressIcon, label: 'Progress' },
  { href: '/library',  Icon: LibraryIcon,  label: 'Library'  },
];

// Brighter active colour (0.9 vs old 0.75) — crisp, not aura-y
const ACTIVE_COLOR   = 'rgba(255, 255, 255, 0.9)';
const INACTIVE_COLOR = 'var(--color-muted)';

// ── Component ────────────────────────────────────────────────────────────────

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
          paddingTop: '10px',
          paddingBottom: '10px',
        }}
      >
        {LINKS.map(({ href, Icon, label }) => {
          const active = pathname === href;
          const color  = active ? ACTIVE_COLOR : INACTIVE_COLOR;
          return (
            <Link
              key={href}
              href={href}
              className="flex-1 flex items-center justify-center"
              style={{ color, transition: 'color 0.2s ease' }}
            >
              {/* Pill wrapper — shown only on active tab, same padding always to prevent layout shift */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '3px',
                paddingInline: '10px',
                paddingBlock: '5px',
                borderRadius: '10px',
                background: active ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                transition: 'background 0.2s ease',
              }}>
                <Icon />
                <span style={{ fontSize: '11px', fontWeight: active ? 500 : 400, lineHeight: 1 }}>
                  {label}
                </span>
              </div>
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
