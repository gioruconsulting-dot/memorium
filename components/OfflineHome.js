'use client';

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useUser, useAuth } from "@clerk/nextjs";
import { useOnlineStatus } from "@/lib/offline/useOnlineStatus";
import { outboxCount } from "@/lib/offline/outbox";
import { readDueSet } from "@/lib/offline/db";
import StarryBackground from "@/components/StarryBackground";

// Offline Home takeover + reconnect sync toast (sub-step 5, chunk 4c-ii).
// A layout-mounted client island (same pattern as OfflinePill), gated to '/'.
// app/page.js (the server Home) is never touched — when offline this overlay
// covers it; on reconnect a toast shows while the outbox drains, then we
// router.refresh() to repopulate the real server Home.
//
// z-index: overlay z-40 sits BELOW Navigation (z-50) and OfflinePill (z-60) so
// the bottom nav stays tappable and the "Off the grid" pill still shows. The
// toast (z-60) only appears online, when the pill is hidden — they never stack.
export default function OfflineHome() {
  const pathname = usePathname();
  const router = useRouter();
  const online = useOnlineStatus();
  // userId from useAuth (chunk-2's proven offline source — reads the cached
  // session, no network, and matches the dueCache key). useUser is best-effort
  // for the name only and may be unhydrated offline.
  const { userId } = useAuth();
  const { user } = useUser();
  const firstName = user?.firstName || null;

  const [recapTitles, setRecapTitles] = useState([]);
  const [syncN, setSyncN] = useState(null); // non-null => toast visible with N
  const prevOnline = useRef(online);

  // Recap titles for the offline card — pulled from the cached due set (each
  // cached question carries document_title). Omitted if unavailable.
  useEffect(() => {
    if (pathname !== '/' || online || !userId) return;
    let cancelled = false;
    (async () => {
      try {
        const cached = await readDueSet(userId);
        const titles = [...new Set((cached?.questions || []).map((q) => q.document_title).filter(Boolean))].slice(0, 2);
        if (!cancelled) setRecapTitles(titles);
      } catch { /* omit recap line */ }
    })();
    return () => { cancelled = true; };
  }, [pathname, online, userId]);

  // Detect offline→online transition WHILE on Home → show the sync toast and
  // poll the outbox to zero (no flush event subscription, by decision), then
  // refresh the real server Home.
  useEffect(() => {
    const was = prevOnline.current;
    prevOnline.current = online;
    if (pathname !== '/' || !(was === false && online === true)) return;

    let cancelled = false;
    let intervalId = null;
    let timeoutId = null;
    const finish = () => {
      if (cancelled) return;
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      if (timeoutId) clearTimeout(timeoutId);
      setSyncN(null);
      router.refresh();
    };

    (async () => {
      let n = 0;
      try { n = await outboxCount(); } catch { n = 0; }
      if (cancelled) return;
      if (n === 0) { router.refresh(); return; } // nothing queued — just repopulate
      setSyncN(n);
      intervalId = setInterval(async () => {
        let c = 0;
        try { c = await outboxCount(); } catch { c = 0; }
        if (!cancelled && c === 0) finish();
      }, 400);
      timeoutId = setTimeout(finish, 6000); // max window; grades sync next cycle if not drained
    })();

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [online, pathname, router]);

  if (pathname !== '/') return null;

  // OFFLINE → full takeover overlay.
  if (!online) {
    return (
      <div style={{
        position:   'fixed',
        inset:      0,
        zIndex:     40, // below Navigation (z-50) + OfflinePill (z-60)
        background: 'var(--color-background)',
        overflowY:  'auto',
        paddingBottom: '96px', // clear the fixed bottom nav
      }}>
        <StarryBackground />
        {/* Top padding mirrors the online <main> offset (md:pt-20) so the greeting
            clears the fixed desktop top nav (h-14) and lands where online Home's does;
            mobile keeps a 24px gap (bottom nav, top is free). */}
        <div className="pt-6 md:pt-20 px-4 pb-2" style={{ position: 'relative', zIndex: 1, maxWidth: '42rem', margin: '0 auto' }}>

          {/* Greeting */}
          <div style={{ marginBottom: '16px', paddingLeft: '16px' }}>
            <h1 style={{ fontSize: '1.9rem', fontWeight: 700, color: '#ffffff', lineHeight: 1.1, marginBottom: '2px' }}>
              Welcome back{firstName ? `, ${firstName}` : ''}
            </h1>
            <p style={{ fontSize: '1.035rem', color: 'var(--color-muted)' }}>
              {"Off the grid — study's still on."}
            </p>
          </div>

          {/* Start Studying — matches the real online hero card (violet glow) */}
          <a href="/study" style={{ display: 'block', textDecoration: 'none', marginBottom: '10px' }}>
            <div style={{
              background:   '#08080f',
              border:       '1px solid #16161e',
              borderRadius: '18px',
              padding:      '16px',
              boxShadow:    '0 0 36px rgba(124, 58, 237, 0.6), 0 0 72px rgba(124, 58, 237, 0.25)',
            }}>
              <div style={{ marginBottom: '3px' }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(238, 255, 153, 0.8)' }}>
                  Up next
                </span>
              </div>
              <h2 style={{ fontSize: '1.65rem', fontWeight: 700, color: '#ffffff', lineHeight: 1.2, marginBottom: '4px' }}>
                Start Studying
              </h2>
              {recapTitles.length > 0 && (
                <p style={{ fontSize: '0.95rem', color: '#9a9896', marginBottom: '10px', lineHeight: 1.5 }}>
                  Recap from <em>{recapTitles[0]}</em>{recapTitles[1] && <> and <em>{recapTitles[1]}</em></>}.
                </p>
              )}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: recapTitles.length > 0 ? 0 : '10px' }}>
                <span style={{ fontSize: '0.88rem', color: '#9a9896' }}>From your saved set</span>
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </div>
              </div>
            </div>
          </a>

        </div>
      </div>
    );
  }

  // ONLINE + sync window → toast (pill is hidden online, so no stacking).
  if (syncN !== null) {
    return (
      <>
        <style>{`@keyframes ohSpin { to { transform: rotate(360deg); } }`}</style>
        <div
          role="status"
          aria-live="polite"
          className="fixed left-3.5 right-3.5 top-3 md:top-[68px] z-[60]"
          style={{
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            gap:            '9px',
            fontSize:       '12.5px',
            fontWeight:     600,
            padding:        '11px 13px',
            borderRadius:   '13px',
            border:         '1px solid rgba(200,224,52,.3)',
            background:     'rgba(20,20,12,.92)',
            color:          '#ecdf9a',
            backdropFilter: 'blur(4px)',
          }}
        >
          <span style={{
            width:        '13px',
            height:       '13px',
            borderRadius: '50%',
            border:       '2px solid rgba(236,223,154,.3)',
            borderTop:    '2px solid #ecdf9a',
            animation:    'ohSpin .85s linear infinite',
            flexShrink:   0,
          }} />
          Syncing your {syncN} offline grade{syncN !== 1 ? 's' : ''}…
        </div>
      </>
    );
  }

  return null;
}
