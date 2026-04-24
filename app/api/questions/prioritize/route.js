import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prioritizeDocumentQuestions } from '@/lib/db/queries';

export async function POST(request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { documentId } = await request.json();
  if (!documentId) return NextResponse.json({ error: 'documentId required' }, { status: 400 });

  await prioritizeDocumentQuestions(userId, documentId);
  return NextResponse.json({ success: true });
}
