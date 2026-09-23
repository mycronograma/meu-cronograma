'use client';

/**
 * PresetSelector Component
 * Allows users to select a study objective preset and import subjects automatically
 */

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  GraduationCap,
  Stethoscope,
  Scale,
  Sparkles,
  Check,
  Loader2,
  AlertCircle,
  Layers,
} from 'lucide-react';
import { Card, Button, Badge } from '@/components/ui';
import { PresetConfigWizard } from '@/components/onboarding';
import { cn, formatHoursDuration } from '@/lib/utils';
import { getEnemPresetSubjects } from '@/lib/enemCatalog';
import { getCuratedPresets, normalizeComparableText } from '@/lib/presetCatalog';
import type { PresetWizardAnswers, StudyPreferences, UserSettings } from '@/types';

interface PresetSubject {
  id: string;
  name: string;
  priority: number;
  difficulty: number;
  recommendedWeeklyHours: number;
  group?: string;
}

interface PresetModule {
  id: string;
  name: string;
  description: string;
  subjects: PresetSubject[];
}

interface Preset {
  id: string;
  name: string;
  description: string;
  subjects: PresetSubject[];
  specificModules?: PresetModule[];
}

type WeeklyLoadLevel = 'leve' | 'normal' | 'intensivo';

interface PresetSelectorProps {
  onImport: (
    presetId: string,
    options?: { source: 'api' | 'local'; wizardAnswers?: PresetWizardAnswers; weeklyLoad?: WeeklyLoadLevel; selectedModules?: string[] }
  ) => Promise<void>;
  onSkip: () => void;
  userId: string;
  baseSettings: UserSettings;
  onApplyPreferences: (
    settings: UserSettings,
    studyPrefs: StudyPreferences,
    answers: PresetWizardAnswers
  ) => Promise<void> | void;
}

const GROUP_ORDER = ['natureza', 'matematica', 'exatas', 'linguagens', 'humanas', 'base comum', 'modulo especifico'];

const presetIcons: Record<string, typeof GraduationCap> = {
  enem: GraduationCap,
  medicina: Stethoscope,
  concursos: Scale,
  'concursos publicos': Scale,
  personalizado: Sparkles,
};

const presetColors: Record<string, string> = {
  enem: 'from-neon-blue/20 to-neon-purple/20',
  medicina: 'from-red-500/20 to-pink-500/20',
  concursos: 'from-yellow-500/20 to-orange-500/20',
  'concursos publicos': 'from-yellow-500/20 to-orange-500/20',
  personalizado: 'from-neon-cyan/20 to-neon-blue/20',
};

const WEEKLY_LOAD_OPTIONS: Array<{
  value: WeeklyLoadLevel;
  label: string;
  helper: string;
  multiplier: number;
}> = [
  { value: 'leve', label: 'Leve', helper: 'rotina corrida', multiplier: 0.55 },
  { value: 'normal', label: 'Normal', helper: 'constante', multiplier: 0.75 },
  { value: 'intensivo', label: 'Intensivo', helper: 'reta final', multiplier: 1 },
];

function getWeeklyLoadOption(value: WeeklyLoadLevel) {
  return WEEKLY_LOAD_OPTIONS.find((option) => option.value === value) || WEEKLY_LOAD_OPTIONS[0];
}

function adjustWeeklyHours(hours: number, weeklyLoad: WeeklyLoadLevel) {
  if (hours <= 0) return 0;
  return Math.max(0.5, Math.round(hours * getWeeklyLoadOption(weeklyLoad).multiplier * 2) / 2);
}

function buildLocalMockPresets(): Preset[] {
  const enemSubjects = getEnemPresetSubjects().map((subject, index) => ({
    id: `enem-${index + 1}`,
    name: subject.name,
    priority: subject.priority,
    difficulty: subject.difficulty,
    recommendedWeeklyHours: subject.recommendedWeeklyHours,
    group: subject.group,
  }));

  const curated = getCuratedPresets().map((preset) => ({
    id: preset.id,
    name: preset.name,
    description: preset.description,
    subjects: preset.subjects.map((subject, index) => ({
      id: `${preset.id}-${index + 1}`,
      name: subject.name,
      priority: subject.priority,
      difficulty: subject.difficulty,
      recommendedWeeklyHours: subject.recommendedWeeklyHours,
      group: subject.group,
    })),
    specificModules: (preset.specificModules || []).map((module) => ({
      id: module.id,
      name: module.name,
      description: module.description,
      subjects: module.subjects.map((subject, index) => ({
        id: `${module.id}-${index + 1}`,
        name: subject.name,
        priority: subject.priority,
        difficulty: subject.difficulty,
        recommendedWeeklyHours: subject.recommendedWeeklyHours,
        group: subject.group,
      })),
    })),
  }));

  return [
    {
      id: 'enem',
      name: 'ENEM',
      description:
        'Preparação completa ENEM organizada por áreas oficiais e disciplinas reais',
      subjects: enemSubjects,
    },
    ...curated,
  ];
}

