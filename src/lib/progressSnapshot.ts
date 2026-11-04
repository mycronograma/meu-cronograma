import { getWeekStart, levelFromXp, parseBlockDate, toLocalDateKey } from '@/lib/utils';
import type { AnalyticsStore, DailyAnalyticsRecord, StudyBlock } from '@/types';

type DailyAnalytics = AnalyticsStore['daily'];

export interface GamificationSnapshot {
  streak: number;
  longestStreak: number;
  level: number;
  totalXp: number;
  xpInCurrentLevel: number;
  xpToNextLevel: number;
}

const toDateKey = (value: Date | string) => toLocalDateKey(value);

export function buildCompletedHoursByDate(plannerBlocks: StudyBlock[]): Record<string, number> {
  const totals: Record<string, number> = {};

  plannerBlocks.forEach((block) => {
    if (block.isBreak || block.status !== 'completed') return;
    const key = toDateKey(block.date);
    totals[key] = (totals[key] ?? 0) + Math.max(0, block.durationMinutes) / 60;
  });

  return totals;
}

/**
 * Horas concluídas por disciplina **na semana atual** (segunda a domingo).
 *
 * A tela de disciplinas mostrava `subject.completedHours`, que é o acumulado de
 * sempre, ao lado de `targetHours` (meta semanal): depois de algumas semanas a
 * barra ficava cheia para sempre e o rótulo "Meta da semana" virava mentira
 * (ex.: 220:00 / 6:00). Este helper calcula o que a semana realmente rendeu, a
 * partir dos blocos concluídos — a mesma base usada no dashboard.
 */
export function buildWeeklyCompletedHoursBySubject(
  plannerBlocks: StudyBlock[],
  reference: Date = new Date()
): Map<string, number> {
  const weekStart = getWeekStart(reference);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  const totals = new Map<string, number>();

  plannerBlocks.forEach((block) => {
    if (block.isBreak || block.status !== 'completed' || !block.subjectId) return;

    const blockDate = parseBlockDate(block.date);
    if (Number.isNaN(blockDate.getTime())) return;
    if (blockDate < weekStart || blockDate >= weekEnd) return;

    const minutes = Number.isFinite(block.durationMinutes) ? Math.max(0, block.durationMinutes) : 0;
    totals.set(block.subjectId, (totals.get(block.subjectId) ?? 0) + minutes / 60);
  });

  return totals;
}

export function buildCompletedSessionsByDate(plannerBlocks: StudyBlock[]): Record<string, number> {
  const totals: Record<string, number> = {};

  plannerBlocks.forEach((block) => {
    if (block.isBreak || block.status !== 'completed') return;
    const key = toDateKey(block.date);
    totals[key] = (totals[key] ?? 0) + 1;
  });

  return totals;
}

export function getStudyHoursForDate(
  dateKey: string,
  dailyAnalytics: DailyAnalytics,
  completedHoursByDate: Record<string, number>
) {
  const analyticsHours = dailyAnalytics[dateKey]?.hours ?? 0;
  const blockHours = completedHoursByDate[dateKey] ?? 0;
  return Math.max(analyticsHours, blockHours);
}

export function getStudySessionsForDate(
  dateKey: string,
  dailyAnalytics: DailyAnalytics,
  completedSessionsByDate: Record<string, number>
) {
  const analyticsSessions = dailyAnalytics[dateKey]?.sessions ?? 0;
  const blockSessions = completedSessionsByDate[dateKey] ?? 0;
  return Math.max(analyticsSessions, blockSessions);
}

export function buildMergedDailyStudyData(
  dailyAnalytics: DailyAnalytics,
  completedHoursByDate: Record<string, number>,
  completedSessionsByDate: Record<string, number>
): DailyAnalytics {
  const merged: DailyAnalytics = { ...dailyAnalytics };
  const allDateKeys = new Set([
    ...Object.keys(dailyAnalytics),
    ...Object.keys(completedHoursByDate),
    ...Object.keys(completedSessionsByDate),
  ]);

  allDateKeys.forEach((dateKey) => {
    const currentRecord = (merged[dateKey] ?? { hours: 0, sessions: 0 }) as DailyAnalyticsRecord;
    merged[dateKey] = {
      ...currentRecord,
      hours: getStudyHoursForDate(dateKey, dailyAnalytics, completedHoursByDate),
      sessions: getStudySessionsForDate(dateKey, dailyAnalytics, completedSessionsByDate),
    };
  });

  return merged;
}

export interface StreakOptions {
  /**
   * Dias de descanso (0 = domingo). Não contam como estudo, mas também não
   * quebram a sequência: sem isso, quem estuda 6 dias por semana e descansa no
   * domingo nunca passava de 6 dias e as conquistas de 7/30 dias eram impossíveis.
   */
  restDays?: number[];
}

