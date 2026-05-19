import { currentUser } from '@clerk/nextjs/server';

// Fallback path covers tokens issued before sessionClaims customization (Chunk 2) was enabled.
export async function getHasNotesAccess(sessionClaims) {
  if (sessionClaims?.publicMetadata !== undefined) {
    return sessionClaims.publicMetadata?.hasNotesAccess === true;
  }
  const user = await currentUser();
  return user?.publicMetadata?.hasNotesAccess === true;
}
