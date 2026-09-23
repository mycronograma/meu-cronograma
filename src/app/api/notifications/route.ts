import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { listNotificationsForUser } from '@/lib/notification-center';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const notifications = await listNotificationsForUser(userId, 25);
    const unreadCount = await prisma.userNotification.count({
      where: {
        userId,
        readAt: null,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        notifications,
        unreadCount,
      },
    });
  } catch (error) {
    console.error('Erro ao carregar notificações:', error);
    return NextResponse.json(
      { success: false, error: 'Falha ao carregar notificações.' },
      { status: 500 }
    );
  }
}
