/**
 * Núcleo do endpoint de sincronização (POST /api/sync).
 *
 * Fica separado da rota para poder ser exercitado nos testes com um cliente
 * Prisma em memória — o mesmo caminho de código que roda em produção.
 */

import {
  applySyncDelta,
  mergeSnapshotDelta,
  migrateProgressSnapshot,
  readSyncDelta,
  SYNC_SCHEMA_VERSION,
  type SyncClient,
  type SyncDeltaPush,
} from '@/lib/syncDelta';

export interface SyncPushBody {
  lastSyncedAt?: {
    subjects?: string | null;
    blocks?: string | null;
    sessions?: string | null;
  };
  push?: SyncDeltaPush;
  /** `false` desliga a migração automática do blob antigo. */
  migrate?: boolean;
}

export interface SyncPushResponse {
  schemaVersion: number;
  data: {
    subjects: unknown[];
    blocks: unknown[];
    sessions: unknown[];
    snapshots: unknown;
    serverTime: string;
    migration: { migrated: boolean; subjects: number; blocks: number };
    processed: { subjects: number; blocks: number; sessions: number; skipped: number; deleted: number };
    dropped: { subjects: string[]; blocks: string[]; sessions: string[] };
    rejected: { subjects: unknown[]; blocks: unknown[]; sessions: unknown[] };
  };
}

const readSince = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

export async function handleSyncPush(params: {
  userId: string;
  body: SyncPushBody;
  client: SyncClient;
}): Promise<SyncPushResponse> {
  const { userId, body, client } = params;
  const push = body?.push ?? {};
  const lastSyncedAt = body?.lastSyncedAt ?? {};
  const migrate = body?.migrate !== false;

  // Migração automática do formato antigo (blob JSON) na primeira sincronização.
  const migration = migrate
    ? await migrateProgressSnapshot({ userId, client })
    : { migrated: false, subjects: 0, blocks: 0 };

  const applied = await applySyncDelta({ userId, delta: push, client });

  if (push.snapshots && Object.keys(push.snapshots).length > 0) {
    await mergeSnapshotDelta({ userId, snapshots: push.snapshots, client });
  }

  const delta = await readSyncDelta({
    userId,
    since: {
      subjects: readSince(lastSyncedAt.subjects),
      blocks: readSince(lastSyncedAt.blocks),
      sessions: readSince(lastSyncedAt.sessions),
    },
    client: client as never,
  });

  const snapshot = await client.userProgressSnapshot.findUnique({ where: { userId } });

  return {
    schemaVersion: SYNC_SCHEMA_VERSION,
    data: {
      ...delta,
      snapshots: (snapshot?.payload as unknown) ?? {},
      migration,
      processed: applied.applied,
      dropped: {
        subjects: applied.droppedSubjectIds,
        blocks: applied.droppedBlockIds,
        sessions: applied.droppedSessionIds,
      },
      rejected: applied.rejected,
    },
  };
}
