import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { Prisma } from '@prisma/client';
import { authOptions } from '@/lib/auth';
import { hasWebPush } from '@/lib/env';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

interface PushSubscriptionInput {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

const isValidSubscription = (value: unknown): value is PushSubscriptionInput => {
  if (!value || typeof value !== 'object') return false;

  const candidate = value as Partial<PushSubscriptionInput>;
  if (typeof candidate.endpoint !== 'string' || candidate.endpoint.length === 0) return false;
  if (!candidate.keys || typeof candidate.keys !== 'object') return false;

  const keys = candidate.keys as Partial<PushSubscriptionInput['keys']>;
  return typeof keys.p256dh === 'string' && typeof keys.auth === 'string';
};

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasWebPush) {
      return NextResponse.json(
        { success: false, error: 'Notificacoes push indisponiveis no momento.' },
        { status: 503 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const subscription = body?.subscription;

    if (!isValidSubscription(subscription)) {
      return NextResponse.json(
        { success: false, error: 'Assinatura de notificação inválida.' },
        { status: 400 }
      );
    }

    const subscriptionJson = subscription as unknown as Prisma.InputJsonValue;

    await prisma.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      update: {
        userId,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
      create: {
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
    });

    try {
      await prisma.userPreferences.upsert({
        where: { userId },
        update: {
          pushSubscription: subscriptionJson,
        },
        create: {
          userId,
          pushSubscription: subscriptionJson,
        },
      });
    } catch (error) {
      console.warn('Falha ao sincronizar pushSubscription em preferencias.', error);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao salvar assinatura de notificacao:', error);
    return NextResponse.json(
      { success: false, error: 'Falha ao ativar notificações no dispositivo.' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const endpoint =
      typeof body?.endpoint === 'string' && body.endpoint.trim().length > 0
        ? body.endpoint.trim()
        : null;

    if (endpoint) {
      await prisma.pushSubscription.deleteMany({
        where: {
          userId,
          endpoint,
        },
      });
      try {
        await prisma.userPreferences.updateMany({
          where: { userId },
          data: { pushSubscription: Prisma.JsonNull },
        });
      } catch (error) {
        console.warn('Falha ao limpar pushSubscription em preferencias.', error);
      }
      return NextResponse.json({ success: true });
    }

    await prisma.pushSubscription.deleteMany({
      where: { userId },
    });

    try {
      await prisma.userPreferences.updateMany({
        where: { userId },
        data: { pushSubscription: Prisma.JsonNull },
      });
    } catch (error) {
      console.warn('Falha ao limpar pushSubscription em preferencias.', error);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao remover assinatura de notificacao:', error);
    return NextResponse.json(
      { success: false, error: 'Falha ao desativar notificações do dispositivo.' },
      { status: 500 }
    );
  }
}
