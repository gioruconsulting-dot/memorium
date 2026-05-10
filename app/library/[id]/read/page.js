import { redirect, notFound } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import Link from 'next/link';
import { getAccessibleDocumentByIdForUser } from '@/lib/db/queries';

export default async function LibraryReadPage({ params }) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const { id } = await params;
  const doc = await getAccessibleDocumentByIdForUser(userId, id);
  if (!doc) notFound();

  const formattedDate = new Date(Number(doc.created_at) * 1000).toLocaleDateString('en-GB', {
    day:   'numeric',
    month: 'short',
    year:  'numeric',
  });
  const questionCount = Number(doc.question_count);

  return (
    <div>
      {/* Top bar */}
      <div style={{
        borderBottom: '1px solid var(--color-border)',
        padding:      '8px 12px',
      }}>
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

      {/* Meta block */}
      <div style={{ padding: '24px 24px 0' }}>
        {doc.themes && (
          <div style={{
            textTransform: 'uppercase',
            color:         '#EEFF99',
            fontSize:      '11px',
            letterSpacing: '0.08em',
            fontWeight:    600,
            marginBottom:  '8px',
          }}>
            {doc.themes}
          </div>
        )}
        <h1 style={{
          fontSize:   '28px',
          fontWeight: 700,
          lineHeight: 1.2,
          margin:     '0 0 6px',
        }}>
          {doc.title}
        </h1>
        <p style={{
          fontSize:     '13px',
          color:        'var(--color-muted)',
          marginBottom: '20px',
        }}>
          {questionCount} question{questionCount !== 1 ? 's' : ''} · added {formattedDate}
        </p>
      </div>

      {/* Divider */}
      <div style={{
        height:     '1px',
        background: 'var(--color-border)',
        margin:     '0 24px 20px',
      }} />

      {/* Body */}
      <div style={{
        whiteSpace: 'pre-wrap',
        fontSize:   '16px',
        lineHeight: 1.75,
        color:      'var(--color-foreground)',
        padding:    '0 24px 40px',
      }}>
        {doc.content}
      </div>
    </div>
  );
}
