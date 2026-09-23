import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from '@/lib/notification-center';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const notificationId =
      typeof body?.notificationId === 'string' && body.notificationId.trim().length > 0
        ? body.notificationId.trim()
        : null;

    if (notificationId) {
      await markNotificationAsRead({ userId, notificationId });
      return NextResponse.json({ success: true });
    }

    await markAllNotificationsAsRead(userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao marcar notificacao como lida:', error);
    return NextResponse.json(
      { success: false, error: 'Falha ao atualizar notificações.' },
      { status: 500 }
    );
  }
}
