/**
 * API Route: /api/sync
 *
 * Sincronização incremental de progresso entre dispositivos.
 *
 * POST  { lastSyncedAt?: { subjects, blocks, sessions }, push?: { subjects, blocks,
 *         sessions, snapshots } }  -> grava o delta do cliente e devolve o do servidor
 * GET   ?subjectsSince=...&blocksSince=...&sessionsSince=... -> só leitura
 *
 * Substitui o antigo PUT /api/progress (blob inteiro de ~3 MB), que continua
 * existindo para compatibilidade com versões antigas do app.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleSyncPush } from '@/lib/syncServer';
import { getSyncCounts, readSyncDelta, SYNC_SCHEMA_VERSION, type SyncClient } from '@/lib/syncDelta';

export const dynamic = 'force-dynamic';

const readSince = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Sessão necessária para sincronizar. Faça login ou entre em modo demo.' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));

    const result = await prisma.$transaction(
      async (tx: SyncClient) => handleSyncPush({ userId, body, client: tx }),
      { timeout: 20000 }
    );

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('Sync API error:', error);
    return NextResponse.json(
      { success: false, error: 'Não foi possível sincronizar o progresso agora.' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const [delta, counts] = await Promise.all([
      readSyncDelta({
        userId,
        since: {
          subjects: readSince(url.searchParams.get('subjectsSince')),
          blocks: readSince(url.searchParams.get('blocksSince')),
          sessions: readSince(url.searchParams.get('sessionsSince')),
        },
      }),
      getSyncCounts(userId),
    ]);

    return NextResponse.json({
      success: true,
      schemaVersion: SYNC_SCHEMA_VERSION,
      data: { ...delta, counts },
    });
  } catch (error) {
    console.error('Sync API read error:', error);
    return NextResponse.json(
      { success: false, error: 'Não foi possível ler o progresso agora.' },
      { status: 500 }
    );
  }
}
