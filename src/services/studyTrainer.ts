import {
  buildCompletedHoursByDate,
  buildCompletedSessionsByDate,
  computeGamificationSnapshot,
  getStudyHoursForDate,
  getStudySessionsForDate,
} from '@/lib/progressSnapshot';
import {
  getWeekDates,
  getWeekStart,
  parseBlockDate,
  toLocalDateKey,
} from '@/lib/utils';
import { getStudyBlockDisplayTitle } from '@/lib/studyBlockLabels';
import type {
  AnalyticsStore,
  StudyBlock,
  StudyPreferences,
  Subject,
  UserSettings,
  WeekdayKey,
} from '@/types';

export const TRAINER_XP = {
  TASK_COMPLETE: 10,
  PER_10_MINUTES: 5,
  DAILY_GOAL: 40,
  WEEKLY_GOAL: 120,
} as const;

export type TrainerXpEventSource =
  | 'task'
  | 'daily-goal'
  | 'weekly-goal'
  | 'achievement';

export interface TrainerXpEvent {
  id: string;
  eventKey: string;
  source: TrainerXpEventSource;
  sourceId?: string;
  blockId?: string;
  amount: number;
  reason: string;
  awardedAt: string;
  dateKey: string;
  metadata?: Record<string, unknown>;
}

export type TrainerAchievementRarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface TrainerAchievementDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  xpReward: number;
  rarity: TrainerAchievementRarity;
  condition: {
    type: 'first-study' | 'streak' | 'tasks' | 'hours' | 'perfect-week' | 'subject-mastered';
    value: number;
  };
}

export interface TrainerAchievementUnlock extends TrainerAchievementDefinition {
  achievementId: string;
  unlockedAt: string;
}

export interface StudyMission {
  block: StudyBlock;
  title: string;
  subjectName: string;
  durationMinutes: number;
  xp: number;
  earnedXp: number;
  status: StudyBlock['status'];
  isNext: boolean;
}

export interface TrainerSnapshot {
  level: number;
  levelTitle: string;
  totalXp: number;
  xpInCurrentLevel: number;
  xpToNextLevel: number;
  levelProgress: number;
  todayXp: number;
  possibleXpToday: number;
  streak: number;
  longestStreak: number;
  dailyGoalMinutes: number;
  todayCompletedMinutes: number;
  todayRemainingMinutes: number;
  todayProgressPercent: number;
  dailyGoalCompleted: boolean;
  weeklyGoalCompleted: boolean;
  missions: StudyMission[];
  nextMission: StudyMission | null;
  planDate: Date;
  planSource: 'today' | 'next' | 'latest' | 'none';
  weekly: {
    minutesStudied: number;
    targetMinutes: number;
    daysCompleted: number;
    activeDays: number;
    goalsMet: number;
  };
  achievements: {
    unlocked: TrainerAchievementUnlock[];
    next: TrainerAchievementDefinition[];
  };
}

export interface TrainerCompletionReward {
  xpEarned: number;
  events: TrainerXpEvent[];
  newAchievements: TrainerAchievementUnlock[];
  levelBefore: number;
  levelAfter: number;
  didLevelUp: boolean;
  streak: number;
  longestStreak: number;
  dailyGoalCompleted: boolean;
  weeklyGoalCompleted: boolean;
  nextMission: StudyMission | null;
  message: string;
}

const weekdayKeys: WeekdayKey[] = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];

