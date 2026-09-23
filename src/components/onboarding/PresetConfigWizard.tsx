'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Calendar, CheckCircle2, Clock, Sparkles } from 'lucide-react';
import { Button, Card, ProgressBar } from '@/components/ui';
import type {
  AIDifficulty,
  ConcursoAreaFocus,
  ConcursoExperienceLevel,
  ConcursoLevel,
  ConcursoStudyPriority,
  DailyAvailabilityByWeekday,
  DailyHoursByWeekday,
  HardSubjectsPeriodPreference,
  PresetWizardAnswers,
  StudyPreferences,
  StudyStylePreference,
  UserSettings,
  WeekdayKey,
} from '@/types';
import { computeStudyPreferences } from '@/services/presetConfigurator';
import { cn, formatDuration, formatHoursDuration, timeToMinutes } from '@/lib/utils';
import { getAiScheduleProfile } from '@/lib/aiScheduleProfiles';

interface PresetConfigWizardProps {
  isOpen: boolean;
  presetId: string;
  presetName: string;
  baseSettings: UserSettings;
  onClose: () => void;
  onApply: (settings: UserSettings, studyPrefs: StudyPreferences, answers: PresetWizardAnswers) => void;
}

const STEP_TITLES = ['Disponibilidade', 'Blocos', 'Dificuldade', 'Estilo', 'Meta', 'Prova'] as const;
const STEP_TITLES_SHORT = ['Disp.', 'Blocos', 'Difíceis', 'Estilo', 'Meta', 'Prova'] as const;
const DAY_OPTIONS: { label: string; value: number; key: WeekdayKey }[] = [
  { label: 'Dom', value: 0, key: 'dom' },
  { label: 'Seg', value: 1, key: 'seg' },
  { label: 'Ter', value: 2, key: 'ter' },
  { label: 'Qua', value: 3, key: 'qua' },
  { label: 'Qui', value: 4, key: 'qui' },
  { label: 'Sex', value: 5, key: 'sex' },
  { label: 'Sab', value: 6, key: 'sab' },
];
const FOCUS_OPTIONS = [30, 45, 50, 60, 90] as const;
const BREAK_OPTIONS = [5, 10, 15] as const;
const HARD_PERIOD_OPTIONS: Array<{ value: HardSubjectsPeriodPreference; label: string; desc: string }> = [
  { value: 'morning', label: 'Manhã', desc: 'Priorizar dentro das janelas da manhã' },
  { value: 'afternoon', label: 'Tarde', desc: 'Priorizar dentro das janelas da tarde' },
  { value: 'night', label: 'Noite', desc: 'Priorizar dentro das janelas da noite' },
  { value: 'any', label: 'Tanto faz', desc: 'Usar qualquer horário disponível' },
];
const STUDY_STYLE_OPTIONS: Array<{ value: StudyStylePreference; label: string; desc: string }> = [
  { value: 'theory', label: 'Mais teoria', desc: 'Maior proporcao de blocos AULA' },
  { value: 'practice', label: 'Mais exercícios', desc: 'Maior proporção de blocos EXERCÍCIOS' },
  { value: 'balanced', label: 'Equilibrado', desc: 'Mix padrão com teoria e exercícios' },
];
const AI_DIFFICULTY_OPTIONS: Array<{ value: AIDifficulty; label: string; desc: string }> = [
  { value: 'easy', label: 'Leve', desc: '30 min foco + 15 min pausa' },
  { value: 'medium', label: 'Moderado', desc: '50 min foco + 10 min pausa' },
  { value: 'hard', label: 'Intenso', desc: '90 min foco + 5 min pausa' },
  { value: 'adaptive', label: 'Adaptativo', desc: 'Ajusta pelo seu desempenho' },
];
const PRESET_FLOW_OPTIONS: Array<{ value: boolean; label: string; desc: string }> = [
  {
    value: true,
    label: 'Ciclo completo',
    desc: 'Garante 1 aula de cada materia antes de repetir.',
  },
  {
    value: false,
    label: 'Foco nas prioridades',
    desc: 'Começa pelas matérias mais importantes, mesmo repetindo mais cedo.',
  },
];
const CONCURSO_AREA_OPTIONS: Array<{ value: ConcursoAreaFocus; label: string; desc: string }> = [
  { value: 'policial', label: 'Área Policial / Segurança Pública', desc: 'Penal, processual penal e legislação especial' },
  { value: 'tribunais', label: 'Tribunais / Jurídica', desc: 'Civil, processo civil e base jurídica' },
  { value: 'fiscal', label: 'Área Fiscal / Controle', desc: 'Tributário, contabilidade e auditoria' },
  { value: 'administrativa', label: 'Área Administrativa / Gestão', desc: 'Administração pública e legislação aplicada' },
  { value: 'bancaria', label: 'Bancária', desc: 'Conhecimentos bancários e matemática financeira' },
  { value: 'inss', label: 'INSS / Previdenciária', desc: 'Previdenciário, seguridade e legislação' },
  { value: 'educacao', label: 'Educação', desc: 'Didática e legislação educacional' },
  { value: 'personalizado', label: 'Personalizado', desc: 'Base comum + ajuste manual por edital' },
];
const CONCURSO_LEVEL_OPTIONS: Array<{ value: ConcursoLevel; label: string }> = [
  { value: 'medio', label: 'Médio' },
  { value: 'superior', label: 'Superior' },
  { value: 'ambos', label: 'Ambos' },
];
const CONCURSO_EXPERIENCE_OPTIONS: Array<{ value: ConcursoExperienceLevel; label: string }> = [
  { value: 'nunca', label: 'Nunca comecei' },
  { value: 'pouco', label: 'Já estudei um pouco' },
  { value: 'intermediaria', label: 'Tenho base intermediária' },
  { value: 'avancado', label: 'Nível avançado' },
];
const CONCURSO_PRIORITY_OPTIONS: Array<{ value: ConcursoStudyPriority; label: string; desc: string }> = [
  { value: 'teoria', label: 'Mais teoria', desc: 'Dar mais carga para leitura e consolidação de base' },
  { value: 'exercicios', label: 'Mais exercícios', desc: 'Priorizar blocos práticos e revisão por erro' },
  { value: 'equilibrado', label: 'Equilibrado', desc: 'Distribuir teoria e prática de forma proporcional' },
];
const QUICK_HOURS = [2, 3, 4, 5, 6] as const;
const SETTINGS_SECTION_CLASS =
  'rounded-[22px] border border-white/10 bg-white/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]';
const SETTINGS_ROW_CLASS =
  'w-full rounded-2xl border border-white/10 bg-[#1a1d28]/85 px-3 py-3 text-left transition-colors';

const overlayVariants = { hidden: { opacity: 0 }, visible: { opacity: 1 } };
const modalVariants = { hidden: { opacity: 0, y: 24, scale: 0.99 }, visible: { opacity: 1, y: 0, scale: 1 } };

const clampHours = (v: number) => Math.min(12, Math.max(0, Math.round(v * 2) / 2));
const clampHoursPrecise = (v: number) => Math.min(12, Math.max(0, Math.round(v * 100) / 100));
const toDateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmtDate = (k?: string) => {
  if (!k) return 'Não definido';
  const d = new Date(`${k}T00:00:00`);
  if (Number.isNaN(d.getTime())) return k;
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
};
const fmtHours = (v: number) => {
  return formatHoursDuration(v);
};
const isValidWindow = (start: string, end: string) => Boolean(start && end && timeToMinutes(end) > timeToMinutes(start));
const windowHours = (start: string, end: string) => {
  if (!isValidWindow(start, end)) return null;
  const diff = (timeToMinutes(end) - timeToMinutes(start)) / 60;
  return clampHoursPrecise(diff);
};
const minutesToClock = (totalMinutes: number) => {
  const clamped = Math.max(0, Math.min((23 * 60) + 59, Math.round(totalMinutes)));
  const hh = Math.floor(clamped / 60);
  const mm = clamped % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};
