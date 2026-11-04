import type {
  StudyBlock,
  StudyBlockType,
  Subject,
  StudyPreferences,
  SubjectPerformanceProfile,
  UserLearningLevel,
} from '@/types';
import {
  generateId,
  minutesToTime,
  timeToMinutes,
  toLocalDateKey,
  parseBlockDate,
  parseLocalDateKey,
} from '@/lib/utils';
import {
  getEnemDisciplineByName,
  isEnemGoal,
  normalizeEnemText,
  type EnemOfficialArea,
} from '@/lib/enemCatalog';
import {
  buildScheduleComputationFingerprint,
  computeAdaptivePriorityScore,
  getEnemWeightForSubject,
} from '@/services/adaptiveStudyIntelligence';

export type SubjectArea =
  | EnemOfficialArea
  | 'exatas'
  | 'humanas'
  | 'biologicas'
  | 'linguagens'
  | 'geral';
export type SubjectLevel = 'basico' | 'intermediario' | 'avancado';
export type SessionType = 'teoria' | 'pratica' | 'revisao' | 'simulado';

export interface SubjectMeta {
  area: SubjectArea;
  nivel: SubjectLevel;
  pesoNoExame: number;
  enemWeight: number;
  prerequisitos?: string[];
  tipo?: SessionType;
}

/**
 * Revisões espaçadas que ficaram pendentes fora da janela gerada.
 * Chave = data (YYYY-MM-DD), valor = ids das disciplinas que precisam de revisão nesse dia.
 */
export type PendingReviewsByDate = Record<string, string[]>;

export interface ChronologicalScheduleConfig {
  subjects: Subject[];
  preferences: StudyPreferences;
  targetDate?: Date;
  startDate: Date;
  endDate: Date;
  /**
   * Início real da jornada de estudos (não o início da janela gerada).
   * Usado para fases pedagógicas e liberação de simulados. Sem ele, gerar o
   * cronograma semana a semana nunca libera simulado (o contador começa do zero
   * a cada geração).
   */
  pedagogicalStartDate?: Date;
  /** Revisões espaçadas pendentes de gerações anteriores. */
  pendingReviews?: PendingReviewsByDate;
  /** Data do último simulado já concluído/agendado, para respeitar o intervalo entre simulados. */
  lastSimuladoDate?: Date;
  preferredStart: string;
  preferredEnd: string;
  maxBlockMinutes: number;
  breakMinutes: number;
  restDays?: number[];
  dailyLimitByDate?: Record<string, number>;
  dailyTimeWindowByDate?: Record<string, { start: string; end: string }>;
  firstCycleAllSubjects?: boolean;
  completedLessonsTotal?: number;
  completedLessonsBySubject?: Record<string, number>;
  completedPracticeTotal?: number;
  completedPracticeBySubject?: Record<string, number>;
  completedReviewsBySubject?: Record<string, number>;
  completedSimuladosBySubject?: Record<string, number>;
  performanceMetricsBySubject?: Record<string, SubjectPerformanceProfile>;
  userLevel?: UserLearningLevel;
  adaptiveNow?: Date;
  enableScheduleCache?: boolean;
  simuladoRules?: {
    minLessonsBeforeSimulated: number;
    minLessonsPerSubject?: number;
    minPracticeBeforeSimulated?: number;
    minDaysBeforeSimulated: number;
    frequencyDays: number;
    minLessonsBeforeAreaSimulated?: number;
    minDaysBeforeAreaSimulated?: number;
  };
  debug?: boolean;
}

export interface ChronologicalScheduleResult {
  blocks: StudyBlock[];
  totalHours: number;
  subjectDistribution: Record<string, number>;
  phaseByDate: Record<string, string>;
  debugLog: string[];
  /** Revisões espaçadas que caíram depois do fim da janela e devem voltar na próxima geração. */
  pendingReviews: PendingReviewsByDate;
  cacheHit?: boolean;
}

const AREA_ROTATION: SubjectArea[] = [
  'matematica',
  'linguagens',
  'natureza',
  'humanas',
  'matematica',
  'linguagens',
  'natureza',
  'humanas',
];

const SUBJECT_AREA_MAP: Record<string, SubjectArea> = {
  matematica: 'matematica',
  física: 'exatas',
  fisica: 'natureza',
  química: 'exatas',
  quimica: 'natureza',
  biologia: 'natureza',
  geografia: 'humanas',
  historia: 'humanas',
  sociologia: 'humanas',
  filosofia: 'humanas',
  português: 'linguagens',
  portugues: 'linguagens',
  linguagens: 'linguagens',
  redação: 'linguagens',
  redacao: 'linguagens',
  atualidades: 'humanas',
  direito: 'humanas',
  informática: 'exatas',
  informatica: 'linguagens',
  // ENEM official mapping and legacy aliases (later keys override earlier legacy values)
  'raciocinio logico': 'matematica',
  natureza: 'natureza',
  'ciencias da natureza': 'natureza',
  ciencias: 'natureza',
  literatura: 'linguagens',
  ingles: 'linguagens',
  espanhol: 'linguagens',
  artes: 'linguagens',
  tecnologia: 'linguagens',
  comunicacao: 'linguagens',
  exatas: 'matematica',
  biologicas: 'natureza',
};

const LEGACY_AREA_ALIASES: Record<string, SubjectArea> = {
  exatas: 'matematica',
  biologicas: 'natureza',
  natureza: 'natureza',
  humanas: 'humanas',
  linguagens: 'linguagens',
  matematica: 'matematica',
  geral: 'geral',
};

type CycleStage = SessionType;

interface SubjectCycleState {
  stageIndex: number;
  stageProgress: number;
}

const CYCLE_ORDER: CycleStage[] = ['teoria', 'pratica', 'revisao', 'simulado'];
const PEDAGOGICAL_STEP_INDEX: Record<SessionType, number> = {
  teoria: 1,
  pratica: 2,
  revisao: 3,
  simulado: 4,
};
const PEDAGOGICAL_STEP_TOTAL = 4;
const ROADMAP_CACHE_TTL_MS = 2 * 60 * 1000;
/**
 * Quanto tempo uma revisão espaçada pode ficar esperando fora da janela gerada.
 * Cobre o intervalo de 30 dias usado pelo ciclo de revisão.
 */
const MAX_PENDING_REVIEW_DAYS = 35;
const roadmapScheduleCache = new Map<
  string,
  { createdAt: number; result: ChronologicalScheduleResult }
>();