export const TRAINER_ACHIEVEMENTS: TrainerAchievementDefinition[] = [
  {
    id: 'first-study',
    name: 'Primeiro estudo concluido',
    description: 'Conclua sua primeira missao de estudo.',
    icon: 'check-circle',
    xpReward: 25,
    rarity: 'common',
    condition: { type: 'first-study', value: 1 },
  },
  {
    id: 'streak-3',
    name: 'Ritmo inicial',
    description: 'Estude por 3 dias seguidos.',
    icon: 'flame',
    xpReward: 30,
    rarity: 'common',
    condition: { type: 'streak', value: 3 },
  },
  {
    id: 'streak-7',
    name: 'Semana consistente',
    description: 'Mantenha 7 dias seguidos de estudo.',
    icon: 'flame',
    xpReward: 70,
    rarity: 'rare',
    condition: { type: 'streak', value: 7 },
  },
  {
    id: 'streak-30',
    name: 'Mes imparavel',
    description: 'Mantenha 30 dias seguidos de estudo.',
    icon: 'trophy',
    xpReward: 250,
    rarity: 'epic',
    condition: { type: 'streak', value: 30 },
  },
  {
    id: 'tasks-10',
    name: '10 tarefas concluidas',
    description: 'Finalize 10 missoes de estudo.',
    icon: 'list-checks',
    xpReward: 60,
    rarity: 'common',
    condition: { type: 'tasks', value: 10 },
  },
  {
    id: 'tasks-100',
    name: '100 tarefas concluidas',
    description: 'Finalize 100 missoes de estudo.',
    icon: 'badge-check',
    xpReward: 300,
    rarity: 'epic',
    condition: { type: 'tasks', value: 100 },
  },
  {
    id: 'hours-10',
    name: '10 horas estudadas',
    description: 'Acumule 10 horas reais de estudo.',
    icon: 'clock',
    xpReward: 80,
    rarity: 'common',
    condition: { type: 'hours', value: 10 },
  },
  {
    id: 'hours-50',
    name: '50 horas estudadas',
    description: 'Acumule 50 horas reais de estudo.',
    icon: 'clock',
    xpReward: 250,
    rarity: 'rare',
    condition: { type: 'hours', value: 50 },
  },
  {
    id: 'perfect-week',
    name: 'Primeira semana perfeita',
    description: 'Bata todas as metas dos dias ativos da semana.',
    icon: 'calendar-check',
    xpReward: 120,
    rarity: 'rare',
    condition: { type: 'perfect-week', value: 1 },
  },
  {
    id: 'subject-mastered',
    name: 'Primeira matéria dominada',
    description: 'Alcance boa consistencia em uma disciplina.',
    icon: 'graduation-cap',
    xpReward: 100,
    rarity: 'rare',
    condition: { type: 'subject-mastered', value: 1 },
  },
];

export function getStudyLevelTitle(level: number): string {
  if (level >= 50) return 'Maquina de Aprovacao';
  if (level >= 30) return 'Estrategista';
  if (level >= 20) return 'Foco Extremo';
  if (level >= 10) return 'Disciplinado';
  if (level >= 5) return 'Consistente';
  if (level >= 2) return 'Aprendiz';
  return 'Iniciante';
}

export function trainerXpForLevel(level: number): number {
  const base = 250;
  const multiplier = 1.35;
  return Math.floor(base * Math.pow(multiplier, Math.max(0, level - 1)));
}

export function trainerLevelFromXp(totalXp: number): { level: number; xpInLevel: number; xpForNext: number } {
  let level = 1;
  let remainingXp = Math.max(0, Math.round(totalXp));

  while (remainingXp >= trainerXpForLevel(level)) {
    remainingXp -= trainerXpForLevel(level);
    level += 1;
  }

  return {
    level,
    xpInLevel: remainingXp,
    xpForNext: trainerXpForLevel(level),
  };
}

export function estimateMissionXp(minutes: number): number {
  const safeMinutes = Math.max(0, Math.round(minutes));
  return TRAINER_XP.TASK_COMPLETE + Math.floor(safeMinutes / 10) * TRAINER_XP.PER_10_MINUTES;
}

export function toBrazilDateKey(value: Date | string | number = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const getPart = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const year = getPart('year');
  const month = getPart('month');
  const day = getPart('day');

  return year && month && day ? `${year}-${month}-${day}` : toLocalDateKey(date);
}

const isStudyBlock = (block: StudyBlock) => !block.isBreak;

const hasManualSequence = (block: StudyBlock) =>
  typeof block.sequenceIndex === 'number' && Number.isFinite(block.sequenceIndex);

