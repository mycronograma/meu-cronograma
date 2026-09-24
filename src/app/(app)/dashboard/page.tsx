'use client';

/**
 * Dashboard Page
 * Visão geral com estatísticas, progresso semanal e plano do dia
 * Inclui experiência de primeiro uso (FTUE)
 */

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { motion } from 'framer-motion';
import {
  Clock,
  Target,
  Flame,
  Brain,
  TrendingUp,
  Calendar,
  Sparkles,
  BookOpen,
  PlayCircle,
  Trophy,
  Zap,
  CheckCircle2,
  Medal,
  Route,
  Award,
} from 'lucide-react';
import { StatsCard, Card, ProgressBar, SkeletonCard, SkeletonChart, SkeletonPlan, Button } from '@/components/ui';
import { TodayPlan, WeeklyChart, LevelProgress } from '@/components/dashboard';
import {
  WelcomeModal,
  EmptyDashboard,
  TutorialTooltip,
  dashboardTutorialSteps,
  dashboardEmptyTutorialSteps,
} from '@/components/onboarding';
import { useOnboarding, useLocalStorage } from '@/hooks';
import { isSameDay, formatDate, formatDuration, formatHoursDuration, getWeekStart, getWeekDates, parseBlockDate } from '@/lib/utils';
import {
  buildCompletedHoursByDate,
  buildCompletedSessionsByDate,
  buildMergedDailyStudyData,
  getStudySessionsForDate,
} from '@/lib/progressSnapshot';
import {
  applyBlockCompletionMetrics,
  computeIntelligentAnalyticsSummary,
} from '@/services/adaptiveStudyIntelligence';
import {
  buildTrainerSnapshot,
  calculateTrainerCompletionReward,
  estimateMissionXp,
  type TrainerAchievementUnlock,
  type TrainerCompletionReward,
  type TrainerXpEvent,
} from '@/services/studyTrainer';
import type { StudyBlock, Subject, AnalyticsStore, StudyPreferences, UserSettings } from '@/types';
import { StudyBlockSessionModal } from '@/components/session';
import { defaultSettings } from '@/lib/defaultSettings';

const emptyAnalytics: AnalyticsStore = { daily: {} };
const weekDayKeys = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'] as const;
const defaultStudyPrefs: StudyPreferences = {
  hoursPerDay: 2,
  daysOfWeek: [1, 2, 3, 4, 5],
  mode: 'random',
  examDate: '',
};

// Variantes de animação
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

const hasManualSequence = (block: StudyBlock) =>
  typeof block.sequenceIndex === 'number' && Number.isFinite(block.sequenceIndex);

const compareBlocksWithinDay = (a: StudyBlock, b: StudyBlock) => {
  const aHasSequence = hasManualSequence(a);
  const bHasSequence = hasManualSequence(b);

  if (aHasSequence && bHasSequence) {
    const sequenceDiff = (a.sequenceIndex as number) - (b.sequenceIndex as number);
    if (sequenceDiff !== 0) return sequenceDiff;
  } else if (aHasSequence !== bHasSequence) {
    return aHasSequence ? -1 : 1;
  }

  return a.startTime.localeCompare(b.startTime);
};

const comparePlannerBlocks = (a: StudyBlock, b: StudyBlock) => {
  const dateDiff = parseBlockDate(a.date).getTime() - parseBlockDate(b.date).getTime();
  if (dateDiff !== 0) return dateDiff;
  return compareBlocksWithinDay(a, b);
};

const toLocalDateKey = (value: Date | string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
};

const formatDayCount = (days: number) => `${days} ${days === 1 ? 'dia' : 'dias'}`;

