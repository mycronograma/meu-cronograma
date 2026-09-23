import type {
  DailyAvailabilityByWeekday,
  DailyHoursByWeekday,
  PresetWizardAnswers,
  StudyPreferences,
  UserSettings,
  WeekdayKey,
} from '@/types';
import { minutesToTime, timeToMinutes } from '@/lib/utils';

const WEEKDAY_KEYS: WeekdayKey[] = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundHalf(value: number) {
  return Math.round(value * 2) / 2;
}

function normalizeDailyHours(
  dailyHoursByWeekday: DailyHoursByWeekday | undefined,
  fallbackHours: number
) {
  const base: DailyHoursByWeekday = {
    dom: 0,
    seg: fallbackHours,
    ter: fallbackHours,
    qua: fallbackHours,
    qui: fallbackHours,
    sex: fallbackHours,
    sab: fallbackHours,
  };

  if (!dailyHoursByWeekday) return base;

  return WEEKDAY_KEYS.reduce((acc, key) => {
    const raw = dailyHoursByWeekday[key];
    const next = typeof raw === 'number' ? clamp(raw, 0, 12) : base[key];
    acc[key] = roundHalf(next);
    return acc;
  }, { ...base });
}

function buildEmptyDailyAvailability(): DailyAvailabilityByWeekday {
  return WEEKDAY_KEYS.reduce((acc, key) => {
    acc[key] = { start: '', end: '' };
    return acc;
  }, {} as DailyAvailabilityByWeekday);
}

function normalizeDailyAvailability(
  dailyAvailabilityByWeekday: DailyAvailabilityByWeekday | undefined
): DailyAvailabilityByWeekday {
  const base = buildEmptyDailyAvailability();
  if (!dailyAvailabilityByWeekday) return base;

  return WEEKDAY_KEYS.reduce((acc, key) => {
    const raw = dailyAvailabilityByWeekday[key];
    acc[key] = {
      start: typeof raw?.start === 'string' ? raw.start : '',
      end: typeof raw?.end === 'string' ? raw.end : '',
    };
    return acc;
  }, base);
}

function isValidWindow(start: string, end: string) {
  if (!start || !end) return false;
  return timeToMinutes(end) > timeToMinutes(start);
}

function getActiveDays(dailyHoursByWeekday: DailyHoursByWeekday) {
  return WEEKDAY_KEYS.map((key, index) => ({
    key,
    index,
    hours: dailyHoursByWeekday[key],
  })).filter((entry) => entry.hours > 0);
}

function derivePreferredWindowFromDailyAvailability(
  dailyAvailabilityByWeekday: DailyAvailabilityByWeekday,
  activeDayKeys: WeekdayKey[],
  fallbackStart: string,
  fallbackEnd: string,
  fallbackDailyHours: number
) {
  const validWindows = activeDayKeys
    .map((key) => dailyAvailabilityByWeekday[key])
    .filter((window) => isValidWindow(window.start, window.end));

  if (validWindows.length === 0) {
    const start = fallbackStart || '08:00';
    const startMinutes = timeToMinutes(start);
    const endCandidate =
      fallbackEnd && isValidWindow(start, fallbackEnd)
        ? fallbackEnd
        : minutesToTime(startMinutes + Math.max(60, Math.round(fallbackDailyHours * 60)));
    return { preferredStart: start, preferredEnd: endCandidate };
  }

  const earliestStartMinutes = Math.min(...validWindows.map((window) => timeToMinutes(window.start)));
  const latestEndMinutes = Math.max(...validWindows.map((window) => timeToMinutes(window.end)));

  return {
    preferredStart: minutesToTime(earliestStartMinutes),
    preferredEnd: minutesToTime(latestEndMinutes),
  };
}

function clampHoursToAvailableWindows(
  dailyHoursByWeekday: DailyHoursByWeekday,
  dailyAvailabilityByWeekday: DailyAvailabilityByWeekday
) {
  const next = { ...dailyHoursByWeekday };
  for (const key of WEEKDAY_KEYS) {
    const hours = next[key] ?? 0;
    if (hours <= 0) continue;
    const window = dailyAvailabilityByWeekday[key];
    if (!isValidWindow(window.start, window.end)) continue;
    const windowHours = Math.max(0, (timeToMinutes(window.end) - timeToMinutes(window.start)) / 60);
    next[key] = roundHalf(Math.min(hours, windowHours));
  }
  return next;
}

function resolveEffectiveExamDate(baseSettings: UserSettings, answers: PresetWizardAnswers) {
  return answers.examDate || answers.concursoPredictedDate || baseSettings.examDate || '';
}

function resolveStudyStyle(answers: PresetWizardAnswers): NonNullable<StudyPreferences['studyStyle']> {
  if (answers.studyStyle) return answers.studyStyle;
  if (answers.studyContentPreference === 'aulas') return 'theory';
  if (answers.studyContentPreference === 'exercicios') return 'practice';
  return 'balanced';
}

function mapStudyStyleToContentPreference(
  studyStyle: NonNullable<StudyPreferences['studyStyle']>
): NonNullable<StudyPreferences['studyContentPreference']> {
  if (studyStyle === 'theory') return 'aulas';
  if (studyStyle === 'practice') return 'exercicios';
  return 'misto';
}

