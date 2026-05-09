import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import PostCelebrationView from './PostCelebrationView';

export default async function PostCelebrationPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');
  return <PostCelebrationView />;
}
