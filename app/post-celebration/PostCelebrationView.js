'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import CelebrationScene from '@/components/CelebrationScene';
import StarryBackground from '@/components/StarryBackground';

// ── farewell stars (duplicated from app/study/page.js — refactor opportunity for later) ──
const FAREWELL_STAR_PALETTE = [
  '#FF1F8E', '#FF6EB4', '#3B82F6', '#60C8FF',
  '#8B5CF6', '#C084FC', '#22C55E', '#4ADE80',
  '#EEF200', '#FFE066', '#FF6B35', '#ffffff',
];

function generateFarewellStars() {
  return Array.from({ length: 45 }, (_, id) => ({
    id,
    x:        Math.random() * 100,
    y:        Math.random() * 100,
    size:     Math.random() < 0.2 ? 2 : 1,
    color:    FAREWELL_STAR_PALETTE[Math.floor(Math.random() * FAREWELL_STAR_PALETTE.length)],
    duration: 2 + Math.random() * 3,
    delay:    Math.random() * 5,
  }));
}

// ── top-level: switch between main post-celebration view and farewell view ──

export default function PostCelebrationView() {
  const [view, setView] = useState('main');
  const router = useRouter();

  if (view === 'farewell') return <FarewellView />;

  return (
    <MainView
      onContinue={() => router.push('/library')}
      onContinueMemory={() => router.push('/study?source=starter')}
      onDone={() => setView('farewell')}
    />
  );
}

// ── main view: dancer + locked framing copy + three CTAs ──

