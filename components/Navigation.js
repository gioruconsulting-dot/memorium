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
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

// ── Icon components ──────────────────────────────────────────────────────────

// Home — pentagon outline + interior diamond marker.
// The diamond replaces the generic door and reads as a precision
// base-marker / headquarters rather than a childish house.
function HomeIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M3,13 L16,3 L29,13 L29,27 L3,27 Z" />
      <path d="M16,15 L20,19 L16,23 L12,19 Z" />
    </svg>
  );
}

// Study — two offset stacked cards (deck).
// Evokes an active study session / flashcard deck.
// Clearly distinct from Library's static horizontal slabs.
function StudyIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="7"  y="4"  width="19" height="15" rx="2" />
      <rect x="4"  y="9"  width="19" height="15" rx="2" />
    </svg>
  );
}

// Progress — diagonal ascending line with three ring nodes.
// Reads as a progression path / upgrade arc rather than a corporate
// bar chart. Elegant and distinctive.
function ProgressIcon() {
  return (
    <svg {...ICON_PROPS}>
      <line x1="5" y1="26" x2="27" y2="6" />
      <circle cx="5"  cy="26" r="2.5" />
      <circle cx="16" cy="16" r="2.5" />
      <circle cx="27" cy="6"  r="2.5" />
    </svg>
  );
}

// Library — three horizontal slabs widening toward the bottom.
// The perspective taper suggests stacked archive modules / volumes.
// Calm and stable — clearly not Study.
function LibraryIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="6" y="5"  width="20" height="5" rx="1" />
      <rect x="4" y="13" width="24" height="5" rx="1" />
      <rect x="2" y="21" width="28" height="5" rx="1" />
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

const ACTIVE_COLOR   = 'rgba(238, 255, 153, 0.75)';
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
              className="flex-1 flex flex-col items-center justify-center"
              style={{ gap: '3px', color, transition: 'color 0.2s ease' }}
            >
              <div style={{
                filter: active ? 'drop-shadow(0 0 3px rgba(238, 255, 153, 0.25))' : 'none',
                transition: 'filter 0.2s ease',
              }}>
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
