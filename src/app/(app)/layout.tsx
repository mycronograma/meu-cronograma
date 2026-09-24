/**
 * App Layout - Wraps all authenticated pages with main layout
 */

import { redirect } from 'next/navigation';
import { MainLayout } from '@/components/layout';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isLocalDemoMode =
    process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_LOCAL_DEMO_MODE === 'true';

  if (isLocalDemoMode) {
    // Modo demo local: nenhuma checagem de sessão (e nenhum acesso ao banco).
    return <MainLayout>{children}</MainLayout>;
  }

  // Import tardio: em modo demo não carregamos NextAuth/Prisma por causa deste
  // layout, o que evita 500 em quem só quer navegar nas telas sem banco.
  const [{ getServerSession }, { authOptions }] = await Promise.all([
    import('next-auth'),
    import('@/lib/auth'),
  ]);

  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect('/login');
  }

  return <MainLayout>{children}</MainLayout>;
}
