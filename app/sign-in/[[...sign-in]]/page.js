'use client';

import { SignIn } from "@clerk/nextjs";
import { useState, useEffect, useRef } from "react";

const LOGO_SIZE = 480;

const GLOW_CYCLE = 3.2; // seconds per pulse wave
const GLOW_STAGGER = 0.45; // seconds between each ring's peak

const RINGS = [
  { offset: -105, borderWidth: '2px',   borderStyle: 'dashed', color: '#7c3aed', ccw: false, speed: 70, glowDelay: 0                  },
  { offset: -80,  borderWidth: '1.5px', borderStyle: 'dashed', color: '#60A5FA', ccw: true,  speed: 55, glowDelay: GLOW_STAGGER        },
  { offset: -55,  borderWidth: '1.5px', borderStyle: 'dotted', color: '#7c3aed', ccw: false, speed: 80, glowDelay: GLOW_STAGGER * 2    },
  { offset: -30,  borderWidth: '1px',   borderStyle: 'dashed', color: '#60A5FA', ccw: true,  speed: 45, glowDelay: GLOW_STAGGER * 3    },
  { offset: -5,   borderWidth: '1px',   borderStyle: 'dotted', color: '#7c3aed', ccw: false, speed: 90, glowDelay: GLOW_STAGGER * 4    },
];

// Height of the hero section = full ring system diameter
const HERO_HEIGHT = LOGO_SIZE + RINGS[4].offset * 2; // 480 + 376 = 856px

// Glow intensity per ring (slightly decreases outward so pulse looks like it's travelling)
const GLOW = [
  { baseAlpha: 0.4,  yellowShadow: '0 0 18px rgba(238,255,153,1),    0 0 45px rgba(238,255,153,0.8),  0 0 90px rgba(238,255,153,0.4)' },
  { baseAlpha: 0.35, yellowShadow: '0 0 15px rgba(238,255,153,0.95), 0 0 38px rgba(238,255,153,0.7),  0 0 75px rgba(238,255,153,0.35)' },
  { baseAlpha: 0.3,  yellowShadow: '0 0 12px rgba(238,255,153,0.9),  0 0 30px rgba(238,255,153,0.6),  0 0 60px rgba(238,255,153,0.3)' },
  { baseAlpha: 0.25, yellowShadow: '0 0 10px rgba(238,255,153,0.85), 0 0 24px rgba(238,255,153,0.55), 0 0 48px rgba(238,255,153,0.25)' },
  { baseAlpha: 0.2,  yellowShadow: '0 0 8px  rgba(238,255,153,0.8),  0 0 20px rgba(238,255,153,0.5),  0 0 40px rgba(238,255,153,0.22)' },
];

const BASE_SHADOW_SIZE = [5, 4, 4, 3, 3];

function parseColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function buildGlowKeyframes() {
  return RINGS.map((ring, i) => {
    const { r, g, b } = parseColor(ring.color);
    const glow = GLOW[i];
    const baseShadow = `0 0 ${BASE_SHADOW_SIZE[i]}px rgba(${r},${g},${b},${glow.baseAlpha})`;
    // Sharp spike: dim at rest, bright yellow at 20%, back to dim by 50%, silence for remaining half
    // This makes the pulse feel like a discrete wave rather than a slow breathe
    return `
      @keyframes glow-ring-${i} {
        0%   { border-color: ${ring.color}; box-shadow: ${baseShadow}; }
        10%  { border-color: #EEFF99;      box-shadow: ${glow.yellowShadow}; }
        20%  { border-color: #EEFF99;      box-shadow: ${glow.yellowShadow}; }
        45%  { border-color: ${ring.color}; box-shadow: ${baseShadow}; }
        100% { border-color: ${ring.color}; box-shadow: ${baseShadow}; }
      }
    `;
  }).join('');
}

function generateStars() {
  const palette = ['#EEFF99', '#EEFF99', '#FFD166', '#FFA552', '#FF6B6B', '#FF8C42', '#FFE08A', '#fff5cc'];
  return Array.from({ length: 150 }, (_, id) => {
    const r = Math.random();
    const size = r < 0.1 ? 3 : r < 0.4 ? 2 : 1;
    return {
      id,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size,
      color: palette[Math.floor(Math.random() * palette.length)],
      duration: 2 + Math.random() * 3,
      delay: Math.random() * 5,
    };
  });
}

const MOBILE_LOGO_SIZE = 360;

// Mobile ring offsets scaled proportionally to MOBILE_LOGO_SIZE
// Preserves the same visual ratio as desktop (rings sit at same relative depth inside logo)
const MOBILE_RINGS = RINGS.map(ring => ({
  ...ring,
  offset: Math.round(((LOGO_SIZE + ring.offset * 2) / LOGO_SIZE * MOBILE_LOGO_SIZE - MOBILE_LOGO_SIZE) / 2),
}));

