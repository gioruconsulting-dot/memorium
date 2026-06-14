// NOTES-7: enable the Notes experiment for the named test cohort (DEC-N30).
// Sets publicMetadata.hasNotesAccess = true via the Clerk backend API.

import { createClerkClient } from '@clerk/backend';

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

const COHORT_USER_IDS = [
  'user_cohort_member_1',
  'user_cohort_member_2',
  'user_cohort_member_3',
];

async function main() {
  for (const userId of COHORT_USER_IDS) {
    const user = await clerk.users.getUser(userId);
    await clerk.users.updateUserMetadata(userId, {
      publicMetadata: { ...user.publicMetadata, hasNotesAccess: true },
    });
    console.log(`enabled hasNotesAccess for ${userId}`);
  }
  console.log(`done: ${COHORT_USER_IDS.length} users enabled`);
}

main();
