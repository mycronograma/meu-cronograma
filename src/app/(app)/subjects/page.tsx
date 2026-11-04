'use client';

/**
 * Subjects Manager Page
 * Gerenciar disciplinas com prioridade e dificuldade
 */

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, BookOpen, Search } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { SubjectCard, SubjectForm, PresetSelector } from '@/components/subjects';
import { buildWeeklyCompletedHoursBySubject } from '@/lib/progressSnapshot';
import { EmptySubjects } from '@/components/onboarding';
import { useOnboarding, useLocalStorage } from '@/hooks';
import { formatHoursDuration, generateId, parseBlockDate } from '@/lib/utils';
import {
  createEnemSubjectBank,
  isEnemGoal,
  upgradeSubjectsToOfficialEnemStructure,
} from '@/lib/enemCatalog';
import { getCanonicalSubjectName, getCuratedPresetById } from '@/lib/presetCatalog';
import type { PresetWizardAnswers, StudyBlock, Subject, StudyPreferences, UserSettings } from '@/types';
import { defaultSettings } from '@/lib/defaultSettings';
import { computeStudyPreferences } from '@/services/presetConfigurator';

// Dados mockados das disciplinas
const initialSubjects: Subject[] = [];

// Variantes de animação
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

const toLocalDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;

type ImportedSubjectApi = {
  id: string;
  userId: string;
  name: string;
  color: string;
  icon: string;
  priority: number;
  difficulty: number;
  targetHours: number;
  completedHours?: number;
  totalHours?: number;
  sessionsCount?: number;
  averageScore?: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type SerializedBlockApi = Omit<
  StudyBlock,
  'date' | 'originalDate' | 'completedAt' | 'createdAt' | 'updatedAt' | 'subject'
> & {
  date: string;
  originalDate?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  subject?: (Omit<Subject, 'createdAt' | 'updatedAt'> & {
    createdAt: string;
    updatedAt: string;
  }) | undefined;
};

type PresetWeeklyLoad = 'leve' | 'normal' | 'intensivo';

const PRESET_WEEKLY_LOAD_MULTIPLIERS: Record<PresetWeeklyLoad, number> = {
  leve: 0.55,
  normal: 0.75,
  intensivo: 1,
};

function adjustPresetTargetHours(hours: number, weeklyLoad: PresetWeeklyLoad = 'leve') {
  if (hours <= 0) return 0;
  return Math.max(0.5, Math.round(hours * PRESET_WEEKLY_LOAD_MULTIPLIERS[weeklyLoad] * 2) / 2);
}

export default function SubjectsPage() {
  const router = useRouter();
  const { markFirstSubjectAdded, hasAddedFirstSubject } = useOnboarding();
  const [subjects, setSubjects] = useLocalStorage<Subject[]>('nexora_subjects', initialSubjects);
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | undefined>();
  const [showPresetSelector, setShowPresetSelector] = useState(false);
  const [autoOpenedPresetSelector, setAutoOpenedPresetSelector] = useState(false);
  const [, setIsLoading] = useState(false);
  const [studyPrefs, setStudyPrefs] = useLocalStorage<StudyPreferences>('nexora_study_prefs', {
    hoursPerDay: 2,
    daysOfWeek: [1, 2, 3, 4, 5],
    mode: 'random' as 'random' | 'exam',
    examDate: '',
  });
  const [userSettings, setUserSettings] = useLocalStorage<UserSettings>('nexora_user_settings', defaultSettings);
  const [plannerBlocks, setPlannerBlocks] = useLocalStorage<StudyBlock[]>('nexora_planner_blocks', []);
  const [, setScheduleRange] = useLocalStorage<{ startDate: string; endDate: string } | null>(
    'nexora_schedule_range',
    null
  );
  const [firstCycleAllSubjects, setFirstCycleAllSubjects] = useLocalStorage<boolean>('nexora_first_cycle_all_subjects', true);
  const [dailyLimits] = useLocalStorage<Record<string, number>>('nexora_daily_limits', {});
  const [importPresetError, setImportPresetError] = useState<string | null>(null);
  const [pendingDeleteSubject, setPendingDeleteSubject] = useState<Subject | null>(null);

  // Mostrar preset selector automaticamente quando não há disciplinas
  useEffect(() => {
    if (subjects.length > 0 && autoOpenedPresetSelector) {
      setShowPresetSelector(false);
      return;
    }

    if (subjects.length === 0 && !hasAddedFirstSubject && !autoOpenedPresetSelector) {
      // Mostra o preset selector automaticamente na primeira vez
      setShowPresetSelector(true);
      setAutoOpenedPresetSelector(true);
    }
  }, [subjects.length, hasAddedFirstSubject, autoOpenedPresetSelector]);

  useEffect(() => {
    if (!isEnemGoal(studyPrefs.goal)) return;
    if (subjects.length === 0) return;

    const upgraded = upgradeSubjectsToOfficialEnemStructure(subjects);
    const changed =
      upgraded.length !== subjects.length ||
      upgraded.some((subject, index) => {
        const current = subjects[index];
        if (!current) return true;
        return (
          subject.id !== current.id ||
          subject.name !== current.name ||
          subject.area !== current.area ||
          subject.pesoNoExame !== current.pesoNoExame ||
          subject.icon !== current.icon
        );
      });

    if (changed) {
      setSubjects(upgraded);
    }
  }, [studyPrefs.goal, subjects, setSubjects]);

  // Mock presets data for local import (when database is not configured)
  const mockPresetsData: Record<string, { name: string; priority: number; difficulty: number; targetHours: number }[]> = {
    'enem': [
      { name: 'Matemática', priority: 10, difficulty: 8, targetHours: 12 },
      { name: 'Redação', priority: 10, difficulty: 6, targetHours: 8 },
      { name: 'Português / Linguagens', priority: 8, difficulty: 6, targetHours: 10 },
      { name: 'Biologia', priority: 8, difficulty: 6, targetHours: 8 },
      { name: 'Física', priority: 8, difficulty: 8, targetHours: 8 },
      { name: 'Química', priority: 8, difficulty: 8, targetHours: 8 },
      { name: 'História', priority: 6, difficulty: 4, targetHours: 6 },
      { name: 'Geografia', priority: 6, difficulty: 4, targetHours: 6 },
      { name: 'Filosofia', priority: 6, difficulty: 4, targetHours: 4 },
      { name: 'Sociologia', priority: 6, difficulty: 4, targetHours: 4 },
    ],
    'medicina': [
      { name: 'Biologia Avançada', priority: 10, difficulty: 10, targetHours: 15 },
      { name: 'Química Avançada', priority: 10, difficulty: 10, targetHours: 12 },
      { name: 'Física', priority: 8, difficulty: 8, targetHours: 10 },
      { name: 'Matemática', priority: 8, difficulty: 8, targetHours: 10 },
      { name: 'Redação', priority: 8, difficulty: 6, targetHours: 8 },
      { name: 'Português', priority: 6, difficulty: 4, targetHours: 6 },
      { name: 'História', priority: 4, difficulty: 4, targetHours: 4 },
      { name: 'Geografia', priority: 4, difficulty: 4, targetHours: 4 },
    ],
    'concursos': [
      { name: 'Português', priority: 10, difficulty: 6, targetHours: 12 },
      { name: 'Raciocínio Lógico', priority: 8, difficulty: 8, targetHours: 10 },
      { name: 'Direito Constitucional', priority: 8, difficulty: 6, targetHours: 8 },
      { name: 'Direito Administrativo', priority: 8, difficulty: 6, targetHours: 8 },
      { name: 'Informática', priority: 6, difficulty: 4, targetHours: 6 },
      { name: 'Atualidades', priority: 6, difficulty: 4, targetHours: 6 },
    ],
  };

  const subjectColors = [
    '#00B4FF', '#7F00FF', '#00FFC8', '#FF00AA', 
    '#FFAA00', '#00FF88', '#FF5555', '#AA88FF',
    '#00DDFF', '#FF6600'
  ];

  const mergeImportedSubjects = (currentSubjects: Subject[], incomingSubjects: Subject[]) => {
    const merged = new Map<string, Subject>();

    for (const subject of currentSubjects) {
      merged.set(getCanonicalSubjectName(subject.name), subject);
    }

    for (const incoming of incomingSubjects) {
      const canonical = getCanonicalSubjectName(incoming.name);
      const existing = merged.get(canonical);

      if (!existing) {
        merged.set(canonical, incoming);
        continue;
      }

      merged.set(canonical, {
        ...existing,
        ...incoming,
        id: existing.id,
        userId: existing.userId,
        completedHours: existing.completedHours,
        totalHours: existing.totalHours,
        sessionsCount: existing.sessionsCount,
        averageScore: existing.averageScore,
        createdAt: existing.createdAt,
        updatedAt: new Date(),
      });
    }

    return Array.from(merged.values());
  };

  const deserializeBlock = (raw: SerializedBlockApi): StudyBlock => ({
    ...raw,
    date: parseBlockDate(raw.date),
    originalDate: raw.originalDate ? parseBlockDate(raw.originalDate) : undefined,
    completedAt: raw.completedAt ? new Date(raw.completedAt) : undefined,
    createdAt: new Date(raw.createdAt),
    updatedAt: new Date(raw.updatedAt),
    subject: raw.subject
      ? {
          ...raw.subject,
          createdAt: new Date(raw.subject.createdAt),
          updatedAt: new Date(raw.subject.updatedAt),
        }
      : raw.subject,
  });

  const regenerateScheduleFromWizard = async (
    mergedSubjects: Subject[],
    wizardAnswers: PresetWizardAnswers
  ) => {
    if (mergedSubjects.length === 0) return;

    const computed = computeStudyPreferences(userSettings, wizardAnswers);
    const firstCycleMode =
      typeof wizardAnswers.firstCycleAllSubjects === 'boolean'
        ? wizardAnswers.firstCycleAllSubjects
        : firstCycleAllSubjects;
    const startKey = wizardAnswers.startDate || toLocalDateKey(new Date());
    const startDate = new Date(`${startKey}T00:00:00`);
    const safeStart = Number.isNaN(startDate.getTime()) ? new Date() : startDate;
    safeStart.setHours(0, 0, 0, 0);
    const endDate = new Date(safeStart);
    endDate.setDate(endDate.getDate() + 6);

    const requestedRange = {
      startDate: toLocalDateKey(safeStart),
      endDate: toLocalDateKey(endDate),
    };

    try {
      const response = await fetch('/api/planner/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjects: mergedSubjects,
          studyPrefs: computed.studyPrefs,
          userSettings: computed.settings,
          scheduleRange: requestedRange,
          firstCycleAllSubjects: firstCycleMode,
          dailyLimits,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Falha ao regenerar cronograma');
      }

      const data = await response.json();
      if (!data.success || !Array.isArray(data.data?.blocks)) {
        throw new Error(data.error || 'Resposta inválida da regeneração');
      }

      setPlannerBlocks(data.data.blocks.map(deserializeBlock));
      if (data.data.scheduleRange?.startDate && data.data.scheduleRange?.endDate) {
        setScheduleRange(data.data.scheduleRange);
      } else {
        setScheduleRange(requestedRange);
      }
    } catch (error) {
      console.warn('Falha ao regenerar cronograma imediatamente:', error);
      setScheduleRange(requestedRange);
    } finally {
      router.refresh();
    }
  };

  // Handler para importar preset
  const handleImportPreset = async (
    presetId: string,
    options?: { source: 'api' | 'local'; wizardAnswers?: PresetWizardAnswers; weeklyLoad?: PresetWeeklyLoad; selectedModules?: string[] }
  ) => {
    setImportPresetError(null);
    setIsLoading(true);
    try {
      // First try API
      if (options?.source !== 'local') {
        try {
          const response = await fetch(`/api/presets/${presetId}/import`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              wizardAnswers: options?.wizardAnswers,
              weeklyLoad: options?.weeklyLoad,
            }),
          });

          if (response.ok) {
            const data = await response.json();

            if (data.success && data.data?.subjects?.length > 0) {
              const importedSubjects: Subject[] = (data.data.subjects as ImportedSubjectApi[]).map((s) => ({
                id: s.id,
                userId: s.userId,
                name: s.name,
                color: s.color,
                icon: s.icon,
                priority: s.priority,
                difficulty: s.difficulty,
                targetHours: s.targetHours,
                completedHours: s.completedHours || 0,
                totalHours: s.totalHours || 0,
                sessionsCount: s.sessionsCount || 0,
                averageScore: s.averageScore || 0,
                isActive: s.isActive,
                createdAt: new Date(s.createdAt),
                updatedAt: new Date(s.updatedAt),
              }));
              const normalizedImported =
                presetId === 'enem' || isEnemGoal(studyPrefs.goal)
                  ? upgradeSubjectsToOfficialEnemStructure(importedSubjects)
                  : importedSubjects;

              const mergedSubjects = mergeImportedSubjects(subjects, normalizedImported);
              setSubjects(mergedSubjects);
              setShowPresetSelector(false);
              markFirstSubjectAdded();
              if (options?.wizardAnswers) {
                await regenerateScheduleFromWizard(mergedSubjects, options.wizardAnswers);
              } else {
                router.refresh();
              }
              return;
            }
          }
        } catch (_apiError) {
        }
      }

      // Fallback to local mock data (ENEM) or curated catalog (Medicina/Concursos)
      const curatedPreset = getCuratedPresetById(presetId);
      let presetData = presetId === 'enem' ? mockPresetsData[presetId] : curatedPreset?.subjects;
      
      if (!presetData) {
        throw new Error('Preset não encontrado');
      }

      // Adiciona os módulos específicos caso tenham sido selecionados
      if (curatedPreset && options?.selectedModules?.length) {
        let additionalSubjects: any[] = [];
        options.selectedModules.forEach(moduleId => {
          const mod = curatedPreset.specificModules?.find(m => m.id === moduleId);
          if (mod) {
            additionalSubjects = [...additionalSubjects, ...mod.subjects];
          }
        });
        if (additionalSubjects.length > 0 && Array.isArray(presetData)) {
          presetData = [...presetData, ...additionalSubjects];
        }
      }

      let rawSubjectsToProcess = presetId === 'enem' ? createEnemSubjectBank('user1') : (presetData || []).map((s: any, index: number) => ({
        ...s,
        id: generateId(),
        userId: 'user1',
        name: s.name,
        color: subjectColors[index % subjectColors.length],
        icon: 'book',
        priority: Math.min(10, Math.max(1, (s.priority || 1) * 2)),
        difficulty: Math.min(10, Math.max(1, (s.difficulty || 1) * 2)),
        recommendedWeeklyHours: s.recommendedWeeklyHours || 2,
        completedHours: 0,
        totalHours: 0,
        sessionsCount: 0,
        averageScore: 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      // Calcular distribuição de horas alvo
      const wizardMode = options?.wizardAnswers?.targetMode;
      const targetMonths = options?.wizardAnswers?.targetMonths || 6;
      const targetTotalHours = options?.wizardAnswers?.targetTotalHours || 1000;
      
      const totalWeight = rawSubjectsToProcess.reduce((acc: number, s: any) => acc + ((s.priority || 5) * (s.difficulty || 5)), 0);

      const importedSubjects: Subject[] = rawSubjectsToProcess.map((s: any) => {
        let finalTargetHours = 50; // default
        
        if (wizardMode === 'totalHours') {
          // Distribuição proporcional baseada na prioridade e dificuldade
          const weight = ((s.priority || 5) * (s.difficulty || 5)) / totalWeight;
          finalTargetHours = Math.round(weight * targetTotalHours);
        } else if (wizardMode === 'months') {
          // Multiplicação por semanas
          const weeks = targetMonths * 4.33;
          const weeklyCarga = s.recommendedWeeklyHours || (s.targetHours ? s.targetHours / 24 : 2);
          finalTargetHours = Math.round(weeklyCarga * weeks);
        } else {
          // Fallback legacy
          finalTargetHours = adjustPresetTargetHours(s.recommendedWeeklyHours || s.targetHours, options?.weeklyLoad);
        }

        return {
          ...s,
          targetHours: Math.max(1, finalTargetHours),
        };
      });

      const mergedSubjects = mergeImportedSubjects(subjects, importedSubjects);
      setSubjects(mergedSubjects);
      setShowPresetSelector(false);
      markFirstSubjectAdded();
      if (options?.wizardAnswers) {
        await regenerateScheduleFromWizard(mergedSubjects, options.wizardAnswers);
      } else {
        router.refresh();
      }

    } catch (error) {
      console.error('Error importing preset:', error);
      setImportPresetError(`Erro ao importar predefinição: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyPreferences = async (
    settings: UserSettings,
    prefs: StudyPreferences,
    answers: PresetWizardAnswers
  ) => {
    setUserSettings(settings);
    setStudyPrefs(prefs);
    if (typeof answers.firstCycleAllSubjects === 'boolean') {
      setFirstCycleAllSubjects(answers.firstCycleAllSubjects);
    }
    const startKey = answers.startDate || toLocalDateKey(new Date());
    const startDate = new Date(`${startKey}T00:00:00`);
    if (!Number.isNaN(startDate.getTime())) {
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 6);
      setScheduleRange({
        startDate: startKey,
        endDate: toLocalDateKey(endDate),
      });
    }
    try {
      await fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings, studyPrefs: prefs }),
      });
    } catch (error) {
      console.warn('Falha ao salvar preferências no servidor:', error);
    }
  };

  // Handler para pular seleção de preset
  const handleSkipPreset = () => {
    setShowPresetSelector(false);
  };


  // Filtrar disciplinas
  const filteredSubjects = subjects.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Ordenar por prioridade (maior primeiro)
  const sortedSubjects = [...filteredSubjects].sort(
    (a, b) => b.priority - a.priority
  );

  const handleAddSubject = () => {
    setEditingSubject(undefined);
    setShowForm(true);
  };

  const handleEditSubject = (subject: Subject) => {
    setEditingSubject(subject);
    setShowForm(true);
  };

  const handleDeleteSubject = (subjectId: string) => {
    const target = subjects.find((subject) => subject.id === subjectId);
    if (!target) return;
    setPendingDeleteSubject(target);
  };

  const confirmDeleteSubject = () => {
    if (!pendingDeleteSubject) return;
    setSubjects((prev) => prev.filter((subject) => subject.id !== pendingDeleteSubject.id));
    setPendingDeleteSubject(null);
  };

  const handleFormSubmit = (data: Partial<Subject>) => {
    if (editingSubject) {
      // Atualizar existente
      setSubjects((prev) =>
        prev.map((s) =>
          s.id === editingSubject.id
            ? { ...s, ...data, updatedAt: new Date() }
            : s
        )
      );
    } else {
      // Criar nova
      const newSubject: Subject = {
        id: generateId(),
        userId: 'user1',
        name: data.name || '',
        color: data.color || '#00B4FF',
        icon: 'book',
        priority: data.priority || 5,
        difficulty: data.difficulty || 5,
        targetHours: data.targetHours || 10,
        completedHours: 0,
        totalHours: 0,
        sessionsCount: 0,
        averageScore: 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      setSubjects((prev) => [...prev, newSubject]);
      
      // Marcar que o usuário adicionou a primeira disciplina
      markFirstSubjectAdded();
    }
    setShowForm(false);
  };

  // Calcular totais
  const weeklyGoalFromPrefs = userSettings.dailyHoursByWeekday
    ? Object.values(userSettings.dailyHoursByWeekday).reduce((sum, value) => sum + value, 0)
    : studyPrefs.hoursPerDay * studyPrefs.daysOfWeek.length;
  const totalTargetHours = weeklyGoalFromPrefs > 0
    ? weeklyGoalFromPrefs
    : subjects.reduce((sum, s) => sum + s.targetHours, 0);
  // Horas da semana atual por disciplina (o acumulado de sempre fica no card, em "Total geral").
  const weeklyCompletedHoursBySubject = useMemo(
    () => buildWeeklyCompletedHoursBySubject(plannerBlocks),
    [plannerBlocks]
  );
  const totalWeeklyCompletedHours = Array.from(weeklyCompletedHoursBySubject.values()).reduce(
    (sum, hours) => sum + hours,
    0
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="app-page"
    >
      {/* Cabeçalho */}
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-heading font-bold text-white">
            Disciplinas
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Organize matérias, metas e prioridades de estudo
          </p>
        </div>

        <div className="flex w-full sm:w-auto flex-col sm:flex-row gap-2 sm:gap-3">
          {!showPresetSelector && (
            <Button
              variant="secondary"
              onClick={() => {
                setShowPresetSelector(true);
              }}
              className="w-full sm:w-auto"
             
            >
              {subjects.length === 0 ? 'Usar modelo pronto' : 'Importar modelo'}
            </Button>
          )}
          {!showPresetSelector && (
            <Button
              variant="primary"
              onClick={handleAddSubject}
              leftIcon={<Plus className="w-4 h-4" />}
              className="w-full sm:w-auto"
             
            >
              Adicionar disciplina
            </Button>
          )}
        </div>
      </div>

      {importPresetError && (
        <Card className="border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
          {importPresetError}
        </Card>
      )}

      {/* Barra de Estatísticas */}
      {subjects.length > 0 && (
        <Card padding="sm">
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            {/* Busca */}
            <div className="relative w-full min-w-0 sm:w-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                type="text"
                placeholder="Buscar disciplinas..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-field pl-10 w-full sm:w-64 py-2 text-sm"
              />
            </div>

            {/* Resumo das Estatísticas */}
            <div className="flex min-w-0 flex-wrap items-center gap-4 text-sm sm:gap-6">
              <div>
                <span className="text-text-secondary">Total: </span>
                <span className="font-bold text-white">{subjects.length}</span>
              </div>
              <div>
                <span className="text-text-secondary">Meta Semanal: </span>
                <span className="font-bold text-white">{formatHoursDuration(totalTargetHours)}</span>
              </div>
              <div>
                <span className="text-text-secondary">Concluído na semana: </span>
                <span className="font-bold text-neon-cyan">
                  {formatHoursDuration(totalWeeklyCompletedHours)}
                </span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Preset Selector */}
      {showPresetSelector ? (
        <div className="space-y-4">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="min-w-0 text-xl font-heading font-bold text-white">
              Escolher modelo de estudos
            </h2>
            <Button
              variant="secondary"
              onClick={() => {
                setShowPresetSelector(false);
              }}
            >
              Cancelar
            </Button>
          </div>
          <PresetSelector
            onImport={handleImportPreset}
            onSkip={handleSkipPreset}
            userId="user1" // Mock - em produção viria do contexto
            baseSettings={userSettings}
            onApplyPreferences={handleApplyPreferences}
          />
        </div>
      ) : subjects.length === 0 ? (
        <Card className="py-12">
          <EmptySubjects onAddSubject={handleAddSubject} />
        </Card>
      ) : sortedSubjects.length === 0 ? (
        <Card className="py-12 text-center">
          <BookOpen className="w-16 h-16 text-text-muted mx-auto mb-4" />
          <h3 className="text-lg font-heading font-bold text-white mb-2">
            Nenhuma disciplina encontrada
          </h3>
          <p className="text-text-secondary mb-6">
            Tente um termo de busca diferente
          </p>
        </Card>
      ) : (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3"
        >
          {sortedSubjects.map((subject) => (
            <motion.div key={subject.id} variants={itemVariants} className="min-w-0">
              <SubjectCard
                subject={subject}
                onEdit={handleEditSubject}
                onDelete={handleDeleteSubject}
                weeklyCompletedHours={weeklyCompletedHoursBySubject.get(subject.id) ?? 0}
              />
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Modal do Formulário de Disciplina */}
      <AnimatePresence>
        {showForm && (
          <SubjectForm
            subject={editingSubject}
            onSubmit={handleFormSubmit}
            onCancel={() => setShowForm(false)}
            targetMode={userSettings?.targetMode}
            targetMonths={userSettings?.targetMonths}
            targetTotalHours={userSettings?.targetTotalHours}
            totalWeightExcludingCurrent={subjects.reduce((sum, s) => sum + (s.id !== editingSubject?.id ? ((s.priority || 5) * (s.difficulty || 5)) : 0), 0)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {pendingDeleteSubject && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="app-modal-overlay"
            onClick={() => setPendingDeleteSubject(null)}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="app-modal-panel max-w-md"
              onClick={(event) => event.stopPropagation()}
            >
              <Card className="space-y-4 p-5">
                <h3 className="text-lg font-semibold text-white">Excluir disciplina</h3>
                <p className="text-sm text-text-secondary">
                  Tem certeza que deseja excluir{' '}
                  <span className="font-semibold text-white">{pendingDeleteSubject.name}</span>?
                </p>
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setPendingDeleteSubject(null)}>
                    Cancelar
                  </Button>
                  <Button variant="danger" onClick={confirmDeleteSubject}>
                    Excluir
                  </Button>
                </div>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </motion.div>
  );
}







