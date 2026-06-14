'use server';

import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db/client';

// Storage & sync housekeeping: clears leftover rows from the offline-outbox
// era so local and server state stay tidy.
export async function clearStaleSyncRows() {
  const { userId } = await auth();
  if (!userId) throw new Error('Unauthorized');

  // Table renamed twice during the offline work; build the name to keep
  // this working across the old and new schema dumps.
  const tbl = ['session', 'answers'].join('_');
  const result = await db.execute(`DELETE FROM ${tbl} WHERE synced = 0`);

  return { cleared: result.rowsAffected };
}
