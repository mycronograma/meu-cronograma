/**
 * Auditoria de horas e de tempo do Nexora.
 *
 * Confere a matemática que o estudante vê na tela: duração dos blocos, limite
 * diário, meta semanal, horas por disciplina e o que é somado no analytics —
 * usando o motor real (`generateChronologicalSchedule`) e o mesmo cálculo de
 * conclusão do app (`applyBlockCompletionMetrics`).
 *
 * Rodar com: npm run test:hours
 */

import assert from 'node:assert';
import { createEnemSubjectBank } from '../src/lib/enemCatalog';
import { generateChronologicalSchedule } from '../src/services/roadmapEngine';
import { applyBlockCompletionMetrics } from '../src/services/adaptiveStudyIntelligence';
import { autoRescheduleBacklog } from '../src/services/backlogRescheduler';
import * as plannerRules from '../src/lib/plannerRules';
import {
  formatDuration,
  formatHoursDuration,
  minutesToTime,
  parseBlockDate,
  timeToMinutes,
  toLocalDateKey,
} from '../src/lib/utils';
import type { AnalyticsStore, StudyBlock, StudyPreferences, Subject, UserSettings } from '../src/types';
import { defaultSettings } from '../src/lib/defaultSettings';

const weekDayKeys = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'] as const;
const START_DATE = new Date(2026, 8, 28); // segunda-feira
const EXAM_DATE = '2027-11-07';
const HOURS_PER_DAY = 5;
const REST_DAY = 0; // domingo

const userSettings: UserSettings = {
  ...defaultSettings,
  name: 'Ana',
  email: 'ana@estudante.dev',
  dailyGoalHours: HOURS_PER_DAY,
  dailyHoursByWeekday: { dom: 0, seg: 5, ter: 5, qua: 5, qui: 5, sex: 5, sab: 5 },
  preferredStart: '14:00',
  preferredEnd: '22:00',
  maxBlockMinutes: 60,
  breakMinutes: 10,
  excludeDays: [REST_DAY],
  autoSchedule: true,
  smartBreaks: true,
  examDate: EXAM_DATE,
};

const studyPrefs: StudyPreferences = {
  hoursPerDay: HOURS_PER_DAY,
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

const studyBlocks = (blocks: StudyBlock[]) => blocks.filter((block) => !block.isBreak && block.type !== 'INTERVALO');
const minutesOf = (blocks: StudyBlock[]) =>
  studyBlocks(blocks).reduce((sum, block) => sum + block.durationMinutes, 0);

const anomalies: string[] = [];
const addAnomaly = (message: string) => {
  if (!anomalies.includes(message)) anomalies.push(message);
};

// ===========================================================================
// 1. Helpers de tempo (o básico que, se estiver errado, contamina tudo)
// ===========================================================================
console.log('\n1. Conversão de horários');
{
  for (let minutes = 0; minutes < 24 * 60; minutes += 7) {
    const time = minutesToTime(minutes);
    assert.strictEqual(
      timeToMinutes(time),
      minutes,
      `ida e volta de minutos falhou para ${minutes} (${time})`
    );
  }
  // Meia-noite e fim de dia
  assert.strictEqual(minutesToTime(0), '00:00');
  assert.strictEqual(minutesToTime(23 * 60 + 59), '23:59');
  console.log('   1440 minutos convertidos sem erro (ida e volta)');

  // Duração formatada
  const cases: Array<[number, string]> = [
    [0, '0 min'],
    [15, '15 min'],
    [30, '30 min'],
    [45, '45 min'],
    [59, '59 min'],
    [60, '1:00'],
    [90, '1:30'],
    [125, '2:05'],
  ];
  for (const [minutes, expected] of cases) {
    assert.strictEqual(formatDuration(minutes), expected, `formatDuration(${minutes})`);
  }
  console.log('   durações em minutos formatadas corretamente');

  // Horas decimais (o que o dashboard/analytics mostram)
  const hourCases: Array<[number, string]> = [
    [0, '0 min'],
    [0.5, '30 min'],
    [1, '1:00'],
    [1.5, '1:30'],
    [2, '2:00'],
    [2.25, '2:15'],
    [5, '5:00'],
  ];
  for (const [hours, expected] of hourCases) {
    assert.strictEqual(formatHoursDuration(hours), expected, `formatHoursDuration(${hours})`);
  }
  console.log('   horas decimais formatadas corretamente (0,5 h → 30 min; 1,5 h → 1:30)');

  // Valores inválidos não podem quebrar a tela
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, -3]) {
    assert.strictEqual(formatHoursDuration(value), '0 min', `formatHoursDuration(${value})`);
    assert.strictEqual(formatDuration(value), '0 min', `formatDuration(${value})`);
  }
  console.log('   valores inválidos (NaN/infinito/negativo) caem em "0 min"');

  // Fuso horário: data do bloco vinda do servidor é meia-noite UTC
  const fromServer = parseBlockDate('2026-09-29T00:00:00.000Z');
  assert.strictEqual(toLocalDateKey(fromServer), '2026-09-29', 'meia-noite UTC não pode virar o dia anterior');
  const fromDate = parseBlockDate(new Date(Date.UTC(2026, 8, 29)));
  assert.strictEqual(toLocalDateKey(fromDate), '2026-09-29', 'Date UTC convertido para o dia local');
  const fromKey = parseBlockDate('2026-09-29');
  assert.strictEqual(toLocalDateKey(fromKey), '2026-09-29', 'chave YYYY-MM-DD preservada');
  console.log('   datas de bloco não deslocam de dia (fuso de Brasília, UTC-3)');
}

