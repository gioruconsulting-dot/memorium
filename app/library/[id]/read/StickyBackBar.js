'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

export default function StickyBackBar() {
  const [visible, setVisible] = useState(true);
  const lastY = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastY.current;
      if (y < 50) setVisible(true);
      else if (delta > 4) setVisible(false);
      else if (delta < -4) setVisible(true);
      lastY.current = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div
      style={{
        position:     'sticky',
        top:          0,
        zIndex:       40,
        background:   'var(--color-background)',
        borderBottom: '1px solid var(--color-border)',
        padding:      '8px 12px',
        transform:    visible ? 'translateY(0)' : 'translateY(-100%)',
        transition:   'transform 200ms ease',
      }}
    >
      <Link
        href="/library"
        style={{
          display:        'inline-flex',
          alignItems:     'center',
          gap:            '4px',
          fontSize:       '14px',
          color:          'var(--color-muted)',
          textDecoration: 'none',
        }}
      >
        <span style={{ fontSize: '18px', lineHeight: 1 }}>‹</span>
        <span>Library</span>
      </Link>
    </div>
  );
}
