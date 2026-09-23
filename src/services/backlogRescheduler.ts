import type { StudyBlock } from '@/types';
import { generateId, minutesToTime, timeToMinutes, parseBlockDate } from '@/lib/utils';

export interface BacklogRescheduleConfig {
  blocks: StudyBlock[];
  today?: Date;
  dailyLimitByDate?: Record<string, number>;
  allowedDays?: number[];
  recoveryDays?: number[];
  breakMinutes?: number;
  backlogQuotaRatio?: number;
  lookaheadDays?: number;
  maxBacklogSubjectsPerDay?: number;
}

export interface BacklogReplanSuggestion {
  shouldSuggestReplan: boolean;
  shouldSuggestRecoveryMode: boolean;
  suggestedExtraMinutesPerDay: number;
  suggestedReduceNewContent: boolean;
}

export interface BacklogRescheduleResult {
  blocks: StudyBlock[];
  movedCount: number;
  backlogBefore: number;
  backlogAfter: number;
  insertedTodayCount: number;
  pendingBacklogCount: number;
  changedBlockIds: string[];
  suggestion: BacklogReplanSuggestion;
}

export interface BacklogEntry {
  block: StudyBlock;
  dateKey: string;
  daysOverdue: number;
  priorityScore: number;
}

const DEFAULT_DAY_START = '09:00';
const DEFAULT_DAY_END = '22:00';
const DAY_MS = 24 * 60 * 60 * 1000;
const RECOVERY_RESCHEDULE_THRESHOLD = 3;
const RECOVERY_SPLIT_MINUTES = 55;
const RECOVERY_MICRO_BLOCK_MIN = 25;
const RECOVERY_MICRO_BLOCK_TARGET = 35;

const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;

const parseDateKey = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  d.setHours(0, 0, 0, 0);
  return d;
};

const cloneDate = (value?: Date | null) => (value ? new Date(value) : undefined);

const isBacklogStatus = (status: StudyBlock['status']) =>
  status === 'scheduled' || status === 'in-progress' || status === 'skipped' || status === 'rescheduled';

const isReviewType = (block: StudyBlock) => block.type === 'REVISAO';
const isSimuladoType = (block: StudyBlock) =>
  block.type === 'SIMULADO_AREA' || block.type === 'SIMULADO_COMPLETO';

const getBlockDateKey = (block: StudyBlock) => toDateKey(parseBlockDate(block.date));

const getOriginalDateKey = (block: StudyBlock) => {
  const original = block.originalDate ? parseBlockDate(block.originalDate) : parseBlockDate(block.date);
  original.setHours(0, 0, 0, 0);
  return toDateKey(original);
};

function getSubjectWeight(block: StudyBlock) {
  const subject = block.subject;
  if (!subject) return 0;
  const priority = subject.priority ?? 5;
  const difficulty = subject.difficulty ?? 5;
  const examWeight = (subject.pesoNoExame ?? 3) * 2;
  return priority * 4 + difficulty * 3 + examWeight;
}

export function computeBacklogPriorityScore(block: StudyBlock, today: Date) {
  const blockDate = parseBlockDate(block.date);
  blockDate.setHours(0, 0, 0, 0);
  const daysOverdue = Math.max(0, Math.floor((today.getTime() - blockDate.getTime()) / DAY_MS));
  const reschedules = block.rescheduleCount || 0;
  let score = 0;
  if (isReviewType(block)) score += 1000;
  if (isSimuladoType(block)) score += 700;
  if (block.type === 'ANALISE') score += 500;
  if (block.status === 'skipped') score += 120;
  score += daysOverdue * 30;
  score += getSubjectWeight(block);
  score += Math.min(240, block.durationMinutes);
  score += Math.min(220, reschedules * 25);
  return score;
}

