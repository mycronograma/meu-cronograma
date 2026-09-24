/**
 * Teste ponta a ponta da sincronização: celular ↔ computador.
 *
 * Usa o motor real do cliente (`src/lib/clientSync.ts`), o núcleo real do
 * endpoint (`src/lib/syncServer.ts`) e um Prisma em memória — ou seja, o mesmo
 * caminho de código que roda em produção, sem banco.
 *
 * Cenário: o estudante começa no computador, continua no celular, volta para o
 * computador, apaga uma disciplina e confere se o outro aparelho acompanha.
 *
 * Rodar com: npm run test:sync-client
 */

import assert from 'node:assert';
import { createMemoryClient, type MemoryPrisma } from './helpers/memoryPrisma';
import { handleSyncPush, type SyncPushBody } from '../src/lib/syncServer';
import {
  buildDelta,
  describeSyncState,
  syncNow,
  SYNC_STATE_KEY,
} from '../src/lib/clientSync';
import {
  clearClientStoreKeys,
  getClientStoreSnapshot,
  setClientStoreEntries,
} from '../src/hooks/useLocalStorage';
import type { StudyBlock, Subject } from '../src/types';

const userId = 'student-1';
const ALL_KEYS = [
  'nexora_subjects',
  'nexora_planner_blocks',
  'nexora_analytics',
  'nexora_study_prefs',
  'nexora_user_settings',
] as const;

// ---------------------------------------------------------------------------
// Infra: "navegador" falso (localStorage + eventos) e servidor em memória
// ---------------------------------------------------------------------------
function createFakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, String(value));
    },
  } as Storage;
}

const fakeWindow = {
  localStorage: createFakeStorage(),
  dispatchEvent: () => true,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
};

(globalThis as unknown as { window: unknown }).window = fakeWindow;

/** Banco em memória compartilhado pelos "dispositivos" do teste. */
const memory: MemoryPrisma = createMemoryClient();

/** Servidor: mesmo núcleo chamado por POST /api/sync em produção. */
const makeFetch = (target: MemoryPrisma, targetUserId = userId): typeof fetch =>
  (async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as SyncPushBody;

    try {
      const result = await handleSyncPush({
        userId: targetUserId,
        body,
        client: target.client as never,
      });

      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ success: true, ...result }),
      } as unknown as Response;
    } catch (error) {
      return {
        ok: false,
        status: 500,
        text: async () => JSON.stringify({ success: false, error: String(error) }),
      } as unknown as Response;
    }
  }) as typeof fetch;

/** Dispositivo = conjunto de chaves do app + estado de sync (localStorage). */
interface Device {
  name: string;
  store: Record<string, unknown>;
  storage: Storage;
}

const devices = new Map<string, Device>();
let activeDevice: Device | null = null;

const getDevice = (name: string): Device => {
  const existing = devices.get(name);
  if (existing) return existing;
  const device: Device = { name, store: {}, storage: createFakeStorage() };
  devices.set(name, device);
  return device;
};

/**
 * Troca o "aparelho ativo". O armazenamento do cliente é um singleton do
 * processo, então guardamos o estado do aparelho atual e carregamos o do alvo.
 */
function activate(deviceName: string): Device {
  if (activeDevice) activeDevice.store = getClientStoreSnapshot() as Record<string, unknown>;

  const target = getDevice(deviceName);
  clearClientStoreKeys(ALL_KEYS);
  setClientStoreEntries(target.store);
  activeDevice = target;
  return target;
}

const syncDevice = (device: Device, options: { force?: boolean; now?: Date } = {}) =>
  syncNow({
    storage: device.storage,
    fetchImpl: makeFetch(memory),
    force: options.force ?? true,
    ...(options.now ? { now: () => options.now as Date } : {}),
  });

// ---------------------------------------------------------------------------
// Dados de apoio
// ---------------------------------------------------------------------------
const subject = (overrides: Partial<Subject> = {}): Subject => ({
  id: 'sub-mat',
  userId,
  name: 'Matemática',
  color: '#00B4FF',
  icon: 'book',
  priority: 9,
  difficulty: 7,
  targetHours: 6,
  completedHours: 0,
  totalHours: 0,
  sessionsCount: 0,
  averageScore: 0,
  isActive: true,
  area: 'Matemática',
  enemWeight: 0.9,
  createdAt: new Date('2026-09-01T10:00:00.000Z'),
  updatedAt: new Date('2026-09-01T10:00:00.000Z'),
  ...overrides,
});

