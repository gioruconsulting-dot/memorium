'use client';

import { useEffect, useState } from 'react';

function indentForLevel(level) {
  if (level === 1) return 0;
  if (level === 2) return 12;
  return 24;
}

function TOCList({ headings, activeId, onClickItem }) {
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {headings.map((h) => {
        const isActive = h.id === activeId;
        return (
          <li
            key={h.id}
            style={{
              marginBottom: '6px',
              paddingLeft:  `${indentForLevel(h.level)}px`,
            }}
          >
            <a
              href={`#${h.id}`}
              onClick={onClickItem}
              style={{
                display:        'block',
                fontSize:       '13px',
                lineHeight:     1.4,
                padding:        '4px 8px',
                borderLeft:     `2px solid ${isActive ? '#60A5FA' : 'transparent'}`,
                color:          isActive ? 'var(--color-foreground)' : 'var(--color-muted)',
                textDecoration: 'none',
                transition:     'color 150ms ease, border-color 150ms ease',
              }}
            >
              {h.text}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

export default function TOCNav({ headings }) {
  const [activeId, setActiveId] = useState(headings[0]?.id ?? null);

  useEffect(() => {
    const els = headings
      .map((h) => document.getElementById(h.id))
      .filter(Boolean);
    if (els.length === 0) return;

    const visible = new Map();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visible.set(entry.target.id, entry.boundingClientRect.top);
          } else {
            visible.delete(entry.target.id);
          }
        }
        if (visible.size === 0) return;
        const topMost = [...visible.entries()].sort((a, b) => a[1] - b[1])[0][0];
        setActiveId(topMost);
      },
      { rootMargin: '0px 0px -70% 0px', threshold: 0 }
    );

    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [headings]);

  if (!headings || headings.length < 2) return null;

  return (
    <details
      className="toc"
      style={{
        marginBottom: '24px',
        padding:      '10px 12px',
        border:       '1px solid var(--color-border)',
        borderRadius: '8px',
      }}
    >
      <summary
        style={{
          cursor:        'pointer',
          textTransform: 'uppercase',
          color:         'var(--color-muted)',
          fontSize:      '11px',
          letterSpacing: '0.08em',
          fontWeight:    600,
          listStyle:     'none',
        }}
      >
        Contents
      </summary>
      <div style={{ marginTop: '10px' }}>
        <TOCList headings={headings} activeId={activeId} />
      </div>
    </details>
  );
}
