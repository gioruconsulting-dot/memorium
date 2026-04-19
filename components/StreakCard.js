'use client';

import { useState, useEffect } from 'react';

const SPARK_COLORS = [
  '#FF1F8E','#EEFF99','#4ADE80','#60A5FA',
  '#C084FC','#FF6B35','#FFE066','#00E5FF','#ffffff',
];

function makeParticles() {
  return Array.from({ length: 28 }, (_, i) => {
    const angle = (i / 28) * 360 + (Math.random() - 0.5) * 25;
    const dist  = 18 + Math.random() * 52;
    const rad   = (angle * Math.PI) / 180;
    return {
      id:    i,
      color: SPARK_COLORS[i % SPARK_COLORS.length],
      x:     15 + Math.random() * 70,         // % along bar width
      dx:    Math.cos(rad) * dist,
      dy:    Math.sin(rad) * dist,
      size:  2 + Math.random() * 3.5,
      dur:   0.65 + Math.random() * 0.75,
      delay: Math.random() * 0.3,
    };
  });
}

export default function StreakCard({
  currentStreak, maxStreak,
  level, isMaxLevel, progressPct, daysToLevelUp,
}) {
  // 55% floor: bar always starts at 55% on a fresh level, fills to 100% at level-up
  const targetPct = isMaxLevel
    ? 100
    : Math.min(100, Math.round(55 + progressPct * 45));

  // True on the first day of a new level (streak just hit level.min)
  const isLevelUpDay = !isMaxLevel && currentStreak === level.min && level.number > 1;

  const [barPct,   setBarPct]   = useState(0);
  const [transDur, setTransDur] = useState(0);       // ms; 0 = no transition
  const [celebrating, setCelebrating] = useState(false);
  const [particles,   setParticles]   = useState([]);

  useEffect(() => {
    const stored         = parseInt(localStorage.getItem('lastCelebratedLevel') ?? '0');
    const shouldCelebrate = isLevelUpDay && level.number > stored;

    if (shouldCelebrate) {
      localStorage.setItem('lastCelebratedLevel', String(level.number));

      // Phase 1 — fill previous level bar to 100%
      setTransDur(900);
      setTimeout(() => setBarPct(100), 60);

      // Phase 2 — sparkle burst
      setTimeout(() => {
        setParticles(makeParticles());
        setCelebrating(true);
      }, 980);

      // Phase 3 — settle: snap to 0%, then animate to 55% (new level start)
      setTimeout(() => {
        setCelebrating(false);
        setParticles([]);
        setTransDur(0);
        setBarPct(0);
        setTimeout(() => {
          setTransDur(800);
          setBarPct(targetPct);          // targetPct = 55 when progressPct = 0
        }, 80);
      }, 2980);

    } else {
      // Normal: animate 0% → targetPct on every page visit
      setTransDur(900);
      setTimeout(() => setBarPct(targetPct), 60);
    }
  // Only runs on mount — deps intentionally empty
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <style suppressHydrationWarning>{`
        @keyframes spark-fly {
          from { opacity: 1; transform: translate(0, 0) scale(1); }
          to   { opacity: 0; transform: translate(var(--sdx), var(--sdy)) scale(0); }
        }
        @keyframes bar-celebrate {
          0%, 100% { box-shadow: 0 0 6px rgba(74,222,128,0.7); }
          50%       { box-shadow: 0 0 24px #EEFF99, 0 0 48px rgba(74,222,128,0.55); }
        }
      `}</style>

      <div style={{
        background:   '#0e0e18',
        border:       '1px solid #1e1e2a',
        borderRadius: '14px',
        padding:      '14px 16px',
        marginBottom: '20px',
        boxShadow:    '0 0 16px rgba(124,58,237,0.22), 0 0 32px rgba(124,58,237,0.08)',
      }}>

        {/* Row 1: streak count + level pill */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'10px' }}>
          <span style={{ fontSize:'0.95rem', fontWeight:600, color:'var(--color-foreground)' }}>
            🔥 <span style={{ color:'rgba(238,255,153,0.8)' }}>{currentStreak}</span> day streak
          </span>
          <span style={{
            fontSize:'0.77rem', fontWeight:500, color:'var(--color-muted)',
            border:'1px solid var(--color-border)', borderRadius:'999px', padding:'2px 10px',
          }}>
            {level.emoji} {level.label} Lv.
          </span>
        </div>

        {/* Progress bar + sparkle container */}
        <div style={{
          height:'6px', borderRadius:'999px',
          background:'var(--color-border)', marginBottom:'8px',
          position:'relative', overflow:'visible',
        }}>
          {/* Fill bar */}
          <div style={{
            height:'100%', borderRadius:'999px',
            background: celebrating ? '#EEFF99' : '#4ADE80',
            width:`${barPct}%`,
            transition: transDur > 0 ? `width ${transDur}ms ease-out` : 'none',
            animation: celebrating ? 'bar-celebrate 0.35s ease-in-out infinite' : 'none',
          }} />

          {/* Sparkle particles — burst from bar on level-up */}
          {particles.map(p => (
            <div
              key={p.id}
              style={{
                position:    'absolute',
                left:        `${p.x}%`,
                top:         '50%',
                width:       `${p.size}px`,
                height:      `${p.size}px`,
                marginTop:   `${-p.size / 2}px`,
                marginLeft:  `${-p.size / 2}px`,
                borderRadius:'50%',
                background:  p.color,
                '--sdx':     `${p.dx}px`,
                '--sdy':     `${p.dy}px`,
                animation:   `spark-fly ${p.dur}s ${p.delay}s ease-out forwards`,
                pointerEvents:'none',
                zIndex:      10,
              }}
            />
          ))}
        </div>

        {/* Row 2: best streak + days-to-level */}
        <div style={{ display:'flex', justifyContent:'space-between' }}>
          <span style={{ fontSize:'0.825rem', color:'var(--color-muted)' }}>
            {maxStreak > 0 ? `Best: ${maxStreak} day${maxStreak !== 1 ? 's' : ''}` : ''}
          </span>
          <span style={{ fontSize:'0.825rem', color:'var(--color-muted)' }}>
            {isMaxLevel ? 'Best Streak EVER 🏆' : `Level up in ${daysToLevelUp} day${daysToLevelUp !== 1 ? 's' : ''}`}
          </span>
        </div>

      </div>
    </>
  );
}
