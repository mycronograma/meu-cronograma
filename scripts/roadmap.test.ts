import { generateChronologicalSchedule } from '../src/services/roadmapEngine';
import { createEnemSubjectBank } from '../src/lib/enemCatalog';
import type {
  DailyAvailabilityByWeekday,
  DailyHoursByWeekday,
  PresetWizardAnswers,
  StudyPreferences,
  Subject,
} from '../src/types';
import assert from 'node:assert';
import { computeStudyPreferences } from '../src/services/presetConfigurator';
import { defaultSettings } from '../src/lib/defaultSettings';

const subjects: Subject[] = [
  {
    id: 'mat',
    userId: 'user1',
    name: 'Matematica',
    color: '#00B4FF',
    icon: 'book',
    priority: 10,
    difficulty: 7,
    targetHours: 8,
    completedHours: 0,
    totalHours: 0,
    sessionsCount: 0,
    averageScore: 0,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'bio',
    userId: 'user1',
    name: 'Biologia',
    color: '#00FFC8',
    icon: 'book',
    priority: 8,
    difficulty: 5,
    targetHours: 6,
    completedHours: 0,
    totalHours: 0,
    sessionsCount: 0,
    averageScore: 0,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'hist',
    userId: 'user1',
    name: 'Historia',
    color: '#FF5555',
    icon: 'book',
    priority: 6,
    difficulty: 4,
    targetHours: 5,
    completedHours: 0,
    totalHours: 0,
    sessionsCount: 0,
    averageScore: 0,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

const preferences: StudyPreferences = {
  hoursPerDay: 3,
  daysOfWeek: [1, 2, 3, 4, 5],
  mode: 'random',
  goal: 'enem',
};

const startDate = new Date();
startDate.setHours(0, 0, 0, 0);
const endDate = new Date(startDate);
endDate.setDate(startDate.getDate() + 14);

const schedule = generateChronologicalSchedule({
  subjects,
  preferences,
  startDate,
  endDate,
  preferredStart: '09:00',
  preferredEnd: '18:00',
  maxBlockMinutes: 60,
  breakMinutes: 10,
  restDays: [0],
  firstCycleAllSubjects: true,
  completedLessonsTotal: 0,
  completedLessonsBySubject: {},
  simuladoRules: {
    minLessonsBeforeSimulated: 20,
    minLessonsPerSubject: 2,
    minDaysBeforeSimulated: 14,
    frequencyDays: 7,
    minLessonsBeforeAreaSimulated: 6,
    minDaysBeforeAreaSimulated: 7,
  },
  debug: false,
});

const blocks = schedule.blocks.filter((b) => !b.isBreak);
assert.ok(blocks.length > 0, 'should generate blocks');

const generatedBlocksByDay = new Map<string, typeof schedule.blocks>();
schedule.blocks.forEach((block) => {
  const key = block.date.toISOString().slice(0, 10);
  const list = generatedBlocksByDay.get(key) || [];
  list.push(block);
  generatedBlocksByDay.set(key, list);
});
generatedBlocksByDay.forEach((dayBlocks) => {
  const ordered = [...dayBlocks].sort((a, b) => a.startTime.localeCompare(b.startTime));
  assert.notStrictEqual(ordered.at(-1)?.isBreak, true, 'day must not end with an orphan break');
});

const firstLessonBySubject: Record<string, number> = {};
blocks.forEach((block, index) => {
  if (firstLessonBySubject[block.subjectId] === undefined && block.type === 'AULA') {
    firstLessonBySubject[block.subjectId] = index;
  }
});
blocks.forEach((block, index) => {
  if (block.type === 'REVISAO') {
    const lessonIndex = firstLessonBySubject[block.relatedSubjectId || block.subjectId];
    assert.ok(typeof lessonIndex === 'number' && lessonIndex <= index, 'review should come after lesson');
  }
});

for (let i = 2; i < blocks.length; i += 1) {
  const a = blocks[i - 2];
  const b = blocks[i - 1];
  const c = blocks[i];
  if (a.subjectId === b.subjectId && b.subjectId === c.subjectId) {
    throw new Error('Three consecutive blocks of same subject');
  }
}

const firstComplete = blocks.find((b) => b.type === 'SIMULADO_COMPLETO');
if (firstComplete) {
  const diffDays = Math.floor(
    (new Date(firstComplete.date).getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  assert.ok(diffDays >= 14, 'simulado completo should appear after 14 days');
}

console.log('roadmap tests passed');

const advancedSchedule = generateChronologicalSchedule({
  subjects,
  preferences,
  startDate,
  endDate,
  preferredStart: '09:00',
  preferredEnd: '18:00',
  maxBlockMinutes: 60,
  breakMinutes: 10,
  restDays: [0],
  firstCycleAllSubjects: false,
  completedLessonsTotal: 30,
  completedLessonsBySubject: { mat: 5, bio: 5, hist: 4 },
  simuladoRules: {
    minLessonsBeforeSimulated: 20,
    minLessonsPerSubject: 2,
    minDaysBeforeSimulated: 14,
    frequencyDays: 7,
    minLessonsBeforeAreaSimulated: 6,
    minDaysBeforeAreaSimulated: 7,
  },
  debug: false,
});

const advancedBlocks = advancedSchedule.blocks.filter((b) => !b.isBreak);
assert.ok(
  advancedBlocks.some((b) => typeof b.pedagogicalStepIndex === 'number' && (b.pedagogicalStepTotal ?? 0) >= 4),
  'blocks should include pedagogical progress metadata'
);
assert.ok(
  advancedBlocks.some((b) => b.topicName),
  'non-break blocks should include ENEM topic labels when available'
);
const firstArea = advancedBlocks.find((b) => b.type === 'SIMULADO_AREA');
if (firstArea) {
  const diffDays = Math.floor(
    (new Date(firstArea.date).getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  assert.ok(diffDays >= 7, 'simulado area should appear after 7 days');
}
const firstComplete2 = advancedBlocks.find((b) => b.type === 'SIMULADO_COMPLETO');
if (firstComplete2) {
  const diffDays = Math.floor(
    (new Date(firstComplete2.date).getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  assert.ok(diffDays >= 14, 'simulado completo should appear after 14 days');
}
const firstSimulado = advancedBlocks.find(
  (b) => b.type === 'SIMULADO_AREA' || b.type === 'SIMULADO_COMPLETO'
);
if (firstSimulado) {
  const nextIndex = advancedBlocks.findIndex((b) => b.id === firstSimulado.id) + 1;
  const nextBlock = advancedBlocks[nextIndex];
  assert.ok(nextBlock && nextBlock.type === 'ANALISE', 'analysis should follow simulado');
}

const enemBank = createEnemSubjectBank('user1');
const normalizeTestText = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
const enemNames = new Set(enemBank.map((subject) => normalizeTestText(subject.name)));
assert.ok(enemNames.has('matematica'), 'ENEM bank should include Matematica');
assert.ok(enemNames.has('portugues (interpretacao)'), 'ENEM bank should include Portugues (Interpretacao)');
assert.ok(enemNames.has('tecnologias da comunicacao'), 'ENEM bank should include Tecnologias da Comunicacao');
assert.ok(!enemNames.has('linguagens'), 'ENEM bank should not include generic Linguagens');
assert.ok(!enemNames.has('natureza'), 'ENEM bank should not include generic Natureza');

console.log('enem structure tests passed');

const cachedSchedule = generateChronologicalSchedule({
  subjects,
  preferences,
  startDate,
  endDate,
  preferredStart: '09:00',
  preferredEnd: '18:00',
  maxBlockMinutes: 60,
  breakMinutes: 10,
  restDays: [0],
  debug: false,
});
const cachedSchedule2 = generateChronologicalSchedule({
  subjects,
  preferences,
  startDate,
  endDate,
  preferredStart: '09:00',
  preferredEnd: '18:00',
  maxBlockMinutes: 60,
  breakMinutes: 10,
  restDays: [0],
  debug: false,
});
assert.ok(cachedSchedule2.cacheHit === true, 'second identical generation should hit cache');
console.log('roadmap cache tests passed');

function makeDailyHours(partial: Partial<DailyHoursByWeekday>): DailyHoursByWeekday {
  return {
    dom: 0,
    seg: 0,
    ter: 0,
    qua: 0,
    qui: 0,
    sex: 0,
    sab: 0,
    ...partial,
  };
}

function makeDailyAvailability(partial?: Partial<DailyAvailabilityByWeekday>): DailyAvailabilityByWeekday {
  return {
    dom: { start: '', end: '' },
    seg: { start: '', end: '' },
    ter: { start: '', end: '' },
    qua: { start: '', end: '' },
    qui: { start: '', end: '' },
    sex: { start: '', end: '' },
    sab: { start: '', end: '' },
    ...(partial || {}),
  };
}

function parseLocalDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toLocalKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function hmToMinutes(value: string) {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

function buildDailyLimitByDate(
  startDate: Date,
  endDate: Date,
  dailyHoursByWeekday: DailyHoursByWeekday | undefined,
  fallbackHours: number
) {
  const keys: Array<keyof DailyHoursByWeekday> = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
  const limits: Record<string, number> = {};
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    const key = keys[cursor.getDay()];
    const hours =
      dailyHoursByWeekday && typeof dailyHoursByWeekday[key] === 'number'
        ? dailyHoursByWeekday[key]
        : fallbackHours;
    limits[toLocalKey(cursor)] = Math.max(0, Math.round(hours * 60));
    cursor.setDate(cursor.getDate() + 1);
  }
  return limits;
}

function buildDailyWindowsByDate(
  startDate: Date,
  endDate: Date,
  dailyAvailabilityByWeekday: DailyAvailabilityByWeekday | undefined
) {
  const keys: Array<keyof DailyAvailabilityByWeekday> = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
  const result: Record<string, { start: string; end: string }> = {};
  if (!dailyAvailabilityByWeekday) return result;
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    const day = dailyAvailabilityByWeekday[keys[cursor.getDay()]];
    if (day?.start && day?.end && hmToMinutes(day.end) > hmToMinutes(day.start)) {
      result[toLocalKey(cursor)] = { start: day.start, end: day.end };
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

function generateFromWizard(
  wizardAnswers: PresetWizardAnswers,
  customSubjects: Subject[] = subjects,
  endDateKey?: string
) {
  const { settings, studyPrefs } = computeStudyPreferences(defaultSettings, wizardAnswers);
  const start = parseLocalDate(wizardAnswers.startDate || '2026-03-02');
  const end = parseLocalDate(endDateKey || wizardAnswers.startDate || '2026-03-02');
  const schedule = generateChronologicalSchedule({
    subjects: customSubjects,
    preferences: studyPrefs,
    startDate: start,
    endDate: end,
    preferredStart: settings.preferredStart || '08:00',
    preferredEnd: settings.preferredEnd || '22:00',
    maxBlockMinutes: studyPrefs.focusBlockMinutes || studyPrefs.blockDurationMinutes || 60,
    breakMinutes: studyPrefs.breakDurationMinutes || 10,
    restDays: settings.excludeDays || [],
    dailyLimitByDate: buildDailyLimitByDate(start, end, settings.dailyHoursByWeekday, studyPrefs.hoursPerDay),
    dailyTimeWindowByDate: buildDailyWindowsByDate(start, end, settings.dailyAvailabilityByWeekday),
    firstCycleAllSubjects: true,
    completedLessonsTotal: 0,
    completedLessonsBySubject: {},
    completedPracticeTotal: 0,
    completedPracticeBySubject: {},
    debug: false,
  });
  return { schedule, settings, studyPrefs };
}

const baseWizardAnswers: PresetWizardAnswers = {
  goal: 'enem',
  dailyHoursByWeekday: makeDailyHours({ seg: 6 }),
  dailyAvailabilityByWeekday: makeDailyAvailability({
    seg: { start: '08:00', end: '20:00' },
  }),
  focusMinutes: 50,
  focusBlockMinutes: 50,
  breakMinutes: 10,
  hardSubjectsPeriodPreference: 'any',
  studyStyle: 'balanced',
  studyContentPreference: 'misto',
  startDate: '2026-03-02',
  examDate: '',
};

const focus45 = generateFromWizard({ ...baseWizardAnswers, focusMinutes: 45, focusBlockMinutes: 45 });
const focus90 = generateFromWizard({ ...baseWizardAnswers, focusMinutes: 90, focusBlockMinutes: 90 });
const focus45Lessons = focus45.schedule.blocks.filter((b) => !b.isBreak && b.type === 'AULA');
const focus90Lessons = focus90.schedule.blocks.filter((b) => !b.isBreak && b.type === 'AULA');
assert.ok(focus45Lessons.length > 0, 'focus 45 should generate lesson blocks');
assert.ok(focus90Lessons.length > 0, 'focus 90 should generate lesson blocks');
assert.ok(focus45Lessons.every((b) => b.durationMinutes === 45), 'focusBlockMinutes=45 should generate 45-min AULA blocks');
assert.ok(focus90Lessons.every((b) => b.durationMinutes === 90), 'focusBlockMinutes=90 should generate 90-min AULA blocks');

const hours2 = generateFromWizard({
  ...baseWizardAnswers,
  dailyHoursByWeekday: makeDailyHours({ seg: 2 }),
  dailyAvailabilityByWeekday: makeDailyAvailability({ seg: { start: '08:00', end: '12:00' } }),
  focusMinutes: 60,
  focusBlockMinutes: 60,
  breakMinutes: 10,
});
const hours4 = generateFromWizard({
  ...baseWizardAnswers,
  dailyHoursByWeekday: makeDailyHours({ seg: 4 }),
  dailyAvailabilityByWeekday: makeDailyAvailability({ seg: { start: '08:00', end: '14:00' } }),
  focusMinutes: 60,
  focusBlockMinutes: 60,
  breakMinutes: 10,
});
const mondayKey = '2026-03-02';
const mondayBlocks2 = hours2.schedule.blocks.filter((b) => !b.isBreak && toLocalKey(new Date(b.date)) === mondayKey);
const mondayBlocks4 = hours4.schedule.blocks.filter((b) => !b.isBreak && toLocalKey(new Date(b.date)) === mondayKey);
assert.ok(mondayBlocks4.length > mondayBlocks2.length, 'dailyHoursByWeekday should increase blocks on that day');

const theoryStyle = generateFromWizard({
  ...baseWizardAnswers,
  dailyHoursByWeekday: makeDailyHours({ seg: 4, ter: 4, qua: 4, qui: 4, sex: 4 }),
  dailyAvailabilityByWeekday: makeDailyAvailability({
    seg: { start: '08:00', end: '13:00' },
    ter: { start: '08:00', end: '13:00' },
    qua: { start: '08:00', end: '13:00' },
    qui: { start: '08:00', end: '13:00' },
    sex: { start: '08:00', end: '13:00' },
  }),
  studyStyle: 'theory',
  studyContentPreference: 'aulas',
  startDate: '2026-03-02',
}, subjects, '2026-03-20');
const practiceStyle = generateFromWizard({
  ...baseWizardAnswers,
  dailyHoursByWeekday: makeDailyHours({ seg: 4, ter: 4, qua: 4, qui: 4, sex: 4 }),
  dailyAvailabilityByWeekday: makeDailyAvailability({
    seg: { start: '08:00', end: '13:00' },
    ter: { start: '08:00', end: '13:00' },
    qua: { start: '08:00', end: '13:00' },
    qui: { start: '08:00', end: '13:00' },
    sex: { start: '08:00', end: '13:00' },
  }),
  studyStyle: 'practice',
  studyContentPreference: 'exercicios',
  startDate: '2026-03-02',
}, subjects, '2026-03-20');
const countType = (blocksList: typeof theoryStyle.schedule.blocks, type: string) =>
  blocksList.filter((b) => !b.isBreak && b.type === type).length;
assert.ok(
  countType(theoryStyle.schedule.blocks, 'AULA') > countType(practiceStyle.schedule.blocks, 'AULA'),
  'studyStyle=theory should increase AULA proportion'
);
assert.ok(
  countType(practiceStyle.schedule.blocks, 'EXERCICIOS') > countType(theoryStyle.schedule.blocks, 'EXERCICIOS'),
  'studyStyle=practice should increase EXERCICIOS proportion'
);

const periodSubjects: Subject[] = [
  { ...subjects[0], id: 'h1', name: 'Matematica Avancada', priority: 8, difficulty: 10, targetHours: 6 },
  { ...subjects[1], id: 'h2', name: 'Fisica Avancada', priority: 8, difficulty: 9, targetHours: 6 },
  { ...subjects[2], id: 'h3', name: 'Quimica Avancada', priority: 8, difficulty: 8, targetHours: 6 },
  { ...subjects[0], id: 'h4', name: 'Raciocinio Logico', priority: 7, difficulty: 8, targetHours: 6 },
  { ...subjects[1], id: 'e1', name: 'Historia', priority: 9, difficulty: 3, targetHours: 6 },
  { ...subjects[2], id: 'e2', name: 'Geografia', priority: 9, difficulty: 3, targetHours: 6 },
  { ...subjects[0], id: 'e3', name: 'Portugues Leitura', priority: 9, difficulty: 4, targetHours: 6 },
  { ...subjects[1], id: 'e4', name: 'Atualidades', priority: 8, difficulty: 3, targetHours: 6 },
];
const periodMorning = generateFromWizard(
  {
    ...baseWizardAnswers,
    goal: 'outros',
    dailyHoursByWeekday: makeDailyHours({ seg: 12, ter: 12 }),
    dailyAvailabilityByWeekday: makeDailyAvailability({
      seg: { start: '08:00', end: '22:00' },
      ter: { start: '08:00', end: '22:00' },
    }),
    focusMinutes: 60,
    focusBlockMinutes: 60,
    breakMinutes: 5,
    hardSubjectsPeriodPreference: 'morning',
  },
  periodSubjects,
  '2026-03-03'
);
const periodNight = generateFromWizard(
  {
    ...baseWizardAnswers,
    goal: 'outros',
    dailyHoursByWeekday: makeDailyHours({ seg: 12, ter: 12 }),
    dailyAvailabilityByWeekday: makeDailyAvailability({
      seg: { start: '08:00', end: '22:00' },
      ter: { start: '08:00', end: '22:00' },
    }),
    focusMinutes: 60,
    focusBlockMinutes: 60,
    breakMinutes: 5,
    hardSubjectsPeriodPreference: 'night',
  },
  periodSubjects,
  '2026-03-03'
);
const morningBucketDifficultyAverage = (blocksList: typeof periodMorning.schedule.blocks) => {
  const values = blocksList
    .filter((b) => !b.isBreak && hmToMinutes(b.startTime) < 12 * 60)
    .map((b) => periodSubjects.find((s) => s.id === b.subjectId)?.difficulty ?? 0);
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
};
assert.ok(
  morningBucketDifficultyAverage(periodMorning.schedule.blocks) >
    morningBucketDifficultyAverage(periodNight.schedule.blocks),
  'hardSubjectsPeriodPreference should prioritize harder subjects in the preferred period'
);

const zeroHoursCase = generateFromWizard(
  {
    ...baseWizardAnswers,
    goal: 'outros',
    dailyHoursByWeekday: makeDailyHours({}),
    dailyAvailabilityByWeekday: makeDailyAvailability({}),
    focusMinutes: 50,
    focusBlockMinutes: 50,
    breakMinutes: 10,
  },
  subjects,
  '2026-03-02'
);
assert.strictEqual(zeroHoursCase.studyPrefs.hoursPerDay, 0, 'wizard must preserve 0h/day');
assert.strictEqual(
  zeroHoursCase.schedule.blocks.filter((b) => !b.isBreak).length,
  0,
  '0h/day must not generate study blocks'
);

console.log('wizard-driven roadmap tests passed');

// ---------------------------------------------------------------------------
// Regressão: geração semana a semana (fluxo real do wizard/planejador)
// ---------------------------------------------------------------------------
const weeklyStart = new Date('2026-03-02T00:00:00');
const weeklyEnd = new Date('2026-03-08T00:00:00');
const studyStart = new Date('2026-01-05T00:00:00');

const buildWeeklyLimits = (from: Date, to: Date) => {
  const limits: Record<string, number> = {};
  const cursor = new Date(from);
  while (cursor <= to) {
    const day = cursor.getDay();
    limits[
      `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(
        cursor.getDate()
      ).padStart(2, '0')}`
    ] = day === 0 ? 0 : 180;
    cursor.setDate(cursor.getDate() + 1);
  }
  return limits;
};

const completedBySubject = Object.fromEntries(subjects.map((subject) => [subject.id, 12]));

const weeklySchedule = generateChronologicalSchedule({
  subjects,
  preferences,
  startDate: weeklyStart,
  endDate: weeklyEnd,
  pedagogicalStartDate: studyStart,
  completedLessonsTotal: 40,
  completedLessonsBySubject: completedBySubject,
  completedPracticeTotal: 30,
  completedPracticeBySubject: completedBySubject,
  completedReviewsBySubject: completedBySubject,
  // Sem simulado concluído ainda: o ciclo está exatamente na etapa de simulado.
  completedSimuladosBySubject: {},
  preferredStart: '09:00',
  preferredEnd: '18:00',
  maxBlockMinutes: 60,
  breakMinutes: 10,
  restDays: [0],
  dailyLimitByDate: buildWeeklyLimits(weeklyStart, weeklyEnd),
  firstCycleAllSubjects: false,
  enableScheduleCache: false,
  simuladoRules: {
    minLessonsBeforeSimulated: 20,
    minLessonsPerSubject: 2,
    minPracticeBeforeSimulated: 12,
    minDaysBeforeSimulated: 14,
    frequencyDays: 7,
    minLessonsBeforeAreaSimulated: 8,
    minDaysBeforeAreaSimulated: 7,
  },
});

assert.ok(
  weeklySchedule.blocks.some(
    (block) => block.type === 'SIMULADO_AREA' || block.type === 'SIMULADO_COMPLETO'
  ),
  'gerar uma semana isolada deve liberar simulado quando o estudante já tem histórico'
);

// Revisões espaçadas que caem fora da janela ficam pendentes e são cobradas depois.
const withPending: typeof weeklySchedule = generateChronologicalSchedule({
  subjects,
  preferences,
  startDate: weeklyStart,
  endDate: weeklyEnd,
  pedagogicalStartDate: studyStart,
  preferredStart: '09:00',
  preferredEnd: '18:00',
  maxBlockMinutes: 60,
  breakMinutes: 10,
  restDays: [0],
  dailyLimitByDate: buildWeeklyLimits(weeklyStart, weeklyEnd),
  firstCycleAllSubjects: true,
  enableScheduleCache: false,
  completedLessonsTotal: 0,
  completedPracticeTotal: 0,
});

const pendingKeys = Object.keys(withPending.pendingReviews ?? {});
assert.ok(pendingKeys.length > 0, 'revisões de 7/30 dias fora da janela devem ficar pendentes');

const nextWeekStart = new Date('2026-03-09T00:00:00');
const nextWeekEnd = new Date('2026-03-15T00:00:00');
const receivingSchedule = generateChronologicalSchedule({
  subjects,
  preferences,
  startDate: nextWeekStart,
  endDate: nextWeekEnd,
  pedagogicalStartDate: studyStart,
  pendingReviews: withPending.pendingReviews,
  preferredStart: '09:00',
  preferredEnd: '18:00',
  maxBlockMinutes: 60,
  breakMinutes: 10,
  restDays: [0],
  dailyLimitByDate: buildWeeklyLimits(nextWeekStart, nextWeekEnd),
  firstCycleAllSubjects: false,
  enableScheduleCache: false,
  completedLessonsTotal: 20,
  completedLessonsBySubject: completedBySubject,
  completedPracticeTotal: 12,
  completedPracticeBySubject: completedBySubject,
  completedReviewsBySubject: completedBySubject,
});

assert.ok(
  receivingSchedule.blocks.some(
    (block) => block.type === 'REVISAO' || block.sessionType === 'revisao'
  ),
  'a semana seguinte deve cobrar as revisões espaçadas pendentes'
);

const activeDayKeys = Object.keys(withPending.pendingReviews ?? {}).filter((dateKey) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getDay() !== 0;
});
assert.strictEqual(
  activeDayKeys.length,
  pendingKeys.length,
  'revisões pendentes não devem cair em dias de descanso'
);

console.log('weekly roadmap scheduling tests passed');