function resolveHardSubjectsPeriodPreference(
  answers: PresetWizardAnswers
): NonNullable<StudyPreferences['hardSubjectsPeriodPreference']> {
  return answers.hardSubjectsPeriodPreference || 'any';
}

function deriveExamIntensity(
  examDate: string
): StudyPreferences['intensity'] {
  if (!examDate) return undefined;
  const target = new Date(`${examDate}T00:00:00`);
  if (Number.isNaN(target.getTime())) return undefined;
  const daysToExam = Math.ceil((target.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (daysToExam <= 30) return 'intensa';
  if (daysToExam <= 120) return 'normal';
  return 'leve';
}

export function computeStudyPreferences(
  baseSettings: UserSettings,
  answers: PresetWizardAnswers
): { settings: UserSettings; studyPrefs: StudyPreferences } {
  const normalizedAvailability = normalizeDailyAvailability(answers.dailyAvailabilityByWeekday);
  const normalizedHours = clampHoursToAvailableWindows(
    normalizeDailyHours(answers.dailyHoursByWeekday, 3),
    normalizedAvailability
  );
  const activeDayEntries = getActiveDays(normalizedHours);
  const activeDayKeys = activeDayEntries.map((entry) => entry.key);
  const weeklyHours = roundHalf(
    activeDayEntries.reduce((sum, entry) => sum + entry.hours, 0)
  );
  const averageHours =
    activeDayEntries.length > 0 ? weeklyHours / activeDayEntries.length : 0;
  const dailyGoalHours = averageHours > 0 ? roundHalf(averageHours) : 0;

  const focusBlockMinutes = clamp(
    typeof answers.focusBlockMinutes === 'number' ? answers.focusBlockMinutes : answers.focusMinutes,
    25,
    120
  );
  const blockMinutes = focusBlockMinutes;
  const breakMinutes = clamp(answers.breakMinutes, 5, 20);
  const studyStyle = resolveStudyStyle(answers);
  const hardSubjectsPeriodPreference = resolveHardSubjectsPeriodPreference(answers);

  const inferredWindow = derivePreferredWindowFromDailyAvailability(
    normalizedAvailability,
    activeDayKeys,
    baseSettings.preferredStart || '08:00',
    baseSettings.preferredEnd || '',
    dailyGoalHours || 2
  );

  const startMinutes = timeToMinutes(inferredWindow.preferredStart);
  let preferredEnd = inferredWindow.preferredEnd;
  if (!isValidWindow(inferredWindow.preferredStart, preferredEnd)) {
    preferredEnd = minutesToTime(startMinutes + Math.max(60, Math.round((dailyGoalHours || 2) * 60)));
  }

  const allDays = [0, 1, 2, 3, 4, 5, 6];
  const activeDays = activeDayEntries.map((entry) => entry.index);
  const excludeDays = allDays.filter((day) => !activeDays.includes(day));
  const effectiveExamDate = resolveEffectiveExamDate(baseSettings, answers);

  const settings: UserSettings = {
    ...baseSettings,
    dailyGoalHours:
      Number.isFinite(dailyGoalHours) ? dailyGoalHours : (baseSettings.dailyGoalHours ?? 2),
    dailyHoursByWeekday: normalizedHours,
    dailyAvailabilityByWeekday: normalizedAvailability,
    preferredStart: inferredWindow.preferredStart,
    preferredEnd,
    maxBlockMinutes: blockMinutes,
    breakMinutes,
    excludeDays,
    examDate: effectiveExamDate,
    aiDifficulty: answers.aiDifficulty ?? baseSettings.aiDifficulty,
    focusMode:
      typeof answers.focusMode === 'boolean' ? answers.focusMode : baseSettings.focusMode,
    autoSchedule:
      typeof answers.autoSchedule === 'boolean' ? answers.autoSchedule : baseSettings.autoSchedule,
    smartBreaks:
      typeof answers.smartBreaks === 'boolean' ? answers.smartBreaks : baseSettings.smartBreaks,
    targetMode: answers.targetMode ?? baseSettings.targetMode,
    targetMonths: answers.targetMonths ?? baseSettings.targetMonths,
    targetTotalHours: answers.targetTotalHours ?? baseSettings.targetTotalHours,
  };

  const studyPrefs: StudyPreferences = {
    hoursPerDay: Number.isFinite(dailyGoalHours) ? dailyGoalHours : 0,
    weeklyHours,
    dailyHoursByWeekday: normalizedHours,
    daysOfWeek: activeDays,
    mode: effectiveExamDate ? 'exam' : 'random',
    examDate: effectiveExamDate || '',
    startDate: answers.startDate || undefined,
    goal: answers.goal,
    blockDurationMinutes: blockMinutes,
    focusBlockMinutes,
    breakDurationMinutes: breakMinutes,
    hardSubjectsPeriodPreference,
    studyStyle,
    studyContentPreference: mapStudyStyleToContentPreference(studyStyle),
    intensity: deriveExamIntensity(effectiveExamDate),
    dailyAvailabilityByWeekday: normalizedAvailability,
    userLevel:
      weeklyHours <= 8
        ? 'iniciante'
        : weeklyHours >= 25 && answers.focusMinutes >= 90
        ? 'avancado'
        : 'intermediario',
  };

  return { settings, studyPrefs };
}
