'use client';

import { useState, useEffect } from 'react';

const PALETTE = [
  '#FF1F8E', '#FF6EB4', '#3B82F6', '#60C8FF',
  '#8B5CF6', '#C084FC', '#22C55E', '#4ADE80',
  '#EEF200', '#FFE066', '#FF6B35', '#ffffff',
];

function generateStars() {
  return Array.from({ length: 60 }, (_, id) => ({
    id,
    x:        Math.random() * 100,
    y:        Math.random() * 100,
    size:     Math.random() < 0.2 ? 2 : 1,
    color:    PALETTE[Math.floor(Math.random() * PALETTE.length)],
    duration: 2 + Math.random() * 3,
    delay:    Math.random() * 5,
  }));
}

export default function StarryBackground() {
  const [stars, setStars] = useState([]);

  useEffect(() => {
    setStars(generateStars());
  }, []);

  return (
    <>
      <style suppressHydrationWarning>{`
        @keyframes starTwinkle {
          0%, 100% { opacity: 0.15; }
          50%       { opacity: 0.9; }
        }
      `}</style>
      <div
        style={{
          position:      'fixed',
          inset:         0,
          pointerEvents: 'none',
          zIndex:        0,
          overflow:      'hidden',
        }}
      >
        {stars.map(s => (
          <div
            key={s.id}
            style={{
              position:     'absolute',
              left:         `${s.x}%`,
              top:          `${s.y}%`,
              width:        `${s.size}px`,
              height:       `${s.size}px`,
              borderRadius: '50%',
              background:   s.color,
              animation:    `starTwinkle ${s.duration}s ${s.delay}s ease-in-out infinite`,
            }}
          />
        ))}
      </div>
    </>
  );
}
