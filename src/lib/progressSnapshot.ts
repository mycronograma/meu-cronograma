import { levelFromXp, toLocalDateKey } from '@/lib/utils';
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

export function computeStudyStreak(
  dailyAnalytics: DailyAnalytics,
  completedHoursByDate: Record<string, number>,
  now: Date = new Date()
) {
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
    } else {
      break;
    }
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
  completedHoursByDate: Record<string, number>
) {
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
    } else if (diffDays > 1) {
      current = 1;
    }
  }

  return longest;
}

export function computeGamificationSnapshot(params: {
  plannerBlocks: StudyBlock[];
  analytics: AnalyticsStore;
  now?: Date;
}): GamificationSnapshot {
  const { plannerBlocks, analytics, now = new Date() } = params;
  const completedHoursByDate = buildCompletedHoursByDate(plannerBlocks);
  const dailyAnalytics = analytics.daily || {};
  const streak = computeStudyStreak(dailyAnalytics, completedHoursByDate, now);
  const longestStreak = computeLongestStudyStreak(dailyAnalytics, completedHoursByDate);

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