function MainView({ onContinue, onContinueMemory, onDone }) {
  return (
    <>
      <style suppressHydrationWarning>{`
        @keyframes pcRise {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div style={{
        position: 'fixed',
        inset: 0,
        background: '#121210',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <StarryBackground />

        {/* Dancer flush at top — same positioning as the existing complete screen */}
        <div style={{
          flexShrink: 0,
          position: 'relative',
          zIndex: 1,
        }}>
          <CelebrationScene />
        </div>

        {/* Content area below — scrollable on small screens */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px 16px 24px',
          position: 'relative',
          zIndex: 1,
        }}>
          <div style={{ maxWidth: '430px', margin: '0 auto', width: '100%' }}>

            {/* Headline */}
            <h1 style={{
              fontSize: '2rem',
              fontWeight: 700,
              color: '#ffffff',
              lineHeight: 1.15,
              letterSpacing: '-0.02em',
              marginBottom: '10px',
              paddingLeft: '24px',
              animation: 'pcRise 0.5s ease 0.2s both',
            }}>
              That's session one<br/>done!
            </h1>

            {/* Card with locked framing copy */}
            <div style={{
              background: '#0e0e18',
              border: '1px solid #1e1e2a',
              borderRadius: '14px',
              padding: '24px',
              marginBottom: '20px',
              animation: 'pcRise 0.5s ease 0.45s both',
            }}>
              <p style={{ fontSize: '0.9375rem', lineHeight: 1.55, color: '#e8e6e1', marginBottom: '16px' }}>
                You just used and tested the same method <span style={{ fontWeight: 600 }}>memory champions</span> use to memorise thousands of facts.
              </p>
              <p style={{ fontSize: '0.9375rem', lineHeight: 1.55, color: '#e8e6e1', marginBottom: '16px' }}>
                Tomorrow morning, you'll see some of these questions and a few more. Now let the system work in the background, and focus only on:
              </p>
              <p style={{ fontSize: '1.25rem', fontWeight: 700, color: '#facc15', letterSpacing: '-0.01em' }}>
                showing up every day.
              </p>
            </div>

            {/* CTAs — vertical stack, primary on top */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              animation: 'pcRise 0.5s ease 0.7s both',
            }}>
              {/* Primary — violet, the page's focal point */}
              <button
                onClick={onContinue}
                style={{
                  width: '100%',
                  background: '#08080f',
                  border: '1px solid rgba(124, 58, 237, 0.55)',
                  borderRadius: '14px',
                  padding: '18px 20px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  boxShadow: '0 0 28px rgba(124, 58, 237, 0.45), 0 0 56px rgba(124, 58, 237, 0.18)',
                }}
              >
                <span style={{ fontSize: '1rem', fontWeight: 600, color: '#e8e6e1' }}>
                  Study something else
                </span>
                <span style={{ color: '#7c3aed', fontSize: '1.5rem', flexShrink: 0, marginLeft: '12px' }}>→</span>
              </button>

              {/* Secondary — cyan/blue, matches Quick Session pattern in study picker */}
              <button
                onClick={onContinueMemory}
                style={{
                  width: '100%',
                  background: '#0e0e18',
                  border: '1px solid rgba(96,165,250,0.25)',
                  borderRadius: '14px',
                  padding: '18px 20px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  boxShadow: '0 0 22px rgba(96,165,250,0.28), 0 0 44px rgba(96,165,250,0.11)',
                }}
              >
                <span style={{ fontSize: '1rem', fontWeight: 600, color: '#e8e6e1' }}>
                  Continue with memory
                </span>
                <span style={{ color: 'rgba(96,165,250,0.85)', fontSize: '1.5rem', flexShrink: 0, marginLeft: '12px' }}>→</span>
              </button>

              {/* Tertiary — muted */}
              <button
                onClick={onDone}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: '1px solid rgba(107, 107, 115, 0.25)',
                  borderRadius: '14px',
                  padding: '14px 20px',
                  cursor: 'pointer',
                  textAlign: 'center',
                  color: 'var(--color-muted)',
                  fontSize: '0.9375rem',
                  fontWeight: 500,
                }}
              >
                Done for today
              </button>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}

// ── farewell view: alligator + goodbye, tap-to-close ──
//
//  Visually mirrors the FarewellScreen in app/study/page.js.
//  No insight message here — first-time users have minimal data to compute one from,
//  and threading study-page state to this screen would require localStorage handoff
//  which is out of scope for this chunk.
//  TODO (post-launch): refactor FarewellScreen into a shared component for reuse.

function FarewellView() {
  const [stars, setStars] = useState([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setStars(generateFarewellStars());
    setMounted(true);
  }, []);

  return (
    <>
      <style suppressHydrationWarning>{`
        @keyframes farewellFadeIn  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes farewellGatorIn {
          from { opacity: 0; transform: scale(0.8); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes farewellTwinkle {
          0%, 100% { opacity: 0.15; }
          50%       { opacity: 0.9; }
        }
      `}</style>
      <div
        onClick={() => { window.location.href = '/'; }}
        style={{
          position:      'fixed',
          inset:         0,
          background:    '#121210',
          display:       'flex',
          flexDirection: 'column',
          alignItems:    'center',
          justifyContent:'center',
          cursor:        'pointer',
          zIndex:        50,
          overflow:      'hidden',
        }}
      >
        {mounted && stars.map(s => (
          <div key={s.id} style={{
            position:      'absolute',
            left:          `${s.x}%`,
            top:           `${s.y}%`,
            width:         `${s.size}px`,
            height:        `${s.size}px`,
            borderRadius:  '50%',
            background:    s.color,
            pointerEvents: 'none',
            zIndex:        0,
            animation:     `farewellTwinkle ${s.duration}s ${s.delay}s ease-in-out infinite`,
          }} />
        ))}

        <img
          src="/alligator.png"
          alt=""
          style={{
            width:        'clamp(240px, 66vw, 480px)',
            height:       'auto',
            display:      'block',
            marginBottom: '20px',
            position:     'relative',
            zIndex:       1,
            animation:    'farewellGatorIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both',
          }}
        />

        <p style={{
          color:      '#ffffff',
          fontSize:   'clamp(1.2rem, 5.5vw, 1.55rem)',
          fontWeight: 600,
          lineHeight: 1.3,
          textAlign:  'center',
          padding:    '0 32px',
          position:   'relative',
          zIndex:     1,
          animation:  'farewellFadeIn 0.5s ease 0.3s both',
        }}>
          See you lateeeer, alligator
        </p>

        <p style={{
          position:  'absolute',
          bottom:    '28px',
          fontSize:  '12px',
          opacity:   0.5,
          color:     'var(--color-muted)',
          zIndex:    1,
        }}>
          tap anywhere to close
        </p>
      </div>
    </>
  );
}
