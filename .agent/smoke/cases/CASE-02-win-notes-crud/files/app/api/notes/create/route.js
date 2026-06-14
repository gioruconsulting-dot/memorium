import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { hasNotesAccess } from '@/lib/auth/has-notes-access';
import { insertNote } from '@/lib/db/queries';

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!(await hasNotesAccess())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const note = await insertNote(userId);
  return NextResponse.json({ id: note.id }, { status: 201 });
}
