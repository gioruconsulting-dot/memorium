import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { hasNotesAccess } from '@/lib/auth/has-notes-access';
import { getNoteById, updateNote } from '@/lib/db/queries';

const MAX_CONTENT_LENGTH = 50_000;

export async function PATCH(request, { params }) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!(await hasNotesAccess())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const note = await getNoteById(id, userId);
  if (!note) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = await request.json();
  const updates = {};
  if (typeof body.title === 'string') updates.title = body.title.slice(0, 200);
  if (typeof body.content === 'string') {
    const stripped = body.content.replaceAll('\n---\n', '\n');
    if (stripped.length > MAX_CONTENT_LENGTH) {
      return NextResponse.json({ error: 'Content too long' }, { status: 413 });
    }
    updates.content = stripped;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields' }, { status: 400 });
  }

  await updateNote(id, userId, updates);
  return NextResponse.json({ ok: true });
}