export default function SignInPage() {
  const [stars, setStars] = useState([]);
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [totalCount, setTotalCount] = useState(null);
  const [displayCount, setDisplayCount] = useState(0);
  const rafRef = useRef(null);

  useEffect(() => {
    setStars(generateStars());
    setMounted(true);
    const check = () => setIsMobile(window.innerWidth <= 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    fetch('/api/stats/public')
      .then(r => r.json())
      .then(d => setTotalCount(Number(d.total) || 0))
      .catch(() => setTotalCount(0));
  }, []);

  useEffect(() => {
    if (totalCount === null) return;
    const target = Math.floor(totalCount / 100) * 100;
    if (target === 0) { setDisplayCount(0); return; }

    const startTime = performance.now() + 800;
    const duration = 1800;

    function tick(now) {
      if (now < startTime) { rafRef.current = requestAnimationFrame(tick); return; }
      const t = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayCount(Math.floor(eased * target));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [totalCount]);

  return (
    <>
      <style suppressHydrationWarning>{`
        @keyframes twinkle {
          0%, 100% { opacity: 0.8; }
          50%       { opacity: 1; }
        }
        @keyframes spin-cw {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to   { transform: translate(-50%, -50%) rotate(360deg); }
        }
        @keyframes spin-ccw {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to   { transform: translate(-50%, -50%) rotate(-360deg); }
        }
        ${buildGlowKeyframes()}

        /* Clerk — strip all chrome from every wrapper layer */
        .cl-card, .cl-cardBox, [class*="cl-card"], [class*="cl-cardBox"],
        [class*="cl-signIn-root"], [class*="cl-main"], [class*="cl-signIn-start"] {
          background: transparent !important;
          background-color: transparent !important;
          box-shadow: none !important;
          border: none !important;
          border-radius: 0 !important;
          padding: 0 !important;
          margin: 0 !important;
        }
        [class*="cl-header"], [class*="cl-footer"], .cl-footer {
          display: none !important;
        }

        /* Mobile: reduce tagline spacing */
        @media (max-width: 640px) {
          .tagline { padding-top: 12px !important; }
        }

        /* Step 1: centre every wrapper in the Clerk tree */
        [class*="cl-rootBox"],
        [class*="cl-card"],
        [class*="cl-cardBox"],
        [class*="cl-main"],
        [class*="cl-signIn-start"],
        [class*="cl-socialButtonsRoot"],
        [class*="cl-socialButtons"] {
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          width: 100% !important;
        }

        /* Step 2: the button */
        button[class*="cl-socialButtonsBlockButton"] {
          background: #7c3aed !important;
          border: none !important;
          border-radius: 0.75rem !important;
          padding: 14px 20px !important;
          width: 300px !important;
          box-shadow: 0 4px 14px rgba(124,58,237,0.3) !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 10px !important;
          cursor: pointer !important;
          margin: 0 auto !important;
        }
        button[class*="cl-socialButtonsBlockButton"]:hover {
          background: #6d28d9 !important;
        }

        /* Step 3: button internals */
        [class*="cl-socialButtonsProviderIcon"] {
          filter: brightness(0) invert(1) !important;
          opacity: 0.9 !important;
          width: 18px !important;
          height: 18px !important;
          position: static !important;
          flex-shrink: 0 !important;
        }
        [class*="cl-socialButtonsBlockButtonText"],
        .cl-socialButtonsBlockButtonText {
          color: white !important;
          font-weight: 600 !important;
          font-size: 15px !important;
          flex: unset !important;
          padding: 0 !important;
          margin: 0 !important;
        }
      `}</style>

      {/*
        Single fixed full-viewport wrapper.
        - Owns the dark background so mix-blend-mode on the logo blends against #121210
        - overflow-y: auto makes it scrollable
        - z-index: 10 ensures it sits above the layout's <main> content
        - No z-index on any child avoids isolated CSS compositing groups that break mix-blend-mode
      */}
      <div style={{
        position: 'fixed',
        inset: 0,
        background: '#000000',
        overflowY: 'auto',
        overflowX: 'hidden',
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}>
        {/* Stars — absolutely positioned, client-only */}
        {mounted && stars.map(s => (
          <div key={s.id} style={{
            position: 'absolute',
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: `${s.size}px`,
            height: `${s.size}px`,
            borderRadius: '50%',
            background: s.color,
            boxShadow: `0 0 ${s.size + 2}px 1px ${s.color}`,
            pointerEvents: 'none',
            animation: `twinkle ${s.duration}s ${s.delay}s ease-in-out infinite`,
          }} />
        ))}

        {/* Gradient overlay — fades stars out from ~55% page height */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to bottom, transparent 0%, transparent 55%, rgba(0,0,0,0.6) 70%, rgba(0,0,0,0.95) 82%, #000000 92%)',
          pointerEvents: 'none',
        }} />

        {/* Content column — position: relative but NO z-index to avoid isolating the blend context */}
        <div style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: '100%',
          paddingTop: '40px',
          paddingBottom: '48px',
        }}>

          {/* Hero: logo + rings */}
          {(() => {
            const logoSize = isMobile ? MOBILE_LOGO_SIZE : LOGO_SIZE;
            const activeRings = isMobile ? MOBILE_RINGS : RINGS;
            const heroHeight = logoSize + activeRings[4].offset * 2;
            return (
          <div style={{
            position: 'relative',
            width: '100%',
            height: `${heroHeight}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            overflow: 'visible',
            marginBottom: isMobile ? '8px' : '0',
          }}>
            <img
              src="/logo-repetita.png"
              alt="Repetita"
              style={{
                height: `${logoSize}px`,
                width: 'auto',
                display: 'block',
              }}
            />

            {/* Rings */}
            {activeRings.map((ring, i) => {
              const size = logoSize + ring.offset * 2;
              return (
                <div key={i} style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  width: `${size}px`,
                  height: `${size}px`,
                  borderRadius: '50%',
                  borderWidth: ring.borderWidth,
                  borderStyle: ring.borderStyle,
                  borderColor: ring.color,
                  animation: `${ring.ccw ? 'spin-ccw' : 'spin-cw'} ${ring.speed}s linear infinite, glow-ring-${i} ${GLOW_CYCLE}s ${ring.glowDelay}s ease-out infinite`,
                }} />
              );
            })}
          </div>
            );
          })()}

          {/* Tagline — starts just below the outermost ring */}
          <p className="tagline" style={{
            fontFamily: 'var(--font-dm-sans), sans-serif',
            fontWeight: 600,
            fontSize: 'clamp(17px, 4.68vw, 22px)',
            color: '#e8e6e1',
            letterSpacing: '-0.01em',
            textAlign: 'center',
            lineHeight: 1.35,
            margin: '0 0 18px',
            paddingTop: '32px',
          }}>
            Stop forgetting.<br />Start remembering.
          </p>

          {/* Three steps */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', textAlign: 'center', marginBottom: '24px' }}>
            {[
              'Choose what to learn',
              'Get daily questions',
              'Let spaced repetition work its magic',
            ].map(step => (
              <p key={step} style={{
                fontFamily: 'var(--font-dm-sans), sans-serif',
                fontWeight: 400,
                fontSize: 'clamp(13px, 3.5vw, 15px)',
                color: 'rgba(147,210,255,0.95)',
                margin: 0,
              }}>
                {step}
              </p>
            ))}
          </div>

          {/* Counter */}
          <p style={{
            fontFamily: 'var(--font-dm-sans), sans-serif',
            fontWeight: 500,
            fontSize: '14px',
            color: '#e8e6e1',
            margin: '0 0 10px',
            fontVariantNumeric: 'tabular-nums',
            textAlign: 'center',
            minHeight: '20px',
          }}>
            {totalCount === null
              ? '\u2014'
              : `${displayCount.toLocaleString()}+ questions generated and counting`
            }
          </p>

          {/* Clerk Sign In */}
          <SignIn
            appearance={{
              variables: {
                colorPrimary: '#7c3aed',
                colorBackground: 'transparent',
                colorText: '#e8e6e1',
                borderRadius: '0.75rem',
              },
              elements: {
                rootBox: { width: '100%', display: 'flex', justifyContent: 'center' },
                cardBox: { background: 'transparent', boxShadow: 'none', border: 'none', borderRadius: '0' },
                card: { background: 'transparent', boxShadow: 'none', border: 'none', borderRadius: '0', padding: '0', gap: '0' },
                'signIn-start': { background: 'transparent', boxShadow: 'none', border: 'none' },
                header: { display: 'none' },
                footer: { display: 'none' },
                main: { gap: '12px' },
                socialButtonsRoot: { width: '100%', maxWidth: '300px' },
                socialButtons: { width: '100%' },
                socialButtonsBlockButton: {
                  background: '#7c3aed',
                  border: 'none',
                  borderRadius: '0.75rem',
                  padding: '14px 16px',
                  width: '100%',
                  maxWidth: '300px',
                  boxShadow: '0 4px 14px rgba(124,58,237,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  cursor: 'pointer',
                },
                socialButtonsBlockButtonText: {
                  color: 'white',
                  fontWeight: '600',
                  fontSize: '15px',
                },
                socialButtonsProviderIcon: {
                  filter: 'brightness(0) invert(1)',
                  opacity: '0.9',
                },
              },
              layout: {
                socialButtonsPlacement: 'top',
                socialButtonsVariant: 'blockButton',
              },
            }}
          />

          {/* Fine print */}
          <p style={{
            fontFamily: 'var(--font-dm-sans), sans-serif',
            fontSize: '12px',
            color: '#e8e6e1',
            margin: '8px 0 0',
            textAlign: 'center',
          }}>
            Free to use · No credit card required
          </p>

          {/* Spacer */}
          <div style={{ flexGrow: 1, minHeight: '40px' }} />

          {/* Footer */}
          <p style={{
            fontFamily: 'var(--font-dm-sans), sans-serif',
            fontSize: '12px',
            color: 'rgba(138,136,128,0.5)',
            margin: '0',
            textAlign: 'center',
          }}>
            Powered by spaced repetition science
          </p>

        </div>
      </div>
    </>
  );
}