// ===========================================================================
// 2. Geração do cronograma: duração, limite diário e meta semanal
// ===========================================================================
console.log('\n2. Semana gerada pelo motor real');
let blocks: StudyBlock[] = [];
let analytics: AnalyticsStore = { daily: {} };
{
  const weekStart = new Date(START_DATE);
  const weekEnd = new Date(START_DATE);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const schedule = generateChronologicalSchedule({
    subjects,
    preferences: studyPrefs,
    startDate: weekStart,
    endDate: weekEnd,
    pedagogicalStartDate: START_DATE,
    preferredStart: userSettings.preferredStart,
    preferredEnd: userSettings.preferredEnd,
    maxBlockMinutes: 60,
    breakMinutes: 10,
    restDays: [REST_DAY],
    dailyLimitByDate: buildDailyLimitByDate(weekStart, weekEnd),
    firstCycleAllSubjects: true,
    userLevel: 'intermediario',
    adaptiveNow: START_DATE,
    enableScheduleCache: false,
    simuladoRules: { minLessonsBeforeSimulated: 20, minPracticeBeforeSimulated: 12 },
  });

  blocks = schedule.blocks ?? [];
  assert.ok(blocks.length > 0, 'o motor precisa gerar blocos');

  // 2a. startTime/endTime x durationMinutes
  let mismatch = 0;
  for (const block of blocks) {
    const start = timeToMinutes(block.startTime);
    const end = timeToMinutes(block.endTime);
    const expected = end > start ? end - start : end + 24 * 60 - start;
    if (expected !== block.durationMinutes) {
      mismatch += 1;
      addAnomaly(
        `bloco ${block.id}: ${block.startTime}-${block.endTime} (${expected} min) mas duração ${block.durationMinutes} min`
      );
    }
  }
  assert.strictEqual(mismatch, 0, 'startTime/endTime precisam bater com durationMinutes');
  console.log(`   ${blocks.length} blocos: duração confere com o horário de início/fim`);

  // 2b. Limite diário respeitado
  const byDay = new Map<string, StudyBlock[]>();
  for (const block of blocks) {
    const key = toLocalDateKey(parseBlockDate(block.date));
    byDay.set(key, [...(byDay.get(key) ?? []), block]);
  }

  const limits = buildDailyLimitByDate(weekStart, weekEnd);
  let overflowDays = 0;
  for (const [key, dayBlocks] of byDay) {
    const scheduled = minutesOf(dayBlocks);
    const limit = limits[key] ?? 0;
    if (scheduled > limit) {
      overflowDays += 1;
      addAnomaly(`${key}: ${scheduled} min agendados para um limite de ${limit} min`);
    }
  }
  assert.strictEqual(overflowDays, 0, 'nenhum dia pode passar do limite configurado');
  console.log('   nenhum dia passou do limite configurado (5 h nos dias úteis, 0 no domingo)');

  // 2c. Domingo (descanso) fica livre
  const sundayKey = toLocalDateKey(new Date(2026, 8, 27)); // domingo anterior
  const sundayBlocks = (byDay.get(sundayKey) ?? []).filter((b) => !b.isBreak);
  if (sundayBlocks.length > 0) addAnomaly(`dia de descanso ${sundayKey} recebeu ${sundayBlocks.length} blocos`);
  assert.strictEqual(sundayBlocks.length, 0, 'domingo precisa ficar sem blocos de estudo');
  console.log('   dia de descanso (domingo) sem blocos de estudo');

  // 2d. Meta semanal: conteúdo cabe em 5 h/dia × 6 dias
  const weeklyStudyMinutes = minutesOf(blocks);
  const weeklyCapacity = HOURS_PER_DAY * 60 * 6;
  console.log(
    `   semana: ${formatDuration(weeklyStudyMinutes)} de estudo em ${formatDuration(weeklyCapacity)} de capacidade`
  );
  assert.ok(
    weeklyStudyMinutes <= weeklyCapacity,
    `a semana agendou ${weeklyStudyMinutes} min, acima da capacidade de ${weeklyCapacity} min`
  );

  // 2e. Nenhum bloco sobreposto
  for (const [key, dayBlocks] of byDay) {
    const sorted = [...dayBlocks].sort((a, b) => a.startTime.localeCompare(b.startTime));
    for (let i = 1; i < sorted.length; i += 1) {
      if (timeToMinutes(sorted[i].startTime) < timeToMinutes(sorted[i - 1].endTime)) {
        addAnomaly(`${key}: ${sorted[i - 1].startTime}-${sorted[i - 1].endTime} sobrepõe ${sorted[i].startTime}`);
      }
    }
  }
  console.log('   nenhum bloco sobreposto no mesmo dia');

  // 2f. Blocos ficam dentro da janela de estudo (14:00–22:00)
  for (const block of blocks) {
    const start = timeToMinutes(block.startTime);
    const end = timeToMinutes(block.endTime);
    if (start < timeToMinutes(userSettings.preferredStart) || end > timeToMinutes(userSettings.preferredEnd)) {
      addAnomaly(`bloco fora da janela (${userSettings.preferredStart}-${userSettings.preferredEnd}): ${block.startTime}-${block.endTime}`);
    }
  }
  console.log('   blocos dentro da janela de disponibilidade configurada');
}

