/**
 * App Layout - Wraps all authenticated pages with main layout
 */

import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { MainLayout } from '@/components/layout';
import { authOptions } from '@/lib/auth';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isLocalDemoMode =
    process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_LOCAL_DEMO_MODE === 'true';

  if (isLocalDemoMode) {
    return <MainLayout>{children}</MainLayout>;
  }

  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect('/login');
  }

  return <MainLayout>{children}</MainLayout>;
}
