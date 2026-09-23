import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createNotificationForUser } from '@/lib/notification-center';

export const dynamic = 'force-dynamic';

const sanitizeString = (value: unknown, fallback: string) => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
};

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const title = sanitizeString(body?.title, 'Nexora');
    const message = sanitizeString(body?.message, 'Você tem um novo aviso de estudo.');
    const url = sanitizeString(body?.url, '/planner');

    const result = await createNotificationForUser({
      userId,
      type: 'study',
      title,
      message,
      url,
      dedupeKey: `study:manual:${Date.now()}`,
      sendPush: true,
      metadata: {
        source: 'manual_send_endpoint',
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        created: result.created,
        pushDelivered: result.pushDelivered,
      },
    });
  } catch (error) {
    console.error('Erro ao enviar notificacao manual:', error);
    return NextResponse.json(
      { success: false, error: 'Falha ao enviar notificacao.' },
      { status: 500 }
    );
  }
}