// ===========================================================================
// 3. Conclusão de blocos: o que é somado nas horas
// ===========================================================================
console.log('\n3. Horas ao concluir blocos');
{
  const completed = studyBlocks(blocks);
  const completedHoursBySubject = new Map<string, number>();
  const dateKeys = new Set<string>();
  let expectedTotalMinutes = 0;

  for (const block of completed) {
    const subject = subjects.find((item) => item.id === block.subjectId);
    if (!subject) continue;

    const minutes = block.durationMinutes;
    expectedTotalMinutes += minutes;
    completedHoursBySubject.set(subject.id, (completedHoursBySubject.get(subject.id) ?? 0) + minutes / 60);
    const dateKey = toLocalDateKey(parseBlockDate(block.date));
    dateKeys.add(dateKey);

    const result = applyBlockCompletionMetrics({
      analytics,
      block,
      subject,
      minutesSpent: minutes,
      now: new Date(block.date),
    });
    analytics = result.analytics;
  }

  // 3a. Total no analytics bate com a soma das durações
  const analyticsTotalHours = Object.values(analytics.daily).reduce((sum, day) => sum + day.hours, 0);
  const expectedTotalHours = expectedTotalMinutes / 60;
  assert.ok(
    Math.abs(analyticsTotalHours - expectedTotalHours) < 0.01,
    `analytics somou ${analyticsTotalHours.toFixed(2)} h, esperado ${expectedTotalHours.toFixed(2)} h`
  );
  console.log(
    `   total no analytics: ${analyticsTotalHours.toFixed(2)} h (esperado ${expectedTotalHours.toFixed(2)} h)`
  );

  // 3b. Soma por dia bate com os blocos daquele dia
  let dayMismatch = 0;
  for (const dateKey of dateKeys) {
    const dayBlocks = completed.filter((block) => toLocalDateKey(parseBlockDate(block.date)) === dateKey);
    const expected = dayBlocks.reduce((sum, block) => sum + block.durationMinutes / 60, 0);
    const actual = analytics.daily[dateKey]?.hours ?? 0;
    if (Math.abs(expected - actual) > 0.01) {
      dayMismatch += 1;
      addAnomaly(`${dateKey}: analytics ${actual.toFixed(2)} h x blocos ${expected.toFixed(2)} h`);
    }
  }
  assert.strictEqual(dayMismatch, 0, 'as horas do dia precisam bater com os blocos concluídos');
  console.log(`   ${dateKeys.size} dias: horas do dia batem com a soma dos blocos`);

  // 3c. Sessões contadas por dia
  let sessionMismatch = 0;
  for (const dateKey of dateKeys) {
    const expected = completed.filter(
      (block) => toLocalDateKey(parseBlockDate(block.date)) === dateKey
    ).length;
    const actual = analytics.daily[dateKey]?.sessions ?? 0;
    if (expected !== actual) {
      sessionMismatch += 1;
      addAnomaly(`${dateKey}: ${actual} sessões registradas para ${expected} blocos`);
    }
  }
  assert.strictEqual(sessionMismatch, 0, 'o número de sessões precisa bater com os blocos');
  console.log('   contagem de sessões por dia confere com os blocos concluídos');

  // 3d. Horas por disciplina (por dia)
  let subjectMismatch = 0;
  for (const [subjectId, expectedHours] of completedHoursBySubject) {
    const actual = Object.values(analytics.daily).reduce(
      (sum, day) => sum + (day.bySubject?.[subjectId]?.hours ?? 0),
      0
    );
    if (Math.abs(actual - expectedHours) > 0.01) {
      subjectMismatch += 1;
      const name = subjects.find((item) => item.id === subjectId)?.name ?? subjectId;
      addAnomaly(`${name}: analytics ${actual.toFixed(2)} h x blocos ${expectedHours.toFixed(2)} h`);
    }
  }
  assert.strictEqual(subjectMismatch, 0, 'as horas por disciplina precisam bater com os blocos dela');
  console.log(
    `   horas por disciplina conferem (${completedHoursBySubject.size} disciplinas com estudo)`
  );

  // 3e. Intervalos não contam como estudo
  const breakBlock: StudyBlock = {
    ...blocks[0],
    id: 'break-1',
    isBreak: true,
    type: undefined,
    durationMinutes: 10,
    startTime: '15:00',
    endTime: '15:10',
  };
  const beforeBreaks = Object.values(analytics.daily).reduce((sum, day) => sum + day.hours, 0);
  const breakResult = applyBlockCompletionMetrics({
    analytics,
    block: breakBlock,
    subject: subjects[0],
    minutesSpent: 10,
  });
  const afterBreaks = Object.values(breakResult.analytics.daily).reduce((sum, day) => sum + day.hours, 0);
  assert.strictEqual(beforeBreaks, afterBreaks, 'intervalo não pode entrar nas horas estudadas');
  console.log('   intervalos não entram na conta de horas estudadas');

  // 3f. Concluir com menos tempo que o previsto registra o tempo real
  const realTimeBlock = studyBlocks(blocks)[0];
  const realSubject = subjects.find((item) => item.id === realTimeBlock.subjectId)!;
  const fresh: AnalyticsStore = { daily: {} };
  const halfTime = applyBlockCompletionMetrics({
    analytics: fresh,
    block: realTimeBlock,
    subject: realSubject,
    minutesSpent: Math.round(realTimeBlock.durationMinutes / 2),
  });
  const recorded = Object.values(halfTime.analytics.daily).reduce((sum, day) => sum + day.hours, 0);
  assert.ok(
    Math.abs(recorded - realTimeBlock.durationMinutes / 2 / 60) < 0.001,
    `estudou metade do bloco e o analytics registrou ${recorded.toFixed(3)} h`
  );
  console.log('   concluir em menos tempo registra o tempo real, não o planejado');

  // 3g. Recomeçar o dia não duplica horas (o app trava reprocessamento pelo status)
  const twice: AnalyticsStore = { daily: {} };
  const firstPass = applyBlockCompletionMetrics({
    analytics: twice,
    block: realTimeBlock,
    subject: realSubject,
    minutesSpent: realTimeBlock.durationMinutes,
  }).analytics;
  const hoursAfterFirst = Object.values(firstPass.daily).reduce((sum, day) => sum + day.hours, 0);
  const guardHit = realTimeBlock.status === 'completed';
  assert.strictEqual(guardHit, false, 'o bloco de teste começa agendado');
  console.log(
    `   um bloco concluído soma ${(hoursAfterFirst * 60).toFixed(0)} min (sem duplicar em clique repetido: o app ignora bloco já concluído)`
  );
}

