/**
 * Simulação de 1 ano de uso do Nexora — auditoria do comportamento de longo prazo.
 *
 * Roda a lógica real do app (roadmap, trainer, backlog, analytics) como um estudante
 * que estuda ~5h por dia, 6 dias por semana, durante um ano:
 *  - gera o cronograma toda semana (fluxo do wizard/planejador);
 *  - conclui a maior parte dos blocos, deixando alguns para trás;
 *  - roda o reencaixe de backlog e a gamificação.
 *
 * O objetivo é pegar problemas que só aparecem com meses de uso (fases travadas,
 * simulados que nunca saem, streak impossível, tamanho dos dados no navegador).
 *
 * Rodar com: npm run test:year-simulation
 */

import assert from 'node:assert';
import { createEnemSubjectBank } from '../src/lib/enemCatalog';
import { generateChronologicalSchedule, type PendingReviewsByDate } from '../src/services/roadmapEngine';
import {
  applyBlockCompletionMetrics,
  buildSubjectPerformanceProfiles,
  computeIntelligentAnalyticsSummary,
  inferUserLearningLevel,
} from '../src/services/adaptiveStudyIntelligence';
import {
  buildTrainerSnapshot,
  calculateTrainerCompletionReward,
  type TrainerAchievementUnlock,
  type TrainerXpEvent,
} from '../src/services/studyTrainer';
import { autoRescheduleBacklog } from '../src/services/backlogRescheduler';
import {
  buildCompletedHoursByDate,
  buildCompletedSessionsByDate,
  buildMergedDailyStudyData,
} from '../src/lib/progressSnapshot';
import { parseBlockDate, toLocalDateKey, parseLocalDateKey } from '../src/lib/utils';
import type { AnalyticsStore, StudyBlock, StudyPreferences, Subject, UserSettings } from '../src/types';
import { defaultSettings } from '../src/lib/defaultSettings';

const weekDayKeys = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'] as const;

const START_DATE = new Date(2026, 8, 28); // segunda-feira
const EXAM_DATE = '2027-11-07';
const SIM_DAYS = 365;
const ADHERENCE = 0.86;

/** RNG determinístico (mulberry32) para a auditoria ser reprodutível. */
const createRandom = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const random = createRandom(20260928);

const userSettings: UserSettings = {
  ...defaultSettings,
  name: 'Ana',
  email: 'ana@estudante.dev',
  dailyGoalHours: 5,
  dailyHoursByWeekday: { dom: 0, seg: 5, ter: 5, qua: 5, qui: 5, sex: 5, sab: 5 },
  preferredStart: '14:00',
  preferredEnd: '22:00',
  maxBlockMinutes: 60,
  breakMinutes: 10,
  excludeDays: [0],
  autoSchedule: true,
  smartBreaks: true,
  examDate: EXAM_DATE,
};

const studyPrefs: StudyPreferences = {
  hoursPerDay: 5,
  daysOfWeek: [1, 2, 3, 4, 5, 6],
  mode: 'exam',
  examDate: EXAM_DATE,
  startDate: toLocalDateKey(START_DATE),
  goal: 'enem',
  userLevel: 'intermediario',
  blockDurationMinutes: 60,
  focusBlockMinutes: 60,
  breakDurationMinutes: 10,
};

const subjects: Subject[] = createEnemSubjectBank('user1').map((subject) => ({
  ...subject,
  createdAt: START_DATE,
  updatedAt: START_DATE,
}));

const buildDailyLimitByDate = (start: Date, end: Date) => {
  const limits: Record<string, number> = {};
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const limit = new Date(end);
  limit.setHours(0, 0, 0, 0);
  while (cursor <= limit) {
    const key = weekDayKeys[cursor.getDay()];
    limits[toLocalDateKey(cursor)] = Math.round((userSettings.dailyHoursByWeekday?.[key] ?? 0) * 60);
    cursor.setDate(cursor.getDate() + 1);
  }
  return limits;
};