function cloneBlock(block: StudyBlock): StudyBlock {
  return {
    ...block,
    date: parseBlockDate(block.date),
    subject: block.subject ? { ...block.subject, createdAt: new Date(block.subject.createdAt), updatedAt: new Date(block.subject.updatedAt) } : block.subject,
    createdAt: new Date(block.createdAt),
    updatedAt: new Date(block.updatedAt),
  };
}

function cloneScheduleResult(result: ChronologicalScheduleResult, cacheHit?: boolean): ChronologicalScheduleResult {
  return {
    ...result,
    blocks: result.blocks.map(cloneBlock),
    subjectDistribution: { ...result.subjectDistribution },
    phaseByDate: { ...result.phaseByDate },
    debugLog: [...result.debugLog],
    pendingReviews: Object.fromEntries(
      Object.entries(result.pendingReviews ?? {}).map(([dateKey, subjectIds]) => [dateKey, [...subjectIds]])
    ),
    cacheHit,
  };
}

function normalize(str: string) {
  return normalizeEnemText(str);
}

function canonicalArea(area: SubjectArea): SubjectArea {
  const normalized = normalize(area);
  return LEGACY_AREA_ALIASES[normalized] || area;
}

function resolveAreaFromName(name: string): SubjectArea {
  const normalized = normalize(name);
  let area: SubjectArea = 'geral';
  Object.keys(SUBJECT_AREA_MAP).forEach((key) => {
    if (normalized.includes(key)) {
      area = SUBJECT_AREA_MAP[key];
    }
  });
  return canonicalArea(area);
}

function resolveLevel(subject: Subject, fallback?: SubjectLevel): SubjectLevel {
  const nivelNormalized = subject.nivel ? normalize(subject.nivel) : '';
  if (nivelNormalized.includes('avan')) return 'avancado';
  if (nivelNormalized.includes('inter')) return 'intermediario';
  if (nivelNormalized.includes('bas') || nivelNormalized.includes('inic')) return 'basico';
  if (fallback) return fallback;
  const difficulty = subject.difficulty ?? 5;
  return difficulty <= 4 ? 'basico' : difficulty <= 7 ? 'intermediario' : 'avancado';
}

function resolvePesoNoExame(subject: Subject, fallback?: number) {
  if (typeof subject.pesoNoExame === 'number') {
    return Math.min(5, Math.max(1, Math.round(subject.pesoNoExame)));
  }
  if (typeof fallback === 'number') {
    return Math.min(5, Math.max(1, Math.round(fallback)));
  }
  return Math.min(5, Math.max(1, Math.round((subject.priority || 5) / 2)));
}

function resolveEnemWeight(subject: Subject, fallback?: number) {
  if (typeof subject.enemWeight === 'number') {
    return Math.min(1, Math.max(0.1, subject.enemWeight));
  }
  if (typeof fallback === 'number') {
    return Math.min(1, Math.max(0.1, fallback));
  }
  return getEnemWeightForSubject(subject);
}

function getCycleRepeatTarget(
  level: SubjectLevel,
  stage: CycleStage,
  userLevel: UserLearningLevel = 'intermediario',
  contentPreference: StudyPreferences['studyContentPreference'] = 'misto'
) {
  if (stage === 'simulado') return 1;
  if (stage === 'revisao') return contentPreference === 'revisao' ? 2 : 1;
  if (stage === 'teoria') {
    let base = level === 'basico' ? 2 : 1;
    if (userLevel === 'iniciante') base += 1;
    if (contentPreference === 'aulas') base += 1;
    if (contentPreference === 'exercicios') base = Math.max(1, base - 1);
    return base;
  }
  let practice = level === 'avancado' ? 3 : level === 'intermediario' ? 2 : 1;
  if (userLevel === 'avancado') practice += 1;
  if (userLevel === 'iniciante') practice = Math.max(1, practice - 1);
  if (contentPreference === 'exercicios') practice += 1;
  if (contentPreference === 'aulas') practice = Math.max(1, practice - 1);
  return practice;
}

function getInitialCycleState(): SubjectCycleState {
  return { stageIndex: 0, stageProgress: 0 };
}

function getExpectedCycleStage(state: SubjectCycleState | undefined): CycleStage {
  return CYCLE_ORDER[state?.stageIndex ?? 0] || 'teoria';
}

function advanceCycleState(
  state: SubjectCycleState | undefined,
  level: SubjectLevel,
  userLevel: UserLearningLevel = 'intermediario',
  contentPreference: StudyPreferences['studyContentPreference'] = 'misto'
): SubjectCycleState {
  const current = state ? { ...state } : getInitialCycleState();
  const stage = getExpectedCycleStage(current);
  const target = getCycleRepeatTarget(level, stage, userLevel, contentPreference);
  const nextProgress = current.stageProgress + 1;
  if (nextProgress < target) {
    return { stageIndex: current.stageIndex, stageProgress: nextProgress };
  }
  return { stageIndex: (current.stageIndex + 1) % CYCLE_ORDER.length, stageProgress: 0 };
}

function getDisciplinePriorityBonus(subject: Subject) {
  const normalized = normalize(subject.name);
  if (normalized.includes('matematica')) return 14;
  if (normalized.includes('portugues')) return 12;
  if (normalized.includes('redacao')) return 10;
  return 0;
}

export function inferSubjectMeta(subject: Subject): SubjectMeta {
  const catalog = getEnemDisciplineByName(subject.name);
  const area = canonicalArea(
    (subject.area ? resolveAreaFromName(subject.area) : undefined) ||
      (catalog?.area as SubjectArea | undefined) ||
      resolveAreaFromName(subject.name)
  );
  const nivel = resolveLevel(subject, catalog?.nivel);
  const pesoNoExame = resolvePesoNoExame(subject, catalog?.pesoNoExame);
  const enemWeight = resolveEnemWeight(subject, catalog?.enemWeight);

  return {
    area,
    nivel,
    pesoNoExame,
    enemWeight,
    prerequisitos:
      Array.isArray(subject.prerequisitos) && subject.prerequisitos.length > 0
        ? subject.prerequisitos
        : Array.isArray(subject.topicos) && subject.topicos.length > 0
        ? subject.topicos
        : catalog?.topics,
  };
}

const phaseForWeek = (weekIndex: number) => {
  if (weekIndex <= 2) return { key: 'base', label: 'Base (Fundamentos)' };
  if (weekIndex <= 5) return { key: 'aprofundamento', label: 'Aprofundamento' };
  return { key: 'consolidacao', label: 'Consolidação' };
};

