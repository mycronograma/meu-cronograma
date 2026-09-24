'use client';

/**
 * Motor de sincronização incremental do cliente.
 *
 * Antes: cada alteração subia o `localStorage` inteiro (~3 MB depois de um ano)
 * num único `PUT /api/progress`. Agora:
 *  - o que mudou é comparado por "impressão digital" (hash do conteúdo do
 *    registro), então só registros alterados viajam;
 *  - exclusões viram tombstones (`deletedAt`), então apagar no celular apaga no
 *    computador;
 *  - conflitos são resolvidos por registro (quem tem a marca de tempo mais nova
 *    vence), sem derrubar o trabalho do outro dispositivo;
 *  - o que ainda não foi migrado para linhas (analytics, preferências, XP...)
 *    continua num snapshot JSON, mas só é enviado quando muda.
 *
 * O estado de sincronização (cursores e impressões digitais) fica em
 * `nexora_sync_state`, separado das chaves do app.
 */

import {
  getClientStoreSnapshot,
  setClientStoreEntries,
} from '@/hooks/useLocalStorage';
import type { StudyBlock, Subject } from '@/types';

export const SYNC_STATE_KEY = 'nexora_sync_state';
export const SYNC_SCHEMA_VERSION = 1;

/** Tempo mínimo entre leituras do servidor sem alterações locais. */
const PULL_INTERVAL_MS = 90_000;

export const ROW_STORE_KEYS = ['nexora_subjects', 'nexora_planner_blocks'] as const;

/** Chaves que continuam como snapshot JSON (não são tabelas). */
export const SNAPSHOT_STORE_KEYS = [
  'nexora_analytics',
  'nexora_study_prefs',
  'nexora_user_settings',
  'nexora_schedule_range',
  'nexora_daily_limits',
  'nexora_first_cycle_all_subjects',
  'nexora_onboarding',
  'nexora_session_timers',
  'nexora_backlog_last_auto_run_day',
  'nexora_xp_events',
  'nexora_unlocked_achievements',
] as const;

/** Chaves leves usadas só para decidir se algo mudou. */
const FINGERPRINT_IGNORED_KEYS = new Set(['updatedAt', 'clientUpdatedAt', 'deletedAt']);

type Collection = 'subjects' | 'blocks' | 'sessions' | 'snapshots';

export interface SyncState {
  version: number;
  cursors: {
    subjects: string | null;
    blocks: string | null;
    sessions: string | null;
  };
  fingerprints: Record<Collection, Record<string, string>>;
  lastSyncAt: string | null;
}

export interface SyncStats {
  ok: boolean;
  skipped: boolean;
  pushed: { subjects: number; blocks: number; sessions: number; snapshots: number };
  pulled: { subjects: number; blocks: number; sessions: number };
  deleted: number;
  dropped: { subjects: number; blocks: number; sessions: number };
  bytesUp: number;
  bytesDown: number;
  at: string;
  error?: string;
}

export interface SyncEngineOptions {
  storage?: Storage | null;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

const emptyState = (): SyncState => ({
  version: SYNC_SCHEMA_VERSION,
  cursors: { subjects: null, blocks: null, sessions: null },
  fingerprints: { subjects: {}, blocks: {}, sessions: {}, snapshots: {} },
  lastSyncAt: null,
});

const resolveStorage = (storage?: Storage | null): Storage | null => {
  if (storage !== undefined) return storage;
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const readArray = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? (value.filter(isRecord) as Record<string, unknown>[]) : [];

/** JSON estável: mesma informação => mesma string (ordem de chaves não importa). */
const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
};

const fingerprint = (record: Record<string, unknown>): string => {
  const light: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (FINGERPRINT_IGNORED_KEYS.has(key)) continue;
    light[key] = value;
  }
  return stableStringify(light);
};

/**
 * Registro pronto para o servidor: sem a cópia embutida da disciplina
 * (≈58% do peso de cada bloco) e sem campos que o servidor decide sozinho.
 */
export const toWireRecord = (record: Record<string, unknown>): Record<string, unknown> => {
  const { subject, userId, ...rest } = record;
  void subject;
  void userId;
  return rest;
};

