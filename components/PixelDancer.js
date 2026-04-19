'use client';

const P = 5;
const C = '#e8e6e1';

function px(coords) {
  return coords.map(([c, r]) => `${c * P}px ${r * P}px 0 0 ${C}`).join(', ');
}

// Head: 6-wide × 5-tall rounded block. dx shifts sway left (-1), center (0), right (+1).
function mkHead(dx) {
  const x = dx;
  return [
    [10+x,0],[11+x,0],[12+x,0],[13+x,0],
    [9+x,1],[10+x,1],[11+x,1],[12+x,1],[13+x,1],[14+x,1],
    [9+x,2],[10+x,2],[11+x,2],[12+x,2],[13+x,2],[14+x,2],
    [9+x,3],[10+x,3],[11+x,3],[12+x,3],[13+x,3],[14+x,3],
    [10+x,4],[11+x,4],[12+x,4],[13+x,4],
  ];
}

function mkNeck(dx) {
  return [[11+dx, 5], [12+dx, 5]];
}

const torso = [[11,6],[12,6],[11,7],[12,7],[11,8],[12,8],[11,9],[12,9]];
const hips  = [[10,10],[11,10],[12,10],[13,10]];
const trunk = [...torso, ...hips];

// ── 10-frame "Disco Point Groove" ───────────────────────────────────────────
//
//  Container: 20 cols × 17 rows = 100×85px at P=5.
//  Body center ≈ col 11.5. Left arm extends to col 6, right to col 17.
//  Head dx lag: head holds its tilt one frame longer than the torso motion.
//
const frames = [
  // 1 — Neutral center (ready stance, arms relaxed at sides)
  [...mkHead(0), ...mkNeck(0), ...trunk,
    [10,8],[10,9],                                // left arm hanging
    [13,8],[13,9],                                // right arm hanging
    [10,11],[10,12],[10,13],[10,14],[11,15],       // left leg
    [13,11],[13,12],[13,13],[13,14],[12,15],       // right leg
  ],

  // 2 — Prep left (head tilts left, left arm starts lifting, right drops to hip)
  [...mkHead(-1), ...mkNeck(-1), ...trunk,
    [10,8],[10,7],                                // left arm starting to rise
    [13,9],                                       // right arm dropping low
    [10,11],[10,12],[10,13],[10,14],[10,15],       // left leg straight (weight-bearing)
    [13,11],[13,12],[14,13],[14,14],               // right leg stepping slightly out
  ],

  // 3 — Mid left rise (left arm halfway up-left diagonal, head holds left)
  [...mkHead(-1), ...mkNeck(-1), ...trunk,
    [10,8],[9,7],[8,6],[7,5],                     // left arm mid-rise up-left
    [13,9],[14,10],                               // right arm low near hip
    [10,11],[10,12],[10,13],[10,14],[10,15],       // left leg straight
    [13,11],[14,12],[14,13],[14,14],               // right leg off
  ],

  // 4 — Full left disco point (left arm fully extended up-left, head up-left)
  [...mkHead(-1), ...mkNeck(-1), ...trunk,
    [10,8],[9,7],[8,6],[7,5],[6,4],               // left arm full extension
    [13,8],[13,9],[14,10],                        // right arm bent near hip
    [10,11],[10,12],[10,13],[10,14],[10,15],       // left leg (weight-bearing)
    [13,11],[13,12],[14,13],[14,14],               // right leg off
  ],

  // 5 — Rebound from left (arm lowers partway, knees compress, head lags left)
  [...mkHead(-1), ...mkNeck(-1), ...trunk,
    [10,8],[9,7],[8,6],                           // left arm partially lowered
    [13,8],[13,9],                                // right arm recovering
    [10,11],[10,12],[11,12],[11,13],[11,14],       // left knee compress (downbeat)
    [13,11],[13,12],[12,12],[12,13],[12,14],       // right knee compress
  ],

  // 6 — Neutral center recovery (head catches up, arms settle near body)
  [...mkHead(0), ...mkNeck(0), ...trunk,
    [10,8],[10,9],                                // left arm settling
    [13,8],[13,9],                                // right arm settling
    [10,11],[10,12],[10,13],[10,14],[11,15],       // left leg
    [13,11],[13,12],[13,13],[13,14],[12,15],       // right leg
  ],

  // 7 — Prep right (head tilts right, right arm starts lifting, left drops to hip)
  [...mkHead(1), ...mkNeck(1), ...trunk,
    [10,9],                                       // left arm dropping low
    [13,8],[13,7],                                // right arm starting to rise
    [10,11],[9,12],[9,13],[9,14],                 // left leg stepping slightly out
    [13,11],[13,12],[13,13],[13,14],[13,15],       // right leg straight (weight-bearing)
  ],

  // 8 — Mid right rise (right arm halfway up-right diagonal, head holds right)
  [...mkHead(1), ...mkNeck(1), ...trunk,
    [10,9],[9,10],                                // left arm low near hip
    [13,8],[14,7],[15,6],[16,5],                  // right arm mid-rise up-right
    [10,11],[9,12],[9,13],[9,14],                 // left leg off
    [13,11],[13,12],[13,13],[13,14],[13,15],       // right leg straight
  ],

  // 9 — Full right disco point (right arm fully extended up-right, head up-right)
  [...mkHead(1), ...mkNeck(1), ...trunk,
    [10,8],[10,9],[9,10],                         // left arm bent near hip
    [13,8],[14,7],[15,6],[16,5],[17,4],            // right arm full extension
    [10,11],[9,12],[9,13],[9,14],                 // left leg off
    [13,11],[13,12],[13,13],[13,14],[13,15],       // right leg (weight-bearing)
  ],

  // 10 — Rebound to center (arm lowers partway, knees compress, head lags right)
  [...mkHead(1), ...mkNeck(1), ...trunk,
    [10,8],[10,9],                                // left arm recovering
    [13,8],[14,7],[15,6],                         // right arm partially lowered
    [10,11],[10,12],[11,12],[11,13],[11,14],       // left knee compress (downbeat)
    [13,11],[13,12],[12,12],[12,13],[12,14],       // right knee compress
  ],
];

const n   = frames.length;                        // 10
const dur = `${(n * 0.25).toFixed(2)}s`;          // 2.50s — deliberate groove tempo

const danceKf = [
  ...frames.map((f, i) => `${Math.round((i / n) * 100)}% { box-shadow: ${px(f)}; }`),
  `100% { box-shadow: ${px(frames[0])}; }`,
].join(' ');

// ── component ───────────────────────────────────────────────────────────────
//
//  Container: 20 cols × 17 rows = 100×85px at P=5.
//  Visual body center ≈ col 11.5 (57.5px from left).
//  CelebrationScene should offset: left: 'calc(50% - 58px)'.
//
export default function PixelDancer() {
  return (
    <>
      <style suppressHydrationWarning>{`
        @keyframes pixelDance { ${danceKf} }
      `}</style>

      <div style={{
        position: 'relative',
        width:  `${20 * P}px`,
        height: `${17 * P}px`,
      }}>
        <div style={{
          position:   'absolute',
          top:        0,
          left:       0,
          width:      `${P}px`,
          height:     `${P}px`,
          background: 'transparent',
          animation:  `pixelDance ${dur} steps(1) infinite`,
        }} />
      </div>
    </>
  );
}