const compareBlocksWithinDay = (a: StudyBlock, b: StudyBlock) => {
  const aHasSequence = hasManualSequence(a);
  const bHasSequence = hasManualSequence(b);

  if (aHasSequence && bHasSequence) {
    const sequenceDiff = (a.sequenceIndex as number) - (b.sequenceIndex as number);
    if (sequenceDiff !== 0) return sequenceDiff;
  } else if (aHasSequence !== bHasSequence) {
    return aHasSequence ? -1 : 1;
  }

  return a.startTime.localeCompare(b.startTime);
};

const comparePlannerBlocks = (a: StudyBlock, b: StudyBlock) => {
  const dateDiff = parseBlockDate(a.date).getTime() - parseBlockDate(b.date).getTime();
  if (dateDiff !== 0) return dateDiff;
  return compareBlocksWithinDay(a, b);
};

const dedupeXpEvents = (events: TrainerXpEvent[]) => {
  const map = new Map<string, TrainerXpEvent>();
  events.forEach((event) => {
    const amount = normalizeXpEventAmount(event);
    if (!event?.eventKey || !Number.isFinite(amount) || amount <= 0) return;
    if (!map.has(event.eventKey)) {
      map.set(event.eventKey, { ...event, amount });
    }
  });
  return Array.from(map.values()).sort((a, b) => a.awardedAt.localeCompare(b.awardedAt));
};

const dedupeAchievements = (achievements: TrainerAchievementUnlock[]) => {
  const map = new Map<string, TrainerAchievementUnlock>();
  achievements.forEach((achievement) => {
    const key = achievement.achievementId || achievement.id;
    if (!key || map.has(key)) return;
    map.set(key, achievement);
  });
  return Array.from(map.values()).sort((a, b) => a.unlockedAt.localeCompare(b.unlockedAt));
};

const eventIdFromKey = (eventKey: string, now: Date) => {
  const safeKey = eventKey.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 90);
  return `xp_${safeKey}_${now.getTime()}`;
};

const normalizeXpEventAmount = (event: TrainerXpEvent) => {
  if (!event) return 0;

  if (event.source === 'task') {
    const minutesSpent = Number(event.metadata?.minutesSpent);
    if (Number.isFinite(minutesSpent) && minutesSpent > 0) {
      return estimateMissionXp(minutesSpent);
    }
    return Math.min(Math.max(0, Math.round(event.amount || 0)), 40);
  }

  if (event.source === 'daily-goal') return TRAINER_XP.DAILY_GOAL;
  if (event.source === 'weekly-goal') return TRAINER_XP.WEEKLY_GOAL;

  if (event.source === 'achievement') {
    const achievement = TRAINER_ACHIEVEMENTS.find((item) => item.id === event.sourceId);
    return achievement?.xpReward ?? Math.min(Math.max(0, Math.round(event.amount || 0)), 120);
  }

  return Math.max(0, Math.round(event.amount || 0));
};

const makeXpEvent = (params: {
  eventKey: string;
  source: TrainerXpEventSource;
  amount: number;
  reason: string;
  dateKey: string;
  now: Date;
  sourceId?: string;
  blockId?: string;
  metadata?: Record<string, unknown>;
}): TrainerXpEvent => ({
  id: eventIdFromKey(params.eventKey, params.now),
  eventKey: params.eventKey,
  source: params.source,
  sourceId: params.sourceId,
  blockId: params.blockId,
  amount: Math.max(0, Math.round(params.amount)),
  reason: params.reason,
  awardedAt: params.now.toISOString(),
  dateKey: params.dateKey,
  metadata: params.metadata,
});

/**
 * Dias sem estudo planejado (descanso). Usa `excludeDays`/`dailyHoursByWeekday` das
 * preferências para que a sequência de dias não seja quebrada por um descanso.
 */