/** Reanexa a cópia da disciplina para a interface continuar funcionando. */
const hydrateBlock = (
  block: Record<string, unknown>,
  subjectsById: Map<string, Subject>
): Record<string, unknown> => {
  const subjectId = typeof block.subjectId === 'string' ? block.subjectId : null;
  if (!subjectId) return block;
  const subject = subjectsById.get(subjectId);
  return subject ? { ...block, subject } : block;
};

const readState = (storage: Storage | null): SyncState => {
  if (!storage) return emptyState();
  try {
    const raw = storage.getItem(SYNC_STATE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<SyncState>;
    if (!isRecord(parsed)) return emptyState();
    const state = emptyState();
    return {
      version: SYNC_SCHEMA_VERSION,
      cursors: {
        subjects: parsed.cursors?.subjects ?? null,
        blocks: parsed.cursors?.blocks ?? null,
        sessions: parsed.cursors?.sessions ?? null,
      },
      fingerprints: {
        subjects: parsed.fingerprints?.subjects ?? {},
        blocks: parsed.fingerprints?.blocks ?? {},
        sessions: parsed.fingerprints?.sessions ?? {},
        snapshots: parsed.fingerprints?.snapshots ?? {},
      },
      lastSyncAt: parsed.lastSyncAt ?? null,
    };
  } catch {
    return emptyState();
  }
};

const writeState = (storage: Storage | null, state: SyncState) => {
  if (!storage) return;
  try {
    storage.setItem(SYNC_STATE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Não foi possível guardar o estado de sincronização:', error);
  }
};

export function resetSyncState(storage?: Storage | null) {
  const target = resolveStorage(storage);
  if (!target) return;
  try {
    target.removeItem(SYNC_STATE_KEY);
  } catch {
    // ignora
  }
}

export function describeSyncState(storage?: Storage | null): SyncState {
  return readState(resolveStorage(storage));
}

interface BuiltDelta {
  delta: {
    subjects?: Record<string, unknown>[];
    blocks?: Record<string, unknown>[];
    snapshots?: Record<string, unknown>;
  };
  counts: { subjects: number; blocks: number; snapshots: number };
  /** Registros carimbados localmente (não mudam os dados, só a marca de tempo). */
  stamped: { subjects: Record<string, unknown>[]; blocks: Record<string, unknown>[] };
  /**
   * Só é chamado depois de o servidor confirmar a gravação. Se a rede cair no
   * meio, as impressões digitais ficam como estavam e o próximo sync reenvia —
   * antes, uma falha no meio do caminho fazia a alteração nunca mais subir.
   */
  commit: () => void;
}

/**
 * Compara o estado local com as impressões digitais guardadas e devolve o que
 * precisa ir para o servidor — incluindo tombstones de registros removidos.
 */
export function buildDelta(options: { storage?: Storage | null; now?: () => Date } = {}): BuiltDelta {
  const storage = resolveStorage(options.storage);
  const state = readState(storage);
  const now = (options.now ?? (() => new Date()))().toISOString();
  const store = getClientStoreSnapshot() as Record<string, unknown>;

  // Alterações só passam a valer depois do "commit" (push confirmado).
  const nextFingerprints: SyncState['fingerprints'] = {
    subjects: { ...state.fingerprints.subjects },
    blocks: { ...state.fingerprints.blocks },
    sessions: { ...state.fingerprints.sessions },
    snapshots: { ...state.fingerprints.snapshots },
  };
  const removed: { subjects: string[]; blocks: string[] } = { subjects: [], blocks: [] };

  const result: BuiltDelta = {
    delta: {},
    counts: { subjects: 0, blocks: 0, snapshots: 0 },
    stamped: { subjects: [], blocks: [] },
    commit: () => {
      writeState(storage, {
        ...state,
        fingerprints: nextFingerprints,
        lastSyncAt: state.lastSyncAt,
      });
    },
  };

  const collect = (
    key: 'subjects' | 'blocks',
    storeKey: string,
    stampChanged: boolean
  ): Record<string, unknown>[] => {
    const records = readArray(store[storeKey]);
    const seen = new Set<string>();
    const payload: Record<string, unknown>[] = [];

    for (const record of records) {
      const id = typeof record.id === 'string' ? record.id : null;
      if (!id) continue;
      seen.add(id);

      const wire = toWireRecord(record);
      const hash = fingerprint(wire);
      if (state.fingerprints[key][id] === hash) continue;

      const stamped = stampChanged ? { ...wire, updatedAt: now } : wire;
      payload.push(stamped);
      nextFingerprints[key][id] = hash;
      if (stampChanged) result.stamped[key].push({ ...record, updatedAt: now });
    }

    // Removidos desde a última sincronização viram tombstones.
    for (const id of Object.keys(state.fingerprints[key])) {
      if (seen.has(id)) continue;
      payload.push({ id, updatedAt: now, deletedAt: now });
      delete nextFingerprints[key][id];
      removed[key].push(id);
    }

    return payload;
  };

  const subjects = collect('subjects', 'nexora_subjects', true);
  const blocks = collect('blocks', 'nexora_planner_blocks', true);

  if (subjects.length > 0) {
    result.delta.subjects = subjects;
    result.counts.subjects = subjects.length;
  }
  if (blocks.length > 0) {
    result.delta.blocks = blocks;
    result.counts.blocks = blocks.length;
  }

  // Snapshots: só entram no payload quando o conteúdo muda.
  const snapshots: Record<string, unknown> = {};
  for (const key of SNAPSHOT_STORE_KEYS) {
    const value = store[key];
    if (value === undefined) {
      if (state.fingerprints.snapshots[key]) {
        snapshots[key] = null;
        delete state.fingerprints.snapshots[key];
        result.counts.snapshots += 1;
      }
      continue;
    }

    const hash = stableStringify(value);
    if (state.fingerprints.snapshots[key] === hash) continue;
    snapshots[key] = value;
    nextFingerprints.snapshots[key] = hash;
    result.counts.snapshots += 1;
  }
  if (Object.keys(snapshots).length > 0) result.delta.snapshots = snapshots;

  void removed;
  return result;
}

/**
 * Junta o registro do servidor ao local preservando o relógio do dispositivo.
 *
 * O `updatedAt` que volta do servidor é o horário do banco — comparar relógios
 * diferentes (servidor × celular) fazia edições legítimas serem tratadas como
 * antigas e "sumirem". Quem manda na marca de tempo local é o cliente; o do
 * servidor serve só para saber em que ponto do delta estamos.
 */
const mergeIncoming = (
  local: Record<string, unknown> | undefined,
  incoming: Record<string, unknown>
): Record<string, unknown> => {
  const merged: Record<string, unknown> = { ...(local ?? {}), ...incoming };
  const deviceUpdatedAt = incoming.clientUpdatedAt ?? incoming.updatedAt;
  if (typeof deviceUpdatedAt === 'string') merged.updatedAt = deviceUpdatedAt;
  delete merged.clientUpdatedAt;
  return merged;
};

/**
 * Atualiza a marca de tempo dos registros enviados — dentro do array atual.
 *
 * Esta função já substituiu a lista inteira uma vez: como o payload contém
 * apenas o que mudou, escrever `stamped` direto no store apagava todos os
 * outros blocos (o teste de dois aparelhos pegou isso).
 */
const commitStamped = (stamped: BuiltDelta['stamped']) => {
  const mergeIntoStore = (storeKey: string, records: Record<string, unknown>[]) => {
    if (records.length === 0) return null;
    const store = getClientStoreSnapshot() as Record<string, unknown>;
    const current = Array.isArray(store[storeKey]) ? (store[storeKey] as unknown[]) : [];
    const stampedById = new Map(records.map((record) => [String(record.id), record]));

    const merged = current.map((row) => {
      if (!isRecord(row)) return row;
      return stampedById.get(String(row.id)) ?? row;
    });

    // Registro que não estava na lista (não deveria acontecer) entra no fim.
    for (const [id, record] of stampedById) {
      if (!merged.some((row) => isRecord(row) && String(row.id) === id)) merged.push(record);
    }

    return merged;
  };

  const entries: Record<string, unknown> = {};
  const subjects = mergeIntoStore('nexora_subjects', stamped.subjects);
  if (subjects) entries.nexora_subjects = subjects;
  const blocks = mergeIntoStore('nexora_planner_blocks', stamped.blocks);
  if (blocks) entries.nexora_planner_blocks = blocks;

  if (Object.keys(entries).length > 0) setClientStoreEntries(entries);
};

export interface AppliedDelta {
  subjects: number;
  blocks: number;
  sessions: number;
  snapshots: number;
  deleted: number;
}

/** Aplica o delta vindo do servidor no estado local. */
export function applyServerDelta(params: {
  delta: {
    subjects?: Record<string, unknown>[];
    blocks?: Record<string, unknown>[];
    sessions?: Record<string, unknown>[];
    snapshots?: Record<string, unknown>;
    dropped?: { subjects?: string[]; blocks?: string[]; sessions?: string[] };
    /** Versões que venceram um conflito: sobrescrevem o local sem discussão. */
    rejected?: {
      subjects?: Record<string, unknown>[];
      blocks?: Record<string, unknown>[];
      sessions?: Record<string, unknown>[];
    };
  };
  storage?: Storage | null;
}): AppliedDelta {
  const forcedSubjectIds = new Set(
    (params.delta.rejected?.subjects ?? []).map((row) => String(row?.id))
  );
  const forcedBlockIds = new Set(
    (params.delta.rejected?.blocks ?? []).map((row) => String(row?.id))
  );
  const storage = resolveStorage(params.storage);
  const state = readState(storage);
  const store = getClientStoreSnapshot() as Record<string, unknown>;
  const applied: AppliedDelta = { subjects: 0, blocks: 0, sessions: 0, snapshots: 0, deleted: 0 };

  // ---------- Disciplinas ----------
  const droppedSubjectIds = new Set(params.delta.dropped?.subjects ?? []);
  const localSubjects = readArray(store.nexora_subjects);
  const subjectsById = new Map<string, Record<string, unknown>>(
    localSubjects.map((subject) => [String(subject.id), subject])
  );
  let subjectsChanged = false;

  for (const incoming of params.delta.subjects ?? []) {
    const id = String(incoming.id);
    const tombstone = Boolean(incoming.deletedAt) || droppedSubjectIds.has(id);
    const local = subjectsById.get(id);

    if (tombstone) {
      if (local) {
        subjectsById.delete(id);
        subjectsChanged = true;
        applied.deleted += 1;
      }
      delete state.fingerprints.subjects[id];
      continue;
    }

    const localUpdatedAt = typeof local?.updatedAt === 'string' ? Date.parse(local.updatedAt) : NaN;
    const serverUpdatedAt = typeof incoming.clientUpdatedAt === 'string' ? Date.parse(incoming.clientUpdatedAt) : NaN;
    const serverIsNewer =
      forcedSubjectIds.has(id) ||
      !local ||
      Number.isNaN(localUpdatedAt) ||
      (!Number.isNaN(serverUpdatedAt) && serverUpdatedAt >= localUpdatedAt);

    // Só a versão mais nova sobrescreve; a impressão digital segue a do servidor.
    state.fingerprints.subjects[id] = fingerprint(toWireRecord(incoming));

    if (!serverIsNewer) continue;

    subjectsById.set(id, mergeIncoming(local, incoming));
    subjectsChanged = true;
    applied.subjects += 1;
  }

  // ---------- Blocos ----------
  const droppedBlockIds = new Set(params.delta.dropped?.blocks ?? []);
  const localBlocks = readArray(store.nexora_planner_blocks);
  const blocksById = new Map<string, Record<string, unknown>>(
    localBlocks.map((block) => [String(block.id), block])
  );
  let blocksChanged = false;

  for (const incoming of params.delta.blocks ?? []) {
    const id = String(incoming.id);
    const tombstone = Boolean(incoming.deletedAt) || droppedBlockIds.has(id);
    const local = blocksById.get(id);

    if (tombstone) {
      if (local) {
        blocksById.delete(id);
        blocksChanged = true;
        applied.deleted += 1;
      }
      delete state.fingerprints.blocks[id];
      continue;
    }

    const localUpdatedAt = typeof local?.updatedAt === 'string' ? Date.parse(local.updatedAt) : NaN;
    const serverUpdatedAt = typeof incoming.clientUpdatedAt === 'string' ? Date.parse(incoming.clientUpdatedAt) : NaN;
    const serverIsNewer =
      forcedBlockIds.has(id) ||
      !local ||
      Number.isNaN(localUpdatedAt) ||
      (!Number.isNaN(serverUpdatedAt) && serverUpdatedAt >= localUpdatedAt);

    state.fingerprints.blocks[id] = fingerprint(toWireRecord(incoming));

    if (!serverIsNewer) continue;

    blocksById.set(id, mergeIncoming(local, incoming));
    blocksChanged = true;
    applied.blocks += 1;
  }

  if (subjectsChanged) {
    setClientStoreEntries({
      nexora_subjects: Array.from(subjectsById.values()) as unknown as Subject[],
    });
  }

  if (blocksChanged || subjectsChanged) {
    // Reanexa a cópia da disciplina (para a interface) usando as disciplinas locais.
    const subjectMap = new Map<string, Subject>();
    for (const subject of Array.from(subjectsById.values())) {
      subjectMap.set(String(subject.id), subject as unknown as Subject);
    }
    setClientStoreEntries({
      nexora_planner_blocks: Array.from(blocksById.values()).map((block) =>
        hydrateBlock(block, subjectMap)
      ) as unknown as StudyBlock[],
    });
  }

  // ---------- Sessões ----------
  // O app ainda não mantém histórico de sessões no cliente; as linhas puxadas só
  // avançam o cursor (ficam disponíveis para relatórios futuros no servidor).
  applied.sessions = (params.delta.sessions ?? []).length;

  // ---------- Snapshots ----------
  const incomingSnapshots = params.delta.snapshots ?? {};
  const snapshotEntries: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(incomingSnapshots)) {
    if (!SNAPSHOT_STORE_KEYS.includes(key as (typeof SNAPSHOT_STORE_KEYS)[number])) continue;

    const local = store[key];
    const localHash = local === undefined ? null : stableStringify(local);
    const lastKnown = state.fingerprints.snapshots[key];
    // Alteração local ainda não enviada tem prioridade sobre o que veio de lá.
    const hasUnsentLocalChange = localHash !== null && lastKnown !== undefined && lastKnown !== localHash;

    if (value === null) {
      if (hasUnsentLocalChange) continue;
      snapshotEntries[key] = null;
      delete state.fingerprints.snapshots[key];
      applied.snapshots += 1;
      continue;
    }

    if (localHash !== null && stableStringify(value) === localHash) {
      state.fingerprints.snapshots[key] = localHash;
      continue;
    }

    if (hasUnsentLocalChange) continue;

    // Objetos são mesclados (o servidor pode ter recebido parte das chaves de
    // outro dispositivo); listas e escalares são substituídos.
    snapshotEntries[key] = isRecord(local) && isRecord(value) ? { ...local, ...value } : value;
    state.fingerprints.snapshots[key] = stableStringify(snapshotEntries[key]);
    applied.snapshots += 1;
  }

  if (Object.keys(snapshotEntries).length > 0) {
    // `null` significa "o que existia foi apagado no outro dispositivo".
    const filtered = Object.fromEntries(
      Object.entries(snapshotEntries).filter(([, value]) => value !== null)
    );
    if (Object.keys(filtered).length > 0) setClientStoreEntries(filtered);
  }

  writeState(storage, state);
  return applied;
}

/**
 * Cursores só avançam. Se o relógio do servidor (ou de um deploy) estiver atrás
 * do último cursor, aceitar o valor menor faria registros antigos voltarem em
 * toda sincronização — foi assim que o mesmo bloco reentrou duas vezes no teste
 * de dois aparelhos.
 */
const advanceCursor = (current: string | null, next: string | null | undefined) => {
  if (!next) return current;
  if (!current) return next;
  const currentTime = Date.parse(current);
  const nextTime = Date.parse(next);
  if (Number.isNaN(nextTime)) return current;
  if (Number.isNaN(currentTime)) return next;
  return nextTime >= currentTime ? next : current;
};

const shouldPull = (state: SyncState, now: Date, force: boolean) => {
  if (force || !state.lastSyncAt) return true;
  const last = Date.parse(state.lastSyncAt);
  if (Number.isNaN(last)) return true;
  return now.getTime() - last >= PULL_INTERVAL_MS;
};

/**
 * Sincroniza com o servidor: envia o que mudou e aplica o que veio de lá.
 * Não lança: devolve `ok: false` para a interface avisar sem quebrar a sessão
 * de estudo (o app já sofreu com sync silencioso que só escrevia no console).
 */
export async function syncNow(options: SyncEngineOptions & { force?: boolean } = {}): Promise<SyncStats> {
  const storage = resolveStorage(options.storage);
  const doFetch = options.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : null);
  const now = options.now ?? (() => new Date());
  const state = readState(storage);

  const empty: SyncStats = {
    ok: true,
    skipped: true,
    pushed: { subjects: 0, blocks: 0, sessions: 0, snapshots: 0 },
    pulled: { subjects: 0, blocks: 0, sessions: 0 },
    deleted: 0,
    dropped: { subjects: 0, blocks: 0, sessions: 0 },
    bytesUp: 0,
    bytesDown: 0,
    at: now().toISOString(),
  };

  if (!doFetch) return empty;

  const built = buildDelta({ storage, now });
  const hasPush =
    built.counts.subjects + built.counts.blocks + built.counts.snapshots > 0;

  if (!hasPush && !shouldPull(state, now(), options.force ?? false)) return empty;

  const body = JSON.stringify({
    lastSyncedAt: state.cursors,
    push: built.delta,
  });

  try {
    const response = await doFetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    const text = await response.text();
    const result = text ? (JSON.parse(text) as { success?: boolean; data?: Record<string, unknown>; error?: string }) : null;

    if (!response.ok || result?.success === false) {
      if (response.status === 401) {
        // Sessão expirada / modo demo: não é erro de sincronização.
        return { ...empty, ok: false, error: result?.error ?? 'Sessão necessária para sincronizar.' };
      }
      return { ...empty, ok: false, skipped: false, error: result?.error ?? 'Falha ao sincronizar.' };
    }

    const data = (result?.data ?? {}) as {
      subjects?: Record<string, unknown>[];
      blocks?: Record<string, unknown>[];
      sessions?: Record<string, unknown>[];
      snapshots?: Record<string, unknown>;
      dropped?: { subjects?: string[]; blocks?: string[]; sessions?: string[] };
      rejected?: {
        subjects?: Record<string, unknown>[];
        blocks?: Record<string, unknown>[];
        sessions?: Record<string, unknown>[];
      };
      serverTime?: string;
    };

    // Só agora as alterações locais contam como enviadas.
    built.commit();
    commitStamped(built.stamped);

    // Conflitos vão em `rejected`: o aparelho que perdeu precisa se alinhar.
    const rejected = data.rejected ?? {};
    const applied = applyServerDelta({
      delta: {
        subjects: [...(data.subjects ?? []), ...(rejected.subjects ?? [])],
        blocks: [...(data.blocks ?? []), ...(rejected.blocks ?? [])],
        sessions: [...(data.sessions ?? []), ...(rejected.sessions ?? [])],
        snapshots: data.snapshots,
        dropped: data.dropped,
        rejected,
      },
      storage,
    });

    const nextState = readState(storage);
    nextState.cursors = {
      subjects: advanceCursor(nextState.cursors.subjects, data.serverTime),
      blocks: advanceCursor(nextState.cursors.blocks, data.serverTime),
      sessions: advanceCursor(nextState.cursors.sessions, data.serverTime),
    };
    nextState.lastSyncAt = now().toISOString();
    writeState(storage, nextState);

    return {
      ok: true,
      skipped: false,
      pushed: { ...built.counts, sessions: 0 },
      pulled: {
        subjects: applied.subjects,
        blocks: applied.blocks,
        sessions: applied.sessions,
      },
      deleted: applied.deleted,
      dropped: {
        subjects: data.dropped?.subjects?.length ?? 0,
        blocks: data.dropped?.blocks?.length ?? 0,
        sessions: data.dropped?.sessions?.length ?? 0,
      },
      bytesUp: body.length,
      bytesDown: text.length,
      at: nextState.lastSyncAt ?? now().toISOString(),
    };
  } catch (error) {
    console.warn('Falha ao sincronizar progresso:', error);
    return {
      ...empty,
      ok: false,
      skipped: false,
      error: error instanceof Error ? error.message : 'Falha ao sincronizar.',
    };
  }
}

export default syncNow;
