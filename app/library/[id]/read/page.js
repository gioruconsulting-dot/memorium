import { redirect, notFound } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getAccessibleDocumentByIdForUser } from '@/lib/db/queries';

const markdownComponents = {
  a: ({ node, ...props }) => (
    <a {...props} target="_blank" rel="noopener noreferrer" />
  ),
};

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
      <div style={{ padding: '0 24px 40px' }}>
        <div
          className="repetita-md"
          style={{
            maxWidth:   '640px',
            margin:     '0 auto',
            fontSize:   '16px',
            lineHeight: 1.75,
            color:      'var(--color-foreground)',
          }}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={markdownComponents}
          >
            {doc.content}
          </ReactMarkdown>
        </div>
      </div>

      <style>{`
        .repetita-md > :first-child { margin-top: 0; }
        .repetita-md h1 { font-size: 26px; font-weight: 700; line-height: 1.2; margin: 32px 0 12px; }
        .repetita-md h2 { font-size: 21px; font-weight: 700; line-height: 1.25; margin: 28px 0 10px; }
        .repetita-md h3 { font-size: 17px; font-weight: 600; line-height: 1.3; margin: 24px 0 8px; }
        .repetita-md p { font-size: 16px; line-height: 1.75; margin: 0 0 18px; color: var(--color-foreground); }
        .repetita-md ul, .repetita-md ol { padding-left: 24px; margin: 0 0 18px; }
        .repetita-md li { margin-bottom: 6px; line-height: 1.7; }
        .repetita-md blockquote {
          border-left: 2px solid var(--color-border);
          padding-left: 16px;
          margin: 0 0 18px;
          color: var(--color-muted);
          font-style: italic;
        }
        .repetita-md a {
          color: #60A5FA;
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .repetita-md code {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 0.9em;
          padding: 2px 6px;
          background: rgba(255,255,255,0.06);
          border-radius: 4px;
        }
        .repetita-md pre {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 13px;
          padding: 12px;
          background: rgba(255,255,255,0.04);
          border: 1px solid var(--color-border);
          border-radius: 6px;
          overflow-x: auto;
          margin: 0 0 18px;
          line-height: 1.5;
        }
        .repetita-md pre > code {
          background: transparent;
          padding: 0;
          border-radius: 0;
          font-size: inherit;
        }
        .repetita-md hr {
          border: 0;
          border-top: 1px solid var(--color-border);
          margin: 24px 0;
        }
      `}</style>
    </div>
  );
}