const addMinutesToClock = (start: string, durationMinutes: number) => minutesToClock(timeToMinutes(start) + durationMinutes);
const buildMassWindowSuggestions = (hours: number) => {
  const durationMinutes = Math.max(60, Math.round(hours * 60));
  const base = [
    { id: 'morning', label: 'Manhã', start: '08:00' },
    { id: 'afternoon', label: 'Tarde', start: '13:30' },
    { id: 'night', label: 'Noite', start: '19:00' },
  ] as const;
  return base.map((slot) => ({
    id: slot.id,
    label: slot.label,
    start: slot.start,
    end: addMinutesToClock(slot.start, durationMinutes),
  }));
};

const HARD_PERIOD_WINDOWS: Record<
  Exclude<HardSubjectsPeriodPreference, 'any'>,
  { start: number; end: number }
> = {
  morning: { start: 5 * 60, end: 12 * 60 },
  afternoon: { start: 12 * 60, end: 18 * 60 },
  night: { start: 18 * 60, end: 24 * 60 },
};

const HARD_PERIOD_LABELS: Record<Exclude<HardSubjectsPeriodPreference, 'any'>, string> = {
  morning: 'manhã',
  afternoon: 'tarde',
  night: 'noite',
};

function windowOverlapsPeriod(start: string, end: string, period: Exclude<HardSubjectsPeriodPreference, 'any'>) {
  if (!isValidWindow(start, end)) return false;
  const windowStart = timeToMinutes(start);
  const windowEnd = timeToMinutes(end);
  const periodWindow = HARD_PERIOD_WINDOWS[period];
  return windowStart < periodWindow.end && windowEnd > periodWindow.start;
}

function getAvailableHardPeriods(
  availability: DailyAvailabilityByWeekday,
  dailyHours: DailyHoursByWeekday
) {
  const explicitWindows = DAY_OPTIONS
    .map((day) => ({
      hours: dailyHours[day.key] || 0,
      window: availability[day.key],
    }))
    .filter((entry) => entry.hours > 0 && isValidWindow(entry.window.start, entry.window.end));

  if (explicitWindows.length === 0) {
    return {
      hasExplicitWindows: false,
      periods: new Set<Exclude<HardSubjectsPeriodPreference, 'any'>>(
        ['morning', 'afternoon', 'night']
      ),
    };
  }

  const periods = new Set<Exclude<HardSubjectsPeriodPreference, 'any'>>();
  for (const entry of explicitWindows) {
    (Object.keys(HARD_PERIOD_WINDOWS) as Array<Exclude<HardSubjectsPeriodPreference, 'any'>>).forEach((period) => {
      if (windowOverlapsPeriod(entry.window.start, entry.window.end, period)) {
        periods.add(period);
      }
    });
  }

  return { hasExplicitWindows: true, periods };
}

const emptyAvailability = (): DailyAvailabilityByWeekday => ({
  dom: { start: '', end: '' },
  seg: { start: '', end: '' },
  ter: { start: '', end: '' },
  qua: { start: '', end: '' },
  qui: { start: '', end: '' },
  sex: { start: '', end: '' },
  sab: { start: '', end: '' },
});

const defaultDailyHours = (goal: PresetWizardAnswers['goal']): DailyHoursByWeekday => {
  if (goal === 'medicina') return { dom: 0, seg: 5, ter: 5, qua: 5, qui: 5, sex: 5, sab: 3 };
  if (goal === 'enem' || goal === 'concurso') return { dom: 0, seg: 4, ter: 4, qua: 4, qui: 4, sex: 4, sab: 2 };
  return { dom: 0, seg: 3, ter: 3, qua: 3, qui: 3, sex: 3, sab: 2 };
};
const getActiveDayValues = (dailyHours: DailyHoursByWeekday) =>
  DAY_OPTIONS.filter((day) => (dailyHours[day.key] || 0) > 0).map((day) => day.value);

const resolveGoal = (presetId: string, presetName: string): PresetWizardAnswers['goal'] => {
  const s = `${presetId} ${presetName}`.toLowerCase();
  if (s.includes('enem')) return 'enem';
  if (s.includes('med')) return 'medicina';
  if (s.includes('conc')) return 'concurso';
  return 'outros';
};

const mapStudyStyleToContentPref = (style: StudyStylePreference): NonNullable<PresetWizardAnswers['studyContentPreference']> => {
  if (style === 'theory') return 'aulas';
  if (style === 'practice') return 'exercicios';
  return 'misto';
};

const mapStudyStyleToConcursoPriority = (style: StudyStylePreference): ConcursoStudyPriority => {
  if (style === 'theory') return 'teoria';
  if (style === 'practice') return 'exercicios';
  return 'equilibrado';
};

const mapConcursoPriorityToStudyStyle = (priority: ConcursoStudyPriority): StudyStylePreference => {
  if (priority === 'teoria') return 'theory';
  if (priority === 'exercicios') return 'practice';
  return 'balanced';
};

const buildDefaultAnswers = (
  presetId: string,
  presetName: string,
  baseSettings?: UserSettings
): PresetWizardAnswers => {
  const goal = resolveGoal(presetId, presetName);
  const concursoDefaults =
    goal === 'concurso'
      ? {
          concursoArea: 'administrativa' as const,
          concursoLevel: 'superior' as const,
          concursoExperience: 'nunca' as const,
          concursoPriorityMode: 'equilibrado' as const,
          concursoSubjectsRaw: '',
        }
      : {};

  const baseAiDifficulty = baseSettings?.aiDifficulty ?? 'adaptive';
  const aiScheduleProfile = getAiScheduleProfile(baseAiDifficulty);
  const baseFocusMode = baseSettings?.focusMode ?? false;
  const baseAutoSchedule = baseSettings?.autoSchedule ?? true;
  const baseSmartBreaks = baseSettings?.smartBreaks ?? true;

  return {
    goal,
    dailyHoursByWeekday: defaultDailyHours(goal),
    dailyAvailabilityByWeekday: emptyAvailability(),
    focusMinutes: aiScheduleProfile.focusBlockMinutes,
    focusBlockMinutes: aiScheduleProfile.focusBlockMinutes,
    breakMinutes: aiScheduleProfile.breakMinutes,
    firstCycleAllSubjects: true,
    aiDifficulty: baseAiDifficulty,
    focusMode: baseFocusMode,
    autoSchedule: baseAutoSchedule,
    smartBreaks: baseSmartBreaks,
    hardSubjectsPeriodPreference: 'any',
    studyStyle: 'balanced',
    studyContentPreference: 'misto',
    startDate: toDateKey(new Date()),
    examDate: '',
    ...concursoDefaults,
  };
};

