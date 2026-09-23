import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { hasWebPush } from '@/lib/env';
import { prisma } from '@/lib/prisma';
import { createNotificationForUser } from '@/lib/notification-center';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasWebPush) {
      return NextResponse.json(
        { success: false, error: 'Push indisponível no momento.' },
        { status: 503 }
      );
    }

    const latestSubscription = await prisma.pushSubscription.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });

    if (!latestSubscription) {
      return NextResponse.json(
        {
          success: false,
          error: 'Nenhum dispositivo cadastrado. Ative as notificações neste navegador.',
        },
        { status: 400 }
      );
    }

    const notificationResult = await createNotificationForUser({
      userId,
      type: 'system',
      title: 'Nexora',
      message: 'Notificacoes push ativadas com sucesso.',
      url: '/dashboard',
      dedupeKey: `system:test:${Date.now()}`,
      sendPush: true,
      metadata: {
        source: 'manual_test',
      },
    });

    if (notificationResult.pushDelivered === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Assinatura expirada. Ative as notificações novamente.',
        },
        { status: 410 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Notificacao de teste enviada.',
    });
  } catch (error) {
    console.error('Erro ao enviar notificacao de teste:', error);
    return NextResponse.json(
      { success: false, error: 'Falha ao enviar notificacao de teste.' },
      { status: 500 }
    );
  }
}
