import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { syncNotificationsForUser } from '@/lib/notification-center';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const result = await syncNotificationsForUser(userId);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Erro ao sincronizar notificações:', error);
    return NextResponse.json(
      { success: false, error: 'Falha ao sincronizar notificações.' },
      { status: 500 }
    );
  }
}
