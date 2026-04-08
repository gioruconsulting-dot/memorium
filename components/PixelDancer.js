'use client';

export default function PixelDancer() {
  const P = 16;
  const C = '#e8e6e1';

  const px = (coords) =>
    coords.map(([c, r]) => `${c * P}px ${r * P}px 0 0 ${C}`).join(', ');

  const common = [
    // head
    [3,0],[4,0],[5,0],
    [2,1],[3,1],[4,1],[5,1],[6,1],
    [3,2],[4,2],[5,2],
    // neck
    [4,3],
    // torso
    [4,4],[4,5],[4,6],
    // hip
    [3,7],[4,7],[5,7],
  ];

  const frames = [
    // 1: arms angled up, legs apart
    [...common, [1,3],[2,3],[3,4], [5,4],[6,3],[7,3], [3,8],[2,9],[2,10], [5,8],[6,9],[6,10]],
    // 2: left arm high, right arm low, stepping left
    [...common, [3,3],[2,2],[1,1], [5,5],[6,6],[7,7], [3,8],[2,9],[1,10], [5,8],[5,9],[5,10]],
    // 3: both arms UP — peak celebration
    [...common, [3,3],[2,2],[1,1], [5,3],[6,2],[7,1], [3,8],[3,9],[2,10], [5,8],[5,9],[6,10]],
    // 4: right arm high, left arm low, stepping right
    [...common, [3,5],[2,6],[1,7], [5,3],[6,2],[7,1], [3,8],[3,9],[3,10], [5,8],[6,9],[7,10]],
    // 5: T-pose — arms horizontal out wide
    [...common, [1,4],[2,4],[3,4], [5,4],[6,4],[7,4], [3,8],[2,9],[1,10], [5,8],[6,9],[7,10]],
    // 6: shimmy squat — arms low, legs wide
    [...common, [2,5],[3,5], [5,5],[6,5], [2,8],[3,8],[1,9], [5,8],[6,8],[7,9]],
  ];

  const n = frames.length;
  const dur = `${(n * 0.25).toFixed(2)}s`;

  const kf = [
    ...frames.map((f, i) => `${Math.round((i / n) * 100)}% { box-shadow: ${px(f)}; }`),
    `100% { box-shadow: ${px(frames[0])}; }`,
  ].join(' ');

  const discos = [
    { color: '#7c3aed', l: '12%', t: '25%', s: '220px', dur: '2.8s', del: '0s'   },
    { color: '#60A5FA', l: '75%', t: '10%', s: '200px', dur: '3.4s', del: '0.7s' },
    { color: '#EC4899', l: '85%', t: '65%', s: '185px', dur: '2.2s', del: '1.2s' },
    { color: '#4ADE80', l: '10%', t: '75%', s: '210px', dur: '3.8s', del: '0.4s' },
    { color: '#EEFF99', l: '50%', t: '90%', s: '195px', dur: '2.6s', del: '1.8s' },
    { color: '#FB923C', l: '70%', t: '40%', s: '175px', dur: '3.1s', del: '0.9s' },
  ];

  const discoKf = discos
    .map((_, i) => `@keyframes disco${i} { 0%,100%{opacity:0.05} 50%{opacity:0.25} }`)
    .join(' ');

  return (
    <>
      <style suppressHydrationWarning>{`
        @keyframes pixelDancer { ${kf} }
        ${discoKf}
      `}</style>

      <div style={{
        position: 'relative',
        width: '100%',
        height: '280px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}>
        {/* Disco lights */}
        {discos.map((d, i) => (
          <div key={i} style={{
            position: 'absolute',
            left: d.l,
            top: d.t,
            width: d.s,
            height: d.s,
            transform: 'translate(-50%, -50%)',
            borderRadius: '50%',
            background: `radial-gradient(circle, ${d.color} 0%, transparent 70%)`,
            opacity: 0.05,
            animation: `disco${i} ${d.dur} ${d.del} ease-in-out infinite`,
          }} />
        ))}

        {/* Pixel dancer — 8×11 pixel grid at 16px per pixel */}
        <div style={{ position: 'relative', width: `${8 * P}px`, height: `${11 * P}px`, zIndex: 1, flexShrink: 0 }}>
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: `${P}px`,
            height: `${P}px`,
            background: 'transparent',
            animation: `pixelDancer ${dur} steps(1) infinite`,
          }} />
        </div>
      </div>
    </>
  );
}
