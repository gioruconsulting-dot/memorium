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
      x:     15 + Math.random() * 70,
      dx:    Math.cos(rad) * dist,
      dy:    Math.sin(rad) * dist,
      size:  2 + Math.random() * 3.5,
      dur:   0.65 + Math.random() * 0.75,
      delay: Math.random() * 0.3,
    };
  });
}

// Toast overlay that auto-dismisses after 3 s
function Toast({ message, accent, onDone }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => { setVisible(false); setTimeout(onDone, 400); }, 3000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{
      position:     'absolute',
      inset:        0,
      borderRadius: '14px',
      display:      'flex',
      alignItems:   'center',
      justifyContent: 'center',
      padding:      '16px',
      zIndex:       20,
      background:   accent === 'amber'
        ? 'linear-gradient(135deg, rgba(14,14,24,0.97) 0%, rgba(30,20,5,0.97) 100%)'
        : 'linear-gradient(135deg, rgba(14,14,24,0.97) 0%, rgba(20,10,35,0.97) 100%)',
      border:       accent === 'amber'
        ? '1px solid rgba(238,255,153,0.35)'
        : '1px solid rgba(124,58,237,0.45)',
      boxShadow:    accent === 'amber'
        ? '0 0 28px rgba(238,255,153,0.25), 0 0 56px rgba(238,255,153,0.1)'
        : '0 0 28px rgba(124,58,237,0.45), 0 0 56px rgba(124,58,237,0.2)',
      opacity:      visible ? 1 : 0,
      transition:   'opacity 0.4s ease',
      pointerEvents: 'none',
    }}>
      <p style={{
        fontSize:    '0.88rem',
        fontWeight:  600,
        color:       accent === 'amber' ? '#EEFF99' : '#c4b5fd',
        lineHeight:  1.5,
        textAlign:   'center',
        margin:      0,
      }}>
        {message}
      </p>
    </div>
  );
}

export default function StreakCard({
  currentStreak, maxStreak,
  level, isMaxLevel, progressPct, daysToLevelUp,
  streakCards, cardUsedAt, cardEarnedAt,
}) {
  const targetPct = isMaxLevel
    ? 100
    : Math.min(100, Math.round(55 + progressPct * 45));

  const isLevelUpDay = !isMaxLevel && currentStreak === level.min && level.number > 1;

  const [barPct,        setBarPct]        = useState(0);
  const [transDur,      setTransDur]      = useState(0);
  const [celebrating,   setCelebrating]   = useState(false);
  const [particles,     setParticles]     = useState([]);
  const [showCardUsed,  setShowCardUsed]  = useState(false);
  const [showCardEarned, setShowCardEarned] = useState(false);

  useEffect(() => {
    // ── Level-up celebration (unchanged) ────────────────────────────────────
    const stored          = parseInt(localStorage.getItem('lastCelebratedLevel') ?? '0');
    const shouldCelebrate = isLevelUpDay && level.number > stored;

    if (shouldCelebrate) {
      localStorage.setItem('lastCelebratedLevel', String(level.number));
      setTransDur(900);
      setTimeout(() => setBarPct(100), 60);
      setTimeout(() => { setParticles(makeParticles()); setCelebrating(true); }, 980);
      setTimeout(() => {
        setCelebrating(false); setParticles([]);
        setTransDur(0); setBarPct(0);
        setTimeout(() => { setTransDur(800); setBarPct(targetPct); }, 80);
      }, 2980);
    } else {
      setTransDur(900);
      setTimeout(() => setBarPct(targetPct), 60);
    }

    // ── Card-used notification ───────────────────────────────────────────────
    if (cardUsedAt) {
      const lastShown = parseInt(localStorage.getItem('lastShownCardUsed') ?? '0');
      if (cardUsedAt > lastShown) {
        localStorage.setItem('lastShownCardUsed', String(cardUsedAt));
        setShowCardUsed(true);
      }
    }

    // ── Card-earned notification (from getUserStreak OR from session complete) ─
    const pendingEarned = parseInt(localStorage.getItem('pendingCardEarned') ?? '0');
    const earnedTs = Math.max(cardEarnedAt ?? 0, pendingEarned ? Math.floor(pendingEarned / 1000) : 0);
    if (earnedTs) {
      const lastShown = parseInt(localStorage.getItem('lastShownCardEarned') ?? '0');
      if (earnedTs > lastShown) {
        localStorage.setItem('lastShownCardEarned', String(earnedTs));
        localStorage.removeItem('pendingCardEarned');
        setShowCardEarned(true);
      }
    }
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
        position:     'relative',
        background:   '#0e0e18',
        border:       '1px solid #1e1e2a',
        borderRadius: '14px',
        padding:      '14px 16px',
        marginBottom: '20px',
        boxShadow:    '0 0 16px rgba(124,58,237,0.22), 0 0 32px rgba(124,58,237,0.08)',
      }}>

        {/* Toast overlays */}
        {showCardUsed && (
          <Toast
            accent="amber"
            message="You're lucky! A bonus streak card was used and you will not lose your streak! Make sure you keep on studying though because next time you might have to restart from 0!"
            onDone={() => setShowCardUsed(false)}
          />
        )}
        {!showCardUsed && showCardEarned && (
          <Toast
            accent="violet"
            message="New Bonus Streak Card unlocked! Well done! Keep it up!"
            onDone={() => setShowCardEarned(false)}
          />
        )}

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
          <div style={{
            height:'100%', borderRadius:'999px',
            background: celebrating ? '#EEFF99' : '#4ADE80',
            width:`${barPct}%`,
            transition: transDur > 0 ? `width ${transDur}ms ease-out` : 'none',
            animation: celebrating ? 'bar-celebrate 0.35s ease-in-out infinite' : 'none',
          }} />
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

        {/* Row 3: bonus streak cards (only shown when user has at least 1) */}
        {streakCards > 0 && (
          <div style={{
            marginTop: '10px',
            paddingTop: '10px',
            borderTop: '1px solid rgba(255,255,255,0.05)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>Streak cards:</span>
            <div style={{ display: 'flex', gap: '4px' }}>
              {Array.from({ length: streakCards }).map((_, i) => (
                <span key={i} style={{
                  fontSize: '0.78rem',
                  background: 'rgba(238,255,153,0.12)',
                  border: '1px solid rgba(238,255,153,0.3)',
                  borderRadius: '6px',
                  padding: '1px 7px',
                  color: 'rgba(238,255,153,0.85)',
                  fontWeight: 600,
                }}>🛡</span>
              ))}
            </div>
          </div>
        )}

      </div>
    </>
  );
}
