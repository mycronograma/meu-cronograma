/**
 * Root Page - Redirect users based on auth state
 */

import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export default async function Home() {
  const isLocalDemoMode =
    process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_LOCAL_DEMO_MODE === 'true';

  if (isLocalDemoMode) {
    redirect('/dashboard');
  }

  const session = await getServerSession(authOptions);
  redirect(session?.user ? '/dashboard' : '/login');
}