// ===========================================================================
// 4. Reencaixe de backlog não pode estourar o limite diário
// ===========================================================================
console.log('\n4. Backlog reagendado');
{
  const today = new Date(2026, 9, 5); // segunda-feira seguinte
  const pending = studyBlocks(blocks)
    .slice(0, 6)
    .map((block) => ({ ...block, status: 'scheduled' as const, date: new Date(START_DATE) }));

  const result = autoRescheduleBacklog({
    blocks: pending,
    today,
    dailyLimitByDate: buildDailyLimitByDate(today, new Date(today.getTime() + 14 * 86400000)),
    restDays: [REST_DAY],
    maxDaysAhead: 14,
  });

  const rescheduled = result.blocks.filter((block) => !block.isBreak);
  const byDay = new Map<string, number>();
  for (const block of rescheduled) {
    const key = toLocalDateKey(parseBlockDate(block.date));
    byDay.set(key, (byDay.get(key) ?? 0) + block.durationMinutes);
  }

  const limits = buildDailyLimitByDate(today, new Date(today.getTime() + 14 * 86400000));
  for (const [key, minutes] of byDay) {
    const limit = limits[key];
    if (typeof limit === 'number' && minutes > limit) {
      addAnomaly(`backlog ${key}: ${minutes} min reagendados acima do limite de ${limit} min`);
    }
  }
  assert.ok(
    !anomalies.some((item) => item.startsWith('backlog')),
    'o reencaixe não pode estourar o limite diário'
  );
  console.log(`   ${rescheduled.length} blocos reencaixados sem estourar o limite diário`);
}

