/**
 * Sincronização incremental de progresso (blocos, disciplinas e sessões).
 *
 * Antes o app subia o `localStorage` inteiro num único JSON
 * (`UserProgressSnapshot.payload`, ~3 MB por ano) — frágil e sem resolução de
 * conflito entre celular e computador. Aqui o estado passa a ser gravado por
 * linha, com:
 *  - delta: só o que mudou desde o último `updatedAt` conhecido;
 *  - tombstones: exclusões viram `deletedAt`, então o outro dispositivo apaga;
 *  - last-write-wins por registro: compara a marca de tempo do dispositivo
 *    (`clientUpdatedAt`) com a última versão aceita, sem misturar relógios;
 *  - snapshots de compatibilidade (`UserProgressSnapshot`) para o que ainda não
 *    foi migrado (analytics, preferências, onboarding).
 */


import { prisma } from '@/lib/prisma';
import type { StudyBlock, StudyPreferences } from '@/types';

export const SYNC_SCHEMA_VERSION = 1;

/**
 * Cliente mínimo usado pela sincronização. É um subconjunto de
 * `Prisma.TransactionClient`, o que permite testar a mesclagem com um cliente
 * em memória (sem banco) — ver `scripts/sync-delta.test.ts`.
 */
/** Valor JSON aceito pelo Prisma. Local para não depender do client gerado. */
type JsonInput = Record<string, unknown> | unknown[] | string | number | boolean | null;

type SyncRowVersion = { updatedAt: Date; clientUpdatedAt?: Date | null; [key: string]: unknown };

export type SyncClient = {
  subject: {
    findFirst: (args: unknown) => Promise<SyncRowVersion | null>;
    findMany: (args: unknown) => Promise<{ id: string }[]>;
    count: (args: unknown) => Promise<number>;
    upsert: (args: { where: { id: string }; create: object; update: object }) => Promise<unknown>;
  };
  studyBlock: {
    findFirst: (args: unknown) => Promise<SyncRowVersion | null>;
    findMany: (args: unknown) => Promise<{ id: string }[]>;
    count: (args: unknown) => Promise<number>;
    upsert: (args: { where: { id: string }; create: object; update: object }) => Promise<unknown>;
  };
  studySession: {
    findFirst: (args: unknown) => Promise<SyncRowVersion | null>;
    findMany: (args: unknown) => Promise<{ id: string }[]>;
    count: (args: unknown) => Promise<number>;
    upsert: (args: { where: { id: string }; create: object; update: object }) => Promise<unknown>;
  };
  userProgressSnapshot: {
    findUnique: (args: unknown) => Promise<{ payload: unknown } | null>;
    upsert: (args: { where: { userId: string }; create: object; update: object }) => Promise<unknown>;
    update: (args: { where: { userId: string }; data: object }) => Promise<unknown>;
  };
};

type TxClient = SyncClient;

export interface SyncRecordInput {
  id: string;
  updatedAt: string;
  deletedAt?: string | null;
  [key: string]: unknown;
}

export interface SyncDeltaPush {
  subjects?: SyncRecordInput[];
  blocks?: SyncRecordInput[];
  sessions?: SyncRecordInput[];
  /**
   * Chaves que o cliente ainda não migrou (analytics, preferências,
   * onboarding...). Mescladas no snapshot JSON de compatibilidade.
   */
  snapshots?: Record<string, unknown>;
}

export interface SyncDeltaPull {
  subjects: SyncRecordInput[];
  blocks: SyncRecordInput[];
  sessions: SyncRecordInput[];
  snapshots: Record<string, unknown>;
  serverTime: string;
  processed: {
    subjects: number;
    blocks: number;
    sessions: number;
    skipped: number;
    deleted: number;
  };
}