const resolveRestDays = (userSettings: UserSettings, studyPrefs: StudyPreferences): number[] => {
  const restDays = new Set<number>();

  (userSettings.excludeDays ?? []).forEach((day) => {
    if (day >= 0 && day <= 6) restDays.add(day);
  });

  const hoursByWeekday = userSettings.dailyHoursByWeekday;
  if (hoursByWeekday) {
    weekdayKeys.forEach((key, index) => {
      const hours = hoursByWeekday[key];
      if (typeof hours === 'number' && hours <= 0) restDays.add(index);
    });
  } else if ((studyPrefs.daysOfWeek ?? []).length > 0) {
    const activeDays = new Set(studyPrefs.daysOfWeek);
    for (let day = 0; day <= 6; day += 1) {
      if (!activeDays.has(day)) restDays.add(day);
    }
  }

  return Array.from(restDays).sort((a, b) => a - b);
};

const getTargetMinutesForDate = (params: {
  date: Date;
  plannerBlocks: StudyBlock[];
  studyPrefs: StudyPreferences;
  userSettings: UserSettings;
}) => {
  const { date, plannerBlocks, studyPrefs, userSettings } = params;
  const dateKey = toLocalDateKey(date);
  const plannedMinutes = plannerBlocks.reduce((sum, block) => {
    if (!isStudyBlock(block)) return sum;
    if (toLocalDateKey(parseBlockDate(block.date)) !== dateKey) return sum;
    if (block.status === 'skipped') return sum;
    return sum + Math.max(0, block.durationMinutes);
  }, 0);

  if (plannedMinutes > 0) return plannedMinutes;

  const weekdayKey = weekdayKeys[date.getDay()];
  const settingsTarget = userSettings.dailyHoursByWeekday?.[weekdayKey];
  if (typeof settingsTarget === 'number' && settingsTarget > 0) {
    return Math.round(settingsTarget * 60);
  }

  const prefsTarget = studyPrefs.dailyHoursByWeekday?.[weekdayKey];
  if (typeof prefsTarget === 'number' && prefsTarget > 0) {
    return Math.round(prefsTarget * 60);
  }

  const activeDays = studyPrefs.daysOfWeek ?? [];
  if (activeDays.length > 0 && !activeDays.includes(date.getDay())) {
    return 0;
  }

  return Math.round(Math.max(0, studyPrefs.hoursPerDay || userSettings.dailyGoalHours || 0) * 60);
};

const getPlanForReferenceDate = (plannerBlocks: StudyBlock[], now: Date) => {
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const sorted = [...plannerBlocks].sort(comparePlannerBlocks);
  const todayKey = toLocalDateKey(todayStart);
  const todayBlocks = sorted.filter((block) => toLocalDateKey(parseBlockDate(block.date)) === todayKey);

  if (todayBlocks.length > 0) {
    return { blocks: todayBlocks, date: todayStart, source: 'today' as const };
  }

  const nextBlock = sorted.find((block) => parseBlockDate(block.date) >= todayStart);
  if (nextBlock) {
    const nextDate = parseBlockDate(nextBlock.date);
    const nextKey = toLocalDateKey(nextDate);
    return {
      blocks: sorted.filter((block) => toLocalDateKey(parseBlockDate(block.date)) === nextKey),
      date: nextDate,
      source: 'next' as const,
    };
  }

  const lastBlock = sorted[sorted.length - 1];
  if (lastBlock) {
    const latestDate = parseBlockDate(lastBlock.date);
    const latestKey = toLocalDateKey(latestDate);
    return {
      blocks: sorted.filter((block) => toLocalDateKey(parseBlockDate(block.date)) === latestKey),
      date: latestDate,
      source: 'latest' as const,
    };
  }

  return { blocks: [] as StudyBlock[], date: todayStart, source: 'none' as const };
};

const buildTaskXpByBlockId = (events: TrainerXpEvent[]) => {
  const map = new Map<string, number>();

  events
    .filter((event) => event.source === 'task')
    .forEach((event) => {
      const blockId = event.blockId || event.sourceId;
      if (!blockId) return;
      map.set(blockId, (map.get(blockId) ?? 0) + event.amount);
    });

  return map;
};

