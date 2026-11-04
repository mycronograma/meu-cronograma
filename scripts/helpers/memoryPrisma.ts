/**
 * Cliente Prisma em memória com o subconjunto usado pela sincronização.
 * Permite testar a API e o motor do cliente sem banco (`npm run test:sync`).
 */

export type MemoryRow = Record<string, unknown> & {
  id: string;
  userId: string;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type MemoryPrisma = {
  client: unknown;
  subjects: Map<string, MemoryRow>;
  blocks: Map<string, MemoryRow>;
  sessions: Map<string, MemoryRow>;
  snapshots: Map<string, Record<string, unknown>>;
};

type Row = Record<string, unknown> & { id: string; userId: string; updatedAt: Date; deletedAt: Date | null };

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/** O Prisma converte colunas DateTime para Date; o fake precisa imitar isso. */
const DATE_FIELDS = [
  'date',
  'originalDate',
  'completedAt',
  'createdAt',
  'updatedAt',
  'deletedAt',
  'clientUpdatedAt',
  'startedAt',
  'endedAt',
];

const coerceDates = (row: Row): Row => {
  const next = { ...row };
  DATE_FIELDS.forEach((field) => {
    const value = next[field];
    if (typeof value === 'string') next[field] = new Date(value) as never;
  });
  return next;
};

/** Cliente Prisma em memória com o subconjunto usado pela sincronização. */
import type { SyncClient } from '../../src/lib/syncDelta';

export function createMemoryClient() {
  // Relógio do "servidor": acompanha o tempo real (é o que o Prisma faz com
  // `@updatedAt`), mas nunca repete — assim o cursor do delta é confiável e os
  // registros não ficam "no futuro" em relação à hora da leitura.
  let serverClock = Date.now();
  const tick = () => new Date((serverClock = Math.max(Date.now(), serverClock + 1)));

  const subjects = new Map<string, Row>();
  const blocks = new Map<string, Row>();
  const sessions = new Map<string, Row>();
  const snapshots = new Map<string, Record<string, unknown>>();

  const matches = (row: Row, where: Record<string, unknown>) => {
    if (where.userId && row.userId !== where.userId) return false;
    if (where.id && row.id !== where.id) return false;
    if ('deletedAt' in where && where.deletedAt === null && row.deletedAt !== null) return false;
    const updatedAtFilter = where.updatedAt as { gt?: Date } | undefined;
    if (updatedAtFilter?.gt && row.updatedAt.getTime() <= updatedAtFilter.gt.getTime()) return false;
    return true;
  };

  const collection = (store: Map<string, Row>) => ({
    findFirst: async ({ where }: { where: Record<string, unknown> }) => {
      for (const row of store.values()) {
        if (matches(row, where)) {
          return {
            ...clone(row),
            clientUpdatedAt: (row.clientUpdatedAt as Date) ?? null,
          };
        }
      }
      return null;
    },
    findMany: async ({ where = {}, limit }: { where?: Record<string, unknown>; limit?: number } = {}) => {
      const found = Array.from(store.values()).filter((row) => matches(row, where));
      found.sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());
      return (limit ? found.slice(0, limit) : found).map((row) => clone(row));
    },
    count: async ({ where = {} }: { where?: Record<string, unknown> } = {}) =>
      Array.from(store.values()).filter((row) => matches(row, where)).length,
    upsert: async ({ where, create, update }: { where: { id: string }; create: object; update: object }) => {
      const existing = store.get(where.id);
      const next = existing
        ? coerceDates({ ...existing, ...(update as object) } as Row)
        : coerceDates({ createdAt: tick(), ...(clone(create) as object) } as unknown as Row);
      // Prisma atualiza `updatedAt` sozinho no relógio do servidor.
      next.updatedAt = tick();
      store.set(where.id, next);
      return clone(next);
    },
  });

  const client = {
    subject: collection(subjects) as unknown as SyncClient['subject'],
    studyBlock: collection(blocks) as unknown as SyncClient['studyBlock'],
    studySession: collection(sessions) as unknown as SyncClient['studySession'],
    userProgressSnapshot: {
      findUnique: async (args: unknown) => {
        const { where } = args as { where: { userId: string } };
        const payload = snapshots.get(where.userId);
        return payload ? { payload: clone(payload) } : null;
      },
      upsert: async ({ where, create, update }: { where: { userId: string }; create: object; update: object }) => {
        const existing = snapshots.get(where.userId);
        const next = existing ? { ...(update as Record<string, unknown>) } : { ...(create as Record<string, unknown>) };
        snapshots.set(where.userId, next.payload as Record<string, unknown>);
        return clone(next);
      },
      update: async ({ where, data }: { where: { userId: string }; data: object }) => {
        const existing = snapshots.get(where.userId) ?? {};
        const next = { ...existing, ...(data as Record<string, unknown>) };
        snapshots.set(where.userId, next.payload as Record<string, unknown>);
        return clone(next);
      },
    },
  };

  return { client: client as unknown as SyncClient, subjects, blocks, sessions, snapshots };
}