const toIso = (value: Date | string | null | undefined): string | null => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const parseDate = (value: unknown): Date | null => {
  if (typeof value !== 'string' && !(value instanceof Date)) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const readString = (source: Record<string, unknown>, key: string): string | undefined => {
  const value = source[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

const readOptionalString = (source: Record<string, unknown>, key: string): string | null => {
  const value = source[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
};

const readNumber = (source: Record<string, unknown>, key: string, fallback: number): number => {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

const readOptionalNumber = (source: Record<string, unknown>, key: string): number | null => {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

const readOptionalInt = (source: Record<string, unknown>, key: string): number | null => {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;
};

const readDate = (source: Record<string, unknown>, key: string): Date | null =>
  parseDate(source[key]);

const readJson = (source: Record<string, unknown>, key: string): JsonInput | undefined => {
  const value = source[key];
  if (value === undefined || value === null) return undefined;
  return value as JsonInput;
};

const sanitizeRecord = (value: unknown): SyncRecordInput | null => {
  if (!isRecord(value)) return null;
  const id = readString(value, 'id');
  const updatedAt = toIso(value.updatedAt as string | Date | undefined);
  if (!id || !updatedAt) return null;
  return { ...value, id, updatedAt } as SyncRecordInput;
};

const sanitizeList = (value: unknown): SyncRecordInput[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map(sanitizeRecord)
    .filter((record): record is SyncRecordInput => Boolean(record));
};

/**
 * O cliente vence se a versão dele for mais recente que a última versão aceita.
 * Compara com `clientUpdatedAt` (relógio do dispositivo) — usar o `updatedAt` do
 * servidor misturaria relógios diferentes e bloquearia edições legítimas.
 */
const clientWins = (record: SyncRecordInput, lastAcceptedAt: Date | null) => {
  const clientUpdatedAt = new Date(record.updatedAt);
  if (Number.isNaN(clientUpdatedAt.getTime())) return false;
  if (!lastAcceptedAt) return true;
  return clientUpdatedAt.getTime() >= lastAcceptedAt.getTime();
};

const toSubjectPayload = (record: SyncRecordInput, userId: string) => ({
  userId,
  name: readString(record, 'name') ?? 'Disciplina',
  color: readString(record, 'color') ?? '#00B4FF',
  icon: readString(record, 'icon') ?? 'book',
  priority: Math.min(10, Math.max(1, readNumber(record, 'priority', 5))),
  difficulty: Math.min(10, Math.max(1, readNumber(record, 'difficulty', 5))),
  targetHours: readNumber(record, 'targetHours', 0),
  completedHours: readNumber(record, 'completedHours', 0),
  totalHours: readNumber(record, 'totalHours', 0),
  sessionsCount: readNumber(record, 'sessionsCount', 0),
  averageScore: readNumber(record, 'averageScore', 0),
  isActive: record.isActive !== false,
  area: readOptionalString(record, 'area'),
  nivel: readOptionalString(record, 'nivel'),
  pesoNoExame: readOptionalInt(record, 'pesoNoExame'),
  enemWeight: readOptionalNumber(record, 'enemWeight'),
  tipo: readOptionalString(record, 'tipo'),
  topicos: readJson(record, 'topicos'),
  prerequisitos: readJson(record, 'prerequisitos'),
  studyPrefs: readJson(record, 'studyPrefs'),
  deletedAt: parseDate(record.deletedAt),
  clientUpdatedAt: parseDate(record.updatedAt),
});

const toBlockPayload = (record: SyncRecordInput, userId: string) => {
  const date = readDate(record, 'date') ?? new Date();
  const startTime = readString(record, 'startTime') ?? '09:00';
  const endTime = readString(record, 'endTime') ?? startTime;

  return {
    userId,
    subjectId: readString(record, 'subjectId') ?? 'unknown',
    date,
    startTime,
    endTime,
    durationMinutes: Math.max(1, Math.round(readNumber(record, 'durationMinutes', 60))),
    type: (readOptionalString(record, 'type') as StudyBlock['type']) ?? null,
    description: readOptionalString(record, 'description'),
    sequenceIndex: readOptionalInt(record, 'sequenceIndex'),
    relatedSubjectId: readOptionalString(record, 'relatedSubjectId'),
    status: readString(record, 'status') ?? 'scheduled',
    isBreak: record.isBreak === true,
    originalDate: readDate(record, 'originalDate'),
    completedAt: readDate(record, 'completedAt'),
    rescheduleCount: readOptionalInt(record, 'rescheduleCount') ?? 0,
    isAutoGenerated: record.isAutoGenerated !== false,
    sessionType: readOptionalString(record, 'sessionType'),
    phase: readOptionalString(record, 'phase'),
    area: readOptionalString(record, 'area'),
    topicName: readOptionalString(record, 'topicName'),
    pedagogicalStepIndex: readOptionalInt(record, 'pedagogicalStepIndex'),
    pedagogicalStepTotal: readOptionalInt(record, 'pedagogicalStepTotal'),
    adaptiveScore: readOptionalNumber(record, 'adaptiveScore'),
    deletedAt: parseDate(record.deletedAt),
    clientUpdatedAt: parseDate(record.updatedAt),
  };
};

const toSessionPayload = (record: SyncRecordInput, userId: string) => ({
  userId,
  subjectId: readString(record, 'subjectId') ?? 'unknown',
  blockId: readOptionalString(record, 'blockId'),
  startedAt: readDate(record, 'startedAt') ?? new Date(),
  endedAt: readDate(record, 'endedAt'),
  plannedMinutes: Math.max(0, Math.round(readNumber(record, 'plannedMinutes', 0))),
  actualMinutes: Math.max(0, Math.round(readNumber(record, 'actualMinutes', 0))),
  focusScore: Math.round(readNumber(record, 'focusScore', 0)),
  productivityScore: Math.round(readNumber(record, 'productivityScore', 0)),
  accuracyRate: readOptionalNumber(record, 'accuracyRate'),
  errorRate: readOptionalNumber(record, 'errorRate'),
  sessionType: (readOptionalString(record, 'sessionType') as never) ?? null,
  difficultyScore: readOptionalInt(record, 'difficultyScore'),
  correctAnswers: readOptionalInt(record, 'correctAnswers'),
  totalQuestions: readOptionalInt(record, 'totalQuestions'),
  topicName: readOptionalString(record, 'topicName'),
  notes: readOptionalString(record, 'notes'),
  xpEarned: Math.round(readNumber(record, 'xpEarned', 0)),
  deletedAt: parseDate(record.deletedAt),
  clientUpdatedAt: parseDate(record.updatedAt),
});

const serializeSubject = (subject: { updatedAt: unknown; [key: string]: unknown }) => ({
  ...subject,
  updatedAt: toIso(subject.updatedAt as Date | string | null),
  clientUpdatedAt: toIso(subject.clientUpdatedAt as Date | string | null),
  createdAt: toIso(subject.createdAt as Date | string | null),
  deletedAt: toIso(subject.deletedAt as Date | string | null),
});

const serializeBlock = (block: { [key: string]: unknown }) => ({
  ...block,
  date: toIso(block.date as Date | string | null),
  originalDate: toIso(block.originalDate as Date | string | null),
  completedAt: toIso(block.completedAt as Date | string | null),
  createdAt: toIso(block.createdAt as Date | string | null),
  updatedAt: toIso(block.updatedAt as Date | string | null),
  clientUpdatedAt: toIso(block.clientUpdatedAt as Date | string | null),
  deletedAt: toIso(block.deletedAt as Date | string | null),
});

const serializeSession = (session: { [key: string]: unknown }) => ({
  ...session,
  startedAt: toIso(session.startedAt as Date | string | null),
  endedAt: toIso(session.endedAt as Date | string | null),
  createdAt: toIso(session.createdAt as Date | string | null),
  updatedAt: toIso(session.updatedAt as Date | string | null),
  clientUpdatedAt: toIso(session.clientUpdatedAt as Date | string | null),
  deletedAt: toIso(session.deletedAt as Date | string | null),
});

export { type TxClient };

export interface ApplyDeltaResult {
  applied: SyncDeltaPull['processed'];
  droppedSubjectIds: string[];
  droppedBlockIds: string[];
  droppedSessionIds: string[];
  /**
   * Registros recusados por já existir uma versão mais nova (conflito) — vão de
   * volta para o cliente com a versão vencedora, senão o aparelho que perdeu o
   * conflito continuaria exibindo (e salvando) um estado que ninguém aceitou.
   */
  rejected: { subjects: unknown[]; blocks: unknown[]; sessions: unknown[] };
}

/**
 * Aplica o delta enviado pelo cliente.
 * Ids órfãos (bloco de disciplina que não existe mais / que o cliente não tem)
 * são descartados e devolvidos para o cliente limpar o estado local — antes,
 * a sincronização quebrava com erro de chave estrangeira.
 */
export async function applySyncDelta(params: {
  userId: string;
  delta: SyncDeltaPush;
  client: TxClient;
}): Promise<ApplyDeltaResult> {
  const { userId, delta, client } = params;
  const subjects = sanitizeList(delta.subjects);
  const blocks = sanitizeList(delta.blocks);
  const sessions = sanitizeList(delta.sessions);

  const applied = { subjects: 0, blocks: 0, sessions: 0, skipped: 0, deleted: 0 };
  const droppedSubjectIds: string[] = [];
  const droppedBlockIds: string[] = [];
  const droppedSessionIds: string[] = [];
  const rejected: ApplyDeltaResult['rejected'] = { subjects: [], blocks: [], sessions: [] };

  /** Busca a versão que venceu o conflito para devolver ao cliente. */
  const findWinningRow = async (
    collection: 'subject' | 'studyBlock' | 'studySession',
    id: string
  ) => {
    const row = await client[collection].findFirst({ where: { id, userId } });
    return row as unknown;
  };

  // ---------- Disciplinas ----------
  for (const record of subjects) {
    const existing = await client.subject.findFirst({
      where: { id: record.id, userId },
      select: { updatedAt: true, clientUpdatedAt: true },
    });
    if (!clientWins(record, existing?.clientUpdatedAt ?? existing?.updatedAt ?? null)) {
      applied.skipped += 1;
      rejected.subjects.push(await findWinningRow('subject', record.id));
      continue;
    }

    const payload = toSubjectPayload(record, userId);
    if (payload.deletedAt) {
      if (!existing) {
        applied.skipped += 1;
        continue;
      }
      applied.deleted += 1;
    }

    await client.subject.upsert({
      where: { id: record.id },
      create: { id: record.id, ...payload },
      update: payload,
    });
    applied.subjects += 1;
  }

  // Ids válidos para blocos: disciplinas do usuário que continuam ativas.
  const ownedSubjects = await client.subject.findMany({
    where: { userId, deletedAt: null },
    select: { id: true },
  });
  const validSubjectIds = new Set(ownedSubjects.map((subject) => subject.id));

  // ---------- Blocos ----------
  const validBlocksBySubject = new Map<string, Set<string>>();
  for (const record of blocks) {
    const existing = await client.studyBlock.findFirst({
      where: { id: record.id, userId },
      select: { updatedAt: true, clientUpdatedAt: true },
    });
    if (!clientWins(record, existing?.clientUpdatedAt ?? existing?.updatedAt ?? null)) {
      applied.skipped += 1;
      rejected.blocks.push(await findWinningRow('studyBlock', record.id));
      continue;
    }

    const payload = toBlockPayload(record, userId);
    const isTombstone = Boolean(payload.deletedAt);

    if (isTombstone) {
      // Exclusão vence a validação de disciplina: apagar uma disciplina e os
      // blocos dela acontece na mesma sincronização, e descartar o tombstone
      // deixaria o bloco vivo no servidor para sempre.
      if (!existing) {
        applied.skipped += 1;
        continue;
      }
      applied.deleted += 1;
    } else if (!payload.isBreak && !validSubjectIds.has(payload.subjectId)) {
      droppedBlockIds.push(record.id);
      applied.skipped += 1;
      continue;
    }

    await client.studyBlock.upsert({
      where: { id: record.id },
      create: { id: record.id, ...payload },
      update: payload,
    });
    applied.blocks += 1;

    const subjectBlocks = validBlocksBySubject.get(payload.subjectId) ?? new Set<string>();
    subjectBlocks.add(record.id);
    validBlocksBySubject.set(payload.subjectId, subjectBlocks);
  }

  const ownedBlocks = await client.studyBlock.findMany({
    where: { userId, deletedAt: null },
    select: { id: true },
  });
  const validBlockIds = new Set(ownedBlocks.map((block) => block.id));

  // ---------- Sessões ----------
  for (const record of sessions) {
    const existing = await client.studySession.findFirst({
      where: { id: record.id, userId },
      select: { updatedAt: true, clientUpdatedAt: true },
    });
    if (!clientWins(record, existing?.clientUpdatedAt ?? existing?.updatedAt ?? null)) {
      applied.skipped += 1;
      rejected.sessions.push(await findWinningRow('studySession', record.id));
      continue;
    }

    const payload = toSessionPayload(record, userId);

    if (payload.deletedAt) {
      if (!existing) {
        applied.skipped += 1;
        continue;
      }
      applied.deleted += 1;
    } else if (!validSubjectIds.has(payload.subjectId)) {
      droppedSessionIds.push(record.id);
      applied.skipped += 1;
      continue;
    }
    if (payload.blockId && !validBlockIds.has(payload.blockId)) {
      payload.blockId = null;
    }

    await client.studySession.upsert({
      where: { id: record.id },
      create: { id: record.id, ...payload },
      update: payload,
    });
    applied.sessions += 1;
  }

  return { applied, droppedSubjectIds, droppedBlockIds, droppedSessionIds, rejected };
}

/** Lê o delta do servidor a partir de `since` (ISO) por coleção. */
export async function readSyncDelta(params: {
  userId: string;
  since?: {
    subjects?: string | null;
    blocks?: string | null;
    sessions?: string | null;
  };
  client?: SyncReadClient;
}): Promise<Omit<SyncDeltaPull, 'snapshots' | 'processed'>> {
  const { userId, since, client = prisma as unknown as SyncReadClient } = params;

  const subjectsSince = parseDate(since?.subjects);
  const blocksSince = parseDate(since?.blocks);
  const sessionsSince = parseDate(since?.sessions);

  const [subjects, blocks, sessions] = await Promise.all([
    client.subject.findMany({
      where: {
        userId,
        ...(subjectsSince ? { updatedAt: { gt: subjectsSince } } : {}),
      },
      orderBy: { updatedAt: 'asc' },
      take: 2000,
    }),
    client.studyBlock.findMany({
      where: {
        userId,
        ...(blocksSince ? { updatedAt: { gt: blocksSince } } : {}),
      },
      orderBy: { updatedAt: 'asc' },
      take: 5000,
    }),
    client.studySession.findMany({
      where: {
        userId,
        ...(sessionsSince ? { updatedAt: { gt: sessionsSince } } : {}),
      },
      orderBy: { updatedAt: 'asc' },
      take: 2000,
    }),
  ]);

  /**
   * O cursor precisa cobrir também os registros recém-gravados. Se o relógio do
   * banco estiver alguns milissegundos à frente do processo web (comum em banco
   * gerenciado), usar só `new Date()` faria o mesmo registro voltar em toda
   * sincronização — tráfego repetido sem necessidade.
   */
  let serverTimeMs = Date.now();
  for (const row of [...subjects, ...blocks, ...sessions]) {
    const value = (row as { updatedAt?: unknown }).updatedAt;
    const time = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
    if (Number.isFinite(time) && time > serverTimeMs) serverTimeMs = time;
  }

  return {
    subjects: subjects.map((row) => serializeSubject(row as never)) as unknown as SyncRecordInput[],
    blocks: blocks.map((row) => serializeBlock(row as never)) as unknown as SyncRecordInput[],
    sessions: sessions.map((row) => serializeSession(row as never)) as unknown as SyncRecordInput[],
    serverTime: new Date(serverTimeMs).toISOString(),
  };
}

/** Mescla chaves não migradas no snapshot JSON de compatibilidade. */
export async function mergeSnapshotDelta(params: {
  userId: string;
  snapshots: Record<string, unknown>;
  client: TxClient;
}): Promise<void> {
  const { userId, snapshots, client } = params;
  const keys = Object.keys(snapshots);
  if (keys.length === 0) return;

  const existing = await client.userProgressSnapshot.findUnique({ where: { userId } });
  const currentPayload = isRecord(existing?.payload) ? (existing.payload as Record<string, unknown>) : {};

  const merged: Record<string, unknown> = { ...currentPayload };
  keys.forEach((key) => {
    const incoming = snapshots[key];
    if (incoming === undefined) return;
    if (incoming === null) {
      delete merged[key];
      return;
    }
    merged[key] = incoming;
  });

  await client.userProgressSnapshot.upsert({
    where: { userId },
    create: { userId, payload: merged as JsonInput },
    update: { payload: merged as JsonInput },
  });
}

const SUBJECT_KEYS = ['nexora_subjects', 'subjects', 'subjectList'] as const;
const BLOCK_KEYS = ['nexora_planner_blocks', 'plannerBlocks', 'planner_blocks', 'blocks'] as const;

/**
 * Registros antigos vindos do `localStorage` podem não ter `updatedAt`
 * (o motor de roadmap só passou a preenchê-lo depois). Na migração isso não
 * pode descartar o dado: usamos `createdAt` e, em último caso, o instante atual.
 */
const sanitizeRecordLenient = (value: unknown, fallback: Date): SyncRecordInput | null => {
  const record = sanitizeRecord(value);
  if (record) return record;
  if (!isRecord(value)) return null;
  const id = readString(value, 'id');
  if (!id) return null;
  const updatedAt = toIso(readDate(value, 'createdAt') ?? fallback) as string;
  return { ...value, id, updatedAt } as SyncRecordInput;
};

const sanitizeListLenient = (value: unknown, fallback: Date): SyncRecordInput[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => sanitizeRecordLenient(item, fallback))
    .filter((record): record is SyncRecordInput => Boolean(record));
};

const readArrayFromSnapshot = (payload: Record<string, unknown>, keys: readonly string[]) => {
  for (const key of keys) {
    const value = payload[key];
    if (Array.isArray(value)) return value;
  }
  return null;
};

export interface MigrationResult {
  migrated: boolean;
  subjects: number;
  blocks: number;
  studyPrefs?: StudyPreferences;
}

/**
 * Migração automática do formato antigo (um blob JSON com tudo) para o formato
 * por linha. Roda uma vez por usuário, no primeiro sync, e é idempotente.
 */
export async function migrateProgressSnapshot(params: {
  userId: string;
  client: TxClient;
  markAsMigrated?: boolean;
}): Promise<MigrationResult> {
  const { userId, client, markAsMigrated = true } = params;

  const snapshot = await client.userProgressSnapshot.findUnique({ where: { userId } });
  if (!snapshot || !isRecord(snapshot.payload)) {
    return { migrated: false, subjects: 0, blocks: 0 };
  }

  const payload = snapshot.payload as Record<string, unknown>;
  if (payload.__normalized === true) {
    return { migrated: false, subjects: 0, blocks: 0 };
  }

  const now = new Date();
  const rawSubjects = readArrayFromSnapshot(payload, SUBJECT_KEYS);
  const rawBlocks = readArrayFromSnapshot(payload, BLOCK_KEYS);
  const subjects = sanitizeListLenient(rawSubjects ?? [], now);
  const blocks = sanitizeListLenient(rawBlocks ?? [], now);

  if (subjects.length === 0 && blocks.length === 0) {
    if (markAsMigrated) {
      await client.userProgressSnapshot.update({
        where: { userId },
        data: { payload: { ...payload, __normalized: true } as JsonInput },
      });
    }
    return { migrated: false, subjects: 0, blocks: 0 };
  }

  const existingSubjects = await client.subject.count({ where: { userId } });
  const existingBlocks = await client.studyBlock.count({ where: { userId } });
  if (existingSubjects > 0 || existingBlocks > 0) {
    // Já existem linhas: não sobrescreve.
    if (markAsMigrated) {
      await client.userProgressSnapshot.update({
        where: { userId },
        data: { payload: { ...payload, __normalized: true } as JsonInput },
      });
    }
    return { migrated: false, subjects: 0, blocks: 0 };
  }

  await applySyncDelta({
    userId,
    delta: { subjects, blocks },
    client,
  });

  if (markAsMigrated) {
    await client.userProgressSnapshot.update({
      where: { userId },
      data: { payload: { ...payload, __normalized: true } as JsonInput },
    });
  }

  return {
    migrated: true,
    subjects: subjects.length,
    blocks: blocks.length,
    studyPrefs: (payload.nexora_study_prefs as StudyPreferences | undefined) ?? undefined,
  };
}

/** Contagens usadas no diagnóstico do sync. */
export type SyncReadClient = {
  subject: { findMany: (args: unknown) => Promise<unknown[]> };
  studyBlock: { findMany: (args: unknown) => Promise<unknown[]> };
  studySession: { findMany: (args: unknown) => Promise<unknown[]> };
  userProgressSnapshot?: { findUnique: (args: unknown) => Promise<{ payload: unknown } | null> };
};

export async function getSyncCounts(userId: string, client = prisma as unknown as SyncClient & SyncReadClient) {
  const [subjects, blocks, sessions] = await Promise.all([
    client.subject.count({ where: { userId, deletedAt: null } }),
    client.studyBlock.count({ where: { userId, deletedAt: null } }),
    client.studySession.count({ where: { userId, deletedAt: null } }),
  ]);

  return { subjects, blocks, sessions };
}

export const syncSnapshotKeyAliases: Record<string, string> = {
  analytics: 'nexora_analytics',
  userSettings: 'nexora_user_settings',
  studyPrefs: 'nexora_study_prefs',
  scheduleRange: 'nexora_schedule_range',
  dailyLimits: 'nexora_daily_limits',
  onboarding: 'nexora_onboarding',
  sessionTimers: 'nexora_session_timers',
  xpEvents: 'nexora_xp_events',
  unlockedAchievements: 'nexora_unlocked_achievements',
  firstCycleAllSubjects: 'nexora_first_cycle_all_subjects',
  subjects: 'nexora_subjects',
  plannerBlocks: 'nexora_planner_blocks',
};

export const normalizeSnapshotKey = (key: string): string =>
  syncSnapshotKeyAliases[key] ?? (key.startsWith('nexora_') ? key : key);