const buildMissions = (blocks: StudyBlock[], xpEvents: TrainerXpEvent[] = []): StudyMission[] => {
  const studyBlocks = blocks.filter(isStudyBlock).sort(compareBlocksWithinDay);
  const earnedByBlockId = buildTaskXpByBlockId(xpEvents);
  const nextBlock =
    studyBlocks.find((block) => block.status === 'in-progress') ||
    studyBlocks.find((block) => block.status === 'scheduled' || block.status === 'rescheduled') ||
    studyBlocks.find((block) => block.status !== 'completed' && block.status !== 'skipped') ||
    null;

  return studyBlocks.map((block) => {
    const earnedXp = earnedByBlockId.get(block.id) ?? 0;
    const availableXp = estimateMissionXp(block.durationMinutes);
    return {
      block,
      title: getStudyBlockDisplayTitle(block),
      subjectName: block.subject?.name || getStudyBlockDisplayTitle(block),
      durationMinutes: block.durationMinutes,
      xp: block.status === 'completed' ? earnedXp : availableXp,
      earnedXp,
      status: block.status,
      isNext: nextBlock?.id === block.id,
    };
  });
};

const getAchievementStats = (params: {
  plannerBlocks: StudyBlock[];
  analytics: AnalyticsStore;
  subjects: Subject[];
  streak: number;
  weekly: TrainerSnapshot['weekly'];
}) => {
  const { plannerBlocks, analytics, subjects, streak, weekly } = params;
  const completedSessionsByDate = buildCompletedSessionsByDate(plannerBlocks);
  const dailyAnalytics = analytics.daily || {};

  const blockMinutes = plannerBlocks.reduce((sum, block) => {
    if (!isStudyBlock(block) || block.status !== 'completed') return sum;
    return sum + Math.max(0, block.durationMinutes);
  }, 0);
  const analyticsMinutes = Object.values(dailyAnalytics).reduce((sum, day) => {
    const hours = day?.hours ?? 0;
    return Number.isFinite(hours) && hours > 0 ? sum + hours * 60 : sum;
  }, 0);
  const totalHours = Math.max(blockMinutes, analyticsMinutes) / 60;
  const completedTasks = plannerBlocks.filter((block) => isStudyBlock(block) && block.status === 'completed').length;
  const totalSessions = Math.max(
    completedTasks,
    Object.keys({ ...dailyAnalytics, ...completedSessionsByDate }).reduce(
      (sum, dateKey) => sum + getStudySessionsForDate(dateKey, dailyAnalytics, completedSessionsByDate),
      0
    )
  );

  const hasDominatedSubject = subjects.some((subject) => {
    const subjectHours = Math.max(subject.totalHours ?? 0, subject.completedHours ?? 0);
    const hasEnoughVolume = subjectHours >= Math.max(2, Math.min(subject.targetHours || 2, 10));
    const hasGoodScore = (subject.averageScore ?? 0) >= 75 || (subject.sessionsCount ?? 0) >= 5;
    return hasEnoughVolume && hasGoodScore;
  });

  const perfectWeek =
    weekly.activeDays >= 3 && weekly.goalsMet >= weekly.activeDays && weekly.targetMinutes > 0;

  return {
    completedTasks: Math.max(completedTasks, totalSessions),
    totalHours,
    streak,
    perfectWeek,
    hasDominatedSubject,
  };
};

const shouldUnlockAchievement = (
  achievement: TrainerAchievementDefinition,
  stats: ReturnType<typeof getAchievementStats>
) => {
  switch (achievement.condition.type) {
    case 'first-study':
      return stats.completedTasks >= achievement.condition.value;
    case 'streak':
      return stats.streak >= achievement.condition.value;
    case 'tasks':
      return stats.completedTasks >= achievement.condition.value;
    case 'hours':
      return stats.totalHours >= achievement.condition.value;
    case 'perfect-week':
      return stats.perfectWeek;
    case 'subject-mastered':
      return stats.hasDominatedSubject;
    default:
      return false;
  }
};

