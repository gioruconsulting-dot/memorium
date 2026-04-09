'use client';

const P = 4;   // px per grid cell
const C = '#e8e6e1';

function px(coords) {
  return coords.map(([c, r]) => `${c * P}px ${r * P}px 0 0 ${C}`).join(', ');
}

// ── body parts (shared across all frames) ──────────────────────────────────
const head = [
  // top arc (4 wide)
  [8,0],[9,0],[10,0],[11,0],
  // full width rows 1-3 (6 wide → rounded sides)
  [7,1],[8,1],[9,1],[10,1],[11,1],[12,1],
  [7,2],[8,2],[9,2],[10,2],[11,2],[12,2],
  [7,3],[8,3],[9,3],[10,3],[11,3],[12,3],
  // chin arc (4 wide)
  [8,4],[9,4],[10,4],[11,4],
];
const neck  = [[9,5],[10,5]];
const torso = [[9,6],[10,6],[9,7],[10,7],[9,8],[10,8],[9,9],[10,9]];
const hips  = [[8,10],[9,10],[10,10],[11,10]];
const body  = [...head, ...neck, ...torso, ...hips];

// ── 6 animation frames ─────────────────────────────────────────────────────
//
//  Visual center of character ≈ col 9.5 (38px from left of container).
//  Arms must reach ≥4 cols out from body to look expressive.
//  Legs attach at row 11 (directly below hips at row 10).
//
const frames = [
  // 1 — Neutral: arms at sides, legs together
  [...body,
    [7,7],[7,8],[7,9],                          // left arm hanging
    [12,7],[12,8],[12,9],                       // right arm hanging
    [8,11],[8,12],[8,13],[8,14],[9,15],         // left leg
    [11,11],[11,12],[11,13],[11,14],[10,15],    // right leg
  ],

  // 2 — Right arm FULLY extended up-right, left arm low, right leg out
  [...body,
    [7,8],[7,9],[6,10],                         // left arm low-left
    [12,8],[13,7],[14,6],[15,5],[16,4],         // right arm up-right (5 steps out!)
    [8,11],[8,12],[8,13],[8,14],[9,15],         // left leg straight
    [11,11],[12,12],[12,13],[13,14],[13,15],    // right leg stepped out
  ],

  // 3 — Both arms V-UP peak celebration (feet off ground = jump row gap)
  [...body,
    [8,8],[7,7],[6,6],[5,5],[4,4],              // left arm up-left (5 steps out!)
    [11,8],[12,7],[13,6],[14,5],[15,4],         // right arm up-right (5 steps out!)
    [8,12],[8,13],[8,14],                       // left leg (gap at row 11 = jump!)
    [11,12],[11,13],[11,14],                    // right leg
  ],

  // 4 — Left arm FULLY extended up-left, right arm low, left leg out
  [...body,
    [8,8],[7,7],[6,6],[5,5],[4,4],              // left arm up-left (5 steps out!)
    [12,8],[12,9],[13,10],                      // right arm low-right
    [8,11],[7,12],[7,13],[6,14],[6,15],         // left leg stepped out
    [11,11],[11,12],[11,13],[11,14],[10,15],    // right leg straight
  ],

  // 5 — T-pose: arms fully horizontal, legs wide stance
  [...body,
    [8,7],[7,7],[6,7],[5,7],[4,7],[3,7],        // left arm horizontal (6 out!)
    [11,7],[12,7],[13,7],[14,7],[15,7],[16,7],  // right arm horizontal (6 out!)
    [8,11],[7,12],[7,13],[7,14],[7,15],         // left leg wide
    [11,11],[12,12],[12,13],[12,14],[12,15],    // right leg wide
  ],

  // 6 — Bounce recoil: arms swept back low, knees bent
  [...body,
    [8,9],[7,10],[6,11],                        // left arm low-back
    [11,9],[12,10],[13,11],                     // right arm low-back
    [8,11],[8,12],[9,12],[9,13],[9,14],         // left leg bent
    [11,11],[11,12],[10,12],[10,13],[10,14],    // right leg bent
  ],
];

// ── keyframe string ─────────────────────────────────────────────────────────
const n   = frames.length;
const dur = `${(n * 0.25).toFixed(2)}s`;

const danceKf = [
  ...frames.map((f, i) => `${Math.round((i / n) * 100)}% { box-shadow: ${px(f)}; }`),
  `100% { box-shadow: ${px(frames[0])}; }`,
].join(' ');

// ── component ───────────────────────────────────────────────────────────────
//
//  Container is 17×17 grid cells = 68×68px.
//  Visual center ≈ col 9.5 (38px from left) — caller should offset by -38px
//  to center the dancer horizontally.
//
export default function PixelDancer() {
  return (
    <>
      <style suppressHydrationWarning>{`
        @keyframes pixelDance { ${danceKf} }
        @keyframes dancerGlow {
          0%   { filter: drop-shadow(0 0 8px #EC4899); }
          20%  { filter: drop-shadow(0 0 8px #3B82F6); }
          40%  { filter: drop-shadow(0 0 8px #A855F7); }
          60%  { filter: drop-shadow(0 0 8px #4ADE80); }
          80%  { filter: drop-shadow(0 0 8px #EEFF99); }
          100% { filter: drop-shadow(0 0 8px #EC4899); }
        }
      `}</style>

      {/* Outer div: apply the color glow filter so it affects child box-shadows */}
      <div style={{
        position: 'relative',
        width:  `${17 * P}px`,
        height: `${17 * P}px`,
        animation: 'dancerGlow 4s linear infinite',
      }}>
        {/* Inner pixel element: box-shadow encodes each animation frame */}
        <div style={{
          position:  'absolute',
          top:    0,
          left:   0,
          width:  `${P}px`,
          height: `${P}px`,
          background: 'transparent',
          animation: `pixelDance ${dur} steps(1) infinite`,
        }} />
      </div>
    </>
  );
}