export function getPhaseForDate(date: Date, startDate?: Date) {
  // Sem uma data de início válida, trata a própria data como início (fase base)
  // em vez de quebrar a tela com "Cannot read properties of undefined".
  const safeStartDate =
    startDate && !Number.isNaN(startDate.getTime()) ? startDate : date;
  const diff = Math.floor((date.getTime() - safeStartDate.getTime()) / (1000 * 60 * 60 * 24));
  const weekIndex = Math.floor(diff / 7) + 1;
  return phaseForWeek(weekIndex);
}

function buildDateRange(startDate: Date, endDate: Date) {
  const dates: Date[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  const current = new Date(start);
  while (current <= end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function getDailyMinutes(preferredStart: string, preferredEnd: string, hoursPerDay: number) {
  const windowMinutes = Math.max(0, timeToMinutes(preferredEnd) - timeToMinutes(preferredStart));
  const desiredMinutes = Math.max(0, hoursPerDay) * 60;
  return Math.min(windowMinutes, desiredMinutes);
}

function getEffectiveDayWindow(
  config: ChronologicalScheduleConfig,
  date: Date
): { start: string; end: string } {
  const key = toLocalDateKey(date);
  const override = config.dailyTimeWindowByDate?.[key];
  if (
    override?.start &&
    override?.end &&
    timeToMinutes(override.end) > timeToMinutes(override.start)
  ) {
    return { start: override.start, end: override.end };
  }
  return { start: config.preferredStart, end: config.preferredEnd };
}

function computeBlockMinutes(
  subject: Subject,
  meta: SubjectMeta,
  baseMax: number,
  sessionType: SessionType,
  adaptivePriorityScore?: number
) {
  void subject;
  void meta;
  void adaptivePriorityScore;
  let duration = Math.max(25, baseMax);
  if (sessionType === 'revisao') {
    duration = Math.max(25, Math.round(baseMax * 0.8));
  }
  if (sessionType === 'simulado') {
    duration = Math.max(baseMax, 90);
  }
  return Math.max(25, duration);
}

function mapStudyStyleToContentPreference(
  studyStyle: StudyPreferences['studyStyle'],
  fallback: StudyPreferences['studyContentPreference']
): NonNullable<StudyPreferences['studyContentPreference']> {
  if (studyStyle === 'theory') return 'aulas';
  if (studyStyle === 'practice') return 'exercicios';
  if (studyStyle === 'balanced') return 'misto';
  return fallback || 'misto';
}

function getHardSubjectPeriodScore(
  periodPreference: StudyPreferences['hardSubjectsPeriodPreference'],
  subject: Subject,
  meta: SubjectMeta,
  bucket: 'manha' | 'tarde' | 'noite',
  isFirstBlock: boolean
) {
  if (!periodPreference || periodPreference === 'any') return 0;
  const preferredBucket =
    periodPreference === 'morning'
      ? 'manha'
      : periodPreference === 'afternoon'
      ? 'tarde'
      : 'noite';
  const isHard = (subject.difficulty ?? 5) >= 7 || meta.pesoNoExame >= 4 || meta.enemWeight >= 0.75;
  if (isHard) {
    if (bucket === preferredBucket) return isFirstBlock ? 18 : 10;
    return bucket === 'noite' && preferredBucket !== 'noite' ? -8 : -5;
  }
  if (bucket === preferredBucket) return -2;
  return 1;
}

function pickTaskType(
  level: SubjectLevel,
  cycleState: SubjectCycleState | undefined,
  hasLesson: boolean,
  userLevel: UserLearningLevel = 'intermediario'
): SessionType {
  if (!hasLesson) return 'teoria';
  const nextStage = getExpectedCycleStage(cycleState);
  if (nextStage === 'simulado' && level === 'basico' && userLevel === 'iniciante') {
    return 'revisao';
  }
  return nextStage;
}

const SESSION_TO_BLOCK_TYPE: Record<SessionType, StudyBlockType> = {
  teoria: 'AULA',
  pratica: 'EXERCICIOS',
  revisao: 'REVISAO',
  simulado: 'SIMULADO_COMPLETO',
};

function buildBlockDescription(
  blockType: StudyBlockType,
  goal: StudyPreferences['goal'],
  areaLabel?: string
) {
  if (blockType === 'AULA') return 'Aula + anotações + 5 min de resumo';
  if (blockType === 'EXERCICIOS') return 'Lista de exercícios + revisar erros';
  if (blockType === 'REVISAO') return 'Revisão guiada (flashcards/resumo)';
  if (blockType === 'SIMULADO_AREA') {
    return `Simulado de ${areaLabel || 'área'} + tempo cronometrado`;
  }
  if (blockType === 'SIMULADO_COMPLETO') {
    if (goal === 'medicina') return 'Simulado de medicina + tempo cronometrado';
    if (goal === 'concurso') return 'Simulado de concurso + correção';
    return 'Simulado ENEM + tempo cronometrado';
  }
  if (blockType === 'ANALISE') {
    return buildAnalysisDescription(goal);
  }
  return 'Sessão de estudo';
}

function buildAnalysisDescription(goal: StudyPreferences['goal']) {
  if (goal === 'medicina') return 'Correção + caderno de erros (60-90min)';
  if (goal === 'concurso') return 'Correção + mapa de erros';
  return 'Correção + análise de desempenho';
}

function createSimuladoSubject(): Subject {
  return {
    id: 'simulado',
    userId: 'user1',
    name: 'Simulado',
    color: '#FF7A00',
    icon: 'target',
    priority: 5,
    difficulty: 6,
    targetHours: 0,
    completedHours: 0,
    totalHours: 0,
    sessionsCount: 0,
    averageScore: 0,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function removeOrphanGeneratedBreaks(blocks: StudyBlock[]) {
  const blocksByDay = new Map<string, StudyBlock[]>();

  blocks.forEach((block) => {
    const dayKey = toLocalDateKey(parseBlockDate(block.date));
    const dayBlocks = blocksByDay.get(dayKey) || [];
    dayBlocks.push(block);
    blocksByDay.set(dayKey, dayBlocks);
  });

  const orphanBreakIds = new Set<string>();

  blocksByDay.forEach((dayBlocks) => {
    const studyBlocks = dayBlocks
      .filter((block) => !block.isBreak)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    dayBlocks
      .filter((block) => block.isBreak)
      .forEach((breakBlock) => {
        const breakStart = timeToMinutes(breakBlock.startTime);
        const breakEnd = timeToMinutes(breakBlock.endTime);
        const previousStudy = [...studyBlocks]
          .reverse()
          .find((block) => timeToMinutes(block.endTime) <= breakStart);
        const nextStudy = studyBlocks.find((block) => timeToMinutes(block.startTime) >= breakEnd);

        if (!previousStudy || !nextStudy) {
          orphanBreakIds.add(breakBlock.id);
        }
      });
  });

  if (orphanBreakIds.size === 0) return blocks;
  return blocks.filter((block) => !orphanBreakIds.has(block.id));
}

export function generateChronologicalSchedule(config: ChronologicalScheduleConfig): ChronologicalScheduleResult {
  const now = config.adaptiveNow ?? new Date();
  const userLevel = config.userLevel ?? config.preferences.userLevel ?? 'intermediario';
  const cacheEnabled = config.enableScheduleCache !== false;
  const cacheKey = cacheEnabled
    ? buildScheduleComputationFingerprint({
        v: 3,
        subjects: config.subjects.map((subject) => ({
          id: subject.id,
          name: subject.name,
          priority: subject.priority,
          difficulty: subject.difficulty,
          targetHours: subject.targetHours,
          completedHours: subject.completedHours,
          area: subject.area,
          nivel: subject.nivel,
          pesoNoExame: subject.pesoNoExame,
          enemWeight: subject.enemWeight,
        })),
        preferences: config.preferences,
        startDate: config.startDate,
        endDate: config.endDate,
        pedagogicalStartDate: config.pedagogicalStartDate,
        pendingReviews: config.pendingReviews,
        lastSimuladoDate: config.lastSimuladoDate,
        preferredStart: config.preferredStart,
        preferredEnd: config.preferredEnd,
        maxBlockMinutes: config.maxBlockMinutes,
        breakMinutes: config.breakMinutes,
        restDays: config.restDays,
        dailyLimitByDate: config.dailyLimitByDate,
        dailyTimeWindowByDate: config.dailyTimeWindowByDate,
        firstCycleAllSubjects: config.firstCycleAllSubjects,
        completedLessonsTotal: config.completedLessonsTotal,
        completedLessonsBySubject: config.completedLessonsBySubject,
        completedPracticeTotal: config.completedPracticeTotal,
        completedPracticeBySubject: config.completedPracticeBySubject,
        completedReviewsBySubject: config.completedReviewsBySubject,
        completedSimuladosBySubject: config.completedSimuladosBySubject,
        simuladoRules: config.simuladoRules,
        userLevel,
        examDate: config.preferences.examDate,
        performanceMetricsBySubject: config.performanceMetricsBySubject,
      })
    : '';

  if (cacheEnabled && cacheKey) {
    const cached = roadmapScheduleCache.get(cacheKey);
    if (cached && now.getTime() - cached.createdAt <= ROADMAP_CACHE_TTL_MS) {
      return cloneScheduleResult(cached.result, true);
    }
  }

  const debugLog: string[] = [];
  const log = (message: string) => {
    if (config.debug) debugLog.push(message);
  };

  const dates = buildDateRange(config.startDate, config.endDate);
  const allDays = [0, 1, 2, 3, 4, 5, 6];
  const restDays = config.restDays ?? [];
  const preferredDays = config.preferences.daysOfWeek?.length
    ? config.preferences.daysOfWeek
    : allDays;
  const activeDays = preferredDays.filter((day) => !restDays.includes(day));
  // Quando o estudante gera o cronograma semana a semana, a janela gerada não é o
  // início da jornada. Sem separar os dois, fases e simulados nunca avançam.
  const pedagogicalStartDate = config.pedagogicalStartDate ?? config.startDate;
  const excludeDays = allDays.filter((day) => !activeDays.includes(day));
  const subjectMeta = new Map(config.subjects.map((s) => [s.id, inferSubjectMeta(s)]));
  const simuladoSubject = createSimuladoSubject();
  const simuladoMeta: SubjectMeta = { area: 'geral', nivel: 'intermediario', pesoNoExame: 5, enemWeight: 1 };
  const simuladoRules = {
    minLessonsBeforeSimulated: 10,
    minLessonsPerSubject: 2,
    minPracticeBeforeSimulated: 8,
    minDaysBeforeSimulated: 14,
    frequencyDays: 7,
    minLessonsBeforeAreaSimulated: 6,
    minDaysBeforeAreaSimulated: 7,
    ...(config.simuladoRules || {}),
  };
  let lastSimuladoDate: Date | null = config.lastSimuladoDate ? new Date(config.lastSimuladoDate) : null;
  const completedLessonsTotal = config.completedLessonsTotal ?? 0;
  const completedLessonsBySubject = config.completedLessonsBySubject ?? {};
  const completedPracticeTotal = config.completedPracticeTotal ?? 0;
  const completedPracticeBySubject = config.completedPracticeBySubject ?? {};
  const completedReviewsBySubject = config.completedReviewsBySubject ?? {};
  const completedSimuladosBySubject = config.completedSimuladosBySubject ?? {};
  const performanceMetricsBySubject = config.performanceMetricsBySubject ?? {};
  const adaptiveScoreBySubject = new Map<string, number>(
    config.subjects.map((subject) => [
      subject.id,
      computeAdaptivePriorityScore({
        subject,
        profile: performanceMetricsBySubject[subject.id],
        now,
        examDate: config.preferences.examDate,
        userLevel,
      }),
    ])
  );
  const primarySubjects = [...config.subjects]
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
    .slice(0, 3)
    .map((subject) => subject.id);

  const hasSimuladoIntervalElapsed = (date: Date) => {
    if (!lastSimuladoDate) return true;
    const gap = Math.floor((date.getTime() - lastSimuladoDate.getTime()) / (1000 * 60 * 60 * 24));
    return gap >= simuladoRules.frequencyDays;
  };

  /** Conteúdo já permite um simulado por área (ignora o intervalo entre simulados). */
  const isSimuladoAreaContentReady = (date: Date) => {
    const daysSinceStart = Math.floor(
      (date.getTime() - pedagogicalStartDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const plannedLessonsTotal = Array.from(plannedLessonsBySubject.values()).reduce((sum, count) => sum + count, 0);
    const plannedPracticeTotal = Array.from(plannedPracticeBySubject.values()).reduce((sum, count) => sum + count, 0);
    const effectiveLessonsTotal = completedLessonsTotal + plannedLessonsTotal;
    const effectivePracticeTotal = completedPracticeTotal + plannedPracticeTotal;
    if (daysSinceStart < simuladoRules.minDaysBeforeAreaSimulated) return false;
    if (effectiveLessonsTotal < simuladoRules.minLessonsBeforeAreaSimulated) return false;
    if (simuladoRules.minPracticeBeforeSimulated && effectivePracticeTotal < Math.floor(simuladoRules.minPracticeBeforeSimulated / 2)) return false;
    return true;
  };

  /** Simulado por área liberado agora (conteúdo pronto + intervalo entre simulados ok). */
  const canScheduleSimuladoArea = (date: Date) =>
    isSimuladoAreaContentReady(date) && hasSimuladoIntervalElapsed(date);

  /** Conteúdo já permite o simulado completo (ignora o intervalo entre simulados). */
  const isSimuladoCompletoContentReady = (date: Date) => {
    const daysSinceStart = Math.floor(
      (date.getTime() - pedagogicalStartDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const plannedLessonsTotal = Array.from(plannedLessonsBySubject.values()).reduce((sum, count) => sum + count, 0);
    const plannedPracticeTotal = Array.from(plannedPracticeBySubject.values()).reduce((sum, count) => sum + count, 0);
    const effectiveLessonsTotal = completedLessonsTotal + plannedLessonsTotal;
    const effectivePracticeTotal = completedPracticeTotal + plannedPracticeTotal;
    if (daysSinceStart < simuladoRules.minDaysBeforeSimulated) return false;
    if (effectiveLessonsTotal < simuladoRules.minLessonsBeforeSimulated) return false;
    if (simuladoRules.minPracticeBeforeSimulated && effectivePracticeTotal < simuladoRules.minPracticeBeforeSimulated) return false;
    if (simuladoRules.minLessonsPerSubject && primarySubjects.length > 0) {
      const ready = primarySubjects.every(
        (subjectId) =>
          (completedLessonsBySubject[subjectId] || 0) + (plannedLessonsBySubject.get(subjectId) || 0) >=
          simuladoRules.minLessonsPerSubject!
      );
      if (!ready) return false;
    }
    return true;
  };

  /** Simulado completo liberado agora (conteúdo pronto + intervalo entre simulados ok). */
  const canScheduleSimuladoCompleto = (date: Date) =>
    isSimuladoCompletoContentReady(date) && hasSimuladoIntervalElapsed(date);

  const contentPreference = mapStudyStyleToContentPreference(
    config.preferences.studyStyle,
    config.preferences.studyContentPreference
  );
  const reviewGapThreshold = contentPreference === 'revisao' ? 2 : 3;
  const reviewOffsets =
    contentPreference === 'revisao'
      ? [1, 3, 7, 14, 30]
      : config.preferences.intensity === 'intensa'
      ? [1, 5, 12, 30]
      : [1, 7, 30];
  const hardSubjectsPeriodPreference = config.preferences.hardSubjectsPeriodPreference ?? 'any';
  const getDailyLimit = (date: Date) => {
    const dayKey = toLocalDateKey(date);
    const dayWindow = getEffectiveDayWindow(config, date);
    const windowMinutes = Math.max(
      0,
      timeToMinutes(dayWindow.end) - timeToMinutes(dayWindow.start)
    );
    const dailyMinutes = getDailyMinutes(
      dayWindow.start,
      dayWindow.end,
      config.preferences.hoursPerDay ?? 2
    );
    const override = config.dailyLimitByDate?.[dayKey];
    if (typeof override === 'number') {
      return Math.min(windowMinutes, Math.max(0, override));
    }
    return dailyMinutes;
  };
  const slotSize = Math.max(25, config.maxBlockMinutes);
  const totalSlots = Math.max(
    1,
    dates
      .filter((date) => !excludeDays.includes(date.getDay()))
      .reduce((sum, date) => sum + Math.max(1, Math.floor(getDailyLimit(date) / slotSize)), 0)
  );

  const weightSum = config.subjects.reduce(
    (sum, s) => {
      const meta = subjectMeta.get(s.id);
      const adaptive = adaptiveScoreBySubject.get(s.id) || 1;
      const examWeight = meta?.enemWeight || 0.5;
      const targetHoursWeight = Math.max(0.5, s.targetHours || 1);
      return (
        sum +
        Math.max(
          0.1,
          targetHoursWeight * 1.4 + examWeight * 2 + (meta?.pesoNoExame || 1) * 0.4 + adaptive
        )
      );
    },
    0
  );
  const remainingSlots = new Map(
    config.subjects.map((s) => [
      s.id,
        Math.max(
          1,
          Math.round(
          (((Math.max(0.5, s.targetHours || 1) * 1.4) +
            (subjectMeta.get(s.id)?.enemWeight || 0.5) * 2 +
            (subjectMeta.get(s.id)?.pesoNoExame || 1) * 0.4 +
            (adaptiveScoreBySubject.get(s.id) || 1)) /
            Math.max(weightSum, 0.1)) *
            totalSlots
          )
        ),
      ])
  );

  const phaseByDate: Record<string, string> = {};
  const reviewQueue = new Map<string, string[]>();
  const pendingReviews: PendingReviewsByDate = {};
  const validSubjectIds = new Set(config.subjects.map((subject) => subject.id));
  const maxReviewDate = new Date(config.endDate);
  maxReviewDate.setHours(0, 0, 0, 0);
  maxReviewDate.setDate(maxReviewDate.getDate() + MAX_PENDING_REVIEW_DAYS);

  /**
   * Empurra a revisão para o próximo dia de estudo válido dentro da janela.
   * Quando o dia válido fica depois da janela, a revisão é devolvida em
   * `pendingReviews` para ser cobrada na próxima geração (revisão espaçada 7d/30d
   * deixa de ser perdida quando o cronograma é gerado semana a semana).
   */
  const queueReview = (reviewDate: Date, subjectId: string) => {
    const cursor = new Date(reviewDate);
    cursor.setHours(0, 0, 0, 0);

    for (let guard = 0; guard < 60; guard += 1) {
      if (!activeDays.includes(cursor.getDay())) {
        cursor.setDate(cursor.getDate() + 1);
        continue;
      }

      const dateKey = toLocalDateKey(cursor);
      if (cursor > config.endDate || cursor > maxReviewDate) {
        const list = pendingReviews[dateKey] ?? [];
        if (!list.includes(subjectId)) list.push(subjectId);
        pendingReviews[dateKey] = list;
        return;
      }

      if (cursor < config.startDate) {
        // Revisão atrasada (gerações anteriores): cobra o quanto antes.
        cursor.setTime(config.startDate.getTime());
        continue;
      }

      const list = reviewQueue.get(dateKey) ?? [];
      if (!list.includes(subjectId)) list.push(subjectId);
      reviewQueue.set(dateKey, list);
      return;
    }
  };

  // Revisões herdadas de gerações anteriores (7d/30d) entram na fila desta janela.
  Object.entries(config.pendingReviews ?? {}).forEach(([dateKey, subjectIds]) => {
    const parsed = parseLocalDateKey(dateKey);
    if (!parsed) return;
    subjectIds
      .filter((subjectId) => validSubjectIds.has(subjectId))
      .forEach((subjectId) => queueReview(parsed, subjectId));
  });

  const plannedLessonsBySubject = new Map<string, number>();
  const plannedPracticeBySubject = new Map<string, number>();
  const blocks: StudyBlock[] = [];
  const cycleStateBySubject = new Map<string, SubjectCycleState>();

  /**
   * O ciclo pedagógico (aula → exercícios → revisão → simulado) é reconstruído a
   * partir do que o estudante já concluiu. Sem isso, cada geração semana a semana
   * recomeça em "aula" e o simulado nunca chega.
   */
  const seedCycleStage = (subjectId: string) => {
    const lessons = completedLessonsBySubject[subjectId] ?? 0;
    const practice = completedPracticeBySubject[subjectId] ?? 0;
    const reviews = completedReviewsBySubject[subjectId] ?? 0;
    const simulados = completedSimuladosBySubject[subjectId] ?? 0;

    if (lessons <= 0) return 0;
    if (practice <= 0) return 1;
    if (reviews <= 0) return 2;
    if (simulados <= 0) return 3;
    // Ciclo completo: volta para conteúdo novo, como no avanço interno do ciclo.
    return 0;
  };
  config.subjects.forEach((subject) => {
    cycleStateBySubject.set(subject.id, { stageIndex: seedCycleStage(subject.id), stageProgress: 0 });
  });
  const topicIndexBySubject = new Map<string, number>();
  const globalUsage = new Map<string, number>();
  const globalRecentSubjects: string[] = [];
  let globalLastSubjectId = '';
  let areaCursor = 0;
  let lastDaySubjects: Set<string> = new Set();
  const maxDailyRepeatsPerSubject = isEnemGoal(config.preferences.goal) ? 1 : 2;

  for (const date of dates) {
    if (excludeDays.includes(date.getDay())) continue;
    const phase = getPhaseForDate(date, config.startDate);
    const dayKey = toLocalDateKey(date);
    phaseByDate[dayKey] = phase.label;

    let lastSubjectId = globalLastSubjectId;
    const dailyCount = new Map<string, number>();
    const recentSubjects: string[] = [];
    let blocksSinceReview = 0;
    const daySubjects = new Set<string>();
    const dailyMinutesLimit = getDailyLimit(date);

    const dueReviews = reviewQueue.get(dayKey) || [];
    const reviewIndex = new Map<string, number>();
    for (const subjectId of dueReviews) {
      reviewIndex.set(subjectId, (reviewIndex.get(subjectId) || 0) + 1);
    }

    const dayWindow = getEffectiveDayWindow(config, date);
    let currentTime = timeToMinutes(dayWindow.start);
    const endTime = timeToMinutes(dayWindow.end);
    if (endTime <= currentTime) continue;
    let plannedMinutes = 0;

    while (
      currentTime + 25 <= endTime &&
      plannedMinutes < dailyMinutesLimit
    ) {
      const desiredArea = AREA_ROTATION[areaCursor % AREA_ROTATION.length];
      const availableMinutes = Math.min(dailyMinutesLimit - plannedMinutes, endTime - currentTime);

      let candidatePool = config.subjects.filter((subject) => {
        const count = dailyCount.get(subject.id) || 0;
        return count < maxDailyRepeatsPerSubject;
      });

      if (candidatePool.length === 0) break;

      if (config.firstCycleAllSubjects) {
        const pendingFirstLesson = candidatePool.filter((subject) => {
          const hasLesson =
            (completedLessonsBySubject[subject.id] || 0) > 0 ||
            (plannedLessonsBySubject.get(subject.id) || 0) > 0;
          return !hasLesson;
        });
        if (pendingFirstLesson.length > 0) {
          candidatePool = pendingFirstLesson;
        }
      }

      const reviewCandidates = candidatePool.filter((subject) => (reviewIndex.get(subject.id) || 0) > 0);

      const ranked = (reviewCandidates.length > 0 ? reviewCandidates : candidatePool)
        .map((subject) => {
          const meta = subjectMeta.get(subject.id)!;
          const weight = meta.pesoNoExame;
          const enemWeight = meta.enemWeight;
          const remaining = remainingSlots.get(subject.id) || 0;
          const hasLesson =
            (completedLessonsBySubject[subject.id] || 0) > 0 ||
            (plannedLessonsBySubject.get(subject.id) || 0) > 0;
          const profile = performanceMetricsBySubject[subject.id];
          const adaptivePriority = adaptiveScoreBySubject.get(subject.id) || 1;
          const sameSubject = subject.id === lastSubjectId;
          const recentPenalty = recentSubjects.includes(subject.id) ? -12 : 0;
          const globalPenalty = globalRecentSubjects.includes(subject.id) ? -10 : 0;
          const isFirstBlock = plannedMinutes === 0;
          const prevDayPenalty = lastDaySubjects.has(subject.id)
            ? isFirstBlock
              ? -16
              : -6
            : 0;
          const sameArea = meta.area === desiredArea;
          const timeMinutes = currentTime;
          const bucket = timeMinutes < 12 * 60 ? 'manha' : timeMinutes < 18 * 60 ? 'tarde' : 'noite';
          const usagePenalty = (globalUsage.get(subject.id) || 0) * 3;
          const periodPreferenceScore = getHardSubjectPeriodScore(
            hardSubjectsPeriodPreference,
            subject,
            meta,
            bucket,
            isFirstBlock
          );
          let score =
            weight * 7 +
            enemWeight * 16 +
            remaining * 2 +
            adaptivePriority * 18 -
            usagePenalty;
          if (sameArea) score += 12;
          if (!sameSubject) score += 8;
          if (!hasLesson) score += 18;
          score += getDisciplinePriorityBonus(subject);
          score += recentPenalty + globalPenalty + prevDayPenalty;
          if ((profile?.accuracyRate ?? 0.65) < 0.55) score += 10;
          if ((profile?.daysWithoutStudy ?? 0) >= 4) score += 8;
          if (bucket === 'manha' && meta.nivel === 'avancado') score += 6;
          if (bucket === 'noite' && meta.nivel === 'basico') score += 4;
          score += periodPreferenceScore;
          return { subject, score, adaptivePriority };
        })
        .sort((a, b) => b.score - a.score);

      let chosen = ranked.find((item) => item.subject.id !== lastSubjectId);
      if (!chosen) chosen = ranked[0];
      if (!chosen) break;

      const meta = subjectMeta.get(chosen.subject.id)!;
      let sessionType: SessionType = 'teoria';
      const alreadyHasLesson =
        (completedLessonsBySubject[chosen.subject.id] || 0) > 0 ||
        (plannedLessonsBySubject.get(chosen.subject.id) || 0) > 0;
      const expectedCycleStage = pickTaskType(
        meta.nivel,
        cycleStateBySubject.get(chosen.subject.id),
        alreadyHasLesson,
        userLevel
      );
      let cycleStageMatched = false;
      let queuedReviewOverride = false;
      let simuladoDeferred = false;

      if (reviewIndex.get(chosen.subject.id) && alreadyHasLesson) {
        sessionType = 'revisao';
        reviewIndex.set(chosen.subject.id, (reviewIndex.get(chosen.subject.id) || 1) - 1);
        blocksSinceReview = 0;
        queuedReviewOverride = expectedCycleStage !== 'revisao';
        cycleStageMatched = expectedCycleStage === 'revisao';
      } else if (blocksSinceReview >= reviewGapThreshold && recentSubjects.length >= 2 && alreadyHasLesson) {
        sessionType = 'revisao';
        blocksSinceReview = 0;
        queuedReviewOverride = expectedCycleStage !== 'revisao';
        cycleStageMatched = expectedCycleStage === 'revisao';
      } else {
        sessionType = expectedCycleStage;
        cycleStageMatched = true;
        if (sessionType !== 'revisao') {
          blocksSinceReview += 1;
        } else {
          blocksSinceReview = 0;
        }
      }

      if (!alreadyHasLesson && sessionType !== 'teoria') {
        sessionType = 'teoria';
        cycleStageMatched = expectedCycleStage === 'teoria';
      }

      if (sessionType === 'simulado') {
        const shouldArea = canScheduleSimuladoArea(date);
        const shouldCompleto = canScheduleSimuladoCompleto(date);
        if (!shouldArea && !shouldCompleto) {
          // Sem espaço na agenda para simulado agora: reforça com prática/aula.
          // Se o conteúdo já está pronto e só o intervalo entre simulados bloqueou,
          // o ciclo avança mesmo assim — do contrário a matéria ficava presa na
          // etapa de simulado e nunca voltava para conteúdo novo.
          const contentReady =
            isSimuladoAreaContentReady(date) || isSimuladoCompletoContentReady(date);
          simuladoDeferred = contentReady;
          sessionType = alreadyHasLesson ? 'pratica' : 'teoria';
          cycleStageMatched = false;
        }
      }
      if (sessionType === 'pratica' && !alreadyHasLesson) {
        sessionType = 'teoria';
        cycleStageMatched = expectedCycleStage === 'teoria';
      }

      let blockType = SESSION_TO_BLOCK_TYPE[sessionType];
      let simuladoAreaLabel: string | undefined;
      if (sessionType === 'simulado') {
        const useCompleto = canScheduleSimuladoCompleto(date);
        blockType = useCompleto ? 'SIMULADO_COMPLETO' : 'SIMULADO_AREA';
        if (blockType === 'SIMULADO_AREA') {
          simuladoAreaLabel =
            meta.area === 'matematica' || meta.area === 'exatas'
              ? 'Matemática'
              : meta.area === 'humanas'
              ? 'Humanas'
              : meta.area === 'natureza' || meta.area === 'biologicas'
              ? 'Natureza'
              : meta.area === 'linguagens'
              ? 'Linguagens'
              : 'Área';
        }
      }

      const isSimulado = blockType === 'SIMULADO_AREA' || blockType === 'SIMULADO_COMPLETO';
      const blockSubject = isSimulado ? simuladoSubject : chosen.subject;
      const blockMeta = isSimulado ? simuladoMeta : meta;
      const topicCandidates =
        (Array.isArray(meta.prerequisitos) && meta.prerequisitos.length > 0
          ? meta.prerequisitos
          : Array.isArray(chosen.subject.topicos)
          ? chosen.subject.topicos
          : []) ?? [];
      const topicIndex = topicIndexBySubject.get(chosen.subject.id) || 0;
      const topicName =
        !isSimulado && topicCandidates.length > 0
          ? topicCandidates[topicIndex % topicCandidates.length]
          : undefined;

      let baseMax = config.maxBlockMinutes;
      if (isSimulado) {
        baseMax = Math.max(config.maxBlockMinutes, 90);
      }

      let blockMinutes = computeBlockMinutes(
        blockSubject,
        blockMeta,
        baseMax,
        sessionType,
        chosen.adaptivePriority
      );
      blockMinutes = Math.min(blockMinutes, availableMinutes);
      if (blockMinutes < 25) break;

      const block: StudyBlock = {
        id: generateId(),
        userId: 'user1',
        subjectId: blockSubject.id,
        subject: blockSubject,
        date,
        startTime: minutesToTime(currentTime),
        endTime: minutesToTime(currentTime + blockMinutes),
        durationMinutes: blockMinutes,
        status: 'scheduled',
        isBreak: false,
        isAutoGenerated: true,
        originalDate: new Date(date),
        completedAt: undefined,
        rescheduleCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        sessionType,
        phase: phase.key,
        area: blockMeta.area,
        type: blockType,
        description: buildBlockDescription(blockType, config.preferences.goal, simuladoAreaLabel),
        relatedSubjectId: sessionType === 'revisao' ? chosen.subject.id : undefined,
        topicName,
        pedagogicalStepIndex: PEDAGOGICAL_STEP_INDEX[sessionType],
        pedagogicalStepTotal: PEDAGOGICAL_STEP_TOTAL,
        adaptiveScore: Number((chosen.adaptivePriority || 0).toFixed(4)),
      } as StudyBlock;

      blocks.push(block);
      if (!isSimulado) {
        dailyCount.set(chosen.subject.id, (dailyCount.get(chosen.subject.id) || 0) + 1);
        remainingSlots.set(chosen.subject.id, Math.max(0, (remainingSlots.get(chosen.subject.id) || 0) - 1));
        globalUsage.set(chosen.subject.id, (globalUsage.get(chosen.subject.id) || 0) + 1);
        daySubjects.add(chosen.subject.id);
        recentSubjects.push(chosen.subject.id);
      }
      if (recentSubjects.length > 3) recentSubjects.shift();
      if (!isSimulado) {
        globalRecentSubjects.push(chosen.subject.id);
      } else {
        globalRecentSubjects.push(simuladoSubject.id);
      }
      if (globalRecentSubjects.length > 5) globalRecentSubjects.shift();

      if (sessionType === 'simulado') {
        lastSimuladoDate = new Date(date);
      }

      if (simuladoDeferred && expectedCycleStage === 'simulado') {
        // Simulado adiado por causa do intervalo entre simulados: o ciclo é liberado
        // para a disciplina voltar a conteúdo novo em vez de ficar presa na etapa.
        cycleStateBySubject.set(chosen.subject.id, { stageIndex: 0, stageProgress: 0 });
        simuladoDeferred = false;
      }

      if (
        cycleStageMatched &&
        !queuedReviewOverride &&
        (sessionType === expectedCycleStage || (expectedCycleStage === 'simulado' && sessionType === 'simulado'))
      ) {
        cycleStateBySubject.set(
          chosen.subject.id,
          advanceCycleState(
            cycleStateBySubject.get(chosen.subject.id),
            meta.nivel,
            userLevel,
            contentPreference
          )
        );
        if (expectedCycleStage === 'simulado' && topicCandidates.length > 0) {
          topicIndexBySubject.set(chosen.subject.id, (topicIndex + 1) % topicCandidates.length);
        }
      }

      if (sessionType === 'teoria') {
        plannedLessonsBySubject.set(
          chosen.subject.id,
          (plannedLessonsBySubject.get(chosen.subject.id) || 0) + 1
        );
        reviewOffsets.forEach((offset) => {
          const reviewDate = new Date(date);
          reviewDate.setDate(reviewDate.getDate() + offset);
          queueReview(reviewDate, chosen.subject.id);
        });
      }
      if (sessionType === 'pratica') {
        plannedPracticeBySubject.set(
          chosen.subject.id,
          (plannedPracticeBySubject.get(chosen.subject.id) || 0) + 1
        );
      }

      currentTime += blockMinutes;
      plannedMinutes += blockMinutes;
      lastSubjectId = blockSubject.id;
      globalLastSubjectId = lastSubjectId;
      areaCursor += 1;

      if (isSimulado) {
        const analysisMinutes = Math.min(availableMinutes - blockMinutes, Math.max(45, Math.min(90, blockMinutes)));
        if (analysisMinutes >= 25 && currentTime + analysisMinutes <= endTime) {
          const analysisBlock: StudyBlock = {
            id: generateId(),
            userId: 'user1',
            subjectId: simuladoSubject.id,
            subject: simuladoSubject,
            date,
            startTime: minutesToTime(currentTime),
            endTime: minutesToTime(currentTime + analysisMinutes),
            durationMinutes: analysisMinutes,
            status: 'scheduled',
            isBreak: false,
            isAutoGenerated: true,
            originalDate: new Date(date),
            completedAt: undefined,
            rescheduleCount: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
            sessionType: 'pratica',
            phase: phase.key,
            area: simuladoMeta.area,
            type: 'ANALISE',
            description: buildAnalysisDescription(config.preferences.goal),
            relatedSubjectId: chosen.subject.id,
          } as StudyBlock;
          blocks.push(analysisBlock);
          currentTime += analysisMinutes;
          plannedMinutes += analysisMinutes;
        }
      }

      const hasRoomForAnotherStudyAfterBreak =
        plannedMinutes + 25 <= dailyMinutesLimit &&
        currentTime + config.breakMinutes + 25 <= endTime;

      if (config.breakMinutes > 0 && hasRoomForAnotherStudyAfterBreak) {
        blocks.push({
          id: generateId(),
          userId: 'user1',
          subjectId: 'break',
          date,
          startTime: minutesToTime(currentTime),
          endTime: minutesToTime(currentTime + config.breakMinutes),
          durationMinutes: config.breakMinutes,
          status: 'scheduled',
          isBreak: true,
          isAutoGenerated: true,
          originalDate: undefined,
          completedAt: undefined,
          rescheduleCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        currentTime += config.breakMinutes;
      }
    }

    log(
      `Dia ${dayKey}: ${
        blocks.filter(
          (b) => !b.isBreak && toLocalDateKey(b.date) === dayKey
        ).length
      } blocos.`
    );
    lastDaySubjects = daySubjects;
  }

  const sortedBlocks = removeOrphanGeneratedBreaks(blocks).sort((a, b) => {
    const dateDiff = parseBlockDate(a.date).getTime() - parseBlockDate(b.date).getTime();
    if (dateDiff !== 0) return dateDiff;
    return a.startTime.localeCompare(b.startTime);
  });

  const totalMinutes = sortedBlocks.filter((b) => !b.isBreak).reduce((sum, b) => sum + b.durationMinutes, 0);
  const subjectDistribution: Record<string, number> = {};
  sortedBlocks
    .filter((b) => !b.isBreak)
    .forEach((b) => {
      subjectDistribution[b.subjectId] = (subjectDistribution[b.subjectId] || 0) + b.durationMinutes / 60;
    });

  const result: ChronologicalScheduleResult = {
    blocks: sortedBlocks,
    totalHours: Number((totalMinutes / 60).toFixed(1)),
    subjectDistribution,
    phaseByDate,
    pendingReviews,
    debugLog,
  };

  if (cacheEnabled && cacheKey) {
    roadmapScheduleCache.set(cacheKey, {
      createdAt: now.getTime(),
      result: cloneScheduleResult(result),
    });
  }

  return cloneScheduleResult(result, false);
}

export function replanAfterPerformanceUpdate(
  config: ChronologicalScheduleConfig,
  performance: Record<string, 'completed' | 'skipped' | 'late'>
) {
  const updatedSubjects = config.subjects.map((subject) => {
    const status = performance[subject.id];
    if (status === 'skipped') {
      return { ...subject, priority: Math.min(10, (subject.priority || 5) + 1) };
    }
    return subject;
  });
  return generateChronologicalSchedule({ ...config, subjects: updatedSubjects, debug: true });
}
