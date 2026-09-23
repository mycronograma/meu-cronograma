import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';
import { syncNotificationsForUser } from '@/lib/notification-center';

export const dynamic = 'force-dynamic';

const getAcceptedCronSecrets = () =>
  Array.from(
    new Set(
      [env.notificationsCronSecret, (process.env.CRON_SECRET ?? '').trim()]
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    )
  );

const isAuthorized = (request: Request) => {
  const acceptedSecrets = getAcceptedCronSecrets();
  if (acceptedSecrets.length === 0) return false;

  const authorization = request.headers.get('authorization') || '';
  return acceptedSecrets.some((secret) => authorization === `Bearer ${secret}`);
};

const handleDispatch = async (request: Request) => {
  try {
    const acceptedSecrets = getAcceptedCronSecrets();
    if (acceptedSecrets.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Configure NOTIFICATIONS_CRON_SECRET ou CRON_SECRET para habilitar o cron.',
        },
        { status: 503 }
      );
    }

    if (!isAuthorized(request)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const users = await prisma.user.findMany({
      select: { id: true },
    });

    let totalCreated = 0;
    let usersProcessed = 0;

    const CHUNK_SIZE = 20;
    for (let index = 0; index < users.length; index += CHUNK_SIZE) {
      const chunk = users.slice(index, index + CHUNK_SIZE);
      const results = await Promise.allSettled(chunk.map((user) => syncNotificationsForUser(user.id)));

      results.forEach((result) => {
        usersProcessed += 1;
        if (result.status === 'fulfilled') {
          totalCreated += result.value.createdCount;
          return;
        }
        console.error('Falha ao sincronizar notificações de usuário no cron:', result.reason);
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        usersProcessed,
        notificationsCreated: totalCreated,
      },
    });
  } catch (error) {
    console.error('Erro ao despachar notificações em lote:', error);
    return NextResponse.json(
      { success: false, error: 'Falha ao despachar notificações.' },
      { status: 500 }
    );
  }
};

export async function POST(request: Request) {
  return handleDispatch(request);
}

export async function GET(request: Request) {
  return handleDispatch(request);
}