let blocks: StudyBlock[] = [];
let analytics: AnalyticsStore = { daily: {} };
let xpEvents: TrainerXpEvent[] = [];
let achievements: TrainerAchievementUnlock[] = [];
let pendingReviews: PendingReviewsByDate = {};
let lastSimuladoDate: Date | undefined;
let completedCount = 0;
let skippedCount = 0;
const genTimes: number[] = [];
const anomalies: string[] = [];
const addAnomaly = (message: string) => {
  if (!anomalies.includes(message)) anomalies.push(message);
};

for (let day = 0; day < SIM_DAYS; day += 1) {
  const today = new Date(START_DATE);
  today.setDate(START_DATE.getDate() + day);
  today.setHours(0, 0, 0, 0);

  // Todo domingo o estudante regenera a semana seguinte no planejador.
  if (today.getDay() === 0) {
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() + 1);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const lessonsBySubject: Record<string, number> = {};
    const practiceBySubject: Record<string, number> = {};
    const reviewsBySubject: Record<string, number> = {};
    const simuladosBySubject: Record<string, number> = {};
    let lessonsTotal = 0;
    let practiceTotal = 0;

    blocks.forEach((block) => {
      if (block.status !== 'completed' || block.isBreak) return;
      if (block.type === 'AULA' || block.sessionType === 'teoria') {
        lessonsTotal += 1;
        lessonsBySubject[block.subjectId] = (lessonsBySubject[block.subjectId] || 0) + 1;
      }
      if (block.type === 'EXERCICIOS' || block.sessionType === 'pratica') {
        practiceTotal += 1;
        practiceBySubject[block.subjectId] = (practiceBySubject[block.subjectId] || 0) + 1;
      }
      if (block.type === 'REVISAO' || block.sessionType === 'revisao') {
        reviewsBySubject[block.subjectId] = (reviewsBySubject[block.subjectId] || 0) + 1;
      }
      if (
        block.type === 'SIMULADO_AREA' ||
        block.type === 'SIMULADO_COMPLETO' ||
        block.sessionType === 'simulado'
      ) {
        simuladosBySubject[block.subjectId] = (simuladosBySubject[block.subjectId] || 0) + 1;
      }
    });

    const startedAt = Date.now();
    const schedule = generateChronologicalSchedule({
      subjects,
      preferences: { ...studyPrefs, userLevel: inferUserLearningLevel(studyPrefs, subjects, analytics) },
      startDate: weekStart,
      endDate: weekEnd,
      pedagogicalStartDate: START_DATE,
      pendingReviews,
      lastSimuladoDate,
      preferredStart: userSettings.preferredStart,
      preferredEnd: userSettings.preferredEnd,
      maxBlockMinutes: 60,
      breakMinutes: 10,
      restDays: [0],
      dailyLimitByDate: buildDailyLimitByDate(weekStart, weekEnd),
      firstCycleAllSubjects: true,
      performanceMetricsBySubject: buildSubjectPerformanceProfiles(subjects, analytics, today),
      userLevel: inferUserLearningLevel(studyPrefs, subjects, analytics),
      adaptiveNow: today,
      enableScheduleCache: false,
      completedLessonsTotal: lessonsTotal,
      completedLessonsBySubject: lessonsBySubject,
      completedPracticeTotal: practiceTotal,
      completedPracticeBySubject: practiceBySubject,
      completedReviewsBySubject: reviewsBySubject,
      completedSimuladosBySubject: simuladosBySubject,
      simuladoRules: {
        minLessonsBeforeSimulated: 20,
        minPracticeBeforeSimulated: 12,
        minLessonsPerSubject: 2,
        minDaysBeforeSimulated: 14,
        frequencyDays: 14,
        minLessonsBeforeAreaSimulated: 8,
        minDaysBeforeAreaSimulated: 7,
      },
    });
    genTimes.push(Date.now() - startedAt);

    const dailyLimits = buildDailyLimitByDate(weekStart, weekEnd);
    const byDate = new Map<string, StudyBlock[]>();
    schedule.blocks.forEach((block) => {
      const key = toLocalDateKey(parseBlockDate(block.date));
      byDate.set(key, [...(byDate.get(key) ?? []), block]);
    });

    byDate.forEach((dayBlocks, key) => {
      const date = parseBlockDate(key);
      if (date.getDay() === 0 && dayBlocks.some((block) => !block.isBreak)) {
        addAnomaly(`Bloco agendado no domingo (${key})`);
      }

      const studyMinutes = dayBlocks
        .filter((block) => !block.isBreak)
        .reduce((sum, block) => sum + block.durationMinutes, 0);
      const limit = dailyLimits[key] ?? 0;
      if (studyMinutes > limit) {
        addAnomaly(`Dia ${key} estourou o limite diário (${studyMinutes}min > ${limit}min)`);
      }

      const ordered = [...dayBlocks].sort((a, b) => a.startTime.localeCompare(b.startTime));
      for (let index = 1; index < ordered.length; index += 1) {
        const previous = ordered[index - 1];
        const current = ordered[index];
        const previousEnd = Number(previous.endTime.split(':')[0]) * 60 + Number(previous.endTime.split(':')[1]);
        const currentStart =
          Number(current.startTime.split(':')[0]) * 60 + Number(current.startTime.split(':')[1]);
        if (currentStart < previousEnd) {
          addAnomaly(
            `Blocos sobrepostos em ${key}: ${previous.startTime}-${previous.endTime} e ${current.startTime}-${current.endTime}`
          );
        }
      }
    });

    const ids = new Set<string>();
    schedule.blocks.forEach((block) => {
      if (ids.has(block.id)) addAnomaly('IDs de bloco duplicados');
      ids.add(block.id);
    });

    blocks = [
      ...blocks.filter((block) => {
        const blockDate = parseBlockDate(block.date);
        return blockDate < weekStart || blockDate > weekEnd;
      }),
      ...schedule.blocks,
    ];

    const carried: PendingReviewsByDate = { ...(schedule.pendingReviews || {}) };
    Object.entries(pendingReviews).forEach(([dateKey, subjectIds]) => {
      const parsed = parseLocalDateKey(dateKey);
      if (!parsed || parsed > weekEnd) carried[dateKey] = subjectIds;
    });
    pendingReviews = carried;

    const lastSimulado = schedule.blocks
      .filter(
        (block) => block.type === 'SIMULADO_AREA' || block.type === 'SIMULADO_COMPLETO'
      )
      .map((block) => parseBlockDate(block.date))
      .sort((a, b) => b.getTime() - a.getTime())[0];
    if (lastSimulado) lastSimuladoDate = lastSimulado;
  }

  // Execução do dia
  const dayBlocks = blocks
    .filter(
      (block) =>
        !block.isBreak && toLocalDateKey(parseBlockDate(block.date)) === toLocalDateKey(today)
    )
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  for (const block of dayBlocks) {
    if (random() > ADHERENCE) {
      skippedCount += 1;
      continue;
    }

    const minutesSpent = Math.round(block.durationMinutes * (0.8 + random() * 0.35));
    const subject = subjects.find((item) => item.id === block.subjectId);
    const completionMoment = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 15, 0, 0);

    const result = applyBlockCompletionMetrics({
      analytics,
      block,
      subject,
      minutesSpent,
      correctAnswers: Math.round(minutesSpent / 6),
      totalQuestions: Math.round(minutesSpent / 5),
      now: completionMoment,
    });
    analytics = result.analytics;

    const completedBlock: StudyBlock = {
      ...block,
      status: 'completed',
      completedAt: completionMoment,
    };
    blocks = blocks.map((item) => (item.id === block.id ? completedBlock : item));

    // Igual ao app: a recompensa é calculada com o estado anterior do bloco e a
    // lista de blocos já atualizada.
    const reward = calculateTrainerCompletionReward({
      block,
      minutesSpent,
      plannerBlocks: blocks,
      analytics,
      subjects,
      studyPrefs,
      userSettings,
      xpEvents,
      unlockedAchievements: achievements,
      now: completionMoment,
    });
    xpEvents = [
      ...xpEvents,
      ...reward.events.filter(
        (event) => !xpEvents.some((existing) => existing.eventKey === event.eventKey)
      ),
    ];
    achievements = [
      ...achievements,
      ...reward.newAchievements.filter(
        (achievement) =>
          !achievements.some((existing) => existing.achievementId === achievement.achievementId)
      ),
    ];
    completedCount += 1;
  }

  // Todo domingo o app tenta reencaixar o backlog.
  if (today.getDay() === 0) {
    const backlog = autoRescheduleBacklog({
      blocks,
      today,
      dailyLimitByDate: buildDailyLimitByDate(today, new Date(today.getTime() + 13 * 86400000)),
      allowedDays: [1, 2, 3, 4, 5, 6],
      breakMinutes: 10,
      lookaheadDays: 10,
    });
    blocks = backlog.blocks;
    if (backlog.movedCount > 60) {
      addAnomaly(`Backlog moveu ${backlog.movedCount} blocos de uma vez`);
    }
  }
}

