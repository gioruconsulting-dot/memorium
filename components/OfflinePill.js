'use client';

import { usePathname } from "next/navigation";
import { useOnlineStatus } from "@/lib/offline/useOnlineStatus";

// "Off the grid" status pill (sub-step 5, chunk 4a). PRESENTATIONAL ONLY — no
// onClick, nothing tappable (pointer-events-none). Visible only while offline,
// driven by useOnlineStatus (the same signal the cache manager + flush use).
//
// Cool-cyan (#9fd4e6 on a faint cyan wash) is chosen to read as STATUS, distinct
// from the app's action accents — violet rgba(124,58,237), green rgba(52,208,128),
// azure rgba(91,157,245). Values match the mockup's .pill-off. Positioned fixed
// top-right; the responsive top offset (md:top-[68px]) clears the desktop top nav.
export default function OfflinePill() {
  const online = useOnlineStatus();
  const pathname = usePathname();
  // Hidden online; and suppressed on /study — Study's offline indicator is the
  // in-header %→pill swap (chunk 4c), not this floating pill (which would collide
  // with Study's fixed top-0 in-session header).
  if (online || pathname === '/study') return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed right-3 top-3 md:top-[68px] z-[60] inline-flex items-center rounded-full select-none pointer-events-none"
      style={{
        gap: '6px',
        fontSize: '10.5px',
        fontWeight: 700,
        letterSpacing: '0.02em',
        color: '#9fd4e6',
        padding: '5px 9px',
        border: '1px solid rgba(120, 190, 215, 0.35)',
        background: 'rgba(120, 190, 215, 0.08)',
        boxShadow: '0 0 14px rgba(120, 190, 215, 0.18)',
      }}
    >
      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <path d="M2 8.8a16 16 0 0 1 20 0" />
        <path d="M5 12.6a11 11 0 0 1 14 0" />
        <path d="M8.5 16.2a6 6 0 0 1 7 0" />
        <line x1="3" y1="3" x2="21" y2="21" strokeWidth="2.4" />
      </svg>
      Off the grid
    </div>
  );
}
