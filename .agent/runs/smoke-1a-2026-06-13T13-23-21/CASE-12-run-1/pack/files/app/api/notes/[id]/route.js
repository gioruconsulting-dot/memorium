import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { hasNotesAccess } from '@/lib/auth/has-notes-access';
import { getDocumentById, updateNote } from '@/lib/db/queries';

export async function PATCH(request, { params }) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!(await hasNotesAccess())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  // Turn-2 fix: explicit owner check before any update.
  const doc = await getDocumentById(id);
  if (!doc || doc.user_id !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = await request.json();
  await updateNote(id, userId, { title: body.title, content: body.content });
  return NextResponse.json({ ok: true });
}
