'use client';

/**
 * WeeklyPlanner Component
 * Grade principal do planner com funcionalidade de arrastar e soltar
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSession } from 'next-auth/react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { motion } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Sparkles,
  RefreshCw,
  ArrowRightLeft,
  ListTodo,
  AlertTriangle,
  Flame,
  BellOff,
} from 'lucide-react';
import {
  getWeekStart,
  getWeekDates,
  formatDate,
  formatDuration,
  isSameDay,
  generateId,
  parseBlockDate,
  timeToMinutes,
  minutesToTime,
} from '@/lib/utils';
import { Button, Card } from '@/components/ui';
import { useLocalStorage } from '@/hooks';
import { defaultSettings } from '@/lib/defaultSettings';
import { getStudyBlockDisplayTitle } from '@/lib/studyBlockLabels';
import DayColumn from './DayColumn';
import TimeBlock from './TimeBlock';
import BlockFormModal, { type BlockFormData } from './BlockFormModal';
import { StudyBlockSessionModal } from '@/components/session';
import type {
  AnalyticsStore,
  DailyHoursByWeekday,
  StudyBlock,
  StudyPreferences,
  Subject,
  UserSettings,
  WeekdayKey,
} from '@/types';
import { autoRescheduleBacklog, getBacklogEntries } from '@/services/backlogRescheduler';
import { applyBlockCompletionMetrics } from '@/services/adaptiveStudyIntelligence';
import {
  calculateTrainerCompletionReward,
  type TrainerAchievementUnlock,
  type TrainerXpEvent,
} from '@/services/studyTrainer';

const emptyAnalytics: AnalyticsStore = { daily: {} };
const weekdayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

const toLocalDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;

const parseLocalDateKey = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  const parsed = new Date(year, month - 1, day);
  parsed.setHours(0, 0, 0, 0);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const hasManualSequence = (block: StudyBlock) =>
  typeof block.sequenceIndex === 'number' && Number.isFinite(block.sequenceIndex);

const isLockedScheduleBlock = (block: StudyBlock) =>
  block.status === 'completed' || block.status === 'in-progress';

const isPendingStudyBlock = (block: StudyBlock) =>
  !block.isBreak && block.status !== 'completed' && block.status !== 'skipped';

const isCapacityStudyBlock = (block: StudyBlock) =>
  !block.isBreak && block.status !== 'skipped';

const compareDayBlocks = (a: StudyBlock, b: StudyBlock) => {
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

const sortBlocksChronologically = (blocks: StudyBlock[]) =>
  [...blocks].sort((a, b) => {
    const dateDiff = parseBlockDate(a.date).getTime() - parseBlockDate(b.date).getTime();
    if (dateDiff !== 0) return dateDiff;
    return a.startTime.localeCompare(b.startTime);
  });

const areBlocksEquivalent = (a: StudyBlock[], b: StudyBlock[]) => {
  if (a.length !== b.length) return false;
  const first = sortBlocksChronologically(a);
  const second = sortBlocksChronologically(b);
  for (let i = 0; i < first.length; i += 1) {
    const one = first[i];
    const two = second[i];
    if (one.id !== two.id) return false;
    if (parseBlockDate(one.date).getTime() !== parseBlockDate(two.date).getTime()) return false;
    if (one.startTime !== two.startTime || one.endTime !== two.endTime) return false;
    if (one.durationMinutes !== two.durationMinutes) return false;
    if (one.status !== two.status) return false;
    if ((one.rescheduleCount || 0) !== (two.rescheduleCount || 0)) return false;
  }
  return true;
};

interface WeeklyPlannerProps {
  initialBlocks: StudyBlock[];
  onBlocksChange: (blocks: StudyBlock[]) => void;
  onGenerateSchedule: (range?: { startDate: Date; endDate: Date }) => void;
  isGenerating?: boolean;
  subjects?: Subject[];
  defaultDailyLimitMinutes?: number;
  defaultDailyLimitsByDate?: Record<string, number>;
  dailyHoursByWeekday?: DailyHoursByWeekday;
  allowedDays?: number[];
  selectedScheduleStartDate?: string | null;
  selectedScheduleEndDate?: string | null;
}

export default function WeeklyPlanner({
  initialBlocks,
  onBlocksChange,
  onGenerateSchedule,
  isGenerating = false,
  subjects = [],
  defaultDailyLimitMinutes = 0,
  defaultDailyLimitsByDate,
  dailyHoursByWeekday,
  allowedDays = [],
  selectedScheduleStartDate,
  selectedScheduleEndDate,
}: WeeklyPlannerProps) {
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const selectedStart = selectedScheduleStartDate
      ? parseLocalDateKey(selectedScheduleStartDate)
      : null;
    return getWeekStart(selectedStart ?? new Date());
  });
  const [blocks, setBlocks] = useState(initialBlocks);
  const [isMobile, setIsMobile] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [mobileDayIndex, setMobileDayIndex] = useState(0);

  // Sincronizar quando o pai atualizar os blocos (ex: após gerar agenda)
  useEffect(() => {
    setBlocks((prev) => {
      if (prev.length !== initialBlocks.length) return initialBlocks;
      for (let i = 0; i < prev.length; i++) {
        const a = prev[i];
        const b = initialBlocks[i];
        if (
          a.id !== b.id ||
          a.status !== b.status ||
          a.subjectId !== b.subjectId ||
          a.startTime !== b.startTime ||
          a.endTime !== b.endTime
        ) {
          return initialBlocks;
        }
      }
      return prev;
    });
  }, [initialBlocks]);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificationPermissionBlocked(false);
      return;
    }

    const refreshPermissionState = () => {
      setNotificationPermissionBlocked(Notification.permission === 'denied');
    };

    refreshPermissionState();
    document.addEventListener('visibilitychange', refreshPermissionState);
    window.addEventListener('focus', refreshPermissionState);

    return () => {
      document.removeEventListener('visibilitychange', refreshPermissionState);
      window.removeEventListener('focus', refreshPermissionState);
    };
  }, []);
  const [activeBlock, setActiveBlock] = useState<StudyBlock | null>(null);
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<StudyBlock | null>(null);
  const [blockModalDate, setBlockModalDate] = useState<Date>(new Date());
  const [blockModalDefaults, setBlockModalDefaults] = useState({
    startTime: '09:00',
    durationMinutes: 60,
  });
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [scheduleStartDate, setScheduleStartDate] = useState('');
  const [scheduleEndDate, setScheduleEndDate] = useState('');
  const [scheduleError, setScheduleError] = useState('');
  const [isRescheduleModalOpen, setIsRescheduleModalOpen] = useState(false);
  const [rescheduleSourceDate, setRescheduleSourceDate] = useState('');
  const [rescheduleTargetDate, setRescheduleTargetDate] = useState('');
  const [rescheduleError, setRescheduleError] = useState('');
  const [rescheduleSingleBlockId, setRescheduleSingleBlockId] = useState<string | null>(null);
  const [isBacklogModalOpen, setIsBacklogModalOpen] = useState(false);
  const [backlogNotice, setBacklogNotice] = useState('');
  const [backlogAutoState, setBacklogAutoState] = useState<{
    movedCount: number;
    insertedTodayCount: number;
    backlogBefore: number;
    backlogAfter: number;
    suggestedExtraMinutesPerDay: number;
    shouldSuggestReplan: boolean;
    shouldSuggestRecoveryMode: boolean;
    suggestedReduceNewContent: boolean;
  } | null>(null);
  const [dailyLimits, setDailyLimits] = useLocalStorage<Record<string, number>>(
    'nexora_daily_limits',
    {}
  );
  const [userSettings, setUserSettings] = useLocalStorage<UserSettings>(
    'nexora_user_settings',
    defaultSettings
  );
  const [storedSubjects, setStoredSubjects] = useLocalStorage<Subject[]>('nexora_subjects', []);
  const [analytics, setAnalytics] = useLocalStorage<AnalyticsStore>('nexora_analytics', emptyAnalytics);
  const [studyPrefs] = useLocalStorage<StudyPreferences>('nexora_study_prefs', {
    hoursPerDay: 2,
    daysOfWeek: [1, 2, 3, 4, 5],
    mode: 'random',
  });
  const [xpEvents, setXpEvents] = useLocalStorage<TrainerXpEvent[]>('nexora_xp_events', []);
  const [unlockedAchievements, setUnlockedAchievements] = useLocalStorage<TrainerAchievementUnlock[]>(
    'nexora_unlocked_achievements',
    []
  );
  const [lastBacklogAutoRunDay, setLastBacklogAutoRunDay] = useLocalStorage<string>(
    'nexora_backlog_last_auto_run_day',
    ''
  );
  const [sessionBlock, setSessionBlock] = useState<StudyBlock | null>(null);
  const [isSessionOpen, setIsSessionOpen] = useState(false);
  const [notificationPermissionBlocked, setNotificationPermissionBlocked] = useState(false);
  const autoBacklogRunRef = useRef<string>('');
  const completingBlockIdsRef = useRef(new Set<string>());
  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const boardScrollRef = useRef<HTMLDivElement | null>(null);
  const boardContentRef = useRef<HTMLDivElement | null>(null);
  const { status: authStatus } = useSession();
  const [boardScrollWidth, setBoardScrollWidth] = useState(0);
  const weekDayKeys: WeekdayKey[] = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
  const weekIndexFromDate = (date: Date) => (date.getDay() + 6) % 7;

  // Obter datas da semana
  const weekDates = useMemo(
    () => getWeekDates(currentWeekStart),
    [currentWeekStart]
  );
  useEffect(() => {
    if (!isMobile) return;
    const today = new Date();
    const todayIndex = weekDates.findIndex((date) => isSameDay(date, today));
    if (todayIndex >= 0) {
      setMobileDayIndex(todayIndex);
    }
  }, [isMobile, weekDates]);

  useEffect(() => {
    if (!isMobile || !selectedScheduleStartDate) return;
    const selectedStart = parseLocalDateKey(selectedScheduleStartDate);
    if (!selectedStart) return;
    const selectedIndex = weekDates.findIndex((date) => isSameDay(date, selectedStart));
    if (selectedIndex >= 0) {
      setMobileDayIndex(selectedIndex);
    }
  }, [isMobile, weekDates, selectedScheduleStartDate]);

  useEffect(() => {
    if (!isMounted) return;
    if (!isScheduleModalOpen && !isRescheduleModalOpen && !isBacklogModalOpen) return;

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [isMounted, isScheduleModalOpen, isRescheduleModalOpen, isBacklogModalOpen]);

  const formatDatePt = (date: Date) =>
    date.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
    });
  const toLocalKey = toLocalDateKey;
  const parseLocalKey = (value: string) => {
    return parseLocalDateKey(value) ?? new Date(Number.NaN);
  };
  const allowSundayBacklog = Boolean(userSettings.allowSundayBacklog);
  const backlogRecoveryDays = useMemo(() => {
    const days = new Set<number>();
    if (allowSundayBacklog) days.add(0);

    if (userSettings.allowRestDaysForRecovery) {
      for (let i = 0; i <= 6; i++) {
        if (allowedDays.length > 0 && !allowedDays.includes(i)) {
          days.add(i);
        }
      }
    }

    (Array.isArray(userSettings.backlogRecoveryDays) ? userSettings.backlogRecoveryDays : []).forEach(
      (day) => {
        if (Number.isInteger(day) && day >= 0 && day <= 6) days.add(day);
      }
    );
    return Array.from(days).sort((a, b) => a - b);
  }, [allowSundayBacklog, userSettings.backlogRecoveryDays, userSettings.allowRestDaysForRecovery, allowedDays]);
  const backlogAllowedDays = useMemo(() => {
    if (allowedDays.length === 0) return [];
    const days = new Set(allowedDays);
    backlogRecoveryDays.forEach((day) => days.add(day));
    return Array.from(days).sort((a, b) => a - b);
  }, [allowedDays, backlogRecoveryDays]);
  const isAllowedBacklogDay = (date: Date) =>
    backlogAllowedDays.length === 0 || backlogAllowedDays.includes(date.getDay());
  const isConfiguredStudyDay = (date: Date) =>
    allowedDays.length === 0 || allowedDays.includes(date.getDay());
  const isRecoveryOnlyDay = (date: Date) =>
    allowedDays.length > 0 && !allowedDays.includes(date.getDay()) && isAllowedBacklogDay(date);

  useEffect(() => {
    if (!selectedScheduleStartDate) return;
    const selectedStart = parseLocalDateKey(selectedScheduleStartDate);
    if (!selectedStart) return;
    setCurrentWeekStart(getWeekStart(selectedStart));
  }, [selectedScheduleStartDate]);

  useEffect(() => {
    if (!isScheduleModalOpen) return;
    const todayKey = toLocalDateKey(new Date());
    const selectedStart = selectedScheduleStartDate
      ? parseLocalDateKey(selectedScheduleStartDate)
      : null;
    const defaultStart = selectedStart ?? parseLocalDateKey(todayKey) ?? new Date();
    const defaultStartKey = toLocalDateKey(defaultStart);

    let defaultEnd = selectedScheduleEndDate ? parseLocalDateKey(selectedScheduleEndDate) : null;
    if (!defaultEnd || defaultEnd < defaultStart) {
      defaultEnd = new Date(defaultStart);
      defaultEnd.setDate(defaultEnd.getDate() + 6);
    }

    setScheduleStartDate(defaultStartKey);
    setScheduleEndDate(toLocalDateKey(defaultEnd));
    setScheduleError('');
  }, [isScheduleModalOpen, selectedScheduleStartDate, selectedScheduleEndDate]);

  useEffect(() => {
    if (!isRescheduleModalOpen) return;
    if (rescheduleSingleBlockId) {
      setRescheduleError('');
      return;
    }
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);
    const defaultSource = toLocalDateKey(today);
    const defaultTarget = toLocalDateKey(tomorrow);
    setRescheduleSourceDate(defaultSource);
    setRescheduleTargetDate(defaultTarget);
    setRescheduleError('');
  }, [isRescheduleModalOpen, rescheduleSingleBlockId]);

  // Configurar sensores de arrastar
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Agrupar blocos por dia
  const blocksByDay = useMemo(() => {
    const grouped = new Map<string, StudyBlock[]>();
    
    weekDates.forEach((date) => {
      const dateKey = toLocalDateKey(date);
      grouped.set(
        dateKey,
        blocks
          .filter((b) => isSameDay(parseBlockDate(b.date), date))
          .sort(compareDayBlocks)
      );
    });
    
    return grouped;
  }, [blocks, weekDates]);

  const mobileDay = weekDates[mobileDayIndex] ?? weekDates[0];
  const mobileDayKey = mobileDay ? toLocalDateKey(mobileDay) : '';
  const mobileDayBlocks = mobileDayKey ? blocksByDay.get(mobileDayKey) ?? [] : [];
  const mobileStudyMinutes = mobileDayBlocks
    .filter((block) => isPendingStudyBlock(block))
    .reduce((sum, block) => sum + block.durationMinutes, 0);
  const mobileSessions = mobileDayBlocks.filter((block) => isPendingStudyBlock(block)).length;
  const visibleDates = isMobile ? [mobileDay] : weekDates;
  const todayKey = useMemo(() => toLocalDateKey(new Date()), []);
  const rescheduleTargetInfo = (() => {
    if (!rescheduleTargetDate) return null;
    const date = parseLocalDateKey(rescheduleTargetDate);
    if (!date) return null;

    const dayIndex = date.getDay();
    return {
      dayIndex,
      label: weekdayLabels[dayIndex],
      isStudyDay: isConfiguredStudyDay(date),
      isAllowed: isAllowedBacklogDay(date),
    };
  })();

  useEffect(() => {
    const content = boardContentRef.current;
    if (!content || isMobile) {
      setBoardScrollWidth(0);
      return;
    }

    const updateWidth = () => setBoardScrollWidth(content.scrollWidth);
    updateWidth();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => updateWidth());
    observer.observe(content);
    return () => observer.disconnect();
  }, [isMobile, visibleDates.length, blocks.length]);

  useEffect(() => {
    if (isMobile) return;
    const topScroll = topScrollRef.current;
    const boardScroll = boardScrollRef.current;
    if (!topScroll || !boardScroll) return;

    let lock = false;
    const syncFromTop = () => {
      if (lock) return;
      lock = true;
      boardScroll.scrollLeft = topScroll.scrollLeft;
      lock = false;
    };
    const syncFromBoard = () => {
      if (lock) return;
      lock = true;
      topScroll.scrollLeft = boardScroll.scrollLeft;
      lock = false;
    };

    topScroll.addEventListener('scroll', syncFromTop, { passive: true });
    boardScroll.addEventListener('scroll', syncFromBoard, { passive: true });
    topScroll.scrollLeft = boardScroll.scrollLeft;

    return () => {
      topScroll.removeEventListener('scroll', syncFromTop);
      boardScroll.removeEventListener('scroll', syncFromBoard);
    };
  }, [isMobile, boardScrollWidth]);

  const backlogEntries = useMemo(() => getBacklogEntries(blocks, new Date()), [blocks]);
  const overdueBacklogCount = backlogEntries.filter((entry) => entry.dateKey < todayKey).length;
  const todaysSkippedBacklogCount = backlogEntries.filter((entry) => entry.dateKey === todayKey).length;
  const backlogHigh = backlogEntries.length >= 6;
  const backlogRecoveryCount = backlogEntries.filter(
    (entry) => (entry.block.rescheduleCount || 0) >= 3
  ).length;

  const streakDays = useMemo(() => {
    const completedKeys = new Set(
      blocks
        .filter((block) => !block.isBreak && block.status === 'completed')
        .map((block) =>
          block.completedAt ? toLocalDateKey(new Date(block.completedAt)) : toLocalDateKey(parseBlockDate(block.date))
        )
    );
    if (completedKeys.size === 0) return 0;

    let streak = 0;
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    const todayCompleted = completedKeys.has(toLocalDateKey(cursor));
    if (!todayCompleted) {
      cursor.setDate(cursor.getDate() - 1);
    }
    while (completedKeys.has(toLocalDateKey(cursor))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }, [blocks]);

  // run once per day after opening the planner, avoiding repeated auto-reschedules in the same session/day
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (overdueBacklogCount <= 0) return;
    if (lastBacklogAutoRunDay === todayKey) return;
    if (autoBacklogRunRef.current === todayKey) return;

    autoBacklogRunRef.current = todayKey;
    const result = runAutoBacklogReschedule('startup');
    setLastBacklogAutoRunDay(todayKey);

    if (result.changedBlockIds.length > 0) {
      setBacklogNotice(
        `Pendências detectadas: ${result.backlogBefore}. Replanejamento automático executado (${result.movedCount} movimentados).`
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overdueBacklogCount, lastBacklogAutoRunDay, todayKey]);

  useEffect(() => {
    if (blocks.length === 0) return;
    const weekHasBlocks = blocks.some((block) =>
      weekDates.some((date) => isSameDay(parseBlockDate(block.date), date))
    );
    if (weekHasBlocks) return;

    const sortedBlocks = [...blocks].sort((a, b) => {
      const dateDiff = parseBlockDate(a.date).getTime() - parseBlockDate(b.date).getTime();
      if (dateDiff !== 0) return dateDiff;
      return a.startTime.localeCompare(b.startTime);
    });
    const firstDate = parseBlockDate(sortedBlocks[0].date);
    const nextWeekStart = getWeekStart(firstDate);
    if (!isSameDay(nextWeekStart, currentWeekStart)) {
      setCurrentWeekStart(nextWeekStart);
    }
  }, [blocks, weekDates, currentWeekStart]);

  const getBaseDailyLimitMinutes = (date: Date) => {
    const key = toLocalKey(date);
    const fallback = defaultDailyLimitsByDate?.[key];
    if (typeof fallback === 'number') return fallback;
    if (dailyHoursByWeekday) {
      const dayKey = weekDayKeys[date.getDay()];
      const hours = dailyHoursByWeekday[dayKey];
      if (typeof hours === 'number') return Math.max(0, Math.round(hours * 60));
    }
    return defaultDailyLimitMinutes;
  };

  const getDailyLimitMinutes = (date: Date) => {
    const key = toLocalKey(date);
    const stored = dailyLimits[key];
    const configuredLimit = typeof stored === 'number' ? stored : getBaseDailyLimitMinutes(date);
    if (configuredLimit <= 0) return configuredLimit;

    const { start, end } = getPlannerWindowBounds(date);
    const windowMinutes = Math.max(0, end - start);
    return windowMinutes > 0 ? Math.min(configuredLimit, windowMinutes) : configuredLimit;
  };

  const getDayStudyMinutesForCapacity = (dayBlocks: StudyBlock[]) =>
    dayBlocks.reduce(
      (sum, block) => (isCapacityStudyBlock(block) ? sum + block.durationMinutes : sum),
      0
    );

  const getPlannerWindowBounds = (date?: Date) => {
    const dayKey = date ? weekDayKeys[date.getDay()] : null;
    const dayWindow = dayKey ? userSettings.dailyAvailabilityByWeekday?.[dayKey] : null;
    const startValue = dayWindow?.start || userSettings.preferredStart || '09:00';
    const endValue = dayWindow?.end || userSettings.preferredEnd || '18:00';
    const start = timeToMinutes(startValue);
    const configuredEnd = timeToMinutes(endValue);
    const end = Math.max(start + 60, configuredEnd);
    return { start, end };
  };
  const getWindowCapacityMinutes = (date: Date) => {
    const { start, end } = getPlannerWindowBounds(date);
    return Math.max(0, end - start);
  };
  const getRecoveryFallbackLimitMinutes = (date: Date) => {
    const fallbackGoalMinutes = Math.max(
      30,
      Math.round((userSettings.dailyGoalHours || defaultDailyLimitMinutes / 60 || 2) * 60)
    );
    const windowCapacity = getWindowCapacityMinutes(date);
    return windowCapacity > 0 ? Math.min(fallbackGoalMinutes, windowCapacity) : fallbackGoalMinutes;
  };
  const getSchedulableDailyLimitMinutes = (date: Date) => {
    const configuredLimit = getDailyLimitMinutes(date);
    if (configuredLimit > 0 || !isRecoveryOnlyDay(date)) return configuredLimit;
    return getRecoveryFallbackLimitMinutes(date);
  };
  const getBaseSchedulableDailyLimitMinutes = (date: Date) => {
    const configuredLimit = getBaseDailyLimitMinutes(date);
    if (configuredLimit > 0 || !isRecoveryOnlyDay(date)) return configuredLimit;
    return getRecoveryFallbackLimitMinutes(date);
  };
  const getBreakGapMinutes = () => Math.max(0, Math.round(userSettings.breakMinutes || 0));
  const getBlockEndMinutes = (block: StudyBlock) =>
    timeToMinutes(block.startTime) + Math.max(0, Math.round(block.durationMinutes || 0));
  const formatClockBoundary = (minutes: number) =>
    minutes >= 24 * 60 ? '24:00' : minutesToTime(Math.max(0, minutes));
  const rangesOverlap = (startA: number, endA: number, startB: number, endB: number) =>
    startA < endB && endA > startB;

  const moveBlocksToNextAllowedDayInternal = (
    sourceDate: Date,
    blocksToMove: StudyBlock[],
    sourceBlocks: StudyBlock[]
  ) => {
    if (blocksToMove.length === 0) return { blocks: sourceBlocks, moved: false };
    const breakGapMinutes = getBreakGapMinutes();
    const idsToMove = new Set(blocksToMove.map((block) => block.id));
    const baseBlocks = sourceBlocks.filter((block) => !idsToMove.has(block.id));

    const blocksMap = new Map<string, StudyBlock[]>();
    for (const block of baseBlocks) {
      const key = toLocalKey(parseBlockDate(block.date));
      const list = blocksMap.get(key) ?? [];
      list.push(block);
      blocksMap.set(key, list);
    }

    const sortedToMove = [...blocksToMove].sort(compareDayBlocks);
    const sourceBaseDate = new Date(sourceDate);
    sourceBaseDate.setHours(0, 0, 0, 0);

    let cursorDate = new Date(sourceBaseDate);
    cursorDate.setDate(cursorDate.getDate() + 1);
    while (!isAllowedBacklogDay(cursorDate)) {
      cursorDate.setDate(cursorDate.getDate() + 1);
    }

    const movedBlocks: StudyBlock[] = [];
    let hasMutation = false;

    for (const block of sortedToMove) {
      let placed = false;
      let guard = 0;
      while (!placed && guard < 90) {
        const { start: defaultStart, end: defaultEnd } = getPlannerWindowBounds(cursorDate);
        const key = toLocalKey(cursorDate);
        const dayBlocks = [...(blocksMap.get(key) ?? [])].sort(compareDayBlocks);
        const dayStudyBlocks = dayBlocks.filter((item) => !item.isBreak);
        const dayLimit = getSchedulableDailyLimitMinutes(cursorDate);
        const dayStudyMinutes = getDayStudyMinutesForCapacity(dayStudyBlocks);
        const lastBlockEnd = dayBlocks.reduce(
          (max, item) => Math.max(max, getBlockEndMinutes(item)),
          defaultStart
        );
        const startMinutes =
          dayBlocks.length > 0
            ? Math.max(lastBlockEnd + breakGapMinutes, defaultStart)
            : Math.max(lastBlockEnd, defaultStart);
        const endMinutes = startMinutes + block.durationMinutes;
        const exceedsDailyLimit =
          !block.isBreak && dayLimit > 0 && dayStudyMinutes + block.durationMinutes > dayLimit;

        if (endMinutes <= defaultEnd && !exceedsDailyLimit) {
          const originalDate = block.originalDate ? parseBlockDate(block.originalDate) : parseBlockDate(block.date);
          originalDate.setHours(0, 0, 0, 0);

          const moved: StudyBlock = {
            ...block,
            date: new Date(cursorDate),
            startTime: minutesToTime(startMinutes),
            endTime: minutesToTime(endMinutes),
            status:
              block.isBreak || isLockedScheduleBlock(block) ? block.status : ('rescheduled' as const),
            originalDate: block.isBreak ? block.originalDate : originalDate,
            rescheduleCount:
              block.isBreak || isLockedScheduleBlock(block)
                ? block.rescheduleCount
                : (block.rescheduleCount || 0) + 1,
            updatedAt: new Date(),
          };
          movedBlocks.push(moved);
          dayBlocks.push(moved);
          blocksMap.set(key, dayBlocks);
          placed = true;

          if (
            parseBlockDate(moved.date).getTime() !== parseBlockDate(block.date).getTime() ||
            moved.startTime !== block.startTime ||
            moved.endTime !== block.endTime ||
            moved.status !== block.status
          ) {
            hasMutation = true;
          }
        } else {
          cursorDate.setDate(cursorDate.getDate() + 1);
          while (!isAllowedBacklogDay(cursorDate)) {
            cursorDate.setDate(cursorDate.getDate() + 1);
          }
        }
        guard += 1;
      }

      if (!placed) {
        movedBlocks.push(block);
      }
    }

    const updatedBlocks = sortBlocksChronologically([...baseBlocks, ...movedBlocks]);
    return { blocks: updatedBlocks, moved: hasMutation };
  };

  const moveBlocksToNextAllowedDay = (
    sourceDate: Date,
    blocksToMove: StudyBlock[]
  ) => {
    const result = moveBlocksToNextAllowedDayInternal(sourceDate, blocksToMove, blocks);
    if (!result.moved || areBlocksEquivalent(result.blocks, blocks)) {
      return false;
    }

    setBlocks(result.blocks);
    onBlocksChange(result.blocks);
    return true;
  };

  const canReflowStudyBlock = (block: StudyBlock) =>
    !block.isBreak && !isLockedScheduleBlock(block) && block.status !== 'skipped';

  const buildReflowBreakBlock = (
    date: Date,
    startMinutes: number,
    durationMinutes: number,
    previousBlock: StudyBlock
  ): StudyBlock => {
    const now = new Date();
    return {
      id: generateId(),
      userId: previousBlock.userId,
      subjectId: '',
      date: new Date(date),
      startTime: minutesToTime(startMinutes),
      endTime: minutesToTime(startMinutes + durationMinutes),
      durationMinutes,
      status: 'scheduled',
      isBreak: true,
      isAutoGenerated: true,
      createdAt: now,
      updatedAt: now,
    };
  };

  const removeOrphanAutoBreaks = (sourceBlocks: StudyBlock[]) => {
    const removableBreakIds = new Set<string>();
    const blocksByDate = new Map<string, StudyBlock[]>();

    sourceBlocks.forEach((block) => {
      const dayKey = toLocalKey(parseBlockDate(block.date));
      const dayBlocks = blocksByDate.get(dayKey) ?? [];
      dayBlocks.push(block);
      blocksByDate.set(dayKey, dayBlocks);
    });

    blocksByDate.forEach((dayBlocks) => {
      const activeStudyBlocks = dayBlocks
        .filter((block) => !block.isBreak && block.status !== 'skipped')
        .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

      dayBlocks
        .filter((block) => block.isBreak && !isLockedScheduleBlock(block))
        .forEach((breakBlock) => {
          if (breakBlock.isAutoGenerated === false) return;

          const breakStart = timeToMinutes(breakBlock.startTime);
          const breakEnd = getBlockEndMinutes(breakBlock);
          const previousStudy = [...activeStudyBlocks]
            .reverse()
            .find((block) => getBlockEndMinutes(block) <= breakStart);
          const nextStudy = activeStudyBlocks.find(
            (block) => timeToMinutes(block.startTime) >= breakEnd
          );

          const isAnchoredBetweenStudies =
            Boolean(previousStudy && nextStudy) &&
            Math.abs(getBlockEndMinutes(previousStudy as StudyBlock) - breakStart) <= 1 &&
            breakEnd <= timeToMinutes((nextStudy as StudyBlock).startTime);

          if (!isAnchoredBetweenStudies) {
            removableBreakIds.add(breakBlock.id);
          }
        });
    });

    if (removableBreakIds.size === 0) return sourceBlocks;
    return sourceBlocks.filter((block) => !removableBreakIds.has(block.id));
  };

  const reflowStudyQueueFromDate = (
    sourceDate: Date,
    dayLimitOverrides: Record<string, number> = {}
  ) => {
    const normalizedSourceDate = new Date(sourceDate);
    normalizedSourceDate.setHours(0, 0, 0, 0);
    const sourceTime = normalizedSourceDate.getTime();
    const breakGapMinutes = getBreakGapMinutes();
    const now = new Date();

    const movableStudyBlocks = blocks
      .filter((block) => {
        const blockDate = parseBlockDate(block.date);
        blockDate.setHours(0, 0, 0, 0);
        return blockDate.getTime() >= sourceTime && canReflowStudyBlock(block);
      })
      .sort((a, b) => {
        const dateDiff = parseBlockDate(a.date).getTime() - parseBlockDate(b.date).getTime();
        if (dateDiff !== 0) return dateDiff;
        return compareDayBlocks(a, b);
      });

    if (movableStudyBlocks.length === 0) {
      return { changed: false, blocks, message: 'Nao ha materias futuras para reorganizar.' };
    }

    const fixedBlocks = blocks.filter((block) => {
      const blockDate = parseBlockDate(block.date);
      blockDate.setHours(0, 0, 0, 0);
      if (blockDate.getTime() < sourceTime) return true;
      if (canReflowStudyBlock(block)) return false;
      if (block.isBreak && !isLockedScheduleBlock(block)) return false;
      return true;
    });

    const dayBlockMap = new Map<string, StudyBlock[]>();
    fixedBlocks.forEach((block) => {
      const blockDate = parseBlockDate(block.date);
      blockDate.setHours(0, 0, 0, 0);
      if (blockDate.getTime() < sourceTime) return;
      const key = toLocalKey(blockDate);
      const dayBlocks = dayBlockMap.get(key) ?? [];
      dayBlocks.push(block);
      dayBlockMap.set(key, dayBlocks);
    });

    const placedStudyBlocks: StudyBlock[] = [];
    let cursorDate = new Date(normalizedSourceDate);

    for (const block of movableStudyBlocks) {
      let placed = false;
      let guard = 0;

      while (!placed && guard < 730) {
        cursorDate.setHours(0, 0, 0, 0);
        if (!isAllowedBacklogDay(cursorDate)) {
          cursorDate.setDate(cursorDate.getDate() + 1);
          guard += 1;
          continue;
        }

        const dayKey = toLocalKey(cursorDate);
        const dayBlocks = [...(dayBlockMap.get(dayKey) ?? [])].sort(compareDayBlocks);
        const dailyLimit = dayLimitOverrides[dayKey] ?? getBaseSchedulableDailyLimitMinutes(cursorDate);
        if (dailyLimit <= 0) {
          cursorDate.setDate(cursorDate.getDate() + 1);
          guard += 1;
          continue;
        }

        const usedStudyMinutes = dayBlocks
          .filter((item) => isCapacityStudyBlock(item))
          .reduce((sum, item) => sum + item.durationMinutes, 0);
        if (usedStudyMinutes + block.durationMinutes > dailyLimit) {
          cursorDate.setDate(cursorDate.getDate() + 1);
          guard += 1;
          continue;
        }

        const { start: dayStart, end: dayEnd } = getPlannerWindowBounds(cursorDate);
        const lastEndMinutes = dayBlocks.reduce(
          (max, item) => Math.max(max, getBlockEndMinutes(item)),
          dayStart
        );
        const startMinutes =
          dayBlocks.length > 0 ? Math.max(lastEndMinutes + breakGapMinutes, dayStart) : dayStart;
        const endMinutes = startMinutes + block.durationMinutes;

        if (endMinutes > dayEnd || endMinutes > 24 * 60) {
          cursorDate.setDate(cursorDate.getDate() + 1);
          guard += 1;
          continue;
        }

        const originalBlockDate = parseBlockDate(block.date);
        originalBlockDate.setHours(0, 0, 0, 0);
        const changed =
          originalBlockDate.getTime() !== cursorDate.getTime() ||
          block.startTime !== minutesToTime(startMinutes) ||
          block.endTime !== minutesToTime(endMinutes);

        const placedBlock: StudyBlock = {
          ...block,
          date: new Date(cursorDate),
          startTime: minutesToTime(startMinutes),
          endTime: minutesToTime(endMinutes),
          status: changed ? ('rescheduled' as const) : block.status,
          originalDate:
            changed && !block.originalDate
              ? originalBlockDate
              : block.originalDate
              ? parseBlockDate(block.originalDate)
              : block.originalDate,
          rescheduleCount: changed ? (block.rescheduleCount || 0) + 1 : block.rescheduleCount,
          updatedAt: changed ? now : block.updatedAt,
        };

        placedStudyBlocks.push(placedBlock);
        dayBlocks.push(placedBlock);
        dayBlockMap.set(dayKey, dayBlocks);
        placed = true;
      }

      if (!placed) {
        return {
          changed: false,
          blocks,
          message: 'Nao consegui reorganizar toda a fila dentro dos horarios disponiveis.',
        };
      }
    }

    const generatedBreaks: StudyBlock[] = [];
    const affectedDayKeys = new Set<string>();
    placedStudyBlocks.forEach((block) => affectedDayKeys.add(toLocalKey(parseBlockDate(block.date))));
    fixedBlocks.forEach((block) => {
      const blockDate = parseBlockDate(block.date);
      blockDate.setHours(0, 0, 0, 0);
      if (blockDate.getTime() >= sourceTime) affectedDayKeys.add(toLocalKey(blockDate));
    });

    affectedDayKeys.forEach((dayKey) => {
      const dayDate = parseLocalKey(dayKey);
      if (!dayDate || Number.isNaN(dayDate.getTime())) return;
      const dayBlocks = [...(dayBlockMap.get(dayKey) ?? [])].sort(compareDayBlocks);
      const fixedBreaks = dayBlocks.filter((block) => block.isBreak);
      const studyBlocks = dayBlocks
        .filter((block) => !block.isBreak && block.status !== 'skipped')
        .sort(compareDayBlocks);

      for (let index = 0; index < studyBlocks.length - 1; index += 1) {
        const current = studyBlocks[index];
        const next = studyBlocks[index + 1];
        const breakStart = getBlockEndMinutes(current);
        const nextStart = timeToMinutes(next.startTime);
        const gapMinutes = nextStart - breakStart;
        const breakDuration = Math.min(breakGapMinutes, gapMinutes);
        if (breakDuration <= 0) continue;

        const alreadyHasBreak = fixedBreaks.some((block) =>
          rangesOverlap(
            breakStart,
            breakStart + breakDuration,
            timeToMinutes(block.startTime),
            getBlockEndMinutes(block)
          )
        );
        if (alreadyHasBreak) continue;

        generatedBreaks.push(buildReflowBreakBlock(dayDate, breakStart, breakDuration, current));
      }
    });

    const nextBlocks = sortBlocksChronologically([
      ...fixedBlocks,
      ...placedStudyBlocks,
      ...generatedBreaks,
    ]);

    return {
      changed: !areBlocksEquivalent(nextBlocks, blocks),
      blocks: nextBlocks,
      message: '',
    };
  };

  const handleAdjustStudyLoad = (date: Date, direction: -1 | 1) => {
    const sourceDate = new Date(date);
    sourceDate.setHours(0, 0, 0, 0);
    const key = toLocalKey(sourceDate);
    const sourceTime = sourceDate.getTime();
    const keepOnlyRelevantDailyLimit = (
      previous: Record<string, number>,
      sourceLimit?: number
    ) => {
      const nextLimits = { ...previous };
      Object.keys(nextLimits).forEach((limitKey) => {
        const limitDate = parseLocalKey(limitKey);
        if (!limitDate || Number.isNaN(limitDate.getTime())) return;
        if (limitDate.getTime() >= sourceTime) delete nextLimits[limitKey];
      });
      if (typeof sourceLimit === 'number') {
        nextLimits[key] = Math.max(0, Math.round(sourceLimit));
      }
      return nextLimits;
    };
    const dayBlocks = [...(blocksByDay.get(key) ?? [])].sort(compareDayBlocks);
    const currentStudyMinutes = dayBlocks
      .filter((block) => isCapacityStudyBlock(block))
      .reduce((sum, block) => sum + block.durationMinutes, 0);

    if (direction > 0) {
      const nextFutureBlock = blocks
        .filter((block) => {
          const blockDate = parseBlockDate(block.date);
          blockDate.setHours(0, 0, 0, 0);
          return blockDate.getTime() > sourceDate.getTime() && canReflowStudyBlock(block);
        })
        .sort((a, b) => {
          const dateDiff = parseBlockDate(a.date).getTime() - parseBlockDate(b.date).getTime();
          if (dateDiff !== 0) return dateDiff;
          return compareDayBlocks(a, b);
        })[0];

      if (!nextFutureBlock) {
        setBacklogNotice('Nao ha materia futura para adiantar.');
        return;
      }

      const targetStudyMinutes = currentStudyMinutes + nextFutureBlock.durationMinutes;
      const result = reflowStudyQueueFromDate(sourceDate, { [key]: targetStudyMinutes });
      if (!result.changed) {
        setBacklogNotice(result.message || 'Nao foi possivel adiantar outra materia para este dia.');
        return;
      }

      const baseLimit = getBaseSchedulableDailyLimitMinutes(sourceDate);
      setDailyLimits((prev) =>
        keepOnlyRelevantDailyLimit(prev, targetStudyMinutes > baseLimit ? targetStudyMinutes : undefined)
      );
      commitBlocksUpdate(result.blocks);
      setBacklogNotice('Agenda recalculada: uma materia foi adiantada e os proximos dias foram puxados.');
      return;
    }

    const movableToday = dayBlocks.filter((block) => canReflowStudyBlock(block));
    if (movableToday.length === 0) {
      setBacklogNotice('Nao ha materia editavel neste dia para diminuir.');
      return;
    }

    const lastStudyBlock = movableToday[movableToday.length - 1];
    const targetStudyMinutes = Math.max(0, currentStudyMinutes - lastStudyBlock.durationMinutes);
    const result = reflowStudyQueueFromDate(sourceDate, { [key]: targetStudyMinutes });
    if (!result.changed) {
      setBacklogNotice(result.message || 'Nao foi possivel diminuir a carga deste dia.');
      return;
    }

    setDailyLimits((prev) => keepOnlyRelevantDailyLimit(prev, targetStudyMinutes));
    commitBlocksUpdate(result.blocks);
    setBacklogNotice('Agenda recalculada: uma materia saiu deste dia e a fila foi empurrada.');
  };

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (blocks.length === 0) return;

    const dayKeys = Array.from(
      new Set(blocks.map((block) => toLocalKey(parseBlockDate(block.date))))
    ).sort();

    for (const dayKey of dayKeys) {
      const dayDate = parseLocalKey(dayKey);
      if (!dayDate || Number.isNaN(dayDate.getTime())) continue;
      const dailyLimit = getSchedulableDailyLimitMinutes(dayDate);
      if (dailyLimit <= 0) continue;

      const dayBlocks = blocks
        .filter((block) => toLocalKey(parseBlockDate(block.date)) === dayKey)
        .sort(compareDayBlocks);
      const activeStudyMinutes = getDayStudyMinutesForCapacity(dayBlocks);
      if (activeStudyMinutes <= dailyLimit) continue;

      let studyMinutes = 0;
      let keepIndex = -1;
      for (let i = 0; i < dayBlocks.length; i += 1) {
        const block = dayBlocks[i];
        if (isCapacityStudyBlock(block)) {
          if (studyMinutes + block.durationMinutes > dailyLimit) break;
          studyMinutes += block.durationMinutes;
        }
        keepIndex = i;
      }

      const overflowBlocks = dayBlocks
        .slice(keepIndex + 1)
        .filter((block) => !isLockedScheduleBlock(block));
      if (overflowBlocks.length === 0) continue;

      const moved = moveBlocksToNextAllowedDay(dayDate, overflowBlocks);
      if (moved) return;
    }
  }, [
    backlogAllowedDays,
    blocks,
    dailyHoursByWeekday,
    dailyLimits,
    defaultDailyLimitMinutes,
    defaultDailyLimitsByDate,
  ]);
  /* eslint-enable react-hooks/exhaustive-deps */

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (blocks.length === 0) return;

    const dayKeys = Array.from(
      new Set(blocks.map((block) => toLocalKey(parseBlockDate(block.date))))
    ).sort();

    for (const dayKey of dayKeys) {
      const dayDate = parseLocalKey(dayKey);
      if (!dayDate || Number.isNaN(dayDate.getTime())) continue;

      const dayBlocks = blocks
        .filter((block) => toLocalKey(parseBlockDate(block.date)) === dayKey)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));

      const blocksToRepair: StudyBlock[] = [];
      let cursorEnd = -1;

      for (const block of dayBlocks) {
        const blockStart = timeToMinutes(block.startTime);
        const blockEnd = getBlockEndMinutes(block);
        const storedEnd = timeToMinutes(block.endTime);
        const crossesMidnight = blockEnd > 24 * 60 || storedEnd <= blockStart;
        const overlapsPrevious = blockStart < cursorEnd;

        if (!isLockedScheduleBlock(block) && (crossesMidnight || overlapsPrevious)) {
          blocksToRepair.push(block);
          continue;
        }

        cursorEnd = Math.max(cursorEnd, blockEnd);
      }

      if (blocksToRepair.length === 0) continue;

      const moved = moveBlocksToNextAllowedDay(dayDate, blocksToRepair);
      if (moved) {
        setBacklogNotice('Corrigi blocos com horario sobreposto ou virando o dia. Revise a agenda atualizada.');
        return;
      }
    }
  }, [
    backlogAllowedDays,
    blocks,
    dailyHoursByWeekday,
    dailyLimits,
    defaultDailyLimitMinutes,
    defaultDailyLimitsByDate,
  ]);
  /* eslint-enable react-hooks/exhaustive-deps */

  const buildDailyLimitMapForBacklog = (start: Date, days = 14) => {
    const map: Record<string, number> = {};
    for (let i = 0; i <= days; i += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      date.setHours(0, 0, 0, 0);
      map[toLocalKey(date)] = getSchedulableDailyLimitMinutes(date);
    }
    return map;
  };

  const commitBlocksUpdate = (nextBlocks: StudyBlock[]) => {
    const ordered = sortBlocksChronologically(removeOrphanAutoBreaks(nextBlocks));
    setBlocks(ordered);
    onBlocksChange(ordered);
  };

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (blocks.length === 0) return;
    const cleanedBlocks = removeOrphanAutoBreaks(blocks);
    if (cleanedBlocks.length === blocks.length) return;
    commitBlocksUpdate(cleanedBlocks);
    setBacklogNotice('Removi intervalos soltos e deixei a agenda encadeada entre materias.');
  }, [blocks]);
  /* eslint-enable react-hooks/exhaustive-deps */

  const runAutoBacklogReschedule = (reason: 'startup' | 'manual' | 'skip') => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const result = autoRescheduleBacklog({
      blocks,
      today: now,
      dailyLimitByDate: buildDailyLimitMapForBacklog(now, 14),
      allowedDays,
      recoveryDays: backlogRecoveryDays,
      breakMinutes: userSettings.breakMinutes,
      backlogQuotaRatio: 0.35,
      lookaheadDays: 14,
      maxBacklogSubjectsPerDay: 2,
    });

    if (result.changedBlockIds.length > 0) {
      commitBlocksUpdate(result.blocks);
    }

    setBacklogAutoState({
      movedCount: result.movedCount,
      insertedTodayCount: result.insertedTodayCount,
      backlogBefore: result.backlogBefore,
      backlogAfter: result.backlogAfter,
      suggestedExtraMinutesPerDay: result.suggestion.suggestedExtraMinutesPerDay,
      shouldSuggestReplan: result.suggestion.shouldSuggestReplan,
      shouldSuggestRecoveryMode: result.suggestion.shouldSuggestRecoveryMode,
      suggestedReduceNewContent: result.suggestion.suggestedReduceNewContent,
    });

    if (reason !== 'startup') {
      if (result.changedBlockIds.length > 0) {
        setBacklogNotice(
          `Replanejado: ${result.movedCount} estudo(s), ${result.insertedTodayCount} inserido(s) hoje.`
        );
      } else if (result.backlogBefore > 0) {
        setBacklogNotice(
          'Sem capacidade suficiente hoje para as pendências. Mantidas para os próximos dias com sugestão de replanejamento.'
        );
      } else {
        setBacklogNotice('Sem tarefas pendentes para replanejar.');
      }
    }

    return result;
  };

  const handleMarkBlockDoneQuick = (block: StudyBlock) => {
    handleCompleteBlock(block.id);
  };

  const handleSkipBlockToday = (block: StudyBlock) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const blockDate = parseBlockDate(block.date);
    blockDate.setHours(0, 0, 0, 0);

    const nextBlocks = blocks.map((item) => {
      if (item.id !== block.id) return item;
      return {
        ...item,
        status: 'skipped' as const,
        originalDate: item.originalDate ? parseBlockDate(item.originalDate) : parseBlockDate(item.date),
        updatedAt: new Date(),
      };
    });
    commitBlocksUpdate(nextBlocks);

    if (blockDate.getTime() <= today.getTime()) {
      // Replaneja parte automaticamente para evitar "agenda perdida".
      setTimeout(() => {
        runAutoBacklogReschedule('skip');
      }, 0);
    }
  };

  const handleRequestQuickReschedule = (block: StudyBlock) => {
    const sourceDate = parseBlockDate(block.date);
    sourceDate.setHours(0, 0, 0, 0);
    const tomorrow = new Date(sourceDate);
    tomorrow.setDate(tomorrow.getDate() + 1);
    setRescheduleSingleBlockId(block.id);
    setRescheduleSourceDate(toLocalKey(sourceDate));
    setRescheduleTargetDate(toLocalKey(tomorrow));
    setRescheduleError('');
    setIsRescheduleModalOpen(true);
  };

  const allowRecoveryDayForBacklog = (dayIndex: number) => {
    if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) return;

    setUserSettings((prev) => {
      const days = new Set<number>();
      if (prev.allowSundayBacklog) days.add(0);
      (Array.isArray(prev.backlogRecoveryDays) ? prev.backlogRecoveryDays : []).forEach((day) => {
        if (Number.isInteger(day) && day >= 0 && day <= 6) days.add(day);
      });
      days.add(dayIndex);

      const nextRecoveryDays = Array.from(days).sort((a, b) => a - b);
      return {
        ...prev,
        backlogRecoveryDays: nextRecoveryDays,
        allowSundayBacklog: nextRecoveryDays.includes(0),
      };
    });

    setRescheduleError('');
    setBacklogNotice(
      `${weekdayLabels[dayIndex]} liberado para recuperação. A grade normal continua sem estudos fixos nesse dia.`
    );
  };

  const moveSingleBlockToDate = (blockId: string, targetDate: Date) => {
    const block = blocks.find((item) => item.id === blockId);
    if (!block) return false;
    if (block.isBreak) return false;
    if (!isAllowedBacklogDay(targetDate)) return false;

    const targetKey = toLocalKey(targetDate);
    const targetDayBlocks = blocks
      .filter((item) => toLocalKey(parseBlockDate(item.date)) === targetKey && item.id !== blockId)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    const targetStudyBlocks = targetDayBlocks.filter((item) => !item.isBreak);
    const targetStudyMinutes = targetStudyBlocks
      .filter((item) => isCapacityStudyBlock(item))
      .reduce((sum, item) => sum + item.durationMinutes, 0);
    const targetLimit = getSchedulableDailyLimitMinutes(targetDate);
    if (targetLimit > 0 && targetStudyMinutes + block.durationMinutes > targetLimit) return false;

    const breakGapMinutes = getBreakGapMinutes();
    const { start: dayStart, end: dayEnd } = getPlannerWindowBounds(targetDate);
    const lastEndMinutes = targetDayBlocks.reduce(
      (max, item) => Math.max(max, getBlockEndMinutes(item)),
      dayStart
    );
    const startMinutes =
      targetDayBlocks.length > 0 ? Math.max(lastEndMinutes + breakGapMinutes, dayStart) : dayStart;
    const endMinutes = startMinutes + block.durationMinutes;
    if (endMinutes > dayEnd || endMinutes > 24 * 60) return false;

    const nextBlocks = blocks.map((item) => {
      if (item.id !== blockId) return item;
      return {
        ...item,
        date: new Date(targetDate),
        startTime: minutesToTime(startMinutes),
        endTime: minutesToTime(endMinutes),
        status: 'rescheduled' as const,
        originalDate: item.originalDate ? parseBlockDate(item.originalDate) : parseBlockDate(item.date),
        rescheduleCount: (item.rescheduleCount || 0) + 1,
        updatedAt: new Date(),
      };
    });
    commitBlocksUpdate(nextBlocks);
    return true;
  };

  // Navegação
  const goToPreviousWeek = () => {
    const newStart = new Date(currentWeekStart);
    newStart.setDate(newStart.getDate() - 7);
    setCurrentWeekStart(newStart);
  };

  const goToNextWeek = () => {
    const newStart = new Date(currentWeekStart);
    newStart.setDate(newStart.getDate() + 7);
    setCurrentWeekStart(newStart);
  };

  const goToCurrentWeek = () => {
    const today = new Date();
    setCurrentWeekStart(getWeekStart(today));
    if (isMobile) {
      setMobileDayIndex(weekIndexFromDate(today));
    }
  };

  const goToPreviousDay = () => {
    if (!isMobile) {
      goToPreviousWeek();
      return;
    }
    setMobileDayIndex((prev) => {
      if (prev > 0) return prev - 1;
      const newStart = new Date(currentWeekStart);
      newStart.setDate(newStart.getDate() - 7);
      setCurrentWeekStart(newStart);
      return 6;
    });
  };

  const goToNextDay = () => {
    if (!isMobile) {
      goToNextWeek();
      return;
    }
    setMobileDayIndex((prev) => {
      if (prev < 6) return prev + 1;
      const newStart = new Date(currentWeekStart);
      newStart.setDate(newStart.getDate() + 7);
      setCurrentWeekStart(newStart);
      return 0;
    });
  };

  // Handlers de arrastar
  const handleDragStart = (event: DragStartEvent) => {
    const block = blocks.find((b) => b.id === event.active.id);
    if (block) {
      setActiveBlock(block);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveBlock(null);

    if (!over) return;

    // Reordenar dentro do mesmo dia
    if (active.id !== over.id) {
      const activeBlock = blocks.find((b) => b.id === active.id);
      const overBlock = blocks.find((b) => b.id === over.id);

      if (activeBlock && overBlock) {
        const activeDate = parseBlockDate(activeBlock.date);
        const overDate = parseBlockDate(overBlock.date);
        if (!isSameDay(activeDate, overDate)) return;

        const dayBlocks = blocks
          .filter((block) => isSameDay(parseBlockDate(block.date), activeDate))
          .sort(compareDayBlocks);

        const oldIndex = dayBlocks.findIndex((block) => block.id === activeBlock.id);
        const newIndex = dayBlocks.findIndex((block) => block.id === overBlock.id);
        if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;

        const reorderedDayBlocks = arrayMove(dayBlocks, oldIndex, newIndex).map((block, index) => {
          const nextSequence = index + 1;
          if (block.sequenceIndex === nextSequence) return block;
          return {
            ...block,
            sequenceIndex: nextSequence,
            updatedAt: new Date(),
          };
        });

        const reorderedMap = new Map(reorderedDayBlocks.map((block) => [block.id, block]));
        const newBlocks = blocks.map((block) => reorderedMap.get(block.id) ?? block);

        setBlocks(newBlocks);
        onBlocksChange(newBlocks);
      }
    }
  };

  // Handlers de blocos
  const handleAddBlock = (date: Date) => {
    const dayBlocks = blocks
      .filter((b) => isSameDay(parseBlockDate(b.date), date))
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    const { start: dayStart, end: dayEnd } = getPlannerWindowBounds(date);
    const defaultDurationMinutes = Math.min(60, Math.max(15, dayEnd - dayStart));
    const lastBlock = dayBlocks[dayBlocks.length - 1];
    let startMinutes = lastBlock
      ? getBlockEndMinutes(lastBlock) + getBreakGapMinutes()
      : dayStart;

    if (startMinutes + defaultDurationMinutes > dayEnd || startMinutes + defaultDurationMinutes > 24 * 60) {
      startMinutes = dayStart;
    }

    setBlockModalDefaults({
      startTime: minutesToTime(startMinutes),
      durationMinutes: defaultDurationMinutes,
    });
    setEditingBlock(null);
    setBlockModalDate(date);
    setIsBlockModalOpen(true);
  };

  const handleEditBlock = (block: StudyBlock) => {
    setEditingBlock(block);
    setBlockModalDate(parseBlockDate(block.date));
    setIsBlockModalOpen(true);
  };

  const handleDeleteBlock = (blockId: string) => {
    const newBlocks = blocks.filter((b) => b.id !== blockId);
    commitBlocksUpdate(newBlocks);
  };

  const handleStartBlock = (block: StudyBlock) => {
    setSessionBlock(block);
    setIsSessionOpen(true);
  };

  const handleCompleteBlock = (
    blockId: string,
    minutesSpent?: number,
    performance?: { correctAnswers?: number; totalQuestions?: number },
    options?: { autoAdvanceToBreak?: boolean }
  ) => {
    const completedBlock = blocks.find((block) => block.id === blockId);
    if (
      !completedBlock ||
      completedBlock.status === 'completed' ||
      completingBlockIdsRef.current.has(blockId)
    ) {
      return;
    }
    completingBlockIdsRef.current.add(blockId);
    const hasExplicitMinutes =
      typeof minutesSpent === 'number' && Number.isFinite(minutesSpent);
    const effectiveMinutes = hasExplicitMinutes
      ? Math.max(1, minutesSpent)
      : completedBlock.durationMinutes;
    const hours = effectiveMinutes / 60;

    const nextBlocks = blocks.map((block) =>
      block.id === blockId
        ? {
            ...block,
            status: 'completed' as const,
            completedAt: new Date(),
            updatedAt: new Date(),
            durationMinutes: hasExplicitMinutes
              ? Math.max(1, Math.round(effectiveMinutes))
              : block.durationMinutes,
          }
        : block
    );
    commitBlocksUpdate(nextBlocks);

    let nextAnalytics = analytics;
    let nextSubjects = storedSubjects;

    if (!completedBlock.isBreak && completedBlock.subjectId) {
      const targetSubject =
        subjects.find((subject) => subject.id === completedBlock.subjectId) ??
        storedSubjects.find((subject) => subject.id === completedBlock.subjectId);

      if (targetSubject) {
        const metricsUpdate = applyBlockCompletionMetrics({
          analytics,
          block: completedBlock,
          subject: targetSubject,
          minutesSpent: effectiveMinutes,
          correctAnswers: performance?.correctAnswers,
          totalQuestions: performance?.totalQuestions,
        });

        nextSubjects = storedSubjects.map((subject) =>
          subject.id === completedBlock.subjectId
            ? {
                ...subject,
                completedHours: Number((subject.completedHours + hours).toFixed(4)),
                totalHours: Number((subject.totalHours + hours).toFixed(4)),
                sessionsCount: subject.sessionsCount + 1,
                averageScore:
                  metricsUpdate.subjectRollingAccuracy !== undefined
                    ? Math.round(metricsUpdate.subjectRollingAccuracy * 100)
                    : subject.averageScore,
              }
            : subject
        );
        setStoredSubjects(nextSubjects);
        nextAnalytics = metricsUpdate.analytics;
        setAnalytics(nextAnalytics);
      } else {
        const dateKey = toLocalDateKey(parseBlockDate(completedBlock.date));
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
    }

    if (!completedBlock.isBreak) {
      const reward = calculateTrainerCompletionReward({
        block: completedBlock,
        minutesSpent: effectiveMinutes,
        plannerBlocks: nextBlocks,
        analytics: nextAnalytics,
        subjects: nextSubjects,
        studyPrefs,
        userSettings,
        xpEvents,
        unlockedAchievements,
      });

      if (reward.events.length > 0) {
        setXpEvents((previous) => {
          const existing = new Set(previous.map((event) => event.eventKey));
          return [...previous, ...reward.events.filter((event) => !existing.has(event.eventKey))];
        });
      }
      if (reward.newAchievements.length > 0) {
        setUnlockedAchievements((previous) => {
          const existing = new Set(previous.map((achievement) => achievement.achievementId));
          return [
            ...previous,
            ...reward.newAchievements.filter((achievement) => !existing.has(achievement.achievementId)),
          ];
        });
      }

      if (authStatus === 'authenticated') {
        void fetch('/api/gamification/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            blockId,
            minutesSpent: effectiveMinutes,
            completionMode: 'manual',
            performance,
          }),
        }).catch((error) => {
          console.warn('Falha ao validar XP no servidor:', error);
        });
      }
    }

    if (!completedBlock.isBreak && options?.autoAdvanceToBreak !== false) {
      const sameDayBreaks = blocks
        .filter(
          (block) =>
            block.isBreak &&
            block.status !== 'completed' &&
            isSameDay(parseBlockDate(block.date), parseBlockDate(completedBlock.date))
        )
        .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

      const nextBreak = sameDayBreaks.find(
        (block) => timeToMinutes(block.startTime) >= getBlockEndMinutes(completedBlock)
      );

      if (nextBreak) {
        setTimeout(() => {
          setSessionBlock(nextBreak);
          setIsSessionOpen(true);
        }, 450);
      }
    }
  };

  /*
   * Completion is calculated from a single snapshot above. Keeping all writes
   * together prevents a rapid second click from incrementing hours, sessions
   * or XP before React has rendered the completed status.
   */
  /*
  commitBlocksUpdate(
      blocks.map((block) =>
        block.id === blockId
          ? {
              ...block,
              status: 'completed' as const,
              completedAt: new Date(),
              updatedAt: new Date(),
            }
          : block
      )
    );

    if (!completedBlock.isBreak && completedBlock.subjectId) {
      const targetSubject =
        subjects.find((subject) => subject.id === completedBlock.subjectId) ??
        storedSubjects.find((subject) => subject.id === completedBlock.subjectId);

      if (targetSubject) {
        const metricsUpdate = applyBlockCompletionMetrics({
          analytics,
          block: completedBlock,
          subject: targetSubject,
          minutesSpent: effectiveMinutes,
          correctAnswers: performance?.correctAnswers,
          totalQuestions: performance?.totalQuestions,
        });

        setStoredSubjects((prev) =>
          prev.map((subject) =>
            subject.id === completedBlock.subjectId
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
          )
        );

        setAnalytics(metricsUpdate.analytics);
      } else {
        const dateKey = toLocalDateKey(parseBlockDate(completedBlock.date));
        setAnalytics((prev) => {
          const current = prev.daily[dateKey] || { hours: 0, sessions: 0 };
          return {
            ...prev,
            daily: {
              ...prev.daily,
              [dateKey]: {
                ...current,
                hours: Number((current.hours + hours).toFixed(2)),
                sessions: current.sessions + 1,
              },
            },
          };
        });
      }
    }

    if (!completedBlock.isBreak && options?.autoAdvanceToBreak !== false) {
      const sameDayBreaks = blocks
        .filter(
          (block) =>
            block.isBreak &&
            block.status !== 'completed' &&
            isSameDay(parseBlockDate(block.date), parseBlockDate(completedBlock.date))
        )
        .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

      const nextBreak = sameDayBreaks.find(
        (block) => timeToMinutes(block.startTime) >= getBlockEndMinutes(completedBlock)
      );

      if (nextBreak) {
        setTimeout(() => {
          setSessionBlock(nextBreak);
          setIsSessionOpen(true);
        }, 450);
      }
    }
  };
  */

  const validateBlockPlacement = (data: BlockFormData) => {
    const date = new Date(data.date);
    date.setHours(0, 0, 0, 0);
    if (Number.isNaN(date.getTime())) {
      return 'Informe uma data valida.';
    }

    const startMinutes = timeToMinutes(data.startTime);
    const endMinutes = startMinutes + data.durationMinutes;
    const { start: dayStart, end: dayEnd } = getPlannerWindowBounds(date);

    if (endMinutes > 24 * 60) {
      return 'Este bloco passa da meia-noite. Reduza a duracao ou escolha um horario mais cedo.';
    }

    if (startMinutes < dayStart || endMinutes > dayEnd) {
      return `Este bloco precisa ficar entre ${formatClockBoundary(dayStart)} e ${formatClockBoundary(dayEnd)}. Ajuste o horario ou altere sua disponibilidade nas Configuracoes.`;
    }

    const targetKey = toLocalKey(date);
    const existingBlocks = blocks
      .filter((block) => {
        if (editingBlock && block.id === editingBlock.id) return false;
        return toLocalKey(parseBlockDate(block.date)) === targetKey;
      })
      .sort(compareDayBlocks);

    const conflictingBlock = existingBlocks.find((block) => {
      const blockStart = timeToMinutes(block.startTime);
      const blockEnd = getBlockEndMinutes(block);
      return rangesOverlap(startMinutes, endMinutes, blockStart, blockEnd);
    });

    if (conflictingBlock) {
      return `Esse horario cruza com "${getStudyBlockDisplayTitle(conflictingBlock)}" (${conflictingBlock.startTime}-${conflictingBlock.endTime}). Escolha outro horario.`;
    }

    if (!data.isBreak) {
      const dailyLimit = getSchedulableDailyLimitMinutes(date);
      const usedStudyMinutes = existingBlocks
        .filter((block) => isCapacityStudyBlock(block))
        .reduce((sum, block) => sum + block.durationMinutes, 0);

      if (dailyLimit > 0 && usedStudyMinutes + data.durationMinutes > dailyLimit) {
        return `Esse dia suporta ${formatDuration(dailyLimit)} e ja tem ${formatDuration(usedStudyMinutes)} planejados. Aumente a capacidade do dia ou escolha outro dia.`;
      }
    }

    return null;
  };

  const handleSaveBlock = (data: BlockFormData) => {
    const placementError = validateBlockPlacement(data);
    if (placementError) {
      setBacklogNotice(placementError);
      return;
    }

    const endTime = minutesToTime(
      timeToMinutes(data.startTime) + data.durationMinutes
    );
    const blockType = data.isBreak ? undefined : data.type || 'AULA';
    const sessionType =
      blockType === 'AULA'
        ? 'teoria'
        : blockType === 'EXERCICIOS'
        ? 'pratica'
        : blockType === 'REVISAO'
        ? 'revisao'
        : blockType === 'SIMULADO_AREA' || blockType === 'SIMULADO_COMPLETO'
        ? 'simulado'
        : undefined;

    const fallbackSubject: Subject = {
      id: 'default',
      userId: 'user1',
      name: 'Sessão Livre',
      color: '#00B4FF',
      icon: 'book',
      priority: 5,
      difficulty: 5,
      targetHours: 0,
      completedHours: 0,
      totalHours: 0,
      sessionsCount: 0,
      averageScore: 0,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const subject =
      data.isBreak || !data.subjectId
        ? undefined
        : subjects.find((s) => s.id === data.subjectId) ||
          editingBlock?.subject ||
          fallbackSubject;

    if (editingBlock) {
      const updatedBlock: StudyBlock = {
        ...editingBlock,
        date: data.date,
        startTime: data.startTime,
        endTime,
        durationMinutes: data.durationMinutes,
        isBreak: data.isBreak,
        subjectId: data.isBreak ? 'break' : subject?.id || 'default',
        subject,
        type: blockType,
        sessionType,
        originalDate: editingBlock.originalDate ? parseBlockDate(editingBlock.originalDate) : editingBlock.originalDate,
        completedAt: editingBlock.completedAt ? new Date(editingBlock.completedAt) : editingBlock.completedAt,
        rescheduleCount: editingBlock.rescheduleCount || 0,
        updatedAt: new Date(),
      };
      const newBlocks = blocks.map((b) =>
        b.id === editingBlock.id ? updatedBlock : b
      );
      commitBlocksUpdate(newBlocks);
    } else {
      const newBlock: StudyBlock = {
        id: generateId(),
        userId: 'user1',
        subjectId: data.isBreak ? 'break' : subject?.id || 'default',
        subject,
        date: data.date,
        startTime: data.startTime,
        endTime,
        durationMinutes: data.durationMinutes,
        type: blockType,
        sessionType,
        status: 'scheduled' as const,
        isBreak: data.isBreak,
        isAutoGenerated: false,
        originalDate: data.isBreak ? undefined : parseBlockDate(data.date),
        completedAt: undefined,
        rescheduleCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const newBlocks = [...blocks, newBlock];
      commitBlocksUpdate(newBlocks);
    }

    setIsBlockModalOpen(false);
    setEditingBlock(null);
  };

  // Verificar se está visualizando a semana atual
  const isCurrentWeek = isSameDay(currentWeekStart, getWeekStart());
  const isViewingToday = isMobile && mobileDay ? isSameDay(mobileDay, new Date()) : false;
  const plannedStudyBlocks = useMemo(
    () => blocks.filter((block) => isPendingStudyBlock(block)),
    [blocks]
  );
  const plannedStudyMinutes = useMemo(
    () => plannedStudyBlocks.reduce((sum, block) => sum + block.durationMinutes, 0),
    [plannedStudyBlocks]
  );
  const hasPendingBacklog =
    backlogEntries.length > 0 || overdueBacklogCount > 0 || todaysSkippedBacklogCount > 0;

  return (
    <div className="mx-auto flex min-h-0 min-w-0 w-full max-w-full flex-col">
      {/* Cabeçalho */}
      <Card
        className="mb-4 border-white/10 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(0,180,255,0.16),rgba(9,12,22,0.95)_45%,rgba(9,12,22,0.92)_100%)] shadow-[0_20px_45px_rgba(0,0,0,0.28)]"
        padding="md"
        hover={false}
      >
        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-heading font-bold text-white sm:text-[2rem]">
            Agenda de Estudos
          </h1>
          <p className="mt-1 text-sm text-text-secondary sm:text-base">
            Veja o que estudar em cada dia e ajuste quando precisar.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 rounded-full border border-neon-cyan/35 bg-neon-cyan/10 px-2.5 py-1 text-neon-cyan">
              {plannedStudyBlocks.length} estudos ativos
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-1 text-white">
              {formatDuration(plannedStudyMinutes)} planejadas
            </span>
          </div>
        </div>

        <div className="flex w-full min-w-0 flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
          {/* Botão de Gerar Agenda */}
          <Button
            variant="primary"
            onClick={() => setIsScheduleModalOpen(true)}
            loading={isGenerating}
            leftIcon={<Sparkles className="w-4 h-4" />}
            className="w-full sm:w-auto"
           
          >
            Gerar Agenda
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setRescheduleSingleBlockId(null);
              setIsRescheduleModalOpen(true);
            }}
            leftIcon={<ArrowRightLeft className="w-4 h-4" />}
            className="w-full sm:w-auto"
           
          >
            Reagendar pendências
          </Button>
        </div>
        </div>
      </Card>

      <Card
        className={
          hasPendingBacklog
            ? 'mb-4 border-amber-300/20 bg-[linear-gradient(165deg,rgba(46,30,18,0.52),rgba(22,25,35,0.96)_45%,rgba(14,18,27,0.96))] shadow-[0_16px_34px_rgba(0,0,0,0.28)]'
            : 'mb-4 border-emerald-300/20 bg-[linear-gradient(165deg,rgba(10,70,58,0.2),rgba(14,18,27,0.94))] shadow-[0_12px_26px_rgba(0,0,0,0.22)]'
        }
        padding="sm"
        hover={false}
      >
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div
              className={
                hasPendingBacklog
                  ? 'inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs text-amber-100'
                  : 'inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-100'
              }
            >
              <ListTodo className="h-4 w-4" />
              {hasPendingBacklog
                ? `Tarefas pendentes: ${backlogEntries.length}`
                : 'Sem tarefas pendentes'}
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-400/30 bg-orange-400/10 px-3 py-1 text-xs text-orange-100">
              <Flame className="h-4 w-4" />
              Sequência: {streakDays} dia(s)
            </div>
            {hasPendingBacklog && (
              <span className="text-xs text-text-secondary">
                Vencidas: {overdueBacklogCount} | Puladas hoje: {todaysSkippedBacklogCount}
              </span>
            )}
          </div>

          {hasPendingBacklog && (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsBacklogModalOpen(true)}
              leftIcon={<ListTodo className="h-4 w-4" />}
              className="w-full sm:w-auto"
            >
              Ver pendências
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => runAutoBacklogReschedule('manual')}
              className="w-full sm:w-auto"
            >
              Replanejar automaticamente
            </Button>
          </div>
          )}
        </div>

        {(backlogHigh || backlogRecoveryCount > 0 || backlogAutoState?.shouldSuggestReplan) && (
          <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-100">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              <div>
                <p>Muitas pendências: o sistema distribui tarefas atrasadas sem passar de 30-40% da capacidade diária.</p>
                {(backlogAutoState?.shouldSuggestRecoveryMode || backlogRecoveryCount > 0) && (
                  <p className="mt-1">Plano de recuperação sugerido: reduzir conteúdo novo temporariamente e priorizar revisão/exercícios.</p>
                )}
                {!!backlogAutoState?.suggestedExtraMinutesPerDay && (
                  <p className="mt-1">Sugestão: adicionar ~{backlogAutoState?.suggestedExtraMinutesPerDay} min/dia para limpar as pendências.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {backlogNotice && <p className="mt-2 text-xs text-text-secondary">{backlogNotice}</p>}

        {userSettings.notificationsEnabled && notificationPermissionBlocked && (
          <div className="mt-3 rounded-xl border border-orange-400/30 bg-orange-400/10 p-3 text-xs text-orange-100">
            <div className="flex items-start gap-2">
              <BellOff className="mt-0.5 h-4 w-4 shrink-0 text-orange-200" />
              <p>
                Permissão de notificação bloqueada no navegador. Reative para receber alertas dos
                estudos no horário correto.
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* Navegação da Semana */}
      <Card
        className="mb-5 border-white/10 bg-[linear-gradient(170deg,rgba(12,17,31,0.92),rgba(16,23,37,0.9))] shadow-[0_14px_30px_rgba(0,0,0,0.25)]"
        padding="sm"
        hover={false}
      >
        <div className="flex min-w-0 flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={isMobile ? goToPreviousDay : goToPreviousWeek}
              className="shrink-0"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>

            <span
              className="min-w-0 flex-1 px-1 text-center text-sm font-heading font-bold leading-tight text-white sm:px-2 md:flex-none md:px-4 md:text-lg"
              title={
                isMobile
                  ? formatDatePt(mobileDay)
                  : `${formatDate(weekDates[0])} - ${formatDate(weekDates[6])}`
              }
            >
              {isMobile
                ? formatDatePt(mobileDay)
                : `${formatDate(weekDates[0])} - ${formatDate(weekDates[6])}`}
            </span>

            <Button
              variant="ghost"
              size="sm"
              onClick={isMobile ? goToNextDay : goToNextWeek}
              className="shrink-0"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          {!isMobile && !isCurrentWeek && (
            <Button
              variant="secondary"
              size="sm"
              onClick={goToCurrentWeek}
              leftIcon={<RefreshCw className="w-4 h-4" />}
              className="w-full md:w-auto"
            >
              Semana Atual
            </Button>
          )}

          {isMobile && !isViewingToday && (
            <Button
              variant="secondary"
              size="sm"
              onClick={goToCurrentWeek}
              leftIcon={<RefreshCw className="w-4 h-4" />}
              className="w-full md:w-auto"
            >
              Hoje
            </Button>
          )}

          {/* Estatisticas da Semana */}
          {!isMobile && (
            <div className="flex flex-wrap items-center justify-between gap-4 text-sm md:justify-end md:gap-6">
              <div>
                <span className="text-text-secondary">Total de Horas: </span>
                <span className="font-bold text-white">
                  {formatDuration(plannedStudyMinutes)}
                </span>
              </div>
              <div>
                <span className="text-text-secondary">Sessões: </span>
                <span className="font-bold text-white">
                  {plannedStudyBlocks.length}
                </span>
              </div>
            </div>
          )}
        </div>
        {isMobile && (
          <div className="flex min-w-0 items-center justify-between gap-3 text-xs text-text-secondary">
            <span>
              Total: {formatDuration(mobileStudyMinutes)}
            </span>
            <span>{mobileSessions} sessões</span>
          </div>
        )}
      </Card>

      {/* Grade do Planner */}
      <div className="flex-1 min-w-0 rounded-[1.75rem] border border-white/10 bg-[linear-gradient(180deg,rgba(8,13,24,0.9),rgba(5,9,18,0.96))] p-2 shadow-[0_18px_36px_rgba(0,0,0,0.28)] sm:p-3">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {!isMobile && (
            <div className="mb-2 rounded-xl border border-white/10 bg-[#0f1524]/80 px-2 py-1">
              <div ref={topScrollRef} className="h-2 overflow-x-auto overflow-y-hidden rounded-full">
                <div className="h-1 w-px" style={{ width: `${Math.max(boardScrollWidth, 1)}px` }} />
              </div>
            </div>
          )}
          <div
            ref={boardScrollRef}
            className="overflow-x-auto overflow-y-hidden pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <div
              ref={boardContentRef}
              className={
                isMobile
                  ? 'flex min-w-0 flex-col gap-3 pb-6 sm:gap-4 sm:pb-8'
                  : 'flex min-w-max flex-row items-start gap-4 pb-6 pr-2'
              }
            >
              {visibleDates.map((date) => {
                const dateKey = toLocalDateKey(date);
                const dayBlocks = blocksByDay.get(dateKey) || [];

                return (
                  <DayColumn
                    key={dateKey}
                    date={date}
                    blocks={dayBlocks}
                    studyTargetMinutes={getSchedulableDailyLimitMinutes(date)}
                    windowCapacityMinutes={getWindowCapacityMinutes(date)}
                    onAdjustStudyLoad={handleAdjustStudyLoad}
                    onAddBlock={handleAddBlock}
                    onEditBlock={handleEditBlock}
                    onDeleteBlock={handleDeleteBlock}
                    onStartBlock={handleStartBlock}
                    onMarkBlockDone={handleMarkBlockDoneQuick}
                    onSkipBlockToday={handleSkipBlockToday}
                    onQuickRescheduleBlock={handleRequestQuickReschedule}
                    notificationsEnabled={userSettings.notificationsEnabled}
                    notificationMinutesBefore={userSettings.notificationMinutesBefore}
                  />
                );
              })}
            </div>
          </div>

          {/* Overlay de Arrastar */}
          <DragOverlay>
            {activeBlock && (
              <TimeBlock block={activeBlock} isDragging />
            )}
          </DragOverlay>
        </DndContext>
      </div>

      <BlockFormModal
        isOpen={isBlockModalOpen}
        onClose={() => {
          setIsBlockModalOpen(false);
          setEditingBlock(null);
        }}
        onSave={handleSaveBlock}
        subjects={subjects}
        date={blockModalDate}
        block={editingBlock}
        defaultStartTime={blockModalDefaults.startTime}
        defaultDurationMinutes={blockModalDefaults.durationMinutes}
        validateBlock={validateBlockPlacement}
      />

      <StudyBlockSessionModal
        isOpen={isSessionOpen}
        block={sessionBlock}
        onClose={() => setIsSessionOpen(false)}
        onComplete={(blockId, minutesSpent, performance, options) => {
          handleCompleteBlock(blockId, minutesSpent ?? undefined, performance, {
            autoAdvanceToBreak: options?.completionMode !== 'manual',
          });
        }}
      />

      {isMounted &&
        isScheduleModalOpen &&
        createPortal(
          <div className="app-modal-overlay">
            <div className="app-modal-panel max-w-[340px] sm:max-w-md">
              <Card className="relative" padding="sm">
              <h2 className="mb-1.5 text-lg font-heading font-bold text-white sm:mb-2 sm:text-xl">
                Definir período do cronograma
              </h2>
              <p className="mb-3 text-xs text-text-secondary sm:mb-4 sm:text-sm">
                Informe até quando a agenda deve ir.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-text-secondary sm:mb-2 sm:text-sm">
                    Início
                  </label>
                  <input
                    type="date"
                    className="input-field h-10 min-h-0 py-2 text-sm"
                    min={scheduleStartDate || toLocalKey(new Date())}
                    value={scheduleStartDate}
                    onChange={(e) => setScheduleStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-text-secondary sm:mb-2 sm:text-sm">
                    Data final
                  </label>
                  <input
                    type="date"
                    className="input-field h-10 min-h-0 py-2 text-sm"
                    min={toLocalKey(new Date())}
                    value={scheduleEndDate}
                    onChange={(e) => setScheduleEndDate(e.target.value)}
                  />
                </div>
                {scheduleError && <p className="text-xs text-red-400 sm:text-sm">{scheduleError}</p>}
              </div>

              <div className="flex flex-col gap-2 pt-4 sm:flex-row">
                <Button
                  variant="secondary"
                  className="h-10 min-h-0 flex-1 text-sm"
                  onClick={() => setIsScheduleModalOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  variant="primary"
                  className="h-10 min-h-0 flex-1 text-sm"
                  onClick={() => {
                    if (!scheduleStartDate) {
                      setScheduleError('Selecione a data de início.');
                      return;
                    }
                    if (!scheduleEndDate) {
                      setScheduleError('Selecione a data final.');
                      return;
                    }
                    const startDate = parseLocalKey(scheduleStartDate);
                    const endDate = parseLocalKey(scheduleEndDate);
                    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
                      setScheduleError('Informe datas válidas para gerar a agenda.');
                      return;
                    }
                    startDate.setHours(0, 0, 0, 0);
                    endDate.setHours(0, 0, 0, 0);
                    if (endDate < startDate) {
                      setScheduleError('A data final deve ser após o início.');
                      return;
                    }
                    setIsScheduleModalOpen(false);
                    onGenerateSchedule({ startDate, endDate });
                  }}
                >
                  Gerar
                </Button>
              </div>
              </Card>
            </div>
          </div>,
          document.body
        )}

      {isMounted &&
        isRescheduleModalOpen &&
        createPortal(
          <div className="app-modal-overlay">
            <div className="app-modal-panel">
              <Card className="relative" padding="lg">
              <h2 className="text-xl font-heading font-bold text-white mb-2">
                {rescheduleSingleBlockId ? 'Reagendar estudo' : 'Reagendar pendências'}
              </h2>
              <p className="text-sm text-text-secondary mb-4">
                {rescheduleSingleBlockId
                  ? 'Escolha um novo dia para este estudo.'
                  : 'Mova estudos não concluídos de um dia para outro.'}
              </p>

              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-card-border px-3 py-2 text-xs text-text-secondary hover:border-neon-blue/40 hover:text-white"
                    onClick={() => {
                      const tomorrow = new Date();
                      tomorrow.setDate(tomorrow.getDate() + 1);
                      setRescheduleTargetDate(toLocalKey(tomorrow));
                    }}
                  >
                    Amanhã
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-card-border px-3 py-2 text-xs text-text-secondary hover:border-neon-blue/40 hover:text-white"
                    onClick={() => {
                      const endOfWeek = new Date();
                      const diff = 6 - endOfWeek.getDay();
                      endOfWeek.setDate(endOfWeek.getDate() + Math.max(1, diff));
                      setRescheduleTargetDate(toLocalKey(endOfWeek));
                    }}
                  >
                    Ainda esta semana
                  </button>
                </div>

                {!rescheduleSingleBlockId && (
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    Dia de origem
                  </label>
                  <input
                    type="date"
                    className="input-field"
                    value={rescheduleSourceDate}
                    onChange={(e) => setRescheduleSourceDate(e.target.value)}
                  />
                </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    Dia de destino
                  </label>
                  <input
                    type="date"
                    className="input-field"
                    value={rescheduleTargetDate}
                    onChange={(e) => setRescheduleTargetDate(e.target.value)}
                  />
                  {rescheduleTargetInfo && !rescheduleTargetInfo.isStudyDay && (
                    <div className="mt-3 rounded-xl border border-neon-cyan/25 bg-neon-cyan/10 p-3">
                      <p className="text-xs leading-relaxed text-text-secondary">
                        {rescheduleTargetInfo.isAllowed
                          ? `${rescheduleTargetInfo.label} está como descanso, mas está liberado para recuperar pendências.`
                          : `${rescheduleTargetInfo.label} está como descanso. Libere este dia para recuperar pendências sem mudar sua grade fixa.`}
                      </p>
                      {!rescheduleTargetInfo.isAllowed && (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="mt-3 w-full"
                          onClick={() => allowRecoveryDayForBacklog(rescheduleTargetInfo.dayIndex)}
                        >
                          Permitir recuperação neste dia
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                {rescheduleError && (
                  <p className="text-sm text-red-400">{rescheduleError}</p>
                )}
              </div>

              <div className="flex flex-col gap-3 pt-6 sm:flex-row">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => {
                    setIsRescheduleModalOpen(false);
                    setRescheduleSingleBlockId(null);
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  variant="primary"
                  className="flex-1"
                  onClick={() => {
                    if (!rescheduleTargetDate) {
                      setRescheduleError('Selecione o dia de destino.');
                      return;
                    }

                    if (!rescheduleSingleBlockId && !rescheduleSourceDate) {
                      setRescheduleError('Selecione o dia de origem.');
                      return;
                    }

                    if (!rescheduleSingleBlockId && rescheduleSourceDate === rescheduleTargetDate) {
                      setRescheduleError('Escolha dias diferentes.');
                      return;
                    }
                    const targetDate = parseLocalKey(rescheduleTargetDate);
                    targetDate.setHours(0, 0, 0, 0);
                    if (Number.isNaN(targetDate.getTime())) {
                      setRescheduleError('Escolha um destino válido.');
                      return;
                    }

                    if (!isAllowedBacklogDay(targetDate)) {
                      setRescheduleError(
                        'Esse dia está como descanso. Clique em "Permitir recuperação neste dia" para usá-lo sem mudar sua grade fixa.'
                      );
                      return;
                    }

                    if (rescheduleSingleBlockId) {
                      const ok = moveSingleBlockToDate(rescheduleSingleBlockId, targetDate);
                      if (!ok) {
                        setRescheduleError('Não foi possível reagendar este estudo para o dia escolhido.');
                        return;
                      }
                      setIsRescheduleModalOpen(false);
                      setRescheduleSingleBlockId(null);
                      setBacklogNotice('Estudo reagendado com sucesso.');
                      return;
                    }

                    const sourceDate = parseLocalKey(rescheduleSourceDate);
                    sourceDate.setHours(0, 0, 0, 0);

                    const sourceKey = toLocalKey(sourceDate);
                    const targetKey = toLocalKey(targetDate);

                    const sourceBlocks = blocks
                      .filter((block) => toLocalKey(parseBlockDate(block.date)) === sourceKey)
                      .filter((block) => !block.isBreak && !isLockedScheduleBlock(block));

                    if (sourceBlocks.length === 0) {
                      setRescheduleError('Não há estudos pendentes no dia selecionado.');
                      return;
                    }

                    const targetBlocks = blocks.filter(
                      (block) => toLocalKey(parseBlockDate(block.date)) === targetKey
                    );
                    const targetStudyBlocks = targetBlocks.filter((block) => !block.isBreak);
                    const targetLimit = getSchedulableDailyLimitMinutes(targetDate);
                    const { start: targetStart, end: targetEnd } = getPlannerWindowBounds(targetDate);
                    const lastEndMinutes = targetBlocks.reduce((max, block) => {
                      const endMinutes = getBlockEndMinutes(block);
                      return Math.max(max, endMinutes);
                    }, targetStart);
                    const existingTargetStudyMinutes = targetStudyBlocks
                      .filter((block) => isCapacityStudyBlock(block))
                      .reduce((sum, block) => sum + block.durationMinutes, 0);
                    const breakGapMinutes = getBreakGapMinutes();

                    let cursorMinutes =
                      targetBlocks.length > 0
                        ? Math.max(lastEndMinutes + breakGapMinutes, targetStart)
                        : targetStart;
                    let movedStudyMinutes = 0;
                    const movedBlocks: StudyBlock[] = [];

                    const orderedSourceBlocks = [...sourceBlocks].sort((a, b) =>
                      a.startTime.localeCompare(b.startTime)
                    );

                    for (const block of orderedSourceBlocks) {
                      const additionalStudyMinutes = isCapacityStudyBlock(block) ? block.durationMinutes : 0;
                      if (
                        targetLimit > 0 &&
                        existingTargetStudyMinutes + movedStudyMinutes + additionalStudyMinutes > targetLimit
                      ) {
                        setRescheduleError(
                          'Não há capacidade suficiente no dia de destino.'
                        );
                        return;
                      }

                      const nextEnd = cursorMinutes + block.durationMinutes;
                      if (nextEnd > targetEnd || nextEnd > 24 * 60) {
                        setRescheduleError(
                          'Não há espaço suficiente no dia de destino.'
                        );
                        return;
                      }

                      movedBlocks.push({
                        ...block,
                        date: new Date(targetDate),
                        startTime: minutesToTime(cursorMinutes),
                        endTime: minutesToTime(nextEnd),
                        status: block.isBreak ? block.status : 'rescheduled',
                        originalDate: block.originalDate ? parseBlockDate(block.originalDate) : parseBlockDate(block.date),
                        rescheduleCount: block.isBreak ? block.rescheduleCount : (block.rescheduleCount || 0) + 1,
                        updatedAt: new Date(),
                      });
                      cursorMinutes = nextEnd + breakGapMinutes;
                      movedStudyMinutes += additionalStudyMinutes;
                    }

                    const movedById = new Map(movedBlocks.map((block) => [block.id, block]));
                    const updatedBlocks = blocks.map((block) => movedById.get(block.id) ?? block);

                    updatedBlocks.sort((a, b) => {
                      const dateDiff = parseBlockDate(a.date).getTime() - parseBlockDate(b.date).getTime();
                      if (dateDiff !== 0) return dateDiff;
                      return a.startTime.localeCompare(b.startTime);
                    });

                    setBlocks(updatedBlocks);
                    onBlocksChange(updatedBlocks);
                    setIsRescheduleModalOpen(false);
                    setRescheduleSingleBlockId(null);
                  }}
                >
                  Reagendar
                </Button>
              </div>
              </Card>
            </div>
          </div>,
          document.body
        )}

      {isMounted &&
        isBacklogModalOpen &&
        createPortal(
          <div className="app-modal-overlay">
            <div className="app-modal-panel">
              <Card className="relative" padding="lg">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-heading font-bold text-white">Tarefas pendentes</h2>
                    <p className="text-sm text-text-secondary">
                      Estudos não concluídos que precisam voltar para a agenda.
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setIsBacklogModalOpen(false)}>
                    Fechar
                  </Button>
                </div>

                <div className="mb-4 flex flex-col gap-2 sm:flex-row">
                  <Button
                    variant="primary"
                    className="flex-1"
                    onClick={() => {
                      runAutoBacklogReschedule('manual');
                    }}
                  >
                    Replanejar automaticamente
                  </Button>
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={() => {
                      setIsBacklogModalOpen(false);
                      setIsRescheduleModalOpen(true);
                      setRescheduleSingleBlockId(null);
                    }}
                  >
                    Reagendar manualmente
                  </Button>
                </div>

                <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
                  {backlogEntries.length === 0 ? (
                    <div className="rounded-xl border border-card-border bg-card-bg/40 p-4 text-sm text-text-secondary">
                      Sem tarefas pendentes.
                    </div>
                  ) : (
                    backlogEntries.map((entry) => {
                      const block = entry.block;
                      const blockDate = parseBlockDate(block.date);
                      const isOverdue = entry.dateKey < todayKey;
                      return (
                        <div
                          key={block.id}
                          className="rounded-xl border border-card-border bg-card-bg/40 p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-white">
                                {getStudyBlockDisplayTitle(block)}
                              </p>
                              <p className="mt-1 text-xs text-text-secondary">
                                {blockDate.toLocaleDateString('pt-BR')} · {block.startTime} · {block.durationMinutes} min
                              </p>
                              <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-text-muted">
                                <span>Status: {block.status === 'completed' ? 'Concluído' : block.status === 'rescheduled' ? 'Reagendado' : block.status === 'skipped' ? 'Pulado' : 'Pendente'}</span>
                                <span>Prioridade: {Math.round(entry.priorityScore)}</span>
                                <span>Reagendamentos: {block.rescheduleCount || 0}</span>
                                {isOverdue && <span className="text-red-300">Vencido há {entry.daysOverdue} dia(s)</span>}
                              </div>
                            </div>
                            <div className="flex shrink-0 flex-col gap-2">
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => handleRequestQuickReschedule(block)}
                              >
                                Reagendar
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleMarkBlockDoneQuick(block)}
                              >
                                Concluir
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </Card>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