export function buildTrainerSnapshot(params: {
  plannerBlocks: StudyBlock[];
  analytics: AnalyticsStore;
  subjects: Subject[];
  studyPrefs: StudyPreferences;
  userSettings: UserSettings;
  xpEvents?: TrainerXpEvent[];
  unlockedAchievements?: TrainerAchievementUnlock[];
  now?: Date;
}): TrainerSnapshot {
  const {
    plannerBlocks,
    analytics,
    subjects,
    studyPrefs,
    userSettings,
    xpEvents = [],
    unlockedAchievements = [],
    now = new Date(),
  } = params;

  const safeEvents = dedupeXpEvents(xpEvents);
  const safeAchievements = dedupeAchievements(unlockedAchievements);
  const legacyGamification = computeGamificationSnapshot({
    plannerBlocks,
    analytics,
    now,
    // Dias de descanso não quebram a sequência (ex.: domingo configurado nas preferências).
    restDays: resolveRestDays(userSettings, studyPrefs),
  });
  const eventsTotalXp = safeEvents.reduce((sum, event) => sum + event.amount, 0);
  const totalXp = eventsTotalXp > 0 ? eventsTotalXp : legacyGamification.totalXp;
  const levelData = trainerLevelFromXp(totalXp);
  const xpToNextLevel = Math.max(1, Math.round(levelData.xpForNext));

  const plan = getPlanForReferenceDate(plannerBlocks, now);
  const missions = buildMissions(plan.blocks, safeEvents);
  const nextMission = missions.find((mission) => mission.isNext) ?? null;
  const completedMinutes = plan.blocks.reduce((sum, block) => {
    if (!isStudyBlock(block) || block.status !== 'completed') return sum;
    return sum + Math.max(0, block.durationMinutes);
  }, 0);
  const dailyGoalMinutes = getTargetMinutesForDate({
    date: plan.date,
    plannerBlocks,
    studyPrefs,
    userSettings,
  });
  const todayRemainingMinutes = Math.max(0, dailyGoalMinutes - completedMinutes);
  const todayProgressPercent =
    dailyGoalMinutes > 0 ? Math.min(100, Math.round((completedMinutes / dailyGoalMinutes) * 100)) : 0;
  const todayKey = toBrazilDateKey(now);
  const todayXp = safeEvents
    .filter((event) => event.dateKey === todayKey)
    .reduce((sum, event) => sum + event.amount, 0);
  const pendingMissionXp = missions.reduce(
    (sum, mission) => sum + (mission.status === 'completed' ? 0 : mission.xp),
    0
  );
  const possibleXpToday =
    pendingMissionXp +
    (completedMinutes >= dailyGoalMinutes || dailyGoalMinutes <= 0
      ? 0
      : TRAINER_XP.DAILY_GOAL);

  const completedHoursByDate = buildCompletedHoursByDate(plannerBlocks);
  const completedSessionsByDate = buildCompletedSessionsByDate(plannerBlocks);
  const dailyAnalytics = analytics.daily || {};
  const weekStart = getWeekStart(now);
  const weekDates = getWeekDates(weekStart);

  const weekly = weekDates.reduce(
    (acc, date) => {
      const targetMinutes = getTargetMinutesForDate({
        date,
        plannerBlocks,
        studyPrefs,
        userSettings,
      });
      const dateKey = toLocalDateKey(date);
      const studiedMinutes = Math.round(
        getStudyHoursForDate(dateKey, dailyAnalytics, completedHoursByDate) * 60
      );
      const sessions = getStudySessionsForDate(dateKey, dailyAnalytics, completedSessionsByDate);
      const isActiveDay = targetMinutes > 0 || sessions > 0 || studiedMinutes > 0;

      acc.minutesStudied += studiedMinutes;
      acc.targetMinutes += targetMinutes;
      if (isActiveDay) acc.activeDays += 1;
      if (targetMinutes > 0 && studiedMinutes >= targetMinutes) {
        acc.daysCompleted += 1;
        acc.goalsMet += 1;
      }
      return acc;
    },
    {
      minutesStudied: 0,
      targetMinutes: 0,
      daysCompleted: 0,
      activeDays: 0,
      goalsMet: 0,
    }
  );

  const stats = getAchievementStats({
    plannerBlocks,
    analytics,
    subjects,
    streak: legacyGamification.streak,
    weekly,
  });
  const unlockedIds = new Set(safeAchievements.map((achievement) => achievement.achievementId));
  const nextAchievements = TRAINER_ACHIEVEMENTS.filter((achievement) => !unlockedIds.has(achievement.id))
    .filter((achievement) => !shouldUnlockAchievement(achievement, stats))
    .slice(0, 3);

  return {
    level: Math.max(1, levelData.level),
    levelTitle: getStudyLevelTitle(levelData.level),
    totalXp,
    xpInCurrentLevel: Math.max(0, Math.round(levelData.xpInLevel)),
    xpToNextLevel,
    levelProgress: Math.min(100, Math.round((levelData.xpInLevel / xpToNextLevel) * 100)),
    todayXp,
    possibleXpToday,
    streak: legacyGamification.streak,
    longestStreak: legacyGamification.longestStreak,
    dailyGoalMinutes,
    todayCompletedMinutes: completedMinutes,
    todayRemainingMinutes,
    todayProgressPercent,
    dailyGoalCompleted: dailyGoalMinutes > 0 && completedMinutes >= dailyGoalMinutes,
    weeklyGoalCompleted: weekly.targetMinutes > 0 && weekly.minutesStudied >= weekly.targetMinutes,
    missions,
    nextMission,
    planDate: plan.date,
    planSource: plan.source,
    weekly,
    achievements: {
      unlocked: safeAchievements,
      next: nextAchievements,
    },
  };
}