export default function PresetConfigWizard({ isOpen, presetId, presetName, baseSettings, onClose, onApply }: PresetConfigWizardProps) {
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<PresetWizardAnswers>(() =>
    buildDefaultAnswers(presetId, presetName, baseSettings)
  );
  const [error, setError] = useState<string | null>(null);
  const [massHours, setMassHours] = useState(4);
  const [massDays, setMassDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [massStart, setMassStart] = useState('');
  const [massEnd, setMassEnd] = useState('');
  const [hasExamDate, setHasExamDate] = useState(false);

  const todayKey = useMemo(() => toDateKey(new Date()), []);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!isOpen) return;
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const next = buildDefaultAnswers(presetId, presetName, baseSettings);
    setAnswers(next);
    setStep(0);
    setError(null);
    setMassHours(4);
    setMassDays(getActiveDayValues(next.dailyHoursByWeekday));
    setMassStart('');
    setMassEnd('');
    setHasExamDate(Boolean(next.examDate));
  }, [isOpen, presetId, presetName, baseSettings]);

  const summary = useMemo(() => computeStudyPreferences(baseSettings, answers), [baseSettings, answers]);
  const progress = Math.round(((step + 1) / STEP_TITLES.length) * 100);
  const activeDays = useMemo(() => DAY_OPTIONS.filter((d) => (answers.dailyHoursByWeekday[d.key] || 0) > 0), [answers.dailyHoursByWeekday]);
  const weeklyHours = useMemo(() => Object.values(answers.dailyHoursByWeekday).reduce((sum, h) => sum + (h || 0), 0), [answers.dailyHoursByWeekday]);
  const blocksPerDay = useMemo(() => {
    const cycle = (answers.focusBlockMinutes || answers.focusMinutes) + answers.breakMinutes;
    const res: Record<WeekdayKey, number> = { dom: 0, seg: 0, ter: 0, qua: 0, qui: 0, sex: 0, sab: 0 };
    DAY_OPTIONS.forEach((d) => {
      const h = answers.dailyHoursByWeekday[d.key] || 0;
      if (h <= 0) return;
      res[d.key] = Math.max(1, Math.floor(((h * 60) + answers.breakMinutes) / cycle));
    });
    return res;
  }, [answers.breakMinutes, answers.dailyHoursByWeekday, answers.focusBlockMinutes, answers.focusMinutes]);
  const weeklyBlocks = useMemo(() => Object.values(blocksPerDay).reduce((sum, n) => sum + n, 0), [blocksPerDay]);
  const massWindowSuggestions = useMemo(() => buildMassWindowSuggestions(massHours), [massHours]);
  const primaryMassSuggestion = massWindowSuggestions[0];
  const effectiveMassStart = massStart || primaryMassSuggestion.start;
  const effectiveMassEnd = massEnd || primaryMassSuggestion.end;
  const effectiveMassHours = windowHours(effectiveMassStart, effectiveMassEnd) ?? clampHours(massHours);
  const averageActiveHours = activeDays.length > 0 ? weeklyHours / activeDays.length : 0;
  const activeDayLabels = activeDays.map((day) => day.label).join(', ') || 'Nenhum dia';
  const daysWithWindows = activeDays.filter((day) => {
    const window = answers.dailyAvailabilityByWeekday[day.key];
    return isValidWindow(window.start, window.end);
  }).length;
  const allActiveDaysHaveWindows = activeDays.length > 0 && daysWithWindows === activeDays.length;
  const hardPeriodAvailability = useMemo(
    () => getAvailableHardPeriods(answers.dailyAvailabilityByWeekday, answers.dailyHoursByWeekday),
    [answers.dailyAvailabilityByWeekday, answers.dailyHoursByWeekday]
  );
  const availableHardPeriodLabels = useMemo(
    () =>
      (Object.keys(HARD_PERIOD_WINDOWS) as Array<Exclude<HardSubjectsPeriodPreference, 'any'>>)
        .filter((period) => hardPeriodAvailability.periods.has(period))
        .map((period) => HARD_PERIOD_LABELS[period]),
    [hardPeriodAvailability]
  );

  useEffect(() => {
    if (!hardPeriodAvailability.hasExplicitWindows) return;
    const current = answers.hardSubjectsPeriodPreference || 'any';
    if (current === 'any') return;
    if (hardPeriodAvailability.periods.has(current)) return;

    const fallback =
      (Object.keys(HARD_PERIOD_WINDOWS) as Array<Exclude<HardSubjectsPeriodPreference, 'any'>>).find((period) =>
        hardPeriodAvailability.periods.has(period)
      ) || 'any';
    setAnswers((prev) => ({ ...prev, hardSubjectsPeriodPreference: fallback }));
  }, [
    answers.hardSubjectsPeriodPreference,
    hardPeriodAvailability.hasExplicitWindows,
    hardPeriodAvailability.periods,
  ]);

  const resetAndClose = () => {
    setStep(0);
    setError(null);
    setAnswers(buildDefaultAnswers(presetId, presetName, baseSettings));
    onClose();
  };

  const patchAnswers = (patch: Partial<PresetWizardAnswers>) => setAnswers((prev) => ({ ...prev, ...patch }));
  const applyAiDifficulty = (value: AIDifficulty) => {
    const profile = getAiScheduleProfile(value);
    patchAnswers({
      aiDifficulty: value,
      focusMinutes: profile.focusBlockMinutes,
      focusBlockMinutes: profile.focusBlockMinutes,
      breakMinutes: profile.breakMinutes,
      smartBreaks: value === 'adaptive' ? true : answers.smartBreaks,
    });
  };
  const updateSelectedDaysSchedule = (days: number[], start: string, end: string) => {
    const autoHours = windowHours(start, end);
    setAnswers((prev) => {
      const nextWindows = { ...prev.dailyAvailabilityByWeekday };
      const nextHours = { ...prev.dailyHoursByWeekday };

      days.forEach((value) => {
        const day = DAY_OPTIONS.find((item) => item.value === value);
        if (!day) return;
        nextWindows[day.key] = { start, end };
        nextHours[day.key] = autoHours ?? clampHours(massHours);
      });

      return { ...prev, dailyAvailabilityByWeekday: nextWindows, dailyHoursByWeekday: nextHours };
    });
  };
  const setMassHoursPreset = (hours: number) => {
    const start = massStart || '08:00';
    const end = addMinutesToClock(start, hours * 60);
    setMassHours(hours);
    setMassStart(start);
    setMassEnd(end);
    updateSelectedDaysSchedule(massDays, start, end);
  };
  const updateMassStart = (value: string) => {
    setMassStart(value);
    if (!value) return;
    const nextEnd =
      !massEnd || timeToMinutes(massEnd) <= timeToMinutes(value)
        ? addMinutesToClock(value, massHours * 60)
        : massEnd;
    setMassEnd(nextEnd);
    updateSelectedDaysSchedule(massDays, value, nextEnd);
  };
  const updateMassEnd = (value: string) => {
    setMassEnd(value);
    const hours = windowHours(effectiveMassStart, value);
    if (hours !== null) setMassHours(clampHours(hours));
    if (hours !== null) updateSelectedDaysSchedule(massDays, effectiveMassStart, value);
  };
  const applySuggestedMassWindow = (start: string, end: string) => {
    setMassStart(start);
    setMassEnd(end);
    const hours = windowHours(start, end);
    if (hours !== null) setMassHours(clampHours(hours));
    updateSelectedDaysSchedule(massDays, start, end);
  };
  const toggleMassDay = (value: number) => {
    const day = DAY_OPTIONS.find((item) => item.value === value);
    if (!day) return;

    setMassDays((prev) => {
      const removing = prev.includes(value);
      const next = removing ? prev.filter((dayValue) => dayValue !== value) : [...prev, value].sort((a, b) => a - b);

      setAnswers((current) => {
        const nextWindows = { ...current.dailyAvailabilityByWeekday };
        const nextHours = { ...current.dailyHoursByWeekday };

        if (removing) {
          nextWindows[day.key] = { start: '', end: '' };
          nextHours[day.key] = 0;
        } else {
          nextWindows[day.key] = { start: effectiveMassStart, end: effectiveMassEnd };
          nextHours[day.key] = effectiveMassHours;
        }

        return { ...current, dailyAvailabilityByWeekday: nextWindows, dailyHoursByWeekday: nextHours };
      });

      return next;
    });
  };
  const toggleDayActive = (value: number) => {
    const day = DAY_OPTIONS.find((d) => d.value === value);
    if (!day) return;
    const isActive = (answers.dailyHoursByWeekday[day.key] || 0) > 0;
    setMassDays((prev) =>
      isActive ? prev.filter((dayValue) => dayValue !== value) : [...new Set([...prev, value])].sort((a, b) => a - b)
    );
    setAnswers((prev) => {
      const currentHours = prev.dailyHoursByWeekday[day.key] || 0;
      const nextHours = { ...prev.dailyHoursByWeekday };
      const nextWindows = { ...prev.dailyAvailabilityByWeekday };
      if (currentHours > 0) {
        nextHours[day.key] = 0;
        nextWindows[day.key] = { start: '', end: '' };
      } else {
        const start = massStart || primaryMassSuggestion.start;
        const end = massEnd || primaryMassSuggestion.end;
        nextWindows[day.key] = { start, end };
        nextHours[day.key] = windowHours(start, end) ?? clampHours(massHours || 2);
      }
      return { ...prev, dailyHoursByWeekday: nextHours, dailyAvailabilityByWeekday: nextWindows };
    });
  };
  const clearDaySchedule = (key: WeekdayKey) => {
    const day = DAY_OPTIONS.find((item) => item.key === key);
    if (day) setMassDays((prev) => prev.filter((value) => value !== day.value));
    setAnswers((prev) => ({
      ...prev,
      dailyHoursByWeekday: {
        ...prev.dailyHoursByWeekday,
        [key]: 0,
      },
      dailyAvailabilityByWeekday: {
        ...prev.dailyAvailabilityByWeekday,
        [key]: { start: '', end: '' },
      },
    }));
  };
  const updateDayWindow = (key: WeekdayKey, field: 'start' | 'end', value: string) => {
    setAnswers((prev) => {
      const nextWindows = {
        ...prev.dailyAvailabilityByWeekday,
        [key]: {
          ...prev.dailyAvailabilityByWeekday[key],
          [field]: value,
        },
      };
      const nextHours = { ...prev.dailyHoursByWeekday };
      const autoHours = windowHours(nextWindows[key].start, nextWindows[key].end);
      if (autoHours !== null) nextHours[key] = autoHours;
      return {
        ...prev,
        dailyAvailabilityByWeekday: nextWindows,
        dailyHoursByWeekday: nextHours,
      };
    });
  };
  const validateStep0 = () => {
    if (activeDays.length === 0) return 'Defina pelo menos um dia com horas líquidas > 0.';
    for (const day of DAY_OPTIONS) {
      const hours = answers.dailyHoursByWeekday[day.key] || 0;
      const window = answers.dailyAvailabilityByWeekday[day.key];
      if (!(window.start || window.end)) continue;
      if (!window.start || !window.end) return `${day.label}: preencha início e fim ou limpe a janela.`;
      if (!isValidWindow(window.start, window.end)) return `${day.label}: horário inválido.`;
      if (hours > 0) {
        const maxHours = (timeToMinutes(window.end) - timeToMinutes(window.start)) / 60;
        if (hours > maxHours + 0.01) return `${day.label}: horas líquidas excedem a janela do dia.`;
      }
    }
    return null;
  };
  const validateStep4 = () => {
    if (answers.targetMode === 'months' && (!answers.targetMonths || answers.targetMonths <= 0)) {
      return 'Informe o tempo desejado em meses (maior que zero).';
    }
    if (answers.targetMode === 'totalHours' && (!answers.targetTotalHours || answers.targetTotalHours <= 0)) {
      return 'Informe a meta de horas totais (maior que zero).';
    }
    return null;
  };

  const validateStep5 = () => {
    if (!hasExamDate) return null;
    if (!answers.examDate) return 'Selecione a data da prova ou marque que ainda não tem data.';
    if (answers.examDate < todayKey) return 'A data da prova precisa ser hoje ou futura.';
    return null;
  };
  const next = () => {
    setError(null);
    const err = step === 0 ? validateStep0() : step === 4 ? validateStep4() : step === 5 ? validateStep5() : null;
    if (err) return setError(err);
    setStep((s) => Math.min(STEP_TITLES.length - 1, s + 1));
  };
  const apply = () => {
    setError(null);
    const err = validateStep0() || validateStep4() || validateStep5();
    if (err) return setError(err);
    onApply(summary.settings, summary.studyPrefs, { ...answers, examDate: hasExamDate ? answers.examDate : '' });
    resetAndClose();
  };

  if (!isOpen || !mounted) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[10000] grid place-items-start overflow-hidden bg-black/80 pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pt-[calc(0.75rem+max(env(safe-area-inset-top),0px))] pb-[calc(0.75rem+max(env(safe-area-inset-bottom),0px))] sm:place-items-center sm:pl-[max(1rem,env(safe-area-inset-left))] sm:pr-[max(1rem,env(safe-area-inset-right))]"
        variants={overlayVariants}
        initial="hidden"
        animate="visible"
        exit="hidden"
      >
        <motion.div
          variants={modalVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          className="flex w-full min-h-0 max-w-4xl flex-col max-h-[calc(100dvh-1.5rem-max(env(safe-area-inset-top),0px)-max(env(safe-area-inset-bottom),0px))]"
        >
          <Card className="flex flex-1 min-h-0 flex-col overflow-hidden rounded-2xl border-white/10 bg-[#0b0e17]/95 p-2.5 sm:p-5 md:p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-neon-cyan sm:text-sm">Configuração do cronograma</p>
                <h2 className="text-xl font-heading font-bold text-white sm:text-2xl">{presetName}</h2>
                <p className="mt-1 text-xs text-text-secondary sm:text-sm">Fluxo curto: cada resposta altera a geração do cronograma.</p>
              </div>
              <Button variant="ghost" className="h-9 min-h-0 px-3 text-xs sm:h-10 sm:text-sm" onClick={resetAndClose}>Fechar</Button>
            </div>

            <div className="mt-3 sm:mt-4">
              <ProgressBar value={progress} label={`${progress}%`} />
              <div className="mt-2 grid gap-2 text-center text-[11px] text-text-muted" style={{ gridTemplateColumns: `repeat(${STEP_TITLES.length}, minmax(0, 1fr))` }}>
                {STEP_TITLES.map((title, idx) => (
                  <span key={title} className={cn(idx === step ? 'text-white' : 'text-text-muted')}>
                    <span className="inline sm:hidden">{STEP_TITLES_SHORT[idx]}</span>
                    <span className="hidden sm:inline">{title}</span>
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-4 flex-1 min-h-0 overflow-y-auto scroll-touch px-0.5 sm:px-1.5 pb-3 sm:pb-6 space-y-4 sm:space-y-6">
              {step === 0 && (
                <>
                  <Card className={cn(SETTINGS_SECTION_CLASS, 'p-3 sm:p-4')}>
                    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white">Sua disponibilidade atual</p>
                        <p className="mt-1 text-xs text-text-secondary">
                          Tudo aqui recalcula a agenda. Horário de início e fim define a carga do dia.
                        </p>
                      </div>
                      <div className={cn(
                        'rounded-full border px-3 py-1 text-xs font-medium',
                        allActiveDaysHaveWindows
                          ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                          : 'border-amber-400/30 bg-amber-400/10 text-amber-300'
                      )}>
                        {allActiveDaysHaveWindows ? 'Horários completos' : 'Faltam horários'}
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <p className="text-[11px] text-text-muted">Semana</p>
                        <p className="mt-1 text-lg font-semibold text-white">{fmtHours(weeklyHours)}</p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <p className="text-[11px] text-text-muted">Dias</p>
                        <p className="mt-1 text-lg font-semibold text-white">{activeDays.length}</p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <p className="text-[11px] text-text-muted">Média</p>
                        <p className="mt-1 text-lg font-semibold text-white">{fmtHours(averageActiveHours)}</p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <p className="text-[11px] text-text-muted">Blocos</p>
                        <p className="mt-1 text-lg font-semibold text-white">{weeklyBlocks}/sem</p>
                      </div>
                    </div>

                    <p className="mt-3 text-xs text-text-muted">Dias ativos: {activeDayLabels}</p>
                  </Card>

                  <Card className={cn(SETTINGS_SECTION_CLASS, 'overflow-hidden p-0')}>
                    <div className="border-b border-white/10 px-3 py-2.5">
                      <p className="text-sm font-semibold text-white">Rotina principal</p>
                      <p className="mt-1 text-xs text-text-muted">
                        Mude dias ou horários aqui e o resumo atualiza na hora.
                      </p>
                    </div>

                    <div className="space-y-3 p-3">
                      <div>
                        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-text-muted">Duração</p>
                        <div className="flex flex-wrap gap-2">
                          {QUICK_HOURS.map((h) => (
                            <button
                              key={h}
                              type="button"
                              className={cn(
                                'rounded-xl border px-3 py-1.5 text-xs transition-colors',
                                Math.abs(effectiveMassHours - h) < 0.01
                                  ? 'border-neon-cyan/60 bg-neon-cyan/10 text-white'
                                  : 'border-white/10 text-text-secondary hover:text-white'
                              )}
                              onClick={() => setMassHoursPreset(h)}
                            >
                              {formatDuration(h * 60)}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-text-muted">Dias</p>
                        <div className="flex flex-wrap gap-2">
                          {DAY_OPTIONS.map((d) => (
                            <button
                              key={d.key}
                              type="button"
                              aria-pressed={massDays.includes(d.value)}
                              className={cn(
                                'rounded-xl border px-3 py-1.5 text-xs transition-colors',
                                massDays.includes(d.value)
                                  ? 'border-neon-purple/60 bg-neon-purple/15 text-white'
                                  : 'border-white/10 text-text-secondary hover:text-white'
                              )}
                              onClick={() => toggleMassDay(d.value)}
                            >
                              {d.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-text-muted">Horário</p>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                          <label className="min-w-0">
                            <span className="sr-only">Início</span>
                            <input
                              type="time"
                              value={effectiveMassStart}
                              onChange={(e) => updateMassStart(e.target.value)}
                              className="input-field h-9 min-h-0 w-full min-w-0 text-sm sm:h-10"
                            />
                          </label>
                          <label className="min-w-0">
                            <span className="sr-only">Fim</span>
                            <input
                              type="time"
                              value={effectiveMassEnd}
                              onChange={(e) => updateMassEnd(e.target.value)}
                              className="input-field h-9 min-h-0 w-full min-w-0 text-sm sm:h-10"
                            />
                          </label>
                          <div className="flex items-center justify-center rounded-xl border border-white/10 px-3 py-2 text-xs text-text-secondary">
                            {fmtHours(effectiveMassHours)}
                          </div>
                        </div>

                        <div className="mt-2 flex flex-wrap gap-2">
                          {massWindowSuggestions.map((slot) => (
                            <button
                              key={slot.id}
                              type="button"
                              className={cn(
                                'rounded-xl border px-2.5 py-1 text-[11px] transition-colors',
                                effectiveMassStart === slot.start && effectiveMassEnd === slot.end
                                  ? 'border-neon-cyan/60 bg-neon-cyan/10 text-white'
                                  : 'border-white/10 text-text-secondary hover:text-white'
                              )}
                              onClick={() => applySuggestedMassWindow(slot.start, slot.end)}
                            >
                              {slot.label} {slot.start}-{slot.end}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </Card>

                  <Card className={cn(SETTINGS_SECTION_CLASS, 'overflow-hidden p-0')}>
                    <div className="border-b border-white/10 px-3 py-2.5">
                      <p className="text-sm font-semibold text-white">Ajuste por dia</p>
                      <p className="mt-1 text-xs text-text-muted">
                        Ative os dias que você estuda. A carga aparece automaticamente pelo intervalo.
                      </p>
                    </div>

                    <div className="divide-y divide-white/10">
                      {DAY_OPTIONS.map((d) => {
                        const hours = answers.dailyHoursByWeekday[d.key] || 0;
                        const active = hours > 0;
                        const w = answers.dailyAvailabilityByWeekday[d.key];
                        const windowComplete = isValidWindow(w.start, w.end);

                        return (
                          <div key={d.key} className="px-3 py-3">
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[70px_1fr_1fr_110px_auto] sm:items-center">
                              <button
                                type="button"
                                aria-pressed={active}
                                onClick={() => toggleDayActive(d.value)}
                                className={cn(
                                  'h-9 rounded-lg border px-2.5 text-xs font-medium transition-colors',
                                  active
                                    ? 'border-neon-cyan/60 bg-neon-cyan/10 text-white'
                                    : 'border-white/10 text-text-muted hover:text-white'
                                )}
                              >
                                {d.label}
                              </button>

                              <label className="min-w-0">
                                <span className="mb-1 block text-[11px] text-text-muted sm:hidden">Início</span>
                                <input
                                  type="time"
                                  disabled={!active}
                                  value={w.start}
                                  onChange={(e) => updateDayWindow(d.key, 'start', e.target.value)}
                                  className={cn('input-field h-9 min-h-0 w-full min-w-0 text-sm', !active && 'opacity-60')}
                                />
                              </label>

                              <label className="min-w-0">
                                <span className="mb-1 block text-[11px] text-text-muted sm:hidden">Fim</span>
                                <input
                                  type="time"
                                  disabled={!active}
                                  value={w.end}
                                  onChange={(e) => updateDayWindow(d.key, 'end', e.target.value)}
                                  className={cn('input-field h-9 min-h-0 w-full min-w-0 text-sm', !active && 'opacity-60')}
                                />
                              </label>

                              <div
                                className={cn(
                                  'flex h-9 items-center justify-center rounded-lg border px-2 text-xs font-medium',
                                  active && windowComplete
                                    ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                                    : active
                                    ? 'border-amber-400/30 bg-amber-400/10 text-amber-300'
                                    : 'border-white/10 text-text-muted'
                                )}
                              >
                                {active ? (windowComplete ? fmtHours(hours) : 'Informe horário') : 'Dia livre'}
                              </div>

                              <button
                                type="button"
                                className="h-9 rounded-lg border border-white/10 px-2 text-xs text-text-secondary hover:text-white"
                                onClick={() => clearDaySchedule(d.key)}
                              >
                                Limpar
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                </>
              )}

              {step === 1 && (
                <>
                  <Card className={cn(SETTINGS_SECTION_CLASS, 'p-3 sm:p-4')}>
                    <p className="mb-2 text-sm font-semibold text-white">Duração do bloco de foco (minutos)</p>
                    <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
                      {FOCUS_OPTIONS.map((v) => (
                        <button
                          key={v}
                          type="button"
                          className={cn(
                            'rounded-xl border px-3 py-2 text-xs sm:text-sm',
                            (answers.focusBlockMinutes || answers.focusMinutes) === v
                              ? 'border-neon-cyan/60 bg-neon-cyan/10 text-white'
                              : 'border-white/10 text-text-secondary'
                          )}
                          onClick={() => patchAnswers({ focusMinutes: v, focusBlockMinutes: v })}
                        >
                          {v} min
                        </button>
                      ))}
                    </div>
                  </Card>
                  <Card className={cn(SETTINGS_SECTION_CLASS, 'p-3 sm:p-4')}>
                    <p className="mb-2 text-sm font-semibold text-white">Tempo de pausa (minutos)</p>
                    <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
                      {BREAK_OPTIONS.map((v) => (
                        <button
                          key={v}
                          type="button"
                          className={cn(
                            'rounded-xl border px-3 py-2 text-xs sm:text-sm',
                            answers.breakMinutes === v
                              ? 'border-neon-purple/60 bg-neon-purple/10 text-white'
                              : 'border-white/10 text-text-secondary'
                          )}
                          onClick={() => patchAnswers({ breakMinutes: v })}
                        >
                          {v} min
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-text-muted">A engine usará exatamente foco = bloco e pausa = intervalo.</p>
                  </Card>
                </>
              )}

              {step === 2 && (
                <Card className={cn(SETTINGS_SECTION_CLASS, 'p-3 sm:p-4')}>
                  <p className="mb-2 text-sm font-semibold text-white">
                    Dentro dos horários informados, quando prefere colocar matérias difíceis?
                  </p>
                  <p className="mb-3 text-xs text-text-secondary">
                    {hardPeriodAvailability.hasExplicitWindows
                      ? `Pelos horários escolhidos, há janela de estudo em: ${availableHardPeriodLabels.join(', ') || 'nenhum período válido'}.`
                      : 'Como nenhum horário de início/fim foi informado, esta escolha funciona como preferência geral.'}
                  </p>
                  <div className="space-y-2">
                    {HARD_PERIOD_OPTIONS.map((opt) => {
                      const unavailable =
                        hardPeriodAvailability.hasExplicitWindows &&
                        opt.value !== 'any' &&
                        !hardPeriodAvailability.periods.has(opt.value);
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          disabled={unavailable}
                          className={cn(
                            SETTINGS_ROW_CLASS,
                            unavailable && 'cursor-not-allowed opacity-45',
                            !unavailable &&
                              (answers.hardSubjectsPeriodPreference || 'any') === opt.value
                              ? 'border-neon-blue/60 bg-neon-blue/10 text-white'
                              : 'text-text-secondary hover:text-white'
                          )}
                          onClick={() => patchAnswers({ hardSubjectsPeriodPreference: opt.value })}
                        >
                          <div className="text-sm font-medium">{opt.label}</div>
                          <div className="mt-0.5 text-xs opacity-80">
                            {unavailable ? 'Fora do horário de estudo informado' : opt.desc}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </Card>
              )}

              {step === 3 && (
                <>
                  <Card className={cn(SETTINGS_SECTION_CLASS, 'p-3 sm:p-4')}>
                    <p className="mb-2 text-sm font-semibold text-white">Qual estilo você prefere?</p>
                    <div className="space-y-2">
                      {STUDY_STYLE_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          className={cn(
                            SETTINGS_ROW_CLASS,
                            (answers.studyStyle || 'balanced') === opt.value
                              ? 'border-neon-cyan/60 bg-neon-cyan/10 text-white'
                              : 'text-text-secondary hover:text-white'
                          )}
                          onClick={() =>
                            patchAnswers({
                              studyStyle: opt.value,
                              studyContentPreference: mapStudyStyleToContentPref(opt.value),
                              ...(answers.goal === 'concurso'
                                ? {
                                    concursoPriorityMode:
                                      mapStudyStyleToConcursoPriority(opt.value),
                                  }
                                : {}),
                            })
                          }
                        >
                          <div className="text-sm font-medium">{opt.label}</div>
                          <div className="mt-0.5 text-xs opacity-80">{opt.desc}</div>
                        </button>
                      ))}
                    </div>
                    <p className="mt-3 text-xs text-text-muted">
                      Revisões e simulados continuam automáticos; esta escolha ajusta o mix entre aula e exercícios.
                    </p>
                  </Card>

                  <Card className={cn(SETTINGS_SECTION_CLASS, 'p-3 sm:p-4')}>
                    <p className="mb-2 text-sm font-semibold text-white">
                      Como você quer que o preset funcione no início?
                    </p>
                    <div className="space-y-2">
                      {PRESET_FLOW_OPTIONS.map((opt) => (
                        <button
                          key={String(opt.value)}
                          type="button"
                          className={cn(
                            SETTINGS_ROW_CLASS,
                            (answers.firstCycleAllSubjects ?? true) === opt.value
                              ? 'border-neon-blue/60 bg-neon-blue/10 text-white'
                              : 'text-text-secondary hover:text-white'
                          )}
                          onClick={() => patchAnswers({ firstCycleAllSubjects: opt.value })}
                        >
                          <div className="text-sm font-medium">{opt.label}</div>
                          <div className="mt-0.5 text-xs opacity-80">{opt.desc}</div>
                        </button>
                      ))}
                    </div>
                    <p className="mt-3 text-xs text-text-muted">
                      Você pode mudar isso depois na Agenda (Trilha de aprovação).
                    </p>
                  </Card>

                  <Card className={cn(SETTINGS_SECTION_CLASS, 'space-y-3 p-3 sm:p-4')}>
                    <p className="text-sm font-semibold text-white">Como a IA deve agendar seus estudos?</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {AI_DIFFICULTY_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          className={cn(
                            'rounded-xl border px-3 py-2 text-xs sm:text-sm',
                            (answers.aiDifficulty || 'adaptive') === opt.value
                              ? 'border-neon-cyan/60 bg-neon-cyan/10 text-white'
                              : 'border-white/10 text-text-secondary'
                          )}
                          onClick={() => applyAiDifficulty(opt.value)}
                        >
                          <div className="text-sm font-medium">{opt.label}</div>
                          <div className="mt-0.5 text-[11px] opacity-80">{opt.desc}</div>
                        </button>
                      ))}
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#1a1d28]/85 px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white">Modo Foco</p>
                          <p className="text-xs text-text-secondary">Blocos um pouco mais longos e pausas menores</p>
                        </div>
                        <button
                          className={cn(
                            'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                            answers.focusMode ? 'bg-neon-cyan' : 'bg-white/10'
                          )}
                          onClick={() => patchAnswers({ focusMode: !answers.focusMode })}
                          aria-label="Alternar modo foco"
                        >
                          <span
                            className={cn(
                              'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                              answers.focusMode ? 'translate-x-6' : 'translate-x-1'
                            )}
                          />
                        </button>
                      </div>

                      <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#1a1d28]/85 px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white">Agendamento automático</p>
                          <p className="text-xs text-text-secondary">A IA cria automaticamente agendas semanais</p>
                        </div>
                        <button
                          className={cn(
                            'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                            answers.autoSchedule ? 'bg-neon-cyan' : 'bg-white/10'
                          )}
                          onClick={() => patchAnswers({ autoSchedule: !answers.autoSchedule })}
                          aria-label="Alternar agendamento automático"
                        >
                          <span
                            className={cn(
                              'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                              answers.autoSchedule ? 'translate-x-6' : 'translate-x-1'
                            )}
                          />
                        </button>
                      </div>

                      <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#1a1d28]/85 px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white">Pausas inteligentes</p>
                          <p className="text-xs text-text-secondary">Ajusta pausas de acordo com o ritmo escolhido</p>
                        </div>
                        <button
                          className={cn(
                            'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                            answers.smartBreaks ? 'bg-neon-cyan' : 'bg-white/10'
                          )}
                          onClick={() => patchAnswers({ smartBreaks: !answers.smartBreaks })}
                          aria-label="Alternar pausas inteligentes"
                        >
                          <span
                            className={cn(
                              'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                              answers.smartBreaks ? 'translate-x-6' : 'translate-x-1'
                            )}
                          />
                        </button>
                      </div>
                      <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#1a1d28]/85 px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white">Absorção de atrasos nos descansos</p>
                          <p className="text-xs text-text-secondary">Usa dias de descanso (contingência) em atrasos severos</p>
                        </div>
                        <button
                          className={cn(
                            'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                            answers.allowRestDaysForRecovery ? 'bg-neon-cyan' : 'bg-white/10'
                          )}
                          onClick={() => patchAnswers({ allowRestDaysForRecovery: !answers.allowRestDaysForRecovery })}
                          aria-label="Alternar absorção de atraso"
                        >
                          <span
                            className={cn(
                              'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                              answers.allowRestDaysForRecovery ? 'translate-x-6' : 'translate-x-1'
                            )}
                          />
                        </button>
                      </div>
                    </div>
                  </Card>

                  {answers.goal === 'concurso' && (
                    <>
                      <Card className={cn(SETTINGS_SECTION_CLASS, 'p-3 sm:p-4')}>
                        <p className="mb-2 text-sm font-semibold text-white">Qual área de concurso você pretende focar?</p>
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                          {CONCURSO_AREA_OPTIONS.map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              className={cn(
                                SETTINGS_ROW_CLASS,
                                answers.concursoArea === opt.value
                                  ? 'border-neon-blue/60 bg-neon-blue/10 text-white'
                                  : 'text-text-secondary hover:text-white'
                              )}
                              onClick={() => patchAnswers({ concursoArea: opt.value })}
                            >
                              <div className="text-sm font-medium">{opt.label}</div>
                              <div className="mt-0.5 text-xs opacity-80">{opt.desc}</div>
                            </button>
                          ))}
                        </div>
                      </Card>

                      <Card className={cn(SETTINGS_SECTION_CLASS, 'space-y-4 p-3 sm:p-4')}>
                        <div>
                          <p className="mb-2 text-sm font-semibold text-white">Qual nível do concurso?</p>
                          <div className="grid grid-cols-3 gap-2">
                            {CONCURSO_LEVEL_OPTIONS.map((opt) => (
                              <button
                                key={opt.value}
                                type="button"
                                className={cn(
                                  'rounded-xl border px-3 py-2 text-xs sm:text-sm',
                                  answers.concursoLevel === opt.value
                                    ? 'border-neon-cyan/60 bg-neon-cyan/10 text-white'
                                    : 'border-white/10 text-text-secondary'
                                )}
                                onClick={() => patchAnswers({ concursoLevel: opt.value })}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <p className="mb-2 text-sm font-semibold text-white">Você já estudou para concursos antes?</p>
                          <div className="space-y-2">
                            {CONCURSO_EXPERIENCE_OPTIONS.map((opt) => (
                              <button
                                key={opt.value}
                                type="button"
                                className={cn(
                                  SETTINGS_ROW_CLASS,
                                  answers.concursoExperience === opt.value
                                    ? 'border-neon-purple/60 bg-neon-purple/10 text-white'
                                    : 'text-text-secondary hover:text-white'
                                )}
                                onClick={() => patchAnswers({ concursoExperience: opt.value })}
                              >
                                <div className="text-sm font-medium">{opt.label}</div>
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <p className="mb-2 text-sm font-semibold text-white">Quer focar mais em:</p>
                          <div className="space-y-2">
                            {CONCURSO_PRIORITY_OPTIONS.map((opt) => (
                              <button
                                key={opt.value}
                                type="button"
                                className={cn(
                                  SETTINGS_ROW_CLASS,
                                  (answers.concursoPriorityMode || 'equilibrado') === opt.value
                                    ? 'border-neon-cyan/60 bg-neon-cyan/10 text-white'
                                    : 'text-text-secondary hover:text-white'
                                )}
                                onClick={() => {
                                  const mappedStyle = mapConcursoPriorityToStudyStyle(opt.value);
                                  patchAnswers({
                                    concursoPriorityMode: opt.value,
                                    studyStyle: mappedStyle,
                                    studyContentPreference: mapStudyStyleToContentPref(mappedStyle),
                                  });
                                }}
                              >
                                <div className="text-sm font-medium">{opt.label}</div>
                                <div className="mt-0.5 text-xs opacity-80">{opt.desc}</div>
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <p className="mb-1 text-sm font-semibold text-white">Disciplinas do edital (opcional)</p>
                          <p className="mb-2 text-xs text-text-muted">
                            Liste matérias adicionais separadas por vírgula ou quebra de linha.
                          </p>
                          <textarea
                            value={answers.concursoSubjectsRaw || ''}
                            onChange={(e) => patchAnswers({ concursoSubjectsRaw: e.target.value })}
                            rows={4}
                            className="input-field w-full resize-y"
                            placeholder="Ex.: Direito Ambiental, Direitos Humanos, Estatística"
                          />
                        </div>
                      </Card>
                    </>
                  )}
                </>
              )}

              {step === 4 && (
                <>
                  <Card className={cn(SETTINGS_SECTION_CLASS, 'p-3 sm:p-4')}>
                    <div className="flex items-start gap-3">
                      <Sparkles className="mt-0.5 h-5 w-5 text-neon-purple" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-white">Alvo de Conclusão</p>
                        <p className="text-xs text-text-muted">
                          Defina como o algoritmo deve distribuir a carga total do edital.
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 space-y-4">
                      <div>
                        <p className="mb-2 text-xs font-semibold text-white">Como você quer definir sua meta?</p>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <button
                            type="button"
                            className={cn(
                              'flex-1 rounded-xl border px-3 py-2 text-center text-xs transition-colors',
                              answers.targetMode === 'months' || !answers.targetMode
                                ? 'border-neon-purple/60 bg-neon-purple/10 text-white'
                                : 'border-white/10 text-text-secondary hover:text-white'
                            )}
                            onClick={() => patchAnswers({ targetMode: 'months' })}
                          >
                            Prazos Fixos (Meses)
                          </button>
                          <button
                            type="button"
                            className={cn(
                              'flex-1 rounded-xl border px-3 py-2 text-center text-xs transition-colors',
                              answers.targetMode === 'totalHours'
                                ? 'border-neon-purple/60 bg-neon-purple/10 text-white'
                                : 'border-white/10 text-text-secondary hover:text-white'
                            )}
                            onClick={() => patchAnswers({ targetMode: 'totalHours' })}
                          >
                            Maratona (Horas Totais)
                          </button>
                        </div>
                      </div>

                      {(answers.targetMode === 'months' || !answers.targetMode) && (
                        <div className="rounded-xl border border-white/10 bg-[#1a1d28]/85 p-3">
                          <label className="block text-xs font-semibold text-white mb-2">Em quanto tempo quer terminar?</label>
                          <div className="grid grid-cols-3 gap-2 mb-3">
                            {[3, 6, 12].map(m => (
                              <button
                                key={m}
                                type="button"
                                className={cn(
                                  'rounded-lg border px-2 py-1.5 text-[11px] transition-colors',
                                  answers.targetMonths === m
                                    ? 'border-neon-cyan/60 bg-neon-cyan/10 text-white'
                                    : 'border-white/10 text-text-secondary'
                                )}
                                onClick={() => patchAnswers({ targetMonths: m })}
                              >
                                {m} meses
                              </button>
                            ))}
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="1"
                              max="60"
                              placeholder="Outro (meses)"
                              value={answers.targetMonths || ''}
                              onChange={(e) => patchAnswers({ targetMonths: Number(e.target.value) })}
                              className="input-field w-full text-xs"
                            />
                          </div>
                          
                          {answers.targetMonths && answers.targetMonths > 0 && weeklyHours > 0 ? (
                            <div className="mt-3 text-[11px] text-text-secondary bg-white/[0.03] p-2 rounded-lg border border-white/5">
                              🗓️ Estudando {fmtHours(weeklyHours)} por semana, você vai acumular aproximadamente <strong className="text-neon-cyan">{Math.round((answers.targetMonths * 4.33) * weeklyHours)} horas líquidas</strong> até lá.
                            </div>
                          ) : null}
                        </div>
                      )}

                      {answers.targetMode === 'totalHours' && (
                        <div className="rounded-xl border border-white/10 bg-[#1a1d28]/85 p-3">
                          <label className="block text-xs font-semibold text-white mb-2">Qual a meta total de horas líquidas?</label>
                          <div className="grid grid-cols-3 gap-2 mb-3">
                            {[500, 1000, 2000].map(h => (
                              <button
                                key={h}
                                type="button"
                                className={cn(
                                  'rounded-lg border px-2 py-1.5 text-[11px] transition-colors',
                                  answers.targetTotalHours === h
                                    ? 'border-neon-cyan/60 bg-neon-cyan/10 text-white'
                                    : 'border-white/10 text-text-secondary'
                                )}
                                onClick={() => patchAnswers({ targetTotalHours: h })}
                              >
                                {h}h
                              </button>
                            ))}
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="1"
                              step="50"
                              placeholder="Outro (horas)"
                              value={answers.targetTotalHours || ''}
                              onChange={(e) => patchAnswers({ targetTotalHours: Number(e.target.value) })}
                              className="input-field w-full text-xs"
                            />
                          </div>

                          {answers.targetTotalHours && answers.targetTotalHours > 0 && weeklyHours > 0 ? (
                            <div className="mt-3 text-[11px] text-text-secondary bg-white/[0.03] p-2 rounded-lg border border-white/5">
                              ⏳ Estudando {fmtHours(weeklyHours)} por semana, você levará cerca de <strong className="text-neon-purple">{Math.ceil(answers.targetTotalHours / weeklyHours)} semanas</strong> (aprox. {Math.round(answers.targetTotalHours / weeklyHours / 4.33 * 10)/10} meses) para concluir essa meta.
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </Card>
                </>
              )}

              {step === 5 && (
                <>
                  <Card className={cn(SETTINGS_SECTION_CLASS, 'space-y-4 p-3 sm:p-4')}>
                    <div className="flex items-start gap-3">
                      <Calendar className="mt-0.5 h-5 w-5 text-neon-blue" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-white">Data da prova (opcional)</p>
                        <p className="text-xs text-text-muted">
                          Se informada, a engine ajusta intensidade e entra em fase final automaticamente.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <button
                        type="button"
                        className={cn(
                          SETTINGS_ROW_CLASS,
                          hasExamDate
                            ? 'text-text-secondary hover:text-white'
                            : 'border-neon-cyan/60 bg-neon-cyan/10 text-white'
                        )}
                        onClick={() => {
                          setHasExamDate(false);
                          patchAnswers({ examDate: '' });
                        }}
                      >
                        Ainda não tenho data
                      </button>
                      <button
                        type="button"
                        className={cn(
                          SETTINGS_ROW_CLASS,
                          hasExamDate
                            ? 'border-neon-cyan/60 bg-neon-cyan/10 text-white'
                            : 'text-text-secondary hover:text-white'
                        )}
                        onClick={() => {
                          setHasExamDate(true);
                          if (!answers.examDate || answers.examDate < todayKey) patchAnswers({ examDate: todayKey });
                        }}
                      >
                        Tenho data da prova
                      </button>
                    </div>

                    {hasExamDate && (
                      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-3 md:items-end">
                        <div>
                          <label className="block text-xs text-text-muted mb-1">Data da prova</label>
                          <input
                            type="date"
                            min={todayKey}
                            value={answers.examDate || ''}
                            onChange={(e) => patchAnswers({ examDate: e.target.value })}
                            className="input-field"
                          />
                        </div>
                        <div className="text-xs text-text-secondary">
                          A intensidade será ajustada automaticamente ao salvar.
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-3 md:items-end">
                      <div>
                        <label className="block text-xs text-text-muted mb-1">Quando deseja iniciar</label>
                        <input
                          type="date"
                          min={todayKey}
                          value={answers.startDate || todayKey}
                          onChange={(e) => patchAnswers({ startDate: e.target.value })}
                          className="input-field"
                        />
                      </div>
                      <div className="text-xs text-text-secondary">
                        O cronograma será regenerado para a semana iniciando em {fmtDate(answers.startDate || todayKey)}.
                      </div>
                    </div>
                  </Card>

                  <Card className={cn(SETTINGS_SECTION_CLASS, 'space-y-4 p-3 sm:p-4')}>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-neon-cyan" />
                      <p className="text-sm font-semibold text-white">Resumo da configuracao</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                        <p className="text-xs text-text-muted">Horas semanais</p>
                        <p className="text-xl font-semibold text-white">{fmtHours(weeklyHours)}</p>
                        <p className="text-xs text-text-secondary mt-1">{activeDays.length} dia(s) ativo(s)</p>
                      </div>
                      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                        <p className="text-xs text-text-muted">Blocos e pausa</p>
                        <p className="text-xl font-semibold text-white flex items-center gap-2">
                          <Clock className="h-4 w-4 text-neon-purple" />
                          {answers.focusBlockMinutes || answers.focusMinutes} / {answers.breakMinutes} min
                        </p>
                        <p className="text-xs text-text-secondary mt-1">{weeklyBlocks} bloco(s) na semana</p>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-neon-blue" />
                      <p className="text-sm font-medium text-white">Previsão de progresso</p>
                      </div>
                      <p className="mt-2 text-sm text-text-secondary">
                        {(() => {
                          const intensity = summary.studyPrefs.intensity || 'normal';
                          const style = answers.studyStyle || 'balanced';
                          const exam = hasExamDate && answers.examDate ? `Prova em ${fmtDate(answers.examDate)}. ` : '';
                          const base =
                            weeklyHours >= 25
                              ? 'ritmo alto com cobertura e revisões frequentes'
                              : weeklyHours >= 12
                              ? 'ritmo consistente com boa progressão semanal'
                              : 'ritmo leve; a progressão será mais gradual';
                          const styleText =
                            style === 'theory'
                              ? 'foco maior em aulas'
                              : style === 'practice'
                              ? 'foco maior em exercícios'
                              : 'mix equilibrado entre teoria e prática';
                          const intensityText =
                            intensity === 'intensa'
                              ? 'fase final intensificada'
                              : intensity === 'leve'
                              ? 'fase de base/medio prazo'
                              : 'fase de consolidação progressiva';
                          return `${exam}${base}, com ${styleText} e ${intensityText}.`;
                        })()}
                      </p>
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                      <p className="text-xs text-text-muted mb-2">Blocos por dia (estimativa)</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                        {DAY_OPTIONS.map((d) => (
                          <div key={d.key} className="rounded-lg border border-slate-800 bg-slate-900/40 px-2 py-2 text-center">
                            <div className="text-[11px] text-text-muted">{d.label}</div>
                            <div className="text-sm font-medium text-white">{blocksPerDay[d.key] || 0}</div>
                            <div className="text-[11px] text-text-secondary">
                              {(answers.dailyHoursByWeekday[d.key] || 0) > 0 ? fmtHours(answers.dailyHoursByWeekday[d.key] || 0) : 'Sem estudo'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </Card>
                </>
              )}
            </div>

            {error && (
              <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {error}
              </div>
            )}

            <div className="mt-3 flex flex-col-reverse gap-2 border-t border-slate-800/70 pt-2.5 pb-[max(0px,env(safe-area-inset-bottom))] sm:mt-4 sm:flex-row sm:items-center sm:justify-between sm:pt-3">
              <div className="text-[11px] text-text-muted sm:text-xs">Todas as respostas desta tela alteram a geração do cronograma.</div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="ghost" className="h-9 min-h-0 px-3 text-xs sm:h-10 sm:text-sm" onClick={resetAndClose}>Cancelar</Button>
                <Button
                  variant="secondary"
                  className="h-9 min-h-0 px-3 text-xs sm:h-10 sm:text-sm"
                  onClick={() => {
                    setError(null);
                    setStep((s) => Math.max(0, s - 1));
                  }}
                  disabled={step === 0}
                >
                  Voltar
                </Button>
                {step < STEP_TITLES.length - 1 ? (
                  <Button variant="primary" className="h-9 min-h-0 px-3 text-xs sm:h-10 sm:text-sm" onClick={next}>Próximo</Button>
                ) : (
                  <Button variant="primary" className="h-9 min-h-0 px-3 text-xs sm:h-10 sm:text-sm" onClick={apply}>Salvar e regenerar cronograma</Button>
                )}
              </div>
            </div>
          </Card>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
