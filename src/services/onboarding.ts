import { generateWeeklySchedule } from './studyAlgorithm';
import { createEnemSubjectBank } from '@/lib/enemCatalog';
import type {
  OnboardingAnswers,
  UserProfileDTO,
  UserProfileConfig,
  StudyPreferences,
  Subject,
  GeneratedSchedule,
} from '@/types';
import { generateId } from '@/lib/utils';

type GoalKey = 'ENEM' | 'Medicina' | 'Concurso' | 'Escola' | 'Outro';

const goalPresets: Record<GoalKey, { subjects: string[]; colors: string[] }> = {
  ENEM: {
    subjects: ['Matemática', 'Linguagens', 'Humanas', 'Natureza', 'Redação'],
    colors: ['#00B4FF', '#7C3AED', '#F59E0B', '#10B981', '#E11D48'],
  },
  Medicina: {
    subjects: ['Biologia', 'Química', 'Física', 'Redação', 'Matemática'],
    colors: ['#06B6D4', '#8B5CF6', '#0EA5E9', '#F97316', '#22C55E'],
  },
  Concurso: {
    subjects: ['Português', 'Raciocínio Lógico', 'Direito', 'Atualidades', 'Informática'],
    colors: ['#3B82F6', '#22C55E', '#F59E0B', '#6366F1', '#EC4899'],
  },
  Escola: {
    subjects: ['Matemática', 'Português', 'Ciências', 'História', 'Geografia'],
    colors: ['#0EA5E9', '#7C3AED', '#10B981', '#EF4444', '#F59E0B'],
  },
  Outro: {
    subjects: ['Projeto', 'Pesquisa', 'Revisão', 'Prática'],
    colors: ['#14B8A6', '#6366F1', '#F59E0B', '#EC4899'],
  },
};

const dayMap: Record<number, string> = {
  0: 'Dom',
  1: 'Seg',
  2: 'Ter',
  3: 'Qua',
  4: 'Qui',
  5: 'Sex',
  6: 'Sab',
};

function parseDailyHours(option: OnboardingAnswers['daily_hours']): number {
  if (option === '<1') return 1;
  if (option === '1-2') return 2;
  if (option === '2-4') return 3;
  return 4;
}

function buildActiveDays(studyDays: number): number[] {
  const all = [0, 1, 2, 3, 4, 5, 6];
  if (studyDays >= 7) return all;
  if (studyDays === 6) return all.filter((d) => d !== 0); // remove domingo
  if (studyDays === 5) return [1, 2, 3, 4, 5];
  if (studyDays === 4) return [1, 2, 4, 6];
  return [1, 3, 5]; // 3 dias
}

export function configureProfileFromAnswers(
  answers: OnboardingAnswers
): { profile: UserProfileDTO; studyPrefs: StudyPreferences } {
  const dailyHours = parseDailyHours(answers.daily_hours);
  const active_days = buildActiveDays(answers.study_days);

  let default_start_time = '09:00';
  if (answers.best_time === 'tarde') default_start_time = '14:00';
  if (answers.best_time === 'noite') default_start_time = '19:00';
  if (answers.best_time === 'madrugada') default_start_time = '22:00';

  const block_duration = answers.fatigue_profile === 'sim' ? 40 : 60;
  const intensity_level =
    answers.study_days >= 6 ? 'high' : answers.daily_hours === '<1' ? 'light' : 'standard';
  const practice_weight = answers.learning_style === 'exercicios' ? 1.3 : 1;

  let focus_subjects =
    answers.daily_hours === '<1'
      ? goalPresets[answers.study_goal]?.subjects.slice(0, 2) ?? []
      : goalPresets[answers.study_goal]?.subjects ?? [];
  if (answers.study_goal === 'ENEM') {
    const enemSubjects = createEnemSubjectBank('local-demo').map((subject) => subject.name);
    focus_subjects = answers.daily_hours === '<1' ? enemSubjects.slice(0, 2) : enemSubjects;
  }

  const studyPrefs: StudyPreferences = {
    hoursPerDay: dailyHours,
    daysOfWeek: active_days,
    mode: 'random',
    examDate: '',
    userLevel:
      answers.daily_hours === '<1'
        ? 'iniciante'
        : answers.study_days >= 6 && answers.learning_style === 'exercicios'
        ? 'avancado'
        : 'intermediario',
  };

  const profile: UserProfileDTO = {
    userId: 'local-demo',
    ...answers,
    default_start_time,
    block_duration,
    intensity_level,
    active_days,
    practice_weight,
    focus_subjects,
  };

  return { profile, studyPrefs };
}

function createSubjectsFromGoal(goal: GoalKey): Subject[] {
  if (goal === 'ENEM') {
    return createEnemSubjectBank('local-demo');
  }
  const preset = goalPresets[goal];
  if (!preset) return [];

  return preset.subjects.map((name, index) => ({
    id: generateId(),
    userId: 'local-demo',
    name,
    color: preset.colors[index % preset.colors.length],
    icon: 'book',
    priority: 7 - index, // decrescente
    difficulty: 5 + (index % 3),
    targetHours: 2,
    completedHours: 0,
    totalHours: 0,
    sessionsCount: 0,
    averageScore: 0,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
}

export function buildInitialSchedule(profile: UserProfileDTO, subjects: Subject[]): GeneratedSchedule {
  const excludeDays = [0, 1, 2, 3, 4, 5, 6].filter((d) => !profile.active_days.includes(d));
  const preferredEndMinutes =
    parseInt(profile.default_start_time.split(':')[0], 10) * 60 +
    (parseDailyHours(profile.daily_hours) * 60 || 120);
  const preferredEnd = `${String(Math.floor(preferredEndMinutes / 60)).padStart(2, '0')}:${String(
    preferredEndMinutes % 60
  ).padStart(2, '0')}`;

  const scheduleConfig = {
    userId: profile.userId,
    subjects,
    preferredStart: profile.default_start_time,
    preferredEnd,
    maxBlockMinutes: profile.block_duration,
    breakMinutes: profile.fatigue_profile === 'sim' ? 10 : 15,
    excludeDays,
  };

  return generateWeeklySchedule(scheduleConfig);
}

export function createDefaultOnboardingSetup(
  answers: OnboardingAnswers
): { profile: UserProfileDTO; subjects: Subject[]; schedule: GeneratedSchedule; studyPrefs: StudyPreferences } {
  const { profile, studyPrefs } = configureProfileFromAnswers(answers);
  const subjects = createSubjectsFromGoal(answers.study_goal);
  const schedule = buildInitialSchedule(profile, subjects);

  return { profile, subjects, schedule, studyPrefs };
}