function groupSubjects(subjects: PresetSubject[]) {
  const grouped = new Map<string, PresetSubject[]>();

  for (const subject of subjects) {
    const group = subject.group || 'Outros';
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group)!.push(subject);
  }

  return Array.from(grouped.entries()).sort((a, b) => {
    const aIndex = GROUP_ORDER.indexOf(normalizeComparableText(a[0]));
    const bIndex = GROUP_ORDER.indexOf(normalizeComparableText(b[0]));
    const safeA = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
    const safeB = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;
    return safeA - safeB || a[0].localeCompare(b[0]);
  });
}

function resolvePresetVisualKey(name: string): string {
  const normalized = normalizeComparableText(name);
  if (normalized.startsWith('concursos')) return 'concursos publicos';
  if (normalized.includes('medicina')) return 'medicina';
  if (normalized.includes('enem')) return 'enem';
  return normalized;
}

export default function PresetSelector({
  onImport,
  onSkip,
  userId,
  baseSettings,
  onApplyPreferences,
}: PresetSelectorProps) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState<string | null>(null);
  const [presetSource, setPresetSource] = useState<'api' | 'local'>('local');
  const [showWizard, setShowWizard] = useState(false);
  const [weeklyLoad, setWeeklyLoad] = useState<WeeklyLoadLevel>('leve');
  const [selectedModules, setSelectedModules] = useState<Set<string>>(new Set());

  void userId;

  useEffect(() => {
    async function fetchPresets() {
      if (process.env.NEXT_PUBLIC_LOCAL_DEMO_MODE === 'true') {
        setPresets(buildLocalMockPresets());
        setPresetSource('local');
        setIsLoading(false);
        return;
      }

      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 2500);

      try {
        const response = await fetch('/api/presets', { signal: controller.signal });
        const data = await response.json();

        if (data.success && Array.isArray(data.data) && data.data.length > 0) {
          setPresets(data.data as Preset[]);
          setPresetSource(data.source === 'local' ? 'local' : 'api');
        } else {
          setPresets(buildLocalMockPresets());
          setPresetSource('local');
        }
      } catch {
        setPresets(buildLocalMockPresets());
        setPresetSource('local');
      } finally {
        window.clearTimeout(timeout);
        setIsLoading(false);
      }
    }

    fetchPresets();
  }, []);

  const selectedPresetData = useMemo(
    () => presets.find((preset) => preset.id === selectedPreset) || null,
    [presets, selectedPreset]
  );

  const handleImport = async (wizardAnswers?: PresetWizardAnswers) => {
    if (!selectedPreset) return;

    setIsImporting(true);
    setError(null);

    try {
      await onImport(selectedPreset, { 
        source: presetSource, 
        wizardAnswers, 
        weeklyLoad,
        selectedModules: Array.from(selectedModules) 
      });
    } catch (err) {
      setError('Erro ao importar predefinição. Tente novamente.');
      console.error('Error importing preset:', err);
    } finally {
      setIsImporting(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="py-16">
        <div className="flex flex-col items-center justify-center">
          <Loader2 className="mb-4 h-8 w-8 animate-spin text-neon-blue" />
          <p className="text-text-secondary">Carregando predefinições...</p>
        </div>
      </Card>
    );
  }

  if (error && presets.length === 0) {
    return (
      <Card className="py-16">
        <div className="flex flex-col items-center justify-center">
          <AlertCircle className="mb-4 h-8 w-8 text-red-400" />
          <p className="mb-4 text-text-secondary">{error}</p>
          <Button variant="secondary" onClick={onSkip}>
            Continuar sem predefinição
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="min-w-0 space-y-6">
      <div className="min-w-0 text-center">
        <h2 className="mb-2 text-2xl font-heading font-bold text-white">Qual é seu objetivo de estudo?</h2>
        <p className="text-text-secondary">
          Escolha um modelo para começar. As horas exibidas são referências iniciais, não sua agenda final.
        </p>
      </div>

      <div className="rounded-xl border border-card-border bg-card-bg p-4 shadow-sm">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">Carga de partida</p>
            <p className="mt-1 text-xs text-text-secondary">
              Escolha sua rotina antes de comparar as horas sugeridas.
            </p>
          </div>
          <div className="grid w-full min-w-0 grid-cols-1 gap-2 sm:grid-cols-3 lg:w-auto">
            {WEEKLY_LOAD_OPTIONS.map((option) => {
              const active = weeklyLoad === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setWeeklyLoad(option.value)}
                  className={cn(
                    'min-h-[58px] min-w-[108px] rounded-lg border px-4 py-2 text-left transition-all',
                    active
                      ? 'border-neon-blue bg-neon-blue/15 text-white shadow-glow-sm'
                      : 'border-card-border bg-card-bg/50 text-text-secondary hover:border-neon-blue/40 hover:text-white'
                  )}
                >
                  <span className="block text-sm font-semibold">{option.label}</span>
                  <span className="block text-xs text-text-muted">{option.helper}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
        {presets.map((preset) => {
          const visualKey = resolvePresetVisualKey(preset.name);
          const Icon = presetIcons[visualKey] || Sparkles;
          const isSelected = selectedPreset === preset.id;
          const isExpanded = showDetails === preset.id;
          const moduleCount = preset.specificModules?.length || 0;
          const weeklyHours = preset.subjects.reduce((sum, s) => sum + s.recommendedWeeklyHours, 0);
          const adjustedWeeklyHours = adjustWeeklyHours(weeklyHours, weeklyLoad);

          return (
            <motion.div key={preset.id} whileHover={{ y: -4 }} className="relative">
              <Card
                className={cn(
                  'cursor-pointer transition-all duration-200',
                  isSelected ? 'border-neon-blue/50 ring-2 ring-neon-blue' : 'hover:border-neon-blue/30'
                )}
                onClick={() => {
                  setSelectedPreset(preset.id);
                  setShowDetails(isExpanded ? null : preset.id);
                  setShowWizard(false);
                }}
              >
                <div className="flex min-w-0 items-start gap-4">
                  <div
                    className={cn(
                      'flex h-16 w-16 items-center justify-center rounded-xl bg-gradient-to-br',
                      presetColors[visualKey] || 'from-neon-blue/20 to-neon-purple/20'
                    )}
                  >
                    <Icon className="h-8 w-8 text-neon-blue" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex min-w-0 items-center justify-between gap-2">
                      <h3 className="min-w-0 truncate text-lg font-heading font-bold text-white">
                        {preset.name}
                      </h3>
                      {isSelected && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="flex h-6 w-6 items-center justify-center rounded-full bg-neon-blue"
                        >
                          <Check className="h-4 w-4 text-white" />
                        </motion.div>
                      )}
                    </div>

                    <p className="mb-2 break-words text-sm text-text-secondary">{preset.description}</p>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted">
                      <span>{preset.subjects.length} disciplinas base</span>
                      <span>{formatHoursDuration(adjustedWeeklyHours)}/sem na carga {getWeeklyLoadOption(weeklyLoad).label}</span>
                      {moduleCount > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Layers className="h-3 w-3" />
                          {moduleCount} módulos
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="mt-4 space-y-4 overflow-hidden border-t border-card-border pt-4"
                    >
                      <div>
                        <div className="mb-3 rounded-lg border border-neon-blue/20 bg-neon-blue/10 p-3">
                          <p className="text-xs font-semibold text-white">Sugestão inicial do modelo</p>
                          <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                            A carga {getWeeklyLoadOption(weeklyLoad).label.toLowerCase()} reduz ou amplia a referência do modelo.
                            Estes valores ajudam o app a entender peso e prioridade. Você ajusta sua carga real
                            no próximo passo, de acordo com seus dias e horários disponíveis.
                          </p>
                        </div>
                        <p className="mb-3 text-xs font-medium text-text-secondary">
                          Disciplinas base por área:
                        </p>
                        <div className="space-y-3">
                          {groupSubjects(preset.subjects).map(([group, groupItems]) => (
                            <div key={group} className="rounded-lg border border-card-border/70 p-3">
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <div className="text-xs font-semibold text-white">{group}</div>
                                <Badge size="sm" variant="default">
                                  {formatHoursDuration(
                                    adjustWeeklyHours(
                                      groupItems.reduce((sum, subject) => sum + subject.recommendedWeeklyHours, 0),
                                      weeklyLoad
                                    )
                                  )} ref.
                                </Badge>
                              </div>
                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                {groupItems.map((subject) => (
                                  <div
                                    key={subject.id}
                                    className="flex min-w-0 items-center justify-between gap-2 rounded-lg bg-card-bg/50 p-2"
                                  >
                                    <span className="min-w-0 truncate text-xs text-white">{subject.name}</span>
                                    <div className="flex shrink-0 items-center gap-2">
                                      <span className="text-xs text-text-muted">Peso {subject.priority}</span>
                                      <span className="text-xs text-text-muted">
                                        {formatHoursDuration(adjustWeeklyHours(subject.recommendedWeeklyHours, weeklyLoad))} ref.
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {!!preset.specificModules?.length && (
                        <div>
                          <p className="mb-3 text-xs font-medium text-text-secondary">
                          Módulos específicos (opcionais, conforme edital):
                          </p>
                          <div className="space-y-2">
                            {preset.specificModules.map((module) => {
                              const isSelected = selectedModules.has(module.id);
                              return (
                                <div
                                  key={module.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const next = new Set(selectedModules);
                                    if (isSelected) next.delete(module.id);
                                    else next.add(module.id);
                                    setSelectedModules(next);
                                  }}
                                  className={cn(
                                    'cursor-pointer rounded-lg border p-3 transition-all duration-200',
                                    isSelected 
                                      ? 'border-neon-cyan/50 bg-neon-cyan/10 ring-1 ring-neon-cyan/30' 
                                      : 'border-amber-500/20 bg-amber-500/5 hover:border-amber-500/40'
                                  )}
                                >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="text-xs font-semibold text-white">{module.name}</div>
                                  <Badge size="sm" variant="warning">
                                    {module.subjects.length} disciplinas
                                  </Badge>
                                </div>
                                <p className="mt-1 text-xs text-text-secondary">{module.description}</p>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {module.subjects.map((subject) => (
                                    <span
                                      key={subject.id}
                                      className="rounded-full border border-card-border bg-card-bg px-2 py-1 text-[11px] text-text-secondary"
                                    >
                                      {subject.name}
                                    </span>
                                  ))}
                                </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            </motion.div>
          );
        })}

        <motion.div whileHover={{ y: -4 }}>
          <Card
            className={cn(
              'cursor-pointer transition-all duration-200',
              selectedPreset === 'custom'
                ? 'border-neon-cyan/50 ring-2 ring-neon-cyan'
                : 'hover:border-neon-cyan/30'
            )}
            onClick={() => {
              setSelectedPreset('custom');
              setShowDetails(null);
              setShowWizard(false);
            }}
          >
            <div className="flex min-w-0 items-start gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-gradient-to-br from-neon-cyan/20 to-neon-blue/20">
                <Sparkles className="h-8 w-8 text-neon-cyan" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex min-w-0 items-center justify-between gap-2">
                  <h3 className="min-w-0 truncate text-lg font-heading font-bold text-white">Personalizado</h3>
                  {selectedPreset === 'custom' && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-neon-cyan"
                    >
                      <Check className="h-4 w-4 text-white" />
                    </motion.div>
                  )}
                </div>
                <p className="text-sm text-text-secondary">
                  Crie suas próprias disciplinas do zero com total controle
                </p>
              </div>
            </div>
          </Card>
        </motion.div>
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4"
        >
          <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
          <p className="text-sm text-red-400">{error}</p>
        </motion.div>
      )}

      <Card className="border-neon-blue/30 bg-neon-blue/10">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-neon-blue" />
          <div>
            <p className="mb-1 text-sm font-medium text-white">As predefinições são apenas sugestões</p>
            <p className="text-xs text-text-secondary">
              Você pode personalizar disciplinas, prioridades e horas depois de importar. O cronograma
              automático usa esses pesos para distribuir o tempo.
            </p>
          </div>
        </div>
      </Card>

      {selectedPresetData?.name === 'Medicina' && (
        <Card className="border-red-500/20 bg-red-500/5">
          <p className="text-sm text-red-100">
            O preset Medicina prioriza Natureza, depois Redação e Matemática, mantendo Linguagens e
            Humanas como suporte para vestibulares.
          </p>
        </Card>
      )}

      {selectedPresetData && normalizeComparableText(selectedPresetData.name).startsWith('concursos') && (
        <Card className="border-yellow-500/20 bg-yellow-500/5">
          <p className="text-sm text-yellow-100">
            O preset de Concursos importa a base comum. Módulos específicos aparecem como trilhas
            opcionais para expansão futura conforme edital.
          </p>
        </Card>
      )}

      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <Button variant="secondary" onClick={onSkip} className="w-full sm:w-auto">
          Pular esta etapa
        </Button>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          {selectedPreset && selectedPreset !== 'custom' && (
            <Button
              variant="primary"
              onClick={() => setShowWizard(true)}
              disabled={isImporting}
              className="w-full sm:w-auto"
              leftIcon={isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            >
              {isImporting ? 'Importando...' : 'Configurar modelo'}
            </Button>
          )}
          {selectedPreset === 'custom' && (
            <Button variant="primary" onClick={onSkip} className="w-full sm:w-auto">
              Criar disciplinas manualmente
            </Button>
          )}
        </div>
      </div>

      <PresetConfigWizard
        isOpen={showWizard && !!selectedPreset && selectedPreset !== 'custom'}
        presetId={selectedPreset || ''}
        presetName={presets.find((preset) => preset.id === selectedPreset)?.name || 'Modelo'}
        baseSettings={baseSettings}
        onClose={() => setShowWizard(false)}
        onApply={(settings, studyPrefs, answers) => {
          void (async () => {
            await onApplyPreferences(settings, studyPrefs, answers);
            await handleImport(answers);
          })();
        }}
      />
    </div>
  );
}
