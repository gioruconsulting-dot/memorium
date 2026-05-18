import { createClerkClient } from '@clerk/backend';
import { config } from 'dotenv';
config({ path: '.env.local' });

const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

// Paginate in case user count grows
const users = [];
let offset = 0;
while (true) {
  const { data } = await clerk.users.getUserList({ limit: 100, offset });
  users.push(...data);
  if (data.length < 100) break;
  offset += 100;
}

const withFlag = users.filter(
  u => u.publicMetadata?.hasNotesAccess === true
);
const withAnyMetadata = users.filter(
  u => Object.keys(u.publicMetadata || {}).length > 0
);

console.log(`Total users:              ${users.length}`);
console.log(`hasNotesAccess === true:  ${withFlag.length}`);
console.log(`Any publicMetadata:       ${withAnyMetadata.length}`);

if (withFlag.length > 0) {
  console.log('\nUsers with flag:');
  withFlag.forEach(u => console.log(`  ${u.id}  ${u.emailAddresses[0]?.emailAddress}`));
}

if (withAnyMetadata.length > 0) {
  console.log('\nUsers with any publicMetadata (FYI):');
  withAnyMetadata.forEach(u => console.log(`  ${u.id}  ${JSON.stringify(u.publicMetadata)}`));
}