export default function DashboardPage() {
  const router = useRouter();
  const { status: authStatus } = useSession();
  const {
    isLoading: onboardingLoading,
    shouldShowWelcome,
    shouldShowTutorial,
    completeWelcome,
    completeTutorial,
    skipTutorial,
  } = useOnboarding();

  const [plannerBlocks, setPlannerBlocks] = useLocalStorage<StudyBlock[]>('nexora_planner_blocks', []);
  const [subjects, setSubjects] = useLocalStorage<Subject[]>('nexora_subjects', []);
  const [analytics, setAnalytics] = useLocalStorage<AnalyticsStore>('nexora_analytics', emptyAnalytics);
  const [studyPrefs] = useLocalStorage<StudyPreferences>('nexora_study_prefs', defaultStudyPrefs);
  const [userSettings] = useLocalStorage<UserSettings>('nexora_user_settings', defaultSettings);
  const [xpEvents, setXpEvents] = useLocalStorage<TrainerXpEvent[]>('nexora_xp_events', []);
  const [unlockedAchievements, setUnlockedAchievements] = useLocalStorage<TrainerAchievementUnlock[]>(
    'nexora_unlocked_achievements',
    []
  );
  const [sessionBlock, setSessionBlock] = useState<StudyBlock | null>(null);
  const [isSessionOpen, setIsSessionOpen] = useState(false);
  const [completionReward, setCompletionReward] = useState<TrainerCompletionReward | null>(null);
  const completingBlockIdsRef = useRef(new Set<string>());

  // useLocalStorage já hidrata na montagem; evitar loops de re-hidratação

  const completedHoursByDate = useMemo(() => {
    return buildCompletedHoursByDate(plannerBlocks);
  }, [plannerBlocks]);
  const completedSessionsByDate = useMemo(() => {
    return buildCompletedSessionsByDate(plannerBlocks);
  }, [plannerBlocks]);
  const analyticsForSummary = useMemo(
    () => ({
      ...analytics,
      daily: buildMergedDailyStudyData(
        analytics.daily || {},
        completedHoursByDate,
        completedSessionsByDate
      ),
    }),
    [analytics, completedHoursByDate, completedSessionsByDate]
  );
  const intelligentSummary = useMemo(
    () =>
      computeIntelligentAnalyticsSummary({
        analytics: analyticsForSummary,
        subjects,
        now: new Date(),
      }),
    [analyticsForSummary, subjects]
  );

  const weeklyData = useMemo(() => {
    const weekStart = getWeekStart(new Date());
    const weekDates = getWeekDates(weekStart);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    const dayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
    const mergedDaily = analyticsForSummary.daily || {};

    const targetByDate = new Map<string, number>();

    plannerBlocks.forEach((block) => {
      if (block.isBreak || block.status === 'rescheduled') return;
      const blockDate = parseBlockDate(block.date);
      if (Number.isNaN(blockDate.getTime())) return;
      if (blockDate < weekStart || blockDate >= weekEnd) return;

      const dateKey = toLocalDateKey(blockDate);
      if (!dateKey) return;

      targetByDate.set(dateKey, (targetByDate.get(dateKey) ?? 0) + block.durationMinutes / 60);
    });

    const hasPlannedTarget = Array.from(targetByDate.values()).some((hours) => hours > 0);

    if (!hasPlannedTarget) {
      weekDates.forEach((date) => {
        const dateKey = toLocalDateKey(date);
        if (!dateKey) return;

        if (userSettings.dailyHoursByWeekday) {
          const weekdayKey = weekDayKeys[date.getDay()];
          const target = userSettings.dailyHoursByWeekday[weekdayKey] ?? 0;
          targetByDate.set(dateKey, Math.max(0, target));
          return;
        }

        const activeDays = studyPrefs.daysOfWeek ?? [];
        const isActiveDay = activeDays.length > 0 ? activeDays.includes(date.getDay()) : true;
        targetByDate.set(dateKey, isActiveDay ? Math.max(0, studyPrefs.hoursPerDay ?? 0) : 0);
      });
    }

    return weekDates.map((date) => {
      const dateKey = toLocalDateKey(date);
      const hours = mergedDaily[dateKey]?.hours ?? 0;

      return {
        day: dayLabels[date.getDay()],
        hours,
        target: dateKey ? targetByDate.get(dateKey) ?? 0 : 0,
      };
    });
  }, [
    analyticsForSummary.daily,
    plannerBlocks,
    studyPrefs.daysOfWeek,
    studyPrefs.hoursPerDay,
    userSettings.dailyHoursByWeekday,
  ]);

  const weeklyGoal = useMemo(
    () => weeklyData.reduce((sum, item) => sum + item.target, 0),
    [weeklyData]
  );

  const weeklyHours = weeklyData.reduce((sum, d) => sum + d.hours, 0);

  const weeklyPracticalHours = useMemo(() => {
    let practical = 0;
    const weekStart = getWeekStart(new Date());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    
    plannerBlocks.forEach((block) => {
      if (block.isBreak || block.status !== 'completed') return;
      if (block.type !== 'EXERCICIOS' && block.type !== 'REVISAO' && block.type !== 'REVISAO_ATIVA' && block.type !== 'ANALISE') return;
      const blockDate = parseBlockDate(block.date);
      if (Number.isNaN(blockDate.getTime())) return;
      if (blockDate < weekStart || blockDate >= weekEnd) return;
      practical += block.durationMinutes / 60;
    });
    return practical;
  }, [plannerBlocks]);
  const focusScore = useMemo(() => {
    if (intelligentSummary.avgFocusScore > 0) {
      return intelligentSummary.avgFocusScore;
    }

    const samples: number[] = [];
    const today = new Date();
    for (let i = 13; i >= 0; i -= 1) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const dateKey = toLocalDateKey(date);
      const record = analyticsForSummary.daily[dateKey];
      const hours = record?.hours ?? 0;
      if (hours <= 0) continue;
      samples.push(Math.round(record?.focusScoreAvg ?? 80));
    }

    if (samples.length === 0) return 0;
    return Math.round(samples.reduce((sum, value) => sum + value, 0) / samples.length);
  }, [analyticsForSummary.daily, intelligentSummary.avgFocusScore]);
  const trainerSnapshot = useMemo(
    () =>
      buildTrainerSnapshot({
        plannerBlocks,
        analytics: analyticsForSummary,
        subjects,
        studyPrefs,
        userSettings,
        xpEvents,
        unlockedAchievements,
      }),
    [
      analyticsForSummary,
      plannerBlocks,
      studyPrefs,
      subjects,
      unlockedAchievements,
      userSettings,
      xpEvents,
    ]
  );

  const completedThisWeek = useMemo(() => {
    const weekStart = getWeekStart(new Date());
    return getWeekDates(weekStart).reduce((sum, date) => {
      const dateKey = toLocalDateKey(date);
      return (
        sum +
        getStudySessionsForDate(
          dateKey,
          analyticsForSummary.daily || {},
          completedSessionsByDate
        )
      );
    }, 0);
  }, [analyticsForSummary.daily, completedSessionsByDate]);

  const weeklyCompletedHoursBySubject = useMemo(() => {
    const weekStart = getWeekStart(new Date());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    const totals = new Map<string, number>();

    plannerBlocks.forEach((block) => {
      if (block.isBreak || block.status !== 'completed' || !block.subjectId) return;
      const blockDate = parseBlockDate(block.date);
      if (blockDate < weekStart || blockDate >= weekEnd) return;

      const previous = totals.get(block.subjectId) ?? 0;
      totals.set(block.subjectId, previous + block.durationMinutes / 60);
    });

    return totals;
  }, [plannerBlocks]);

  const todayPlan = useMemo(() => {
    const today = new Date();
    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);
    const normalizedBlocks = plannerBlocks
      .map((block) => ({
        ...block,
        date: parseBlockDate(block.date),
      }))
      .sort(comparePlannerBlocks);

    const blocksForToday = normalizedBlocks.filter((block) =>
      isSameDay(parseBlockDate(block.date), today)
    );

    if (blocksForToday.length > 0) {
      return { blocks: blocksForToday, date: today, source: 'today' as const };
    }

    // Fallback: show next available day blocks if none scheduled today
    const nextBlock = normalizedBlocks.find((block) => block.date >= todayStart);
    if (nextBlock) {
      const nextDate = parseBlockDate(nextBlock.date);
      return {
        blocks: normalizedBlocks.filter((block) =>
          isSameDay(parseBlockDate(block.date), nextDate)
        ),
        date: nextDate,
        source: 'next' as const,
      };
    }

    if (normalizedBlocks.length > 0) {
      const lastDate = parseBlockDate(normalizedBlocks[normalizedBlocks.length - 1].date);
      return {
        blocks: normalizedBlocks.filter((block) =>
          isSameDay(parseBlockDate(block.date), lastDate)
        ),
        date: lastDate,
        source: 'latest' as const,
      };
    }

    return { blocks: [], date: today, source: 'none' as const };
  }, [plannerBlocks]);

  const todayBlocks = todayPlan.blocks;
  const subjectOrderByPlan = useMemo(() => {
    const order = new Map<string, number>();
    todayBlocks.forEach((block, index) => {
      if (block.isBreak || !block.subjectId) return;
      if (!order.has(block.subjectId)) {
        order.set(block.subjectId, index);
      }
    });
    return order;
  }, [todayBlocks]);

  const subjectProgressRows = useMemo(
    () =>
      subjects
        .map((subject) => ({
          subject,
          completedHours: weeklyCompletedHoursBySubject.get(subject.id) ?? 0,
        }))
        .sort((a, b) => {
          const aOrder = subjectOrderByPlan.get(a.subject.id);
          const bOrder = subjectOrderByPlan.get(b.subject.id);

          if (aOrder !== undefined && bOrder !== undefined) return aOrder - bOrder;
          if (aOrder !== undefined) return -1;
          if (bOrder !== undefined) return 1;

          return a.subject.name.localeCompare(b.subject.name, 'pt-BR');
        }),
    [subjects, subjectOrderByPlan, weeklyCompletedHoursBySubject]
  );

  const planTitle =
    todayPlan.source === 'today' || todayPlan.source === 'none'
      ? 'Plano de Hoje'
      : `Plano de ${formatDate(todayPlan.date, 'short')}`;
  const planSubtitle =
    todayPlan.source === 'today' || todayPlan.source === 'none'
      ? undefined
      : 'Mostrando o dia planejado mais próximo';
  const currentHour = new Date().getHours();
  const greeting =
    currentHour < 12 ? 'Bom dia' : currentHour < 18 ? 'Boa tarde' : 'Boa noite';

  const handleStartSession = (blockId: string) => {
    setPlannerBlocks((blocks) =>
      blocks.map((b) =>
        b.id === blockId ? { ...b, status: 'in-progress' as const } : b
      )
    );
  };

  const handleSkipBlock = (blockId: string) => {
    setPlannerBlocks((blocks) =>
      blocks.map((b) =>
        b.id === blockId ? { ...b, status: 'skipped' as const } : b
      )
    );
  };

  const handleStartBlock = (block: StudyBlock) => {
    setSessionBlock(block);
    setIsSessionOpen(true);
  };

  const handleCompleteBlock = (
    blockId: string,
    minutesSpent?: number,
    performance?: { correctAnswers?: number; totalQuestions?: number },
    options?: { completionMode: 'auto' | 'manual' }
  ) => {
    const targetBlock = plannerBlocks.find((b) => b.id === blockId);
    if (!targetBlock || targetBlock.status === 'completed' || completingBlockIdsRef.current.has(blockId)) {
      return;
    }
    completingBlockIdsRef.current.add(blockId);
    const targetSubject = subjects.find((s) => s.id === targetBlock.subjectId);

    const hasExplicitMinutes =
      typeof minutesSpent === 'number' && Number.isFinite(minutesSpent);
    const effectiveMinutes = hasExplicitMinutes
      ? Math.max(1, minutesSpent)
      : targetBlock.durationMinutes;
    const hours = effectiveMinutes / 60;

    const nextPlannerBlocks = plannerBlocks.map((b) =>
        b.id === blockId
          ? {
              ...b,
              status: 'completed' as const,
              completedAt: new Date(),
              updatedAt: new Date(),
              durationMinutes: hasExplicitMinutes
                ? Math.max(1, Math.round(effectiveMinutes))
                : b.durationMinutes,
            }
          : b
    );
    setPlannerBlocks(nextPlannerBlocks);

    let nextAnalytics = analytics;
    let nextSubjects = subjects;
    if (!targetBlock.isBreak && targetBlock.subjectId) {
      const metricsUpdate = targetSubject
        ? applyBlockCompletionMetrics({
            analytics,
            block: targetBlock,
            subject: targetSubject,
            minutesSpent: effectiveMinutes,
            correctAnswers: performance?.correctAnswers,
            totalQuestions: performance?.totalQuestions,
          })
        : null;

      nextSubjects = subjects.map((subject) =>
          subject.id === targetBlock.subjectId
            ? {
                ...subject,
                completedHours: Number((subject.completedHours + hours).toFixed(4)),
                totalHours: Number((subject.totalHours + hours).toFixed(4)),
                sessionsCount: subject.sessionsCount + 1,
                averageScore:
                  metricsUpdate?.subjectRollingAccuracy !== undefined
                    ? Math.round(metricsUpdate.subjectRollingAccuracy * 100)
                    : subject.averageScore,
              }
            : subject
      );
      setSubjects(nextSubjects);
      if (metricsUpdate) {
        nextAnalytics = metricsUpdate.analytics;
        setAnalytics(nextAnalytics);
      }
    } else if (!targetBlock.isBreak) {
      // Fallback for cases where the subject was removed but the block still exists.
      const dateKey = toLocalDateKey(targetBlock.date);
      const current = analytics.daily[dateKey] || { hours: 0, sessions: 0 };
      nextAnalytics = {
        ...analytics,
        daily: {
          ...analytics.daily,
          [dateKey]: {
            ...current,
            hours: Number((current.hours + hours).toFixed(2)),
            sessions: current.sessions + 1,
          },
        },
      };
      setAnalytics(nextAnalytics);
    }

    if (!targetBlock.isBreak) {
      const reward = calculateTrainerCompletionReward({
        block: targetBlock,
        minutesSpent: effectiveMinutes,
        plannerBlocks: nextPlannerBlocks,
        analytics: nextAnalytics,
        subjects: nextSubjects,
        studyPrefs,
        userSettings,
        xpEvents,
        unlockedAchievements,
      });

      if (reward.events.length > 0) {
        setXpEvents((prev) => {
          const existing = new Set(prev.map((event) => event.eventKey));
          return [
            ...prev,
            ...reward.events.filter((event) => !existing.has(event.eventKey)),
          ];
        });
      }
      if (reward.newAchievements.length > 0) {
        setUnlockedAchievements((prev) => {
          const existing = new Set(prev.map((achievement) => achievement.achievementId));
          return [
            ...prev,
            ...reward.newAchievements.filter(
              (achievement) => !existing.has(achievement.achievementId)
            ),
          ];
        });
      }
      setCompletionReward(reward);

      if (authStatus === 'authenticated') {
        void fetch('/api/gamification/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            blockId,
            minutesSpent: effectiveMinutes,
            completionMode: options?.completionMode ?? 'manual',
            performance,
          }),
        }).catch((error) => {
          console.warn('Falha ao validar XP no servidor:', error);
        });
      }
    }
  };

  const handleAddSubject = () => {
    router.push('/subjects');
  };

  // Estado de primeiro uso (sem disciplinas)
  const isEmptyState = subjects.length === 0;
  const tutorialSteps = isEmptyState ? dashboardEmptyTutorialSteps : dashboardTutorialSteps;

  // Loading state
  if (onboardingLoading) {
    return (
      <div className="space-y-6">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div>
            <div className="h-8 w-64 bg-card-bg rounded-lg animate-pulse mb-2" />
            <div className="h-4 w-48 bg-card-bg rounded animate-pulse" />
          </div>
        </div>

        {/* Stats skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>

        {/* Charts skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          <div className="lg:col-span-2">
            <SkeletonChart />
          </div>
          <SkeletonCard className="h-[400px]" />
        </div>

        {/* Plan skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          <div className="lg:col-span-2">
            <SkeletonPlan />
          </div>
          <SkeletonCard className="h-[300px]" />
        </div>
      </div>
    );
  }

  return (
    <>
      <StudyBlockSessionModal
        isOpen={isSessionOpen}
        block={sessionBlock}
        estimatedXp={
          sessionBlock && !sessionBlock.isBreak ? estimateMissionXp(sessionBlock.durationMinutes) : undefined
        }
        onClose={() => setIsSessionOpen(false)}
        onComplete={(blockId, minutesSpent, performance, options) => {
          handleCompleteBlock(blockId, minutesSpent, performance, options);
        }}
      />
      {completionReward && (
        <div className="app-modal-overlay z-[10030] place-items-center">
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="app-modal-panel max-w-[360px] sm:max-w-md"
          >
            <Card className="p-4 text-center sm:p-6" padding="none">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-neon-cyan/15 text-neon-cyan">
                <Trophy className="h-6 w-6" />
              </div>
              <h2 className="text-xl font-heading font-bold text-white">Missão concluída</h2>
              <p className="mt-1 text-sm text-text-secondary">{completionReward.message}</p>

              <div className="mt-4 grid grid-cols-2 gap-2 text-left">
                <div className="rounded-lg border border-card-border bg-card-bg p-3">
                  <p className="text-xs text-text-muted">XP recebido</p>
                  <p className="text-lg font-bold text-neon-cyan">
                    {completionReward.xpEarned > 0 ? `+${completionReward.xpEarned}` : '0'}
                  </p>
                </div>
                <div className="rounded-lg border border-card-border bg-card-bg p-3">
                  <p className="text-xs text-text-muted">Sequência</p>
                  <p className="text-lg font-bold text-white">{formatDayCount(completionReward.streak)}</p>
                </div>
              </div>

              {completionReward.didLevelUp && (
                <div className="mt-3 rounded-lg border border-neon-purple/30 bg-neon-purple/10 p-3 text-sm text-neon-violet">
                  Você subiu para o nível {completionReward.levelAfter}.
                </div>
              )}

              {completionReward.newAchievements.length > 0 && (
                <div className="mt-3 space-y-2 text-left">
                  {completionReward.newAchievements.slice(0, 2).map((achievement) => (
                    <div
                      key={achievement.achievementId}
                      className="rounded-lg border border-neon-blue/25 bg-neon-blue/10 p-3"
                    >
                      <p className="text-sm font-semibold text-white">{achievement.name}</p>
                      <p className="text-xs text-text-secondary">{achievement.description}</p>
                    </div>
                  ))}
                </div>
              )}

              {completionReward.nextMission && (
                <p className="mt-4 text-xs text-text-secondary">
                  Próxima missão: {completionReward.nextMission.title}
                </p>
              )}

              <Button
                variant="primary"
                className="mt-4 w-full"
                onClick={() => setCompletionReward(null)}
              >
                Continuar
              </Button>
            </Card>
          </motion.div>
        </div>
      )}
      {/* Modal de Boas-vindas */}
      <WelcomeModal
        isOpen={shouldShowWelcome}
        onComplete={completeWelcome}
        userName={userSettings.name || 'Estudante'}
      />

      {/* Tutorial passo a passo */}
      <TutorialTooltip
        steps={tutorialSteps}
        isActive={shouldShowTutorial}
        onComplete={completeTutorial}
        onSkip={skipTutorial}
      />

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="app-page max-[479px]:[&>*+*]:mt-3"
      >
        {/* Cabeçalho da página */}
        <motion.div
          variants={itemVariants}
          className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          data-tutorial="dashboard-header"
        >
          <div className="min-w-0">
            <h1 className="text-2xl max-[479px]:text-xl sm:text-3xl font-heading font-bold text-white leading-tight">
              {greeting}, {userSettings.name || 'Estudante'}
            </h1>
            <p className="text-text-secondary mt-1 max-[479px]:text-sm">
              {isEmptyState
                ? 'Vamos configurar seu treinador inteligente de estudos.'
                : 'Seu treinador inteligente de estudos. Abra e saiba o que fazer agora.'}
            </p>
          </div>
          {!isEmptyState && (
            <motion.div
              whileHover={{ scale: 1.05 }}
              className="hidden items-center gap-2 rounded-lg border border-neon-blue/30 bg-neon-blue/10 px-4 py-2 md:flex"
            >
              <Sparkles className="h-5 w-5 text-neon-blue" />
              <span className="text-sm text-white">
                Nível {trainerSnapshot.level} - {trainerSnapshot.levelTitle}
              </span>
            </motion.div>
          )}
        </motion.div>

        {!isEmptyState && (
          <>
            <motion.div
              variants={itemVariants}
              className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.75fr)]"
            >
              <div className="rounded-lg border border-neon-blue/25 bg-[linear-gradient(135deg,rgba(0,180,255,0.14),rgba(127,0,255,0.08)_46%,rgba(15,25,45,0.76))] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.22)] sm:p-5">
                <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-neon-cyan/30 bg-neon-cyan/10 px-3 py-1 text-xs font-medium text-neon-cyan">
                      <Route className="h-3.5 w-3.5" />
                      Próxima missão de estudo
                    </div>
                    <h2 className="break-words text-2xl font-heading font-bold text-white max-[479px]:text-xl sm:text-3xl">
                      {trainerSnapshot.nextMission
                        ? trainerSnapshot.nextMission.title
                        : trainerSnapshot.missions.length > 0
                        ? 'Missões de hoje concluídas'
                        : 'Nenhuma missão pronta'}
                    </h2>
                    <p className="mt-2 max-w-2xl text-sm text-text-secondary">
                      {trainerSnapshot.nextMission
                        ? `${trainerSnapshot.nextMission.block.startTime} - ${trainerSnapshot.nextMission.block.endTime} · ${formatDuration(
                            trainerSnapshot.nextMission.durationMinutes
                          )} · vale +${trainerSnapshot.nextMission.xp} XP`
                        : trainerSnapshot.missions.length > 0
                        ? 'Bom trabalho. O próximo passo é revisar seu progresso ou adiantar a agenda.'
                        : 'Gere uma agenda para o treinador montar suas próximas missões.'}
                    </p>
                  </div>

                  <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
                    {trainerSnapshot.nextMission ? (
                      <Button
                        variant="primary"
                        onClick={() => handleStartBlock(trainerSnapshot.nextMission!.block)}
                        leftIcon={<PlayCircle className="h-4 w-4" />}
                        className="w-full sm:w-auto"
                      >
                        Começar agora
                      </Button>
                    ) : null}
                    <Button
                      variant={trainerSnapshot.nextMission ? 'secondary' : 'primary'}
                      onClick={() => router.push('/planner')}
                      className="w-full sm:w-auto"
                    >
                      Ver agenda
                    </Button>
                  </div>
                </div>

                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between gap-3 text-xs text-text-secondary">
                    <span>
                      Meta do dia: {formatDuration(trainerSnapshot.todayCompletedMinutes)} de{' '}
                      {formatDuration(trainerSnapshot.dailyGoalMinutes)}
                    </span>
                    <span>
                      {trainerSnapshot.todayRemainingMinutes > 0
                        ? `Faltam ${formatDuration(trainerSnapshot.todayRemainingMinutes)}`
                        : trainerSnapshot.dailyGoalMinutes > 0
                        ? 'Meta diária concluída'
                        : 'Sem meta para hoje'}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-neon-cyan to-neon-blue transition-all duration-500"
                      style={{ width: `${trainerSnapshot.todayProgressPercent}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-card-border bg-card-bg p-4 sm:p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-normal text-text-muted">
                      Evolução
                    </p>
                    <h2 className="text-xl font-heading font-bold text-white">
                      Nível {trainerSnapshot.level}
                    </h2>
                    <p className="text-sm text-text-secondary">{trainerSnapshot.levelTitle}</p>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-neon-purple/15 text-neon-violet">
                    <Medal className="h-6 w-6" />
                  </div>
                </div>
                <div className="mb-4">
                  <div className="mb-2 flex items-center justify-between text-xs text-text-secondary">
                    <span>{trainerSnapshot.xpInCurrentLevel} XP</span>
                    <span>{trainerSnapshot.xpToNextLevel} XP</span>
                  </div>
                  <ProgressBar
                    value={trainerSnapshot.xpInCurrentLevel}
                    max={trainerSnapshot.xpToNextLevel || 1}
                    color="gradient"
                    size="md"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-card-border bg-[var(--surface-soft)] p-3">
                    <div className="mb-1 flex items-center gap-1.5 text-xs text-text-muted">
                      <Zap className="h-3.5 w-3.5 text-neon-cyan" />
                      Ganho hoje
                    </div>
                    <p className="text-lg font-bold text-white">+{trainerSnapshot.todayXp}</p>
                  </div>
                  <div className="rounded-lg border border-card-border bg-[var(--surface-soft)] p-3">
                    <div className="mb-1 flex items-center gap-1.5 text-xs text-text-muted">
                      <Flame className="h-3.5 w-3.5 text-orange-400" />
                      Sequência
                    </div>
                    <p className="text-lg font-bold text-white">{formatDayCount(trainerSnapshot.streak)}</p>
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div
              variants={itemVariants}
              className="grid grid-cols-1 gap-3 sm:grid-cols-3"
            >
              <div className="rounded-lg border border-card-border bg-card-bg p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-white">
                  <Target className="h-4 w-4 text-neon-blue" />
                  Meta do dia
                </div>
                <p className="text-2xl font-bold text-white">
                  {formatDuration(trainerSnapshot.dailyGoalMinutes)}
                </p>
                <p className="mt-1 text-xs text-text-secondary">
                  {trainerSnapshot.dailyGoalCompleted
                    ? 'Concluída hoje.'
                    : `${formatDuration(trainerSnapshot.todayRemainingMinutes)} para bater a meta.`}
                </p>
              </div>
              <div className="rounded-lg border border-card-border bg-card-bg p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-white">
                  <Award className="h-4 w-4 text-neon-cyan" />
                  XP restante hoje
                </div>
                <p className="text-2xl font-bold text-white">+{trainerSnapshot.possibleXpToday}</p>
                <p className="mt-1 text-xs text-text-secondary">
                  Disponível nas missões pendentes.
                </p>
              </div>
              <div className="rounded-lg border border-card-border bg-card-bg p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-white">
                  <CheckCircle2 className="h-4 w-4 text-neon-cyan" />
                  Semana
                </div>
                <p className="text-2xl font-bold text-white">
                  {trainerSnapshot.weekly.daysCompleted}/{Math.max(1, trainerSnapshot.weekly.activeDays)} metas
                </p>
                <p className="mt-1 text-xs text-text-secondary">
                  {formatDuration(trainerSnapshot.weekly.minutesStudied)} estudados na semana.
                </p>
              </div>
            </motion.div>
          </>
        )}

        {/* Estado vazio - Primeiro uso */}
        {isEmptyState ? (
          <motion.div variants={itemVariants}>
            <Card className="py-16">
              <EmptyDashboard onAddSubject={handleAddSubject} />
            </Card>

            {/* Cards de prévia */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-[479px]:gap-3 sm:gap-6 mt-6 max-[479px]:mt-4 sm:mt-8">
              <motion.div
                variants={itemVariants}
                whileHover={{ y: -4 }}
                className="glass-card p-4 max-[479px]:p-3 sm:p-6 text-center"
              >
                <div className="w-16 h-16 max-[479px]:w-12 max-[479px]:h-12 rounded-2xl bg-neon-blue/20 flex items-center justify-center mx-auto mb-4 max-[479px]:mb-3">
                  <BookOpen className="w-8 h-8 max-[479px]:w-6 max-[479px]:h-6 text-neon-blue" />
                </div>
                <h3 className="font-heading font-bold text-white mb-2">
                  Organize suas Disciplinas
                </h3>
                <p className="text-sm text-text-secondary">
                  Cadastre matérias com prioridade e dificuldade para otimizar seus estudos.
                </p>
              </motion.div>

              <motion.div
                variants={itemVariants}
                whileHover={{ y: -4 }}
                className="glass-card p-4 max-[479px]:p-3 sm:p-6 text-center"
              >
                <div className="w-16 h-16 max-[479px]:w-12 max-[479px]:h-12 rounded-2xl bg-neon-purple/20 flex items-center justify-center mx-auto mb-4 max-[479px]:mb-3">
                  <Calendar className="w-8 h-8 max-[479px]:w-6 max-[479px]:h-6 text-neon-violet" />
                </div>
                <h3 className="font-heading font-bold text-white mb-2">
                  Agenda Inteligente
                </h3>
                <p className="text-sm text-text-secondary">
                  A IA cria automaticamente um cronograma baseado nas suas necessidades.
                </p>
              </motion.div>

              <motion.div
                variants={itemVariants}
                whileHover={{ y: -4 }}
                className="glass-card p-4 max-[479px]:p-3 sm:p-6 text-center"
              >
                <div className="w-16 h-16 max-[479px]:w-12 max-[479px]:h-12 rounded-2xl bg-neon-cyan/20 flex items-center justify-center mx-auto mb-4 max-[479px]:mb-3">
                  <TrendingUp className="w-8 h-8 max-[479px]:w-6 max-[479px]:h-6 text-neon-cyan" />
                </div>
                <h3 className="font-heading font-bold text-white mb-2">
                  Acompanhe o Progresso
                </h3>
                <p className="text-sm text-text-secondary">
                  Visualize estatísticas e insights para melhorar continuamente.
                </p>
              </motion.div>
            </div>
          </motion.div>
        ) : (
          <>
            <motion.div
              variants={itemVariants}
              className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]"
              data-tutorial="plan"
            >
              <Card padding="none">
                <div className="border-b border-card-border p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-heading font-bold text-white">
                        Missões de hoje
                      </h2>
                      <p className="mt-1 text-sm text-text-secondary">
                        O treinador ordena o que fazer e evita que você precise decidir no impulso.
                      </p>
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => router.push('/planner')}>
                      Ajustar
                    </Button>
                  </div>
                </div>
                <div className="divide-y divide-card-border">
                  {trainerSnapshot.missions.length === 0 ? (
                    <div className="p-5 text-sm text-text-secondary">
                      Nenhuma missão pronta. Gere a agenda para montar seu plano automático.
                    </div>
                  ) : (
                    trainerSnapshot.missions.slice(0, 6).map((mission) => (
                      <div
                        key={mission.block.id}
                        className="flex min-w-0 flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: mission.block.subject?.color || '#00B4FF' }}
                            />
                            <p className="truncate font-semibold text-white">{mission.title}</p>
                          </div>
                          <p className="mt-1 text-xs text-text-secondary">
                            {formatDuration(mission.durationMinutes)} ·{' '}
                            {mission.status === 'completed'
                              ? mission.earnedXp > 0
                                ? `+${mission.earnedXp} XP recebidos`
                                : 'XP já registrado'
                              : `vale +${mission.xp} XP`}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {mission.status === 'completed' ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-neon-cyan/25 bg-neon-cyan/10 px-2.5 py-1 text-xs text-neon-cyan">
                              <CheckCircle2 className="h-3 w-3" />
                              Concluída
                            </span>
                          ) : (
                            <Button
                              variant={mission.isNext ? 'primary' : 'secondary'}
                              size="sm"
                              onClick={() => handleStartBlock(mission.block)}
                            >
                              {mission.isNext ? 'Começar' : 'Abrir'}
                            </Button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Card>

              <Card className="h-full">
                <div className="mb-4 flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-neon-violet" />
                  <h2 className="text-lg font-heading font-bold text-white">Conquistas</h2>
                </div>
                <div className="space-y-3">
                  {trainerSnapshot.achievements.unlocked.slice(-3).length > 0 ? (
                    trainerSnapshot.achievements.unlocked.slice(-3).map((achievement) => (
                      <div key={achievement.achievementId} className="rounded-lg border border-card-border bg-card-bg p-3">
                        <p className="text-sm font-semibold text-white">{achievement.name}</p>
                        <p className="mt-1 text-xs text-text-secondary">{achievement.description}</p>
                      </div>
                    ))
                  ) : (
                    <p className="rounded-lg border border-card-border bg-card-bg p-3 text-sm text-text-secondary">
                      Complete sua primeira missão para desbloquear conquistas.
                    </p>
                  )}
                </div>
                {trainerSnapshot.achievements.next.length > 0 && (
                  <div className="mt-4 border-t border-card-border pt-4">
                    <p className="mb-2 text-xs font-medium uppercase tracking-normal text-text-muted">
                      Próximas
                    </p>
                    <div className="space-y-2">
                      {trainerSnapshot.achievements.next.slice(0, 2).map((achievement) => (
                        <p key={achievement.id} className="text-xs text-text-secondary">
                          {achievement.name}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            </motion.div>

            {/* Cards de estatísticas */}
            <motion.div
              variants={itemVariants}
              className="grid grid-cols-2 lg:grid-cols-4 gap-3 max-[479px]:gap-2"
              data-tutorial="stats"
            >
              <StatsCard
                title="Prática na semana"
                titleShort="Prática"
                value={formatHoursDuration(weeklyPracticalHours)}
                subtitle="Apenas blocos práticos"
                icon={Clock}
                trend={{ value: 0, isPositive: false }}
                color="blue"
                variant="mobile"
              />
              <StatsCard
                title="Foco médio"
                titleShort="Foco"
                value={`${focusScore}%`}
                subtitle={focusScore > 0 ? 'Últimos estudos' : 'Sem dados ainda'}
                icon={Brain}
                trend={{ value: 0, isPositive: false }}
                color="purple"
                variant="mobile"
              />
              <StatsCard
                title="Sequência de estudos"
                titleShort="Sequência"
                value={formatDayCount(trainerSnapshot.streak)}
                subtitle={`Recorde pessoal: ${formatDayCount(trainerSnapshot.longestStreak)}`}
                icon={Flame}
                color="orange"
                variant="mobile"
              />
              <StatsCard
                title="Estudos feitos"
                titleShort="Feitos"
                value={completedThisWeek.toString()}
                subtitle="Esta semana"
                icon={Target}
                trend={{ value: 0, isPositive: false }}
                color="cyan"
                variant="mobile"
              />
            </motion.div>

            {/* Grid de conteúdo principal */}
            <div className="grid grid-cols-1 gap-4 max-[479px]:gap-3 sm:gap-6 lg:grid-cols-3">
              {/* Gráfico semanal - 2 colunas */}
              <motion.div
                variants={itemVariants}
                className="lg:col-span-2"
                data-tutorial="chart"
              >
                <WeeklyChart data={weeklyData} />
              </motion.div>

              {/* Progresso de nível */}
              <motion.div variants={itemVariants} data-tutorial="level">
                <LevelProgress
                  level={trainerSnapshot.level}
                  currentXp={trainerSnapshot.xpInCurrentLevel}
                  xpForNextLevel={trainerSnapshot.xpToNextLevel}
                  totalXp={trainerSnapshot.totalXp}
                  achievements={trainerSnapshot.achievements.unlocked.length}
                />
              </motion.div>
            </div>

            {/* Seção inferior */}
            <div className="grid grid-cols-1 gap-4 max-[479px]:gap-3 sm:gap-6 lg:grid-cols-3">
              {/* Plano do dia - 2 colunas */}
              <motion.div
                variants={itemVariants}
                className="self-start lg:col-span-2"
                data-tutorial="plan"
              >
                <TodayPlan
                  blocks={todayBlocks}
                  onStartSession={handleStartSession}
                  onSkipBlock={handleSkipBlock}
                  title={planTitle}
                  subtitle={planSubtitle}
                  onCompleteBlock={handleCompleteBlock}
                  onStartBlock={handleStartBlock}
                />
              </motion.div>

              {/* Progresso das disciplinas */}
              <motion.div variants={itemVariants}>
                <Card className="h-full">
                  <h2 className="text-xl max-[479px]:text-lg font-heading font-bold text-white mb-4 max-[479px]:mb-2">
                    Metas por disciplina
                  </h2>
                  <p className="text-sm max-[479px]:text-xs text-text-secondary mb-6 max-[479px]:mb-4">
                    Metas semanais
                  </p>

                  <div className="space-y-5 max-[479px]:space-y-3">
                    {subjectProgressRows.map(({ subject, completedHours }, index) => (
                      <motion.div
                        key={subject.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                      >
                        <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: subject.color }}
                            />
                            <span className="truncate text-sm font-medium text-white">
                              {subject.name}
                            </span>
                          </div>
                          <span className="shrink-0 text-xs text-text-secondary">
                            {formatHoursDuration(completedHours)} / {formatHoursDuration(subject.targetHours)}
                          </span>
                        </div>
                        <div className="relative">
                          <ProgressBar
                            value={completedHours}
                            max={subject.targetHours}
                            color={
                              completedHours >= subject.targetHours
                                ? 'cyan'
                                : 'blue'
                            }
                            size="sm"
                          />
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  {/* Ações rápidas */}
                  <div className="mt-6 max-[479px]:mt-4 pt-4 max-[479px]:pt-3 border-t border-card-border">
                    <motion.a
                      href="/subjects"
                      whileHover={{ x: 4 }}
                      className="flex items-center gap-2 text-sm text-neon-blue hover:text-neon-cyan transition-colors"
                    >
                      <TrendingUp className="w-4 h-4" />
                      Ver todas as disciplinas
                    </motion.a>
                  </div>
                </Card>
              </motion.div>
            </div>
          </>
        )}
      </motion.div>
    </>
  );
}
