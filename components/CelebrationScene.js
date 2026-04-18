'use client';

import { useState, useEffect } from 'react';
import PixelDancer from './PixelDancer';

// ── light beam definitions ──────────────────────────────────────────────────
//
//  Each beam originates from a narrow slot at top-center (46-54% of width)
//  and fans out downward using clip-path: polygon().
//  The gradient goes from opaque at the source to transparent at the bottom.
//
const BEAMS = [
  {
    color:       '#FF1F8E',  // vivid pink
    clip:        'polygon(47% 0%, 53% 0%, 32% 100%, 2% 100%)',
    pulseDur:    '3.2s',
    pulseDelay:  '0s',
    baseOpacity: 0.55,
    peakOpacity: 1.0,
  },
  {
    color:       '#3B82F6',  // vivid blue
    clip:        'polygon(48% 0%, 54% 0%, 97% 100%, 65% 100%)',
    pulseDur:    '4.4s',
    pulseDelay:  '1.1s',
    baseOpacity: 0.50,
    peakOpacity: 1.0,
  },
  {
    color:       '#8B5CF6',  // vivid violet
    clip:        'polygon(45% 0%, 51% 0%, 18% 100%, -12% 100%)',
    pulseDur:    '3.8s',
    pulseDelay:  '0.7s',
    baseOpacity: 0.50,
    peakOpacity: 1.0,
  },
  {
    color:       '#22C55E',  // vivid green
    clip:        'polygon(49% 0%, 55% 0%, 112% 100%, 80% 100%)',
    pulseDur:    '5.1s',
    pulseDelay:  '2.0s',
    baseOpacity: 0.42,
    peakOpacity: 0.95,
  },
  {
    color:       '#EEF200',  // vivid yellow
    clip:        'polygon(46% 0%, 54% 0%, 63% 100%, 37% 100%)',
    pulseDur:    '2.9s',
    pulseDelay:  '0.4s',
    baseOpacity: 0.42,
    peakOpacity: 0.95,
  },
];

// Build pulse keyframes for each beam
const beamKeyframes = BEAMS.map((b, i) => `
  @keyframes beam-pulse-${i} {
    0%, 100% { opacity: ${b.baseOpacity}; }
    50%       { opacity: ${b.peakOpacity}; }
  }
`).join('');

// ── star generation ──────────────────────────────────────────────────────────
const STAR_PALETTE = [
  '#FF1F8E', '#FF6EB4', '#3B82F6', '#60C8FF',
  '#8B5CF6', '#C084FC', '#22C55E', '#4ADE80',
  '#EEF200', '#FFE066', '#FF6B35', '#FF9A5C',
  '#00E5FF', '#ffffff', '#ffffff', '#ffffff',
];

function generateStars() {
  return Array.from({ length: 56 }, (_, id) => ({
    id,
    x:        Math.random() * 100,
    y:        Math.random() * 100,
    size:     Math.random() < 0.2 ? 3 : Math.random() < 0.45 ? 2 : 1,
    color:    STAR_PALETTE[Math.floor(Math.random() * STAR_PALETTE.length)],
    duration: 1.5 + Math.random() * 3,
    delay:    Math.random() * 5,
  }));
}

// ── component ────────────────────────────────────────────────────────────────
//
//  Three layers stacked inside a fixed-height container:
//    1. Colored spotlight beams (CSS clip-path cones, pulsing opacity)
//    2. Twinkling stars (client-only, avoids hydration mismatch)
//    3. PixelDancer (bottom-center, bathed in the lights)
//
export default function CelebrationScene() {
  const [stars, setStars] = useState([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setStars(generateStars());
    setMounted(true);
  }, []);

  return (
    <>
      <style suppressHydrationWarning>{`
        @keyframes star-twinkle {
          0%, 100% { opacity: 0.2; }
          50%       { opacity: 0.85; }
        }
        ${beamKeyframes}
      `}</style>

      <div style={{
        position: 'relative',
        width:    '100%',
        height:   'clamp(270px, 34.2vw, 342px)',
        background: '#121210',
        overflow: 'hidden',
      }}>

        {/* ── Layer 1: Spotlight beams ── */}
        {BEAMS.map((b, i) => (
          <div key={i} style={{
            position:   'absolute',
            inset:      0,
            background: `linear-gradient(to bottom, ${b.color}55 0%, ${b.color}20 55%, transparent 100%)`,
            clipPath:   b.clip,
            opacity:    b.baseOpacity,
            animation:  `beam-pulse-${i} ${b.pulseDur} ${b.pulseDelay} ease-in-out infinite`,
            willChange: 'opacity',
          }} />
        ))}

        {/* Light-source origin: faint radial bloom at top-center */}
        <div style={{
          position:   'absolute',
          top:        0,
          left:       '50%',
          transform:  'translateX(-50%)',
          width:      '180px',
          height:     '90px',
          background: 'radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.13) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* ── Layer 2: Twinkling stars (client-only) — sharp, no glow ── */}
        {mounted && stars.map(s => (
          <div key={s.id} style={{
            position:     'absolute',
            left:         `${s.x}%`,
            top:          `${s.y}%`,
            width:        `${s.size}px`,
            height:       `${s.size}px`,
            borderRadius: '50%',
            background:   s.color,
            pointerEvents: 'none',
            animation:    `star-twinkle ${s.duration}s ${s.delay}s ease-in-out infinite`,
          }} />
        ))}

        {/* Top fade: blends scene into the dark page background above */}
        <div style={{
          position:   'absolute',
          top:        0,
          left:       0,
          right:      0,
          height:     '40%',
          background: 'linear-gradient(to bottom, #121210 0%, transparent 100%)',
          pointerEvents: 'none',
          zIndex:     3,
        }} />

        {/* ── Layer 3: Pixel dancer — bottom-center ── */}
        {/*
          P=6 → visual center ≈ col 9.5 × 6 = 57px from the container's left edge.
          Offset left by 57px to horizontally center the character's body axis.
        */}
        <div style={{
          position:  'absolute',
          bottom:    '12px',
          left:      'calc(50% - 58px)',
          zIndex:    2,
        }}>
          <PixelDancer />
        </div>

      </div>
    </>
  );
}
