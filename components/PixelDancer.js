'use client';

const P = 5;   // px per grid cell (finer than 6 → smoother head sway)
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

// Neck: 2-wide, follows head sway
function mkNeck(dx) {
  return [[11+dx, 5], [12+dx, 5]];
}

// Torso + hips are fixed — only head, neck, arms, and legs vary per frame
const torso = [[11,6],[12,6],[11,7],[12,7],[11,8],[12,8],[11,9],[12,9]];
const hips  = [[10,10],[11,10],[12,10],[13,10]];
const trunk = [...torso, ...hips];

// ── 8 animation frames ─────────────────────────────────────────────────────
//
//  Body horizontal center ≈ col 11.5 (57.5px from container left at P=5).
//  Arms extend left to col ~5, right to col ~18 in wide T-pose.
//  Container: 20 cols × 17 rows = 100×85px.
//
const frames = [
  // 1 — Groove neutral: arms at sides, legs together, head center
  [...mkHead(0), ...mkNeck(0), ...trunk,
    [10,7],[10,8],[10,9],                       // left arm hanging
    [13,7],[13,8],[13,9],                       // right arm hanging
    [10,11],[10,12],[10,13],[10,14],[11,15],     // left leg
    [13,11],[13,12],[13,13],[13,14],[12,15],     // right leg
  ],

  // 2 — Right arm reaches up-right, head sways right
  [...mkHead(1), ...mkNeck(1), ...trunk,
    [10,8],[10,9],[9,10],                       // left arm low-left
    [13,8],[14,7],[15,6],[16,5],[17,4],          // right arm up-right (5 steps!)
    [10,11],[10,12],[10,13],[10,14],[11,15],     // left leg straight
    [13,11],[14,12],[14,13],[15,14],[15,15],     // right leg stepped out
  ],

  // 3 — Both arms V-up peak, head center, jump gap at row 11
  [...mkHead(0), ...mkNeck(0), ...trunk,
    [10,8],[9,7],[8,6],[7,5],[6,4],             // left arm up-left
    [13,8],[14,7],[15,6],[16,5],[17,4],          // right arm up-right
    [10,12],[10,13],[10,14],                    // left leg (gap = jump!)
    [13,12],[13,13],[13,14],                    // right leg
  ],

  // 4 — Left arm reaches up-left, right arm low, head sways left
  [...mkHead(-1), ...mkNeck(-1), ...trunk,
    [10,8],[9,7],[8,6],[7,5],[6,4],             // left arm up-left
    [13,8],[13,9],[14,10],                      // right arm low-right
    [10,11],[9,12],[9,13],[8,14],[8,15],         // left leg stepped out
    [13,11],[13,12],[13,13],[13,14],[12,15],     // right leg straight
  ],

  // 5 — T-pose wide arms, head sways right
  [...mkHead(1), ...mkNeck(1), ...trunk,
    [10,7],[9,7],[8,7],[7,7],[6,7],[5,7],       // left arm horizontal
    [13,7],[14,7],[15,7],[16,7],[17,7],[18,7],  // right arm horizontal
    [10,11],[9,12],[9,13],[9,14],[9,15],         // left leg wide
    [13,11],[14,12],[14,13],[14,14],[14,15],     // right leg wide
  ],

  // 6 — Bounce recoil: arms swept low-back, knees bent, head center
  [...mkHead(0), ...mkNeck(0), ...trunk,
    [10,9],[9,10],[8,11],                       // left arm sweep back-low
    [13,9],[14,10],[15,11],                     // right arm sweep back-low
    [10,11],[10,12],[11,12],[11,13],[11,14],     // left leg bent
    [13,11],[13,12],[12,12],[12,13],[12,14],     // right leg bent
  ],

  // 7 — Left arm wave mid-up, head sways left
  [...mkHead(-1), ...mkNeck(-1), ...trunk,
    [10,8],[9,7],[8,6],[7,6],                   // left arm wave mid-up
    [13,8],[13,9],[14,10],                      // right arm low
    [10,11],[10,12],[10,13],[10,14],[11,15],     // left leg
    [13,11],[13,12],[13,13],[13,14],[12,15],     // right leg
  ],

  // 8 — Settle: arms half-raised, head center
  [...mkHead(0), ...mkNeck(0), ...trunk,
    [10,7],[10,8],                              // left arm half-raised
    [13,7],[13,8],                              // right arm half-raised
    [10,11],[10,12],[10,13],[10,14],[11,15],     // left leg
    [13,11],[13,12],[13,13],[13,14],[12,15],     // right leg
  ],
];

const n   = frames.length;                       // 8
const dur = `${(n * 0.25).toFixed(2)}s`;         // 2.00s per full loop

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