const block = (overrides: Partial<StudyBlock> = {}): StudyBlock => ({
  id: 'block-1',
  userId,
  subjectId: 'sub-mat',
  date: new Date('2026-09-02T00:00:00.000Z'),
  startTime: '09:00',
  endTime: '10:30',
  durationMinutes: 90,
  type: 'AULA',
  status: 'scheduled',
  isBreak: false,
  isAutoGenerated: true,
  createdAt: new Date('2026-09-01T10:00:00.000Z'),
  updatedAt: new Date('2026-09-01T10:00:00.000Z'),
  ...overrides,
});

async function main() {
  // =========================================================================
  console.log('\n1. Computador: primeiro acesso com dados locais');
  // =========================================================================
  const desktop = activate('computador');
  setClientStoreEntries({
    nexora_subjects: [subject()],
    nexora_planner_blocks: [
      { ...block(), subject: subject() },
      { ...block(), id: 'block-2', startTime: '10:30', endTime: '11:30', subject: subject() },
    ],
    nexora_analytics: { daily: { '2026-09-02': { hours: 1.5, sessions: 1 } } },
    nexora_study_prefs: { hoursPerDay: 5 },
  });

  const firstSync = await syncDevice(desktop);
  assert.strictEqual(firstSync.ok, true, 'primeiro sync deve funcionar');
  assert.strictEqual(firstSync.pushed.subjects, 1, 'deve enviar a disciplina');
  assert.strictEqual(firstSync.pushed.blocks, 2, 'deve enviar os dois blocos');
  assert.strictEqual(firstSync.pushed.snapshots, 2, 'deve enviar os snapshots alterados');
  console.log(
    `   enviado: ${(firstSync.bytesUp / 1024).toFixed(1)} KB (disciplinas ${firstSync.pushed.subjects}, blocos ${firstSync.pushed.blocks}, snapshots ${firstSync.pushed.snapshots})`
  );

  const storedBlock = memory.blocks.get('block-1')!;
  assert.strictEqual(storedBlock.subject, undefined, 'cópia da disciplina não deve ir para o banco');
  assert.strictEqual(storedBlock.subjectId, 'sub-mat');
  assert.strictEqual(storedBlock.date instanceof Date, true, 'data deve ser gravada como data');

  // =========================================================================
  console.log('\n2. Nada mudou: o sync não reenvia dado nenhum');
  // =========================================================================
  desktop.store = getClientStoreSnapshot() as Record<string, unknown>;
  const idle = await syncDevice(desktop);
  assert.strictEqual(
    idle.pushed.subjects + idle.pushed.blocks + idle.pushed.snapshots,
    0,
    'sem alterações não há envio'
  );
  assert.ok(idle.bytesUp < 600, `requisição ociosa deve ser minúscula (foi ${idle.bytesUp} bytes)`);
  console.log(`   requisição ociosa: ${idle.bytesUp} bytes`);

  // =========================================================================
  console.log('\n3. Celular: mesmo estudante, aparelho novo (sem dados)');
  // =========================================================================
  const phone = activate('celular');
  const phoneFirst = await syncDevice(phone);
  assert.strictEqual(phoneFirst.pulled.subjects, 1, 'celular deve receber a disciplina');
  assert.strictEqual(phoneFirst.pulled.blocks, 2, 'celular deve receber os blocos');

  let phoneStore = getClientStoreSnapshot() as Record<string, unknown>;
  const phoneBlocks = phoneStore.nexora_planner_blocks as StudyBlock[];
  const phoneSubjects = phoneStore.nexora_subjects as Subject[];
  assert.strictEqual(phoneSubjects[0].name, 'Matemática');
  assert.strictEqual(phoneBlocks.length, 2);
  assert.strictEqual(
    phoneBlocks[0].subject?.name,
    'Matemática',
    'a interface do celular precisa da disciplina reanexada ao bloco'
  );
  assert.deepStrictEqual(phoneStore.nexora_study_prefs, { hoursPerDay: 5 }, 'preferências acompanham');
  assert.ok(
    (phoneStore.nexora_analytics as { daily: Record<string, unknown> }).daily['2026-09-02'],
    'analytics acompanham'
  );
  phone.store = phoneStore;

  // =========================================================================
  console.log('\n4. Celular conclui um bloco; computador vê a conclusão');
  // =========================================================================
  setClientStoreEntries({
    nexora_planner_blocks: [
      {
        ...phoneBlocks[0],
        status: 'completed',
        completedAt: new Date('2026-09-02T11:30:00.000Z'),
      },
      phoneBlocks[1],
    ],
  });

  const phonePush = await syncDevice(phone);
  assert.strictEqual(phonePush.pushed.blocks, 1, 'só o bloco alterado deve subir');
  assert.strictEqual(phonePush.pushed.subjects, 0, 'disciplina inalterada não deve subir');
  assert.ok(phonePush.bytesUp < 1500, 'bloco alterado sozinho é uma requisição pequena');
  console.log(`   celular enviou apenas ${phonePush.bytesUp} bytes`);
  phone.store = getClientStoreSnapshot() as Record<string, unknown>;

  const desktopAgain = activate('computador');
  const desktopPull = await syncDevice(desktopAgain);
  assert.strictEqual(desktopPull.pulled.blocks, 1, 'computador deve receber o bloco alterado');

  const desktopBlocks = (getClientStoreSnapshot() as Record<string, unknown>)
    .nexora_planner_blocks as StudyBlock[];
  const updatedOnDesktop = desktopBlocks.find((item) => item.id === 'block-1')!;
  assert.strictEqual(updatedOnDesktop.status, 'completed', 'conclusão deve chegar no computador');
  desktopAgain.store = getClientStoreSnapshot() as Record<string, unknown>;

  // =========================================================================
  console.log('\n5. Conflito: computador offline tenta reabrir o bloco com marca antiga');
  // =========================================================================
  const reopened = desktopBlocks.map((item) =>
    item.id === 'block-1' ? { ...item, status: 'scheduled' as const } : item
  );
  setClientStoreEntries({ nexora_planner_blocks: reopened });

  const staleSync = await syncDevice(desktopAgain, { now: new Date('2026-09-02T12:00:00.000Z') });
  assert.strictEqual(
    memory.blocks.get('block-1')!.status,
    'completed',
    'servidor mantém a versão mais recente do celular'
  );
  assert.strictEqual(staleSync.ok, true, 'conflito não é erro de sincronização');
  // O computador recebe de volta a versão vencedora e o estado converge.
  const converged = (getClientStoreSnapshot() as Record<string, unknown>)
    .nexora_planner_blocks as StudyBlock[];
  assert.strictEqual(
    converged.find((item) => item.id === 'block-1')!.status,
    'completed',
    'aparelho que perdeu o conflito precisa se alinhar ao servidor'
  );
  desktopAgain.store = getClientStoreSnapshot() as Record<string, unknown>;
  console.log('   conflito resolvido: o aparelho desatualizado adotou a versão mais recente');

  // =========================================================================
  console.log('\n6. Computador apaga uma disciplina: o celular acompanha');
  // =========================================================================
  const beforeDelete = getClientStoreSnapshot() as Record<string, unknown>;
  const survivingBlock = (beforeDelete.nexora_planner_blocks as StudyBlock[]).find(
    (item) => item.id === 'block-2'
  )!;
  setClientStoreEntries({
    nexora_subjects: [],
    // Só sobra um intervalo (não depende de disciplina).
    nexora_planner_blocks: [{ ...survivingBlock, isBreak: true, subjectId: 'intervalo' }],
  });

  const deleteSync = await syncDevice(desktopAgain);
  assert.strictEqual(deleteSync.pushed.subjects, 1, 'exclusão da disciplina vira tombstone');
  assert.strictEqual(deleteSync.pushed.blocks, 2, 'bloco removido vira tombstone + intervalo alterado');
  desktopAgain.store = getClientStoreSnapshot() as Record<string, unknown>;

  const phoneAfterDelete = activate('celular');
  const phoneDeleteSync = await syncDevice(phoneAfterDelete);
  const phoneFinal = getClientStoreSnapshot() as Record<string, unknown>;
  assert.strictEqual((phoneFinal.nexora_subjects as Subject[]).length, 0, 'disciplina apagada no celular');
  assert.strictEqual(
    (phoneFinal.nexora_planner_blocks as StudyBlock[]).length,
    1,
    'o bloco apagado sumiu; o intervalo continua'
  );
  assert.ok(phoneDeleteSync.deleted >= 1, 'exclusões devem ser contabilizadas');
  console.log(`   celular aplicou ${phoneDeleteSync.deleted} exclusão(ões)`);
  phoneAfterDelete.store = phoneFinal;

  // =========================================================================
  console.log('\n7. Migração do formato antigo (blob JSON) → linhas');
  // =========================================================================
  clearClientStoreKeys(ALL_KEYS);
  activeDevice = null;

  const legacy = createMemoryClient();
  legacy.snapshots.set(userId, {
    nexora_subjects: [subject({ id: 'sub-fis', name: 'Física' })],
    nexora_planner_blocks: [block({ id: 'block-legado', subjectId: 'sub-fis' })],
    nexora_analytics: { daily: {} },
  });

  const legacyDevice = getDevice('tablet');
  const legacyPull = await syncNow({
    storage: legacyDevice.storage,
    fetchImpl: makeFetch(legacy),
    force: true,
  });
  assert.strictEqual(legacyPull.pulled.subjects, 1, 'conta antiga entrega a disciplina migrada');
  assert.strictEqual(legacyPull.pulled.blocks, 1, 'conta antiga entrega os blocos migrados');
  console.log('   blob antigo virou 1 disciplina + 1 bloco sem o usuário fazer nada');
  clearClientStoreKeys(ALL_KEYS);

  // =========================================================================
  console.log('\n8. Volume: 1 ano de estudo');
  // =========================================================================
  const yearMemory = createMemoryClient();
  const yearStorage = createFakeStorage();
  const yearBlocks = Array.from({ length: 2400 }, (_, index) =>
    block({
      id: `year-block-${index}`,
      date: new Date(Date.UTC(2026, 0, 1 + (index % 365))),
      updatedAt: new Date(Date.UTC(2026, 0, 1 + (index % 365), 12, 0, 0)),
    })
  );
  const yearPayload = {
    nexora_subjects: [subject()],
    nexora_planner_blocks: yearBlocks.map((item) => ({ ...item, subject: subject() })),
  };

  const yearFetch = makeFetch(yearMemory, 'student-year');
  setClientStoreEntries(yearPayload);
  const yearPush = await syncNow({ storage: yearStorage, fetchImpl: yearFetch, force: true });

  const blobBytes = JSON.stringify({ data: yearPayload }).length;
  console.log(
    `   1º envio: ${(yearPush.bytesUp / 1024).toFixed(0)} KB por delta (formato antigo: ${(blobBytes / 1024).toFixed(0)} KB de blob)`
  );
  assert.ok(
    yearPush.bytesUp < blobBytes * 0.7,
    'o delta precisa ser bem menor que o blob (a cópia da disciplina sai do payload)'
  );

  const yearIdle = await syncNow({ storage: yearStorage, fetchImpl: yearFetch, force: true });
  assert.strictEqual(
    yearIdle.pushed.subjects + yearIdle.pushed.blocks + yearIdle.pushed.snapshots,
    0,
    'com 1 ano sincronizado, nada é reenviado'
  );
  assert.ok(yearIdle.bytesUp < 600, `após 1 ano, requisição ociosa de ${yearIdle.bytesUp} bytes`);

  const yearDelta = buildDelta({ storage: yearStorage });
  assert.strictEqual(
    yearDelta.counts.blocks + yearDelta.counts.subjects + yearDelta.counts.snapshots,
    0,
    'sem alterações o delta é vazio'
  );
  const state = describeSyncState(yearStorage);
  assert.ok(state.lastSyncAt, 'estado de sync guarda o horário da última sincronização');
  assert.ok(yearStorage.getItem(SYNC_STATE_KEY), 'estado de sync fica separado das chaves do app');
  clearClientStoreKeys(ALL_KEYS);

  console.log('\nclient sync tests passed');
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