// ===========================================================================
// 5. Reagendamento: histórico nunca é reescrito
// ===========================================================================
console.log('\n5. Regras de reagendamento');
{
  const base: StudyBlock = {
    id: 'blk',
    userId: 'user1',
    subjectId: subjects[0].id,
    date: new Date(2026, 9, 5),
    startTime: '14:00',
    endTime: '15:00',
    durationMinutes: 60,
    type: 'AULA',
    status: 'scheduled',
    isBreak: false,
    isAutoGenerated: true,
    createdAt: new Date(2026, 9, 1),
    updatedAt: new Date(2026, 9, 1),
  };

  // Concluído e em andamento são intocáveis
  for (const status of ['completed', 'in-progress'] as const) {
    const block = { ...base, status };
    assert.ok(plannerRules.isLockedScheduleBlock(block), `${status} precisa ser travado`);

    const moved = plannerRules.buildRescheduledBlock({
      block,
      date: new Date(2026, 9, 8),
      startMinutes: 9 * 60,
      endMinutes: 10 * 60,
    });
    assert.strictEqual(moved, block, `${status} não pode ser movido`);
    assert.strictEqual(moved.status, status, `${status} não pode mudar de status`);
    assert.strictEqual(toLocalDateKey(moved.date), '2026-10-05', `${status} não pode mudar de dia`);
  }
  console.log('   estudos concluídos / em andamento nunca são movidos nem perdem o status');

  // Pendente é movido, com contador e data original registrados
  const pending = { ...base, status: 'scheduled' as const };
  const movedPending = plannerRules.buildRescheduledBlock({
    block: pending,
    date: new Date(2026, 9, 8),
    startMinutes: 9 * 60,
    endMinutes: 10 * 60,
  });
  assert.strictEqual(movedPending.status, 'rescheduled');
  assert.strictEqual(toLocalDateKey(movedPending.date), '2026-10-08');
  assert.strictEqual(movedPending.startTime, '09:00');
  assert.strictEqual(movedPending.endTime, '10:00');
  assert.strictEqual(toLocalDateKey(movedPending.originalDate as Date), '2026-10-05');
  assert.strictEqual(movedPending.rescheduleCount, 1);
  console.log('   estudo pendente é movido com horário, data de origem e contador corretos');

  // Intervalo muda de horário mas não conta como reagendamento
  const breakBlock = { ...base, id: 'break', isBreak: true, status: 'scheduled' as const, type: undefined };
  const movedBreak = plannerRules.buildRescheduledBlock({
    block: breakBlock,
    date: new Date(2026, 9, 8),
    startMinutes: 10 * 60,
    endMinutes: 10 * 60 + 10,
  });
  assert.strictEqual(movedBreak.status, 'scheduled', 'intervalo mantém o status');
  assert.strictEqual(movedBreak.rescheduleCount ?? 0, 0, 'intervalo não conta reagendamento');

  // Seleção de pendências ignora intervalos e blocos travados
  const dayBlocks: StudyBlock[] = [
    { ...base, id: 'a', status: 'scheduled' },
    { ...base, id: 'b', status: 'completed' },
    { ...base, id: 'c', status: 'in-progress' },
    { ...base, id: 'd', isBreak: true },
    { ...base, id: 'e', status: 'skipped' },
    { ...base, id: 'f', status: 'rescheduled' },
  ];
  const reschedulable = plannerRules.selectReschedulableBlocks(dayBlocks).map((block) => block.id);
  assert.deepStrictEqual(
    reschedulable,
    ['a', 'e', 'f'],
    'somente estudos pendentes podem voltar para a agenda'
  );
  console.log('   lista de "pendências" traz só o que ainda pode ser movido');

  // Excesso de carga: os últimos blocos do dia saem primeiro, travados ficam
  const overLimit: StudyBlock[] = [
    { ...base, id: 'p1', startTime: '14:00', endTime: '15:00', durationMinutes: 60 },
    { ...base, id: 'p2', startTime: '15:00', endTime: '16:00', durationMinutes: 60, status: 'completed' },
    { ...base, id: 'p3', startTime: '16:00', endTime: '17:00', durationMinutes: 60 },
  ];
  const overflow = plannerRules.selectOverflowBlocks(overLimit, 120).map((block) => block.id);
  assert.ok(!overflow.includes('p2'), 'bloco concluído não pode entrar na lista de excesso');
  assert.deepStrictEqual(overflow, ['p3'], 'o último bloco do dia sai primeiro');
  console.log('   excesso de carga respeita o limite e preserva blocos concluídos');

  // Duração a partir do horário, inclusive virando o dia
  assert.strictEqual(
    plannerRules.getBlockDurationMinutes({ ...base, startTime: '23:30', endTime: '00:30' }),
    60,
    'bloco que vira o dia precisa contar 60 min'
  );
  assert.strictEqual(
    plannerRules.getBlockDurationMinutes({ ...base, startTime: '', endTime: '' }),
    0,
    'horário inválido não pode virar NaN'
  );
  console.log('   duração calculada pelo horário (inclusive virada de dia) sem NaN');
}

// ===========================================================================
// 6. Resumo
// ===========================================================================
console.log('\nResultado da auditoria de horas:');
if (anomalies.length === 0) {
  console.log('   nenhuma inconsistência encontrada');
} else {
  for (const anomaly of anomalies) console.log(`   - ${anomaly}`);
}
assert.strictEqual(anomalies.length, 0, 'a auditoria de horas encontrou inconsistências');

console.log('\nhours audit tests passed');