export function getBacklogEntries(blocks: StudyBlock[], today = new Date()): BacklogEntry[] {
  const now = new Date(today);
  now.setHours(0, 0, 0, 0);
  return blocks
    .filter((block) => !block.isBreak)
    .filter((block) => isBacklogStatus(block.status))
    .filter((block) => {
      const blockDate = parseBlockDate(block.date);
      blockDate.setHours(0, 0, 0, 0);
      return blockDate < now || (blockDate.getTime() === now.getTime() && block.status === 'skipped');
    })
    .map((block) => {
      const blockDate = parseBlockDate(block.date);
      blockDate.setHours(0, 0, 0, 0);
      const daysOverdue = Math.max(0, Math.floor((now.getTime() - blockDate.getTime()) / DAY_MS));
      return {
        block,
        dateKey: toDateKey(blockDate),
        daysOverdue,
        priorityScore: computeBacklogPriorityScore(block, now),
      };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore);
}

const isLockedForDayStartShift = (status: StudyBlock['status']) =>
  status === 'completed' || status === 'in-progress';

const canSplitForRecovery = (block: StudyBlock) =>
  !block.isBreak &&
  isBacklogStatus(block.status) &&
  (block.rescheduleCount || 0) >= RECOVERY_RESCHEDULE_THRESHOLD &&
  block.durationMinutes >= RECOVERY_SPLIT_MINUTES &&
  !isReviewType(block) &&
  !isSimuladoType(block);

function buildRecoveryDurations(totalMinutes: number) {
  const safeTotal = Math.max(RECOVERY_MICRO_BLOCK_MIN, Math.round(totalMinutes));
  const pieces = Math.max(2, Math.ceil(safeTotal / RECOVERY_MICRO_BLOCK_TARGET));
  const base = Math.floor(safeTotal / pieces);
  const remainder = safeTotal % pieces;
  const durations: number[] = [];

  for (let index = 0; index < pieces; index += 1) {
    durations.push(base + (index < remainder ? 1 : 0));
  }

  for (let index = durations.length - 1; index > 0; index -= 1) {
    if (durations[index] >= RECOVERY_MICRO_BLOCK_MIN) continue;
    const deficit = RECOVERY_MICRO_BLOCK_MIN - durations[index];
    const transferable = Math.max(0, durations[index - 1] - RECOVERY_MICRO_BLOCK_MIN);
    const transfer = Math.min(deficit, transferable);
    durations[index - 1] -= transfer;
    durations[index] += transfer;
  }

  return durations.filter((duration) => duration > 0);
}

function buildRecoveryDescription(description: string | null | undefined, index: number, total: number) {
  const base = (description ?? '').trim();
  const suffix = `Recuperacao ${index}/${total}`;
  return base.length > 0 ? `${base} - ${suffix}` : suffix;
}

function expandRecoveryBacklogBlocks(blocksById: Map<string, StudyBlock>) {
  const changedIds: string[] = [];
  let expandedCount = 0;
  const snapshot = Array.from(blocksById.values());

  for (const block of snapshot) {
    if (!canSplitForRecovery(block)) continue;

    const durations = buildRecoveryDurations(block.durationMinutes);
    if (durations.length <= 1) continue;

    const originalDate = block.originalDate ? parseBlockDate(block.originalDate) : parseBlockDate(block.date);
    originalDate.setHours(0, 0, 0, 0);
    const referenceStart = timeToMinutes(block.startTime);
    const total = durations.length;

    const firstDuration = durations[0];
    blocksById.set(block.id, {
      ...block,
      durationMinutes: firstDuration,
      startTime: minutesToTime(referenceStart),
      endTime: minutesToTime(referenceStart + firstDuration),
      status: 'rescheduled',
      originalDate,
      description: buildRecoveryDescription(block.description, 1, total),
      updatedAt: new Date(),
    });
    changedIds.push(block.id);

    let cursorStart = referenceStart;
    for (let index = 1; index < durations.length; index += 1) {
      const duration = durations[index];
      cursorStart += durations[index - 1];
      const id = generateId();

      blocksById.set(id, {
        ...block,
        id,
        durationMinutes: duration,
        startTime: minutesToTime(cursorStart),
        endTime: minutesToTime(cursorStart + duration),
        status: 'rescheduled',
        originalDate,
        description: buildRecoveryDescription(block.description, index + 1, total),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      changedIds.push(id);
    }

    expandedCount += 1;
  }

  return { changedIds, expandedCount };
}

function normalizeWeekdays(days: number[] | undefined) {
  return Array.from(
    new Set(
      (Array.isArray(days) ? days : []).filter(
        (day) => Number.isInteger(day) && day >= 0 && day <= 6
      )
    )
  ).sort((a, b) => a - b);
}

function buildDayKeys(today: Date, lookaheadDays: number, allowedDays: number[], recoveryDays: number[] = []) {
  const keys: string[] = [];
  const allowedSet = new Set(allowedDays);
  recoveryDays.forEach((day) => allowedSet.add(day));
  const restrictDays = allowedDays.length > 0;

  for (let i = 0; i <= lookaheadDays; i += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    date.setHours(0, 0, 0, 0);
    if (restrictDays && !allowedSet.has(date.getDay())) continue;
    keys.push(toDateKey(date));
  }
  return keys;
}

function inferDayWindow(blocks: StudyBlock[]): { start: string; end: string } {
  const dayBlocks = blocks.filter((b) => !b.isBreak);
  if (dayBlocks.length === 0) return { start: DEFAULT_DAY_START, end: DEFAULT_DAY_END };
  const starts = dayBlocks.map((b) => timeToMinutes(b.startTime));
  const ends = dayBlocks.map((b) => timeToMinutes(b.endTime));
  const earliest = Math.min(...starts, timeToMinutes(DEFAULT_DAY_START));
  const latest = Math.max(...ends, timeToMinutes(DEFAULT_DAY_END));
  return { start: minutesToTime(earliest), end: minutesToTime(Math.min(23 * 60 + 55, latest)) };
}

function sortBlocksChronologically(blocks: StudyBlock[]) {
  return [...blocks].sort((a, b) => {
    const dateDiff = parseBlockDate(a.date).getTime() - parseBlockDate(b.date).getTime();
    if (dateDiff !== 0) return dateDiff;
    return a.startTime.localeCompare(b.startTime);
  });
}

function cloneBlocks(blocks: StudyBlock[]) {
  return blocks.map((block) => ({
    ...block,
    date: parseBlockDate(block.date),
    originalDate: cloneDate(block.originalDate),
    completedAt: cloneDate(block.completedAt),
    createdAt: new Date(block.createdAt),
    updatedAt: new Date(block.updatedAt),
    subject: block.subject
      ? {
          ...block.subject,
          createdAt: new Date(block.subject.createdAt),
          updatedAt: new Date(block.subject.updatedAt),
        }
      : block.subject,
  }));
}

function getDayCapacityMinutes(
  dayKey: string,
  blocks: StudyBlock[],
  dailyLimitByDate: Record<string, number> | undefined
) {
  const explicit = dailyLimitByDate?.[dayKey];
  if (typeof explicit === 'number') return Math.max(0, explicit);
  const planned = blocks
    .filter((block) => !block.isBreak && getBlockDateKey(block) === dayKey && block.status !== 'skipped')
    .reduce((sum, block) => sum + block.durationMinutes, 0);
  return planned;
}

function getDayStudyBlocks(blocks: StudyBlock[], dayKey: string) {
  return blocks
    .filter((block) => !block.isBreak && getBlockDateKey(block) === dayKey)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

function getActivePlannedDayBlocks(blocks: StudyBlock[], dayKey: string) {
  return getDayStudyBlocks(blocks, dayKey).filter(
    (block) => block.status !== 'completed' && block.status !== 'skipped'
  );
}

function getCurrentStudyMinutes(blocks: StudyBlock[], dayKey: string) {
  return getActivePlannedDayBlocks(blocks, dayKey).reduce((sum, block) => sum + block.durationMinutes, 0);
}

function getExistingBacklogMinutes(blocks: StudyBlock[], dayKey: string) {
  return getDayStudyBlocks(blocks, dayKey)
    .filter((block) => block.status === 'rescheduled' && getOriginalDateKey(block) < dayKey)
    .reduce((sum, block) => sum + block.durationMinutes, 0);
}

function getExistingBacklogSubjects(blocks: StudyBlock[], dayKey: string) {
  const set = new Set<string>();
  getDayStudyBlocks(blocks, dayKey)
    .filter((block) => block.status === 'rescheduled' && getOriginalDateKey(block) < dayKey)
    .forEach((block) => {
      if (!block.isBreak) set.add(block.subjectId);
    });
  return set;
}

function updateBlock(blocksById: Map<string, StudyBlock>, nextBlock: StudyBlock) {
  blocksById.set(nextBlock.id, nextBlock);
}

function rebuildArray(blocksById: Map<string, StudyBlock>) {
  return sortBlocksChronologically(Array.from(blocksById.values()));
}

function appendBlockToDay(
  blocksById: Map<string, StudyBlock>,
  dayKey: string,
  blockId: string,
  opts: {
    status?: StudyBlock['status'];
    incrementReschedule?: boolean;
    dayEndLimitMinutes?: number;
    preferDayStart?: boolean;
    breakMinutes?: number;
  }
) {
  const allBlocks = Array.from(blocksById.values());
  const block = blocksById.get(blockId);
  if (!block) return false;
  if (block.isBreak) return false;

  const dayBlocks = allBlocks
    .filter((b) => getBlockDateKey(b) === dayKey)
    .filter((b) => b.id !== block.id);
  const dayStudyBlocks = dayBlocks.filter((item) => !item.isBreak);
  const dayWindow = inferDayWindow(dayStudyBlocks);
  const hardEnd = opts.dayEndLimitMinutes ?? timeToMinutes(dayWindow.end);
  const breakGapMinutes = Math.max(0, Math.round(opts.breakMinutes ?? 0));

  const originalDate = block.originalDate ? parseBlockDate(block.originalDate) : parseBlockDate(block.date);
  originalDate.setHours(0, 0, 0, 0);

  if (opts.preferDayStart) {
    const dayStart = timeToMinutes(dayWindow.start);
    const lockedEnd = dayStudyBlocks
      .filter((item) => isLockedForDayStartShift(item.status))
      .reduce((max, item) => Math.max(max, timeToMinutes(item.endTime)), dayStart);
    const insertionStart = Math.max(dayStart, lockedEnd);
    const insertionEnd = insertionStart + block.durationMinutes;

    if (insertionEnd <= hardEnd) {
      const shiftTargets = dayStudyBlocks
        .filter((item) => !isLockedForDayStartShift(item.status))
        .filter((item) => timeToMinutes(item.startTime) >= insertionStart)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
      const insertionSpan = block.durationMinutes + (shiftTargets.length > 0 ? breakGapMinutes : 0);

      const canShift = shiftTargets.every(
        (item) => timeToMinutes(item.endTime) + insertionSpan <= hardEnd
      );

      if (canShift) {
        shiftTargets.forEach((item) => {
          const shiftedStart = timeToMinutes(item.startTime) + insertionSpan;
          const shiftedEnd = timeToMinutes(item.endTime) + insertionSpan;

          updateBlock(blocksById, {
            ...item,
            date: parseDateKey(dayKey),
            startTime: minutesToTime(shiftedStart),
            endTime: minutesToTime(shiftedEnd),
            updatedAt: new Date(),
          });
        });

        updateBlock(blocksById, {
          ...block,
          date: parseDateKey(dayKey),
          startTime: minutesToTime(insertionStart),
          endTime: minutesToTime(insertionEnd),
          status: opts.status ?? 'rescheduled',
          originalDate,
          rescheduleCount: (block.rescheduleCount || 0) + (opts.incrementReschedule ? 1 : 0),
          updatedAt: new Date(),
        });
        return true;
      }
    }
  }

  const lastEnd = dayStudyBlocks.reduce(
    (max, item) => Math.max(max, timeToMinutes(item.endTime)),
    timeToMinutes(dayWindow.start)
  );
  const start = Math.max(
    dayStudyBlocks.length > 0 ? lastEnd + breakGapMinutes : lastEnd,
    timeToMinutes(dayWindow.start)
  );
  const end = start + block.durationMinutes;
  if (end > hardEnd) return false;

  updateBlock(blocksById, {
    ...block,
    date: parseDateKey(dayKey),
    startTime: minutesToTime(start),
    endTime: minutesToTime(end),
    status: opts.status ?? 'rescheduled',
    originalDate,
    rescheduleCount: (block.rescheduleCount || 0) + (opts.incrementReschedule ? 1 : 0),
    updatedAt: new Date(),
  });
  return true;
}

function chooseNextDayForSimulado(
  dayKeys: string[],
  blocksById: Map<string, StudyBlock>,
  dailyLimitByDate: Record<string, number> | undefined,
  quotaRatio: number,
  todayKey: string
) {
  const candidates = dayKeys
    .filter((dayKey) => dayKey >= todayKey)
    .map((dayKey) => {
      const date = parseDateKey(dayKey);
      const allBlocks = Array.from(blocksById.values());
      const capacity = getDayCapacityMinutes(dayKey, allBlocks, dailyLimitByDate);
      const current = getCurrentStudyMinutes(allBlocks, dayKey);
      const free = Math.max(0, capacity - current);
      const quota = Math.floor(capacity * quotaRatio);
      const backlogUsed = getExistingBacklogMinutes(allBlocks, dayKey);
      const backlogFree = Math.max(0, quota - backlogUsed);
      const weekendBonus = date.getDay() === 0 || date.getDay() === 6 ? 200 : 0;
      return { dayKey, score: free * 2 + backlogFree + weekendBonus, free, backlogFree };
    })
    .filter((item) => item.free > 0 && item.backlogFree > 0)
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.dayKey;
}

export function autoRescheduleBacklog(config: BacklogRescheduleConfig): BacklogRescheduleResult {
  const today = new Date(config.today ?? new Date());
  today.setHours(0, 0, 0, 0);
  const todayKey = toDateKey(today);
  const quotaRatio = Math.min(0.4, Math.max(0.2, config.backlogQuotaRatio ?? 0.35));
  const lookaheadDays = Math.max(3, Math.min(21, config.lookaheadDays ?? 10));
  const maxBacklogSubjectsPerDay = Math.max(1, Math.min(3, config.maxBacklogSubjectsPerDay ?? 2));
  const allowedDays = normalizeWeekdays(config.allowedDays);
  const recoveryDays = normalizeWeekdays(config.recoveryDays);

  const cloned = cloneBlocks(config.blocks);
  const blocksById = new Map(cloned.map((block) => [block.id, block]));
  const backlogBeforeEntries = getBacklogEntries(cloned, today);
  const backlogBefore = backlogBeforeEntries.length;
  if (backlogBefore === 0) {
    return {
      blocks: sortBlocksChronologically(cloned),
      movedCount: 0,
      backlogBefore: 0,
      backlogAfter: 0,
      insertedTodayCount: 0,
      pendingBacklogCount: 0,
      changedBlockIds: [],
      suggestion: {
        shouldSuggestReplan: false,
        shouldSuggestRecoveryMode: false,
        suggestedExtraMinutesPerDay: 0,
        suggestedReduceNewContent: false,
      },
    };
  }

  const dayKeys = buildDayKeys(today, lookaheadDays, allowedDays, recoveryDays);
  const changedIds = new Set<string>();
  const recoveryExpansion = expandRecoveryBacklogBlocks(blocksById);
  recoveryExpansion.changedIds.forEach((id) => changedIds.add(id));
  const queue = getBacklogEntries(Array.from(blocksById.values()), today).map((entry) => entry.block.id);
  const queuedSet = new Set(queue);
  let insertedTodayCount = 0;
  let movedCount = 0;

  const popNextPrioritized = (existingBacklogSubjects: Set<string>) => {
    const allBlocks = Array.from(blocksById.values());
    const queueWithScores = queue
      .map((id) => blocksById.get(id))
      .filter(Boolean)
      .map((block) => block as StudyBlock)
      .filter((block) => queuedSet.has(block.id))
      .filter((block) => !block.isBreak)
      .map((block) => ({
        block,
        score: computeBacklogPriorityScore(block, today),
      }))
      .sort((a, b) => b.score - a.score);

    const preferred = queueWithScores.find(({ block }) => {
      if (existingBacklogSubjects.size >= maxBacklogSubjectsPerDay) {
        return existingBacklogSubjects.has(block.subjectId);
      }
      return true;
    });

    if (!preferred) return null;
    const index = queue.indexOf(preferred.block.id);
    if (index >= 0) queue.splice(index, 1);
    queuedSet.delete(preferred.block.id);
    return preferred.block;
  };

  const requeueDisplacedTail = (
    dayKey: string,
    minutesToFree: number,
    currentDayKey: string
  ) => {
    if (minutesToFree <= 0) return 0;
    let freed = 0;
    const allBlocks = Array.from(blocksById.values());
    const tailCandidates = getActivePlannedDayBlocks(allBlocks, dayKey)
      .filter((block) => !isReviewType(block))
      .filter((block) => !isSimuladoType(block))
      .sort((a, b) => b.startTime.localeCompare(a.startTime));

    for (const block of tailCandidates) {
      if (freed >= minutesToFree) break;
      const targetDayKey = dayKeys.find((candidateKey) => candidateKey > currentDayKey && candidateKey >= dayKey);
      if (!targetDayKey) break;
      const allNow = Array.from(blocksById.values());
      const targetCapacity = getDayCapacityMinutes(targetDayKey, allNow, config.dailyLimitByDate);
      const targetCurrent = getCurrentStudyMinutes(allNow, targetDayKey);
      if (targetCapacity > 0 && targetCurrent + block.durationMinutes > targetCapacity) continue;
      const moved = appendBlockToDay(blocksById, targetDayKey, block.id, {
        status: 'rescheduled',
        incrementReschedule: true,
        breakMinutes: config.breakMinutes,
      });
      if (moved) {
        changedIds.add(block.id);
        movedCount += 1;
        freed += block.durationMinutes;
      }
    }
    return freed;
  };

  const placeBlockOnDay = (block: StudyBlock, dayKey: string) => {
    const allBlocks = Array.from(blocksById.values());
    const capacity = getDayCapacityMinutes(dayKey, allBlocks, config.dailyLimitByDate);
    if (capacity <= 0) return false;

    const plannedBlocks = getActivePlannedDayBlocks(allBlocks, dayKey);
    const plannedCount = plannedBlocks.length;
    const quotaBlocks = plannedCount > 0 ? Math.max(1, Math.floor(plannedCount * quotaRatio)) : 1;
    const quotaMinutes = Math.max(block.durationMinutes, Math.floor(capacity * quotaRatio));
    const backlogUsedMinutes = getExistingBacklogMinutes(allBlocks, dayKey);
    const backlogUsedBlocks = getDayStudyBlocks(allBlocks, dayKey).filter(
      (item) => item.status === 'rescheduled' && getOriginalDateKey(item) < dayKey
    ).length;
    if (backlogUsedBlocks >= quotaBlocks) return false;
    if (backlogUsedMinutes + block.durationMinutes > quotaMinutes) return false;

    const backlogSubjects = getExistingBacklogSubjects(allBlocks, dayKey);
    if (
      !backlogSubjects.has(block.subjectId) &&
      backlogSubjects.size >= maxBacklogSubjectsPerDay
    ) {
      return false;
    }

    const currentStudyMinutes = getCurrentStudyMinutes(allBlocks, dayKey);
    let freeMinutes = Math.max(0, capacity - currentStudyMinutes);
    if (freeMinutes < block.durationMinutes) {
      const freed = requeueDisplacedTail(dayKey, block.durationMinutes - freeMinutes, dayKey);
      freeMinutes += freed;
    }
    if (freeMinutes < block.durationMinutes) return false;

    const dayEndMinute = Math.min(
      timeToMinutes(DEFAULT_DAY_END),
      timeToMinutes(inferDayWindow(allBlocks.filter((b) => getBlockDateKey(b) === dayKey)).end)
    );
    const placed = appendBlockToDay(blocksById, dayKey, block.id, {
      status: 'rescheduled',
      incrementReschedule: true,
      dayEndLimitMinutes: dayEndMinute,
      preferDayStart: true,
      breakMinutes: config.breakMinutes,
    });
    if (!placed) return false;

    const updated = blocksById.get(block.id);
    if (updated) {
      changedIds.add(updated.id);
      movedCount += 1;
      if (dayKey === todayKey) insertedTodayCount += 1;
    }
    return true;
  };

  // 1) Simulados perdidos: escolher dia com maior capacidade (preferência por fim de semana)
  const simuladoIds = queue.filter((id) => {
    const block = blocksById.get(id);
    return Boolean(block && isSimuladoType(block));
  });
  for (const simuladoId of simuladoIds) {
    if (!queuedSet.has(simuladoId)) continue;
    const block = blocksById.get(simuladoId);
    if (!block) continue;
    const bestDay = chooseNextDayForSimulado(
      dayKeys,
      blocksById,
      config.dailyLimitByDate,
      quotaRatio,
      todayKey
    );
    if (!bestDay) continue;
    if (placeBlockOnDay(block, bestDay)) {
      const index = queue.indexOf(simuladoId);
      if (index >= 0) queue.splice(index, 1);
      queuedSet.delete(simuladoId);
    }
  }

  // 2) Demais pendências: reviews primeiro e depois prioridade geral
  for (const dayKey of dayKeys) {
    let keepPlacing = true;
    while (keepPlacing && queue.length > 0) {
      const existingSubjects = getExistingBacklogSubjects(Array.from(blocksById.values()), dayKey);
      const nextBlock = popNextPrioritized(existingSubjects);
      if (!nextBlock) break;
      const placed = placeBlockOnDay(nextBlock, dayKey);
      if (!placed) {
        // tenta outro dia no mesmo ciclo
        let placedElsewhere = false;
        for (const fallbackDay of dayKeys) {
          if (fallbackDay <= dayKey) continue;
          if (placeBlockOnDay(nextBlock, fallbackDay)) {
            placedElsewhere = true;
            break;
          }
        }
        if (!placedElsewhere) {
          queue.push(nextBlock.id);
          queuedSet.add(nextBlock.id);
          keepPlacing = false;
        }
      }
    }
  }

  const resultBlocks = rebuildArray(blocksById);
  const backlogAfterEntries = getBacklogEntries(resultBlocks, today);
  const backlogAfter = backlogAfterEntries.length;
  const pendingBacklogCount = backlogAfterEntries.length;
  const stuckItems = resultBlocks.filter(
    (block) => !block.isBreak && isBacklogStatus(block.status) && (block.rescheduleCount || 0) >= RECOVERY_RESCHEDULE_THRESHOLD
  );
  const suggestion: BacklogReplanSuggestion = {
    shouldSuggestReplan: backlogAfter >= 6,
    shouldSuggestRecoveryMode: stuckItems.length > 0 || recoveryExpansion.expandedCount > 0,
    suggestedExtraMinutesPerDay:
      backlogAfter > 0 && dayKeys.length > 0
        ? Math.ceil(
            backlogAfterEntries.reduce((sum, entry) => sum + entry.block.durationMinutes, 0) /
              Math.max(1, Math.min(dayKeys.length, 5))
          )
        : 0,
    suggestedReduceNewContent:
      backlogAfter >= 4 || stuckItems.length > 0 || recoveryExpansion.expandedCount > 0,
  };

  return {
    blocks: resultBlocks,
    movedCount,
    backlogBefore,
    backlogAfter,
    insertedTodayCount,
    pendingBacklogCount,
    changedBlockIds: Array.from(changedIds),
    suggestion,
  };
}
