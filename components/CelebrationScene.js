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
    color:      '#EC4899',
    clip:       'polygon(47% 0%, 53% 0%, 32% 100%, 2% 100%)',
    pulseDur:   '3.2s',
    pulseDelay: '0s',
    baseOpacity: 0.18,
    peakOpacity: 0.38,
  },
  {
    color:      '#60A5FA',
    clip:       'polygon(48% 0%, 54% 0%, 97% 100%, 65% 100%)',
    pulseDur:   '4.4s',
    pulseDelay: '1.1s',
    baseOpacity: 0.14,
    peakOpacity: 0.32,
  },
  {
    color:      '#7c3aed',
    clip:       'polygon(45% 0%, 51% 0%, 18% 100%, -12% 100%)',
    pulseDur:   '3.8s',
    pulseDelay: '0.7s',
    baseOpacity: 0.16,
    peakOpacity: 0.36,
  },
  {
    color:      '#4ADE80',
    clip:       'polygon(49% 0%, 55% 0%, 112% 100%, 80% 100%)',
    pulseDur:   '5.1s',
    pulseDelay: '2.0s',
    baseOpacity: 0.12,
    peakOpacity: 0.28,
  },
  {
    color:      '#EEFF99',
    clip:       'polygon(46% 0%, 54% 0%, 63% 100%, 37% 100%)',
    pulseDur:   '2.9s',
    pulseDelay: '0.4s',
    baseOpacity: 0.20,
    peakOpacity: 0.42,
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
  '#EC4899', '#60A5FA', '#7c3aed', '#4ADE80',
  '#EEFF99', '#FB923C', '#e8e6e1', '#e8e6e1',
];

function generateStars() {
  return Array.from({ length: 28 }, (_, id) => ({
    id,
    x:        Math.random() * 100,
    y:        Math.random() * 100,
    size:     Math.random() < 0.25 ? 2 : 1,
    color:    STAR_PALETTE[Math.floor(Math.random() * STAR_PALETTE.length)],
    duration: 2 + Math.random() * 3,
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
        height:   'clamp(280px, 35vw, 350px)',
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

        {/* ── Layer 2: Twinkling stars (client-only) ── */}
        {mounted && stars.map(s => (
          <div key={s.id} style={{
            position:    'absolute',
            left:        `${s.x}%`,
            top:         `${s.y}%`,
            width:       `${s.size}px`,
            height:      `${s.size}px`,
            borderRadius: '50%',
            background:  s.color,
            boxShadow:   `0 0 ${s.size + 2}px 1px ${s.color}`,
            pointerEvents: 'none',
            animation:   `star-twinkle ${s.duration}s ${s.delay}s ease-in-out infinite`,
          }} />
        ))}

        {/* ── Layer 3: Pixel dancer ── */}
        {/*
          PixelDancer's visual center ≈ col 9.5 = 38px from the container's left edge.
          Offset by -38px so the body axis aligns with the scene's horizontal center.
        */}
        <div style={{
          position:  'absolute',
          bottom:    '10px',
          left:      'calc(50% - 38px)',
          zIndex:    2,
        }}>
          <PixelDancer />
        </div>

      </div>
    </>
  );
}