export function calculateTrainerCompletionReward(params: {
  block: StudyBlock;
  minutesSpent: number;
  plannerBlocks: StudyBlock[];
  analytics: AnalyticsStore;
  subjects: Subject[];
  studyPrefs: StudyPreferences;
  userSettings: UserSettings;
  xpEvents: TrainerXpEvent[];
  unlockedAchievements: TrainerAchievementUnlock[];
  now?: Date;
}): TrainerCompletionReward {
  const {
    block,
    minutesSpent,
    plannerBlocks,
    analytics,
    subjects,
    studyPrefs,
    userSettings,
    xpEvents,
    unlockedAchievements,
    now = new Date(),
  } = params;

  const safeEvents = dedupeXpEvents(xpEvents);
  const safeAchievements = dedupeAchievements(unlockedAchievements);
  const existingEventKeys = new Set(safeEvents.map((event) => event.eventKey));
  const existingAchievementIds = new Set(safeAchievements.map((achievement) => achievement.achievementId));
  const snapshotBefore = buildTrainerSnapshot({
    plannerBlocks,
    analytics,
    subjects,
    studyPrefs,
    userSettings,
    xpEvents: safeEvents,
    unlockedAchievements: safeAchievements,
    now,
  });

  if (block.isBreak || block.status === 'completed') {
    return {
      xpEarned: 0,
      events: [],
      newAchievements: [],
      levelBefore: snapshotBefore.level,
      levelAfter: snapshotBefore.level,
      didLevelUp: false,
      streak: snapshotBefore.streak,
      longestStreak: snapshotBefore.longestStreak,
      dailyGoalCompleted: snapshotBefore.dailyGoalCompleted,
      weeklyGoalCompleted: snapshotBefore.weeklyGoalCompleted,
      nextMission: snapshotBefore.nextMission,
      message: block.isBreak ? 'Intervalo registrado.' : 'Esta missao ja foi concluida.',
    };
  }

  const nextEvents: TrainerXpEvent[] = [];
  const completionDateKey = toBrazilDateKey(now);
  const taskEventKey = `task:${block.id}:complete`;

  if (!existingEventKeys.has(taskEventKey)) {
    nextEvents.push(
      makeXpEvent({
        eventKey: taskEventKey,
        source: 'task',
        sourceId: block.id,
        blockId: block.id,
        amount: estimateMissionXp(minutesSpent),
        reason: `${getStudyBlockDisplayTitle(block)} concluida`,
        dateKey: completionDateKey,
        now,
        metadata: {
          minutesSpent: Math.max(1, Math.round(minutesSpent)),
          subjectId: block.subjectId,
        },
      })
    );
    existingEventKeys.add(taskEventKey);
  }

  const snapshotAfterTask = buildTrainerSnapshot({
    plannerBlocks,
    analytics,
    subjects,
    studyPrefs,
    userSettings,
    xpEvents: [...safeEvents, ...nextEvents],
    unlockedAchievements: safeAchievements,
    now,
  });

  const dailyEventKey = `daily-goal:${toLocalDateKey(snapshotAfterTask.planDate)}`;
  if (snapshotAfterTask.dailyGoalCompleted && !existingEventKeys.has(dailyEventKey)) {
    nextEvents.push(
      makeXpEvent({
        eventKey: dailyEventKey,
        source: 'daily-goal',
        sourceId: toLocalDateKey(snapshotAfterTask.planDate),
        amount: TRAINER_XP.DAILY_GOAL,
        reason: 'Meta diaria concluida',
        dateKey: completionDateKey,
        now,
      })
    );
    existingEventKeys.add(dailyEventKey);
  }

  const weekKey = toLocalDateKey(getWeekStart(now));
  const weeklyEventKey = `weekly-goal:${weekKey}`;
  if (snapshotAfterTask.weeklyGoalCompleted && !existingEventKeys.has(weeklyEventKey)) {
    nextEvents.push(
      makeXpEvent({
        eventKey: weeklyEventKey,
        source: 'weekly-goal',
        sourceId: weekKey,
        amount: TRAINER_XP.WEEKLY_GOAL,
        reason: 'Meta semanal concluida',
        dateKey: completionDateKey,
        now,
      })
    );
    existingEventKeys.add(weeklyEventKey);
  }

  const snapshotBeforeAchievements = buildTrainerSnapshot({
    plannerBlocks,
    analytics,
    subjects,
    studyPrefs,
    userSettings,
    xpEvents: [...safeEvents, ...nextEvents],
    unlockedAchievements: safeAchievements,
    now,
  });
  const stats = getAchievementStats({
    plannerBlocks,
    analytics,
    subjects,
    streak: snapshotBeforeAchievements.streak,
    weekly: snapshotBeforeAchievements.weekly,
  });

  const newAchievements = TRAINER_ACHIEVEMENTS.filter((achievement) => {
    if (existingAchievementIds.has(achievement.id)) return false;
    return shouldUnlockAchievement(achievement, stats);
  }).map((achievement) => ({
    ...achievement,
    achievementId: achievement.id,
    unlockedAt: now.toISOString(),
  }));

  newAchievements.forEach((achievement) => {
    existingAchievementIds.add(achievement.achievementId);
    if (achievement.xpReward <= 0) return;
    const eventKey = `achievement:${achievement.achievementId}`;
    if (existingEventKeys.has(eventKey)) return;
    nextEvents.push(
      makeXpEvent({
        eventKey,
        source: 'achievement',
        sourceId: achievement.achievementId,
        amount: achievement.xpReward,
        reason: `Conquista: ${achievement.name}`,
        dateKey: completionDateKey,
        now,
      })
    );
    existingEventKeys.add(eventKey);
  });

  const snapshotAfter = buildTrainerSnapshot({
    plannerBlocks,
    analytics,
    subjects,
    studyPrefs,
    userSettings,
    xpEvents: [...safeEvents, ...nextEvents],
    unlockedAchievements: [...safeAchievements, ...newAchievements],
    now,
  });
  const xpEarned = nextEvents.reduce((sum, event) => sum + event.amount, 0);

  return {
    xpEarned,
    events: nextEvents,
    newAchievements,
    levelBefore: snapshotBefore.level,
    levelAfter: snapshotAfter.level,
    didLevelUp: snapshotAfter.level > snapshotBefore.level,
    streak: snapshotAfter.streak,
    longestStreak: snapshotAfter.longestStreak,
    dailyGoalCompleted: snapshotAfter.dailyGoalCompleted,
    weeklyGoalCompleted: snapshotAfter.weeklyGoalCompleted,
    nextMission: snapshotAfter.nextMission,
    message:
      xpEarned > 0
        ? `Você recebeu ${xpEarned} XP.`
        : 'Missão registrada sem novo XP porque a recompensa já tinha sido aplicada.',
  };
}
