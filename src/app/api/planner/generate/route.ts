import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { generateChronologicalSchedule } from '@/services/roadmapEngine';
import { authOptions } from '@/lib/auth';
import { getWeekStart, minutesToTime, timeToMinutes } from '@/lib/utils';
import type { StudyBlock, StudyPreferences, Subject, UserSettings, WeekdayKey } from '@/types';

type ScheduleRangePayload = { startDate: string; endDate: string };

type GeneratePlannerRequest = {
  subjects?: Subject[];
  studyPrefs?: StudyPreferences;
  userSettings?: UserSettings;
  scheduleRange?: ScheduleRangePayload | null;
  dailyLimits?: Record<string, number>;
  firstCycleAllSubjects?: boolean;
};

const WEEKDAY_KEYS: WeekdayKey[] = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];

const toLocalDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;

const parseLocalDateKey = (value?: string | null) => {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  const parsed = new Date(year, month - 1, day);
  parsed.setHours(0, 0, 0, 0);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

function getHoursForDate(
  date: Date,
  dailyHoursByWeekday: UserSettings['dailyHoursByWeekday'],
  fallbackHours: number
) {
  if (!dailyHoursByWeekday) return fallbackHours;
  const key = WEEKDAY_KEYS[date.getDay()];
  const hours = dailyHoursByWeekday[key];
  return typeof hours === 'number' ? hours : fallbackHours;
}

function buildDailyLimitByDate(
  startDate: Date,
  endDate: Date,
  dailyHoursByWeekday: UserSettings['dailyHoursByWeekday'],
  fallbackHours: number
) {
  const limits: Record<string, number> = {};
  const cursor = new Date(startDate);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  while (cursor <= end) {
    limits[toLocalDateKey(cursor)] = Math.max(0, Math.round(getHoursForDate(cursor, dailyHoursByWeekday, fallbackHours) * 60));
    cursor.setDate(cursor.getDate() + 1);
  }
  return limits;
}

function buildDailyTimeWindowByDate(
  startDate: Date,
  endDate: Date,
  dailyAvailabilityByWeekday: UserSettings['dailyAvailabilityByWeekday']
) {
  const windows: Record<string, { start: string; end: string }> = {};
  if (!dailyAvailabilityByWeekday) return windows;

  const cursor = new Date(startDate);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  while (cursor <= end) {
    const dayKey = WEEKDAY_KEYS[cursor.getDay()];
    const dayWindow = dailyAvailabilityByWeekday[dayKey];
    if (
      dayWindow?.start &&
      dayWindow?.end &&
      timeToMinutes(dayWindow.end) > timeToMinutes(dayWindow.start)
    ) {
      windows[toLocalDateKey(cursor)] = { start: dayWindow.start, end: dayWindow.end };
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return windows;
}

function resolveSimuladoRules(studyPrefs: StudyPreferences) {
  const examDate = studyPrefs.examDate ? new Date(studyPrefs.examDate) : null;
  const daysToExam =
    examDate && !Number.isNaN(examDate.getTime())
      ? Math.ceil((examDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null;
  const adaptiveFrequencyDays = daysToExam !== null && daysToExam <= 90 ? 7 : 14;
  const intensity = studyPrefs.intensity || 'normal';
  const frequencyDays =
    intensity === 'intensa'
      ? Math.max(5, adaptiveFrequencyDays - 3)
      : intensity === 'leve'
      ? adaptiveFrequencyDays + 7
      : adaptiveFrequencyDays;
  const lessonDelta = intensity === 'intensa' ? -2 : intensity === 'leve' ? 2 : 0;
  const practiceDelta = intensity === 'intensa' ? -1 : intensity === 'leve' ? 2 : 0;

  if (studyPrefs.goal === 'medicina') {
    return {
      minLessonsBeforeSimulated: Math.max(8, 20 + lessonDelta),
      minPracticeBeforeSimulated: Math.max(4, 12 + practiceDelta),
      minLessonsPerSubject: 3,
      minDaysBeforeSimulated: 14,
      frequencyDays,
      minLessonsBeforeAreaSimulated: 8,
      minDaysBeforeAreaSimulated: 7,
    };
  }
  if (studyPrefs.goal === 'concurso') {
    return {
      minLessonsBeforeSimulated: Math.max(8, 16 + lessonDelta),
      minPracticeBeforeSimulated: Math.max(4, 10 + practiceDelta),
      minLessonsPerSubject: 2,
      minDaysBeforeSimulated: 14,
      frequencyDays,
      minLessonsBeforeAreaSimulated: 6,
      minDaysBeforeAreaSimulated: 7,
    };
  }
  if (studyPrefs.goal === 'enem') {
    return {
      minLessonsBeforeSimulated: Math.max(8, 20 + lessonDelta),
      minPracticeBeforeSimulated: Math.max(4, 12 + practiceDelta),
      minLessonsPerSubject: 2,
      minDaysBeforeSimulated: 14,
      frequencyDays,
      minLessonsBeforeAreaSimulated: 8,
      minDaysBeforeAreaSimulated: 7,
    };
  }
  return {
    minLessonsBeforeSimulated: Math.max(8, 20 + lessonDelta),
    minPracticeBeforeSimulated: Math.max(4, 8 + practiceDelta),
    minLessonsPerSubject: 2,
    minDaysBeforeSimulated: 14,
    frequencyDays,
    minLessonsBeforeAreaSimulated: 6,
    minDaysBeforeAreaSimulated: 7,
  };
}

function serializeBlock(block: StudyBlock) {
  return {
    ...block,
    date: block.date.toISOString(),
    originalDate: block.originalDate ? block.originalDate.toISOString() : undefined,
    completedAt: block.completedAt ? block.completedAt.toISOString() : undefined,
    createdAt: block.createdAt.toISOString(),
    updatedAt: block.updatedAt.toISOString(),
    subject: block.subject
      ? {
          ...block.subject,
          createdAt: block.subject.createdAt.toISOString(),
          updatedAt: block.subject.updatedAt.toISOString(),
        }
      : block.subject,
  };
}

export async function POST(request: Request) {
  try {
    const isLocalDemoMode =
      process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_LOCAL_DEMO_MODE === 'true';
    const session = isLocalDemoMode ? null : await getServerSession(authOptions);

    if (!isLocalDemoMode && !session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as GeneratePlannerRequest;
    const subjects = Array.isArray(body.subjects) ? body.subjects : [];
    const studyPrefs = body.studyPrefs;
    const userSettings = body.userSettings;

    if (!studyPrefs || !userSettings) {
      return NextResponse.json(
        { success: false, error: 'studyPrefs e userSettings sao obrigatorios.' },
        { status: 400 }
      );
    }

    if (subjects.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Nenhuma disciplina fornecida para gerar cronograma.' },
        { status: 400 }
      );
    }

    const requestedStart = parseLocalDateKey(body.scheduleRange?.startDate);
    const requestedEnd = parseLocalDateKey(body.scheduleRange?.endDate);
    const startDate = requestedStart ?? parseLocalDateKey(studyPrefs.startDate) ?? getWeekStart(new Date());
    const endDate = requestedEnd ?? (() => {
      const next = new Date(startDate);
      next.setDate(next.getDate() + 6);
      return next;
    })();

    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);
    if (endDate < startDate) {
      endDate.setTime(startDate.getTime());
      endDate.setDate(endDate.getDate() + 6);
    }

    const activeDays = userSettings.dailyHoursByWeekday
      ? WEEKDAY_KEYS.map((key, index) => ({ key, index }))
          .filter((entry) => (userSettings.dailyHoursByWeekday?.[entry.key] ?? 0) > 0)
          .map((entry) => entry.index)
      : studyPrefs.daysOfWeek ?? [];
    const excludeDays =
      activeDays.length > 0
        ? [0, 1, 2, 3, 4, 5, 6].filter((day) => !activeDays.includes(day))
        : (userSettings.excludeDays ?? [0]);

    const baseDailyLimits = buildDailyLimitByDate(
      startDate,
      endDate,
      userSettings.dailyHoursByWeekday,
      studyPrefs.hoursPerDay
    );
    const mergedDailyLimits = { ...baseDailyLimits, ...(body.dailyLimits || {}) };
    const dailyTimeWindowByDate = buildDailyTimeWindowByDate(
      startDate,
      endDate,
      userSettings.dailyAvailabilityByWeekday
    );

    const preferredStart = userSettings.preferredStart || '09:00';
    const preferredEnd =
      userSettings.preferredEnd ||
      minutesToTime(
        timeToMinutes(preferredStart) + Math.max(60, Math.round((studyPrefs.hoursPerDay ?? 2) * 60))
      );
    const blockMinutes = Math.max(
      25,
      studyPrefs.focusBlockMinutes ?? studyPrefs.blockDurationMinutes ?? userSettings.maxBlockMinutes ?? 90
    );
    const breakMinutes = Math.max(5, studyPrefs.breakDurationMinutes ?? userSettings.breakMinutes ?? 10);

    const schedule = generateChronologicalSchedule({
      subjects,
      preferences: studyPrefs,
      startDate,
      endDate,
      preferredStart,
      preferredEnd,
      maxBlockMinutes: blockMinutes,
      breakMinutes,
      restDays: excludeDays,
      dailyLimitByDate: mergedDailyLimits,
      dailyTimeWindowByDate,
      firstCycleAllSubjects: body.firstCycleAllSubjects ?? true,
      completedLessonsTotal: 0,
      completedLessonsBySubject: {},
      completedPracticeTotal: 0,
      completedPracticeBySubject: {},
      simuladoRules: resolveSimuladoRules(studyPrefs),
      enableScheduleCache: true,
      debug: false,
    });

    return NextResponse.json({
      success: true,
      data: {
        blocks: schedule.blocks.map(serializeBlock),
        scheduleRange: {
          startDate: toLocalDateKey(startDate),
          endDate: toLocalDateKey(endDate),
        },
        meta: {
          totalHours: schedule.totalHours,
          totalBlocks: schedule.blocks.filter((block) => !block.isBreak).length,
          cacheHit: schedule.cacheHit === true,
        },
      },
    });
  } catch (error) {
    console.error('Planner generate API error:', error);
    return NextResponse.json(
      { success: false, error: 'Falha ao regenerar cronograma.' },
      { status: 500 }
    );
  }
}