const buildRestDaySet = (options?: StreakOptions) =>
  new Set((options?.restDays ?? []).filter((day) => day >= 0 && day <= 6));

export function computeStudyStreak(
  dailyAnalytics: DailyAnalytics,
  completedHoursByDate: Record<string, number>,
  now: Date = new Date(),
  options?: StreakOptions
) {
  const restDays = buildRestDaySet(options);
  let streak = 0;
  const todayKey = toLocalDateKey(now);
  const studiedToday = getStudyHoursForDate(todayKey, dailyAnalytics, completedHoursByDate) > 0;
  const startOffset = studiedToday ? 0 : 1;

  for (let i = startOffset; i < 365; i += 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);
    const dateKey = toLocalDateKey(date);
    const hours = getStudyHoursForDate(dateKey, dailyAnalytics, completedHoursByDate);

    if (hours > 0) {
      streak += 1;
      continue;
    }

    // Dia de descanso configurado não interrompe a sequência (e não conta como dia estudado).
    if (restDays.has(date.getDay())) {
      continue;
    }

    break;
  }

  return streak;
}

const dateKeyToUtcTime = (dateKey: string) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  if (!year || !month || !day) return Number.NaN;
  return Date.UTC(year, month - 1, day);
};

export function computeLongestStudyStreak(
  dailyAnalytics: DailyAnalytics,
  completedHoursByDate: Record<string, number>,
  options?: StreakOptions
) {
  const restDays = buildRestDaySet(options);
  const dateKeySet = new Set<string>();

  Object.keys(dailyAnalytics).forEach((key) => {
    if ((dailyAnalytics[key]?.hours ?? 0) > 0 || (completedHoursByDate[key] ?? 0) > 0) {
      dateKeySet.add(key);
    }
  });

  Object.keys(completedHoursByDate).forEach((key) => {
    if ((completedHoursByDate[key] ?? 0) > 0) {
      dateKeySet.add(key);
    }
  });

  const orderedDays = Array.from(dateKeySet)
    .map((dateKey) => dateKeyToUtcTime(dateKey))
    .filter((time) => Number.isFinite(time))
    .sort((a, b) => a - b);

  if (orderedDays.length === 0) return 0;

  let longest = 1;
  let current = 1;

  for (let index = 1; index < orderedDays.length; index += 1) {
    const diffDays = Math.round((orderedDays[index] - orderedDays[index - 1]) / 86_400_000);
    if (diffDays === 1) {
      current += 1;
      if (current > longest) {
        longest = current;
      }
      continue;
    }

    if (diffDays > 1 && restDays.size > 0) {
      // O intervalo só continua sendo sequência se todos os dias pulados forem
      // dias de descanso configurados (ex.: domingo entre sábado e segunda).
      let onlyRestDays = true;
      for (let skipped = 1; skipped < diffDays; skipped += 1) {
        const skippedDate = new Date(orderedDays[index - 1] + skipped * 86_400_000);
        if (!restDays.has(skippedDate.getUTCDay())) {
          onlyRestDays = false;
          break;
        }
      }
      if (onlyRestDays) {
        current += 1;
        if (current > longest) {
          longest = current;
        }
        continue;
      }
    }

    if (diffDays > 1) {
      current = 1;
    }
  }

  return longest;
}

export function computeGamificationSnapshot(params: {
  plannerBlocks: StudyBlock[];
  analytics: AnalyticsStore;
  now?: Date;
  restDays?: number[];
}): GamificationSnapshot {
  const { plannerBlocks, analytics, now = new Date(), restDays } = params;
  const completedHoursByDate = buildCompletedHoursByDate(plannerBlocks);
  const dailyAnalytics = analytics.daily || {};
  const streak = computeStudyStreak(dailyAnalytics, completedHoursByDate, now, { restDays });
  const longestStreak = computeLongestStudyStreak(dailyAnalytics, completedHoursByDate, { restDays });

  const minutesFromBlocks = plannerBlocks.reduce((sum, block) => {
    if (block.isBreak || block.status !== 'completed') return sum;
    return sum + Math.max(0, block.durationMinutes);
  }, 0);

  const minutesFromAnalytics = Object.values(dailyAnalytics).reduce((sum, day) => {
    const hours = day?.hours ?? 0;
    if (!Number.isFinite(hours) || hours <= 0) return sum;
    return sum + hours * 60;
  }, 0);

  const totalXp = Math.max(0, Math.round(Math.max(minutesFromBlocks, minutesFromAnalytics)));
  const levelData = levelFromXp(totalXp);

  return {
    streak,
    longestStreak,
    level: Math.max(1, levelData.level),
    totalXp,
    xpInCurrentLevel: Math.max(0, Math.round(levelData.xpInLevel)),
    xpToNextLevel: Math.max(1, Math.round(levelData.xpForNext)),
  };
}