const end = new Date(2027, 8, 28);
const merged = buildMergedDailyStudyData(
  analytics.daily,
  buildCompletedHoursByDate(blocks),
  buildCompletedSessionsByDate(blocks)
);
const summary = computeIntelligentAnalyticsSummary({
  analytics: { ...analytics, daily: merged },
  subjects,
  studyPrefs,
  now: end,
});
const snapshot = buildTrainerSnapshot({
  plannerBlocks: blocks,
  analytics,
  subjects,
  studyPrefs,
  userSettings,
  xpEvents,
  unlockedAchievements: achievements,
  now: end,
});

const typeCounts = blocks.reduce<Record<string, number>>((acc, block) => {
  if (block.isBreak) return acc;
  const key = block.type ?? block.sessionType ?? 'sem-tipo';
  acc[key] = (acc[key] ?? 0) + 1;
  return acc;
}, {});

const storeSizes = {
  plannerBlocks: JSON.stringify(blocks).length,
  analytics: JSON.stringify(analytics).length,
  subjects: JSON.stringify(subjects).length,
  xpEvents: JSON.stringify(xpEvents).length,
};
const totalStoreBytes =
  storeSizes.plannerBlocks + storeSizes.analytics + storeSizes.subjects + storeSizes.xpEvents;

console.log('===== SIMULAÇÃO DE 1 ANO =====');
console.log('Blocos por tipo:', typeCounts);
console.log(`Blocos: ${blocks.length} | concluídos: ${completedCount} | não feitos: ${skippedCount}`);
console.log(
  `Geração de semana: média ${(genTimes.reduce((a, b) => a + b, 0) / genTimes.length).toFixed(1)}ms, máx ${Math.max(...genTimes)}ms`
);
console.log(`XP: ${snapshot.totalXp} | nível ${snapshot.level} | sequência: ${snapshot.streak} dias`);
console.log(`Conquistas: ${achievements.length}`);
console.log('Resumo inteligente:', summary.weakestSubject?.name, '|', summary.avgAccuracyRate);
console.log(
  `Dados no navegador: ${(totalStoreBytes / 1024).toFixed(0)} KB (blocos ${(storeSizes.plannerBlocks / 1024).toFixed(0)} KB)`
);
console.log('Anomalias:', anomalies.length === 0 ? 'nenhuma' : anomalies);

assert.strictEqual(anomalies.length, 0, `Anomalias encontradas na simulação: ${anomalies.join('; ')}`);
assert.ok(
  (typeCounts.SIMULADO_AREA ?? 0) + (typeCounts.SIMULADO_COMPLETO ?? 0) > 0,
  'um ano de estudo precisa ter simulados (gerando semana a semana)'
);
assert.ok((typeCounts.REVISAO ?? 0) > 0, 'um ano de estudo precisa ter revisões');
assert.ok((typeCounts.AULA ?? 0) > 0, 'um ano de estudo precisa continuar tendo aulas');
assert.ok((typeCounts.EXERCICIOS ?? 0) > 0, 'um ano de estudo precisa ter exercícios');
assert.ok(
  snapshot.streak > 7,
  'a sequência precisa passar de 7 dias para quem estuda 6x por semana com 1 dia de descanso'
);
assert.ok(
  totalStoreBytes < 4 * 1024 * 1024,
  `dados de um ano muito grandes para o navegador: ${(totalStoreBytes / 1024 / 1024).toFixed(2)} MB`
);

console.log('year simulation tests passed');
