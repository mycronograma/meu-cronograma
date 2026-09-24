'use client';

/**
 * Settings Page
 * Perfil do usuário, preferências de estudo e parâmetros da IA
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useSession } from 'next-auth/react';
import { signOut } from 'next-auth/react';
import {
  User,
  Clock,
  Brain,
  Bell,
  Shield,
  AlertTriangle,
  Save,
  RefreshCw,
  UploadCloud,
  LogOut,
  Trash2,
  RotateCcw,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Moon,
  Palette,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import { Card, Button, Badge } from '@/components/ui';
import TimePickerField from '@/components/settings/TimePickerField';
import SystemNotificationsCard from '@/components/settings/SystemNotificationsCard';
import { useIsMobile, useOnboarding, useLocalStorage } from '@/hooks';
import { clearClientStoreKeys } from '@/hooks/useLocalStorage';
import {
  SERVER_PROGRESS_STORE_KEYS,
  SYNC_STATUS_STORAGE_KEY,
  type StoredSyncStatus,
} from '@/hooks/useServerProgressSync';
import { resetSyncState, syncNow } from '@/lib/clientSync';
import { cn, formatDate, formatHoursDuration } from '@/lib/utils';
import { getAiScheduleProfile } from '@/lib/aiScheduleProfiles';
import type { DailyHoursByWeekday, StudyPreferences, UserSettings, WeekdayKey } from '@/types';
import { defaultSettings } from '@/lib/defaultSettings';
import { clearLocalDemoSession, isLocalDemoAuthEnabled } from '@/lib/localDemoAuth';

const initialSettings: UserSettings = defaultSettings;

const aiDifficultyOptions = [
  { value: 'easy', label: 'Leve', description: '30 min foco + 15 min pausa' },
  { value: 'medium', label: 'Moderado', description: '50 min foco + 10 min pausa' },
  { value: 'hard', label: 'Intenso', description: '90 min foco + 5 min pausa' },
  { value: 'adaptive', label: 'Adaptativo', description: 'Ajusta entre os perfis pelo desempenho' },
] as const;

const alarmSoundOptions = [
  {
    value: 'pulse' as const,
    label: 'Pulse',
    description: 'Bipes repetidos e mais chamativos',
  },
  {
    value: 'beep' as const,
    label: 'Beep',
    description: 'Um aviso simples e direto',
  },
  {
    value: 'chime' as const,
    label: 'Chime',
    description: 'Toque curto em dois tons',
  },
  {
    value: 'soft' as const,
    label: 'Soft',
    description: 'Aviso suave e discreto',
  },
];

const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
const weekDayKeys: WeekdayKey[] = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
const notificationLeadOptions = [5, 10, 15, 30, 60] as const;

const clampHours = (value: number) => Math.min(12, Math.max(0, Math.round(value * 2) / 2));

const formatHours = (value: number) => {
  return formatHoursDuration(value);
};

const buildDailyHoursByWeekday = (dailyGoalHours: number, excludeDays: number[]): DailyHoursByWeekday => {
  return weekDayKeys.reduce((acc, key, index) => {
    acc[key] = excludeDays.includes(index) ? 0 : clampHours(dailyGoalHours);
    return acc;
  }, {} as DailyHoursByWeekday);
};

type SettingsSection = 'profile' | 'appearance' | 'study' | 'ai' | 'notifications' | 'danger';

const sectionMeta: Record<
  SettingsSection,
  { title: string; description: string; icon: LucideIcon; iconClassName: string }
> = {
  profile: {
    title: 'Perfil',
    description: 'Nome e informações da conta',
    icon: User,
    iconClassName: 'bg-[#007aff] text-white',
  },
  appearance: {
    title: 'Aparência',
    description: 'Tema claro ou escuro',
    icon: Palette,
    iconClassName: 'bg-[#8e8e93] text-white',
  },
  study: {
    title: 'Preferências de estudo',
    description: 'Meta, horários e rotina semanal',
    icon: Clock,
    iconClassName: 'bg-[#5856d6] text-white',
  },
  ai: {
    title: 'Configurações da IA',
    description: 'Dificuldade e automações',
    icon: Brain,
    iconClassName: 'bg-[#34c759] text-white',
  },
  notifications: {
    title: 'Notificações',
    description: 'Lembretes e alertas',
    icon: Bell,
    iconClassName: 'bg-[#ff9500] text-white',
  },
  danger: {
    title: 'Zona de perigo',
    description: 'Ações irreversíveis da conta',
    icon: Shield,
    iconClassName: 'bg-[#ff3b30] text-white',
  },
};

const sectionGroups: Array<{ title: string; sections: SettingsSection[] }> = [
  { title: 'Conta', sections: ['profile', 'appearance', 'notifications'] },
  { title: 'Estudo', sections: ['study', 'ai'] },
  { title: 'Segurança', sections: ['danger'] },
];

const isSettingsSection = (value: string | null): value is SettingsSection => {
  return (
    value === 'profile' ||
    value === 'appearance' ||
    value === 'study' ||
    value === 'ai' ||
    value === 'notifications' ||
    value === 'danger'
  );
};

const mobileStackTransition = { duration: 0.22, ease: 'easeOut' } as const;

const mobileRootScreenVariants = {
  enter: (direction: number) => ({
    x: direction < 0 ? -48 : 0,
    opacity: direction < 0 ? 0 : 1,
  }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({
    x: direction > 0 ? -48 : 0,
    opacity: direction > 0 ? 0 : 1,
  }),
};

const mobileDetailScreenVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 48 : 0,
    opacity: direction > 0 ? 0 : 1,
  }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({
    x: direction < 0 ? 48 : 0,
    opacity: direction < 0 ? 0 : 1,
  }),
};

function SettingsSectionIcon({ section }: { section: SettingsSection }) {
  const Icon = sectionMeta[section].icon;

  return (
    <span
      className={cn(
        'ios-section-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-lg shadow-sm',
        sectionMeta[section].iconClassName
      )}
      aria-hidden
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { resetOnboarding } = useOnboarding();
  const { data: session } = useSession();
  const isMobile = useIsMobile();
  const [isIOS, setIsIOS] = useState(false);
  const [settings, setSettings] = useLocalStorage<UserSettings>('nexora_user_settings', initialSettings);
  const [studyPrefs, setStudyPrefs] = useLocalStorage<StudyPreferences>('nexora_study_prefs', {
    hoursPerDay: initialSettings.dailyGoalHours,
    daysOfWeek: [1, 2, 3, 4, 5],
    mode: 'random',
    examDate: '',
  });
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [hasRemotePrefs, setHasRemotePrefs] = useState(false);
  const [syncStatus] = useLocalStorage<StoredSyncStatus | null>(SYNC_STATUS_STORAGE_KEY, null);
  const [isSyncingNow, setIsSyncingNow] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const hasAttemptedRemotePrefs = useRef(false);
  const [pendingAlarmSound, setPendingAlarmSound] = useState<UserSettings['alarmSound']>(
    settings.alarmSound || 'pulse'
  );
  const [alarmApplied, setAlarmApplied] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteStep, setDeleteStep] = useState<'idle' | 'confirm'>('idle');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [resetTutorialStep, setResetTutorialStep] = useState<'idle' | 'confirm'>('idle');
  const [resetProgressStep, setResetProgressStep] = useState<'idle' | 'confirm'>('idle');
  const [isResettingTutorial, setIsResettingTutorial] = useState(false);
  const [isResettingProgress, setIsResettingProgress] = useState(false);
  const [generalDangerFeedback, setGeneralDangerFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [deleteFeedback, setDeleteFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const deleteInputRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const latestSettingsRef = useRef(settings);
  const hasChangesRef = useRef(hasChanges);
  const saveInFlightRef = useRef(false);
  const saveQueuedRef = useRef(false);
  const previousSectionRef = useRef<SettingsSection | null>(null);
  const rootScrollYRef = useRef(0);
  const openedFromRootRef = useRef(false);

  const sectionParam = searchParams.get('section');
  const activeSection = isSettingsSection(sectionParam) ? sectionParam : null;
  const transitionDirection = useMemo(() => {
    const previousSection = previousSectionRef.current;
    if (previousSection && !activeSection) return -1;
    if (!previousSection && activeSection) return 1;
    return 1;
  }, [activeSection]);

  const setSectionQuery = useCallback(
    (section: SettingsSection | null, mode: 'push' | 'replace' = 'push') => {
      const params = new URLSearchParams(searchParams.toString());
      if (section) {
        params.set('section', section);
      } else {
        params.delete('section');
      }

      const query = params.toString();
      const nextUrl = query ? `${pathname}?${query}` : pathname;
      if (mode === 'replace') {
        router.replace(nextUrl, { scroll: false });
        return;
      }
      router.push(nextUrl, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const openSection = useCallback(
    (section: SettingsSection) => {
      if (activeSection === section) return;
      openedFromRootRef.current = true;
      setSectionQuery(section, 'push');
    },
    [activeSection, setSectionQuery]
  );

  const closeSection = useCallback(() => {
    if (!activeSection) return;

    // If the user navigated from the root list, behave like a real "pop" (so browser forward works).
    if (openedFromRootRef.current) {
      openedFromRootRef.current = false;
      router.back();
      return;
    }

    // Deep-link fallback: keep the user inside /settings and just clear the query param.
    setSectionQuery(null, 'replace');
  }, [activeSection, router, setSectionQuery]);

  useEffect(() => {
    if (activeSection) return;
    openedFromRootRef.current = false;
  }, [activeSection]);

  const excludeDays = useMemo(
    () => (Array.isArray(settings.excludeDays) ? settings.excludeDays : []),
    [settings.excludeDays]
  );
  const dailyGoalHours =
    typeof settings.dailyGoalHours === 'number' && Number.isFinite(settings.dailyGoalHours)
      ? settings.dailyGoalHours
      : defaultSettings.dailyGoalHours;
  const preferredStart = settings.preferredStart || defaultSettings.preferredStart;
  const preferredEnd = settings.preferredEnd || defaultSettings.preferredEnd;
  const maxBlockMinutes =
    typeof settings.maxBlockMinutes === 'number' && Number.isFinite(settings.maxBlockMinutes)
      ? settings.maxBlockMinutes
      : defaultSettings.maxBlockMinutes;
  const breakMinutes =
    typeof settings.breakMinutes === 'number' && Number.isFinite(settings.breakMinutes)
      ? settings.breakMinutes
      : defaultSettings.breakMinutes;
  const rawDailyHoursByWeekday =
    settings.dailyHoursByWeekday ?? buildDailyHoursByWeekday(dailyGoalHours, excludeDays);
  const dailyHoursByWeekday = weekDayKeys.reduce((acc, key, index) => {
    const value = rawDailyHoursByWeekday[key];
    acc[key] =
      typeof value === 'number' && Number.isFinite(value)
        ? value
        : excludeDays.includes(index)
        ? 0
        : clampHours(dailyGoalHours);
    return acc;
  }, {} as DailyHoursByWeekday);

  const weeklyTotalHours = Object.values(dailyHoursByWeekday).reduce(
    (sum, value) => sum + value,
    0
  );
  const activeDayValues = Object.values(dailyHoursByWeekday).filter((value) => value > 0);
  const averageDailyHours =
    activeDayValues.length > 0 ? weeklyTotalHours / activeDayValues.length : 0;
  const emailValue = settings.email || session?.user?.email || '';
  const notificationsEnabled = Boolean(settings.notificationsEnabled);
  const backlogReminderEnabled = Boolean(settings.backlogReminderEnabled);
  const allowSundayBacklog = Boolean(settings.allowSundayBacklog);
  const backlogRecoveryDays = useMemo(() => {
    const days = new Set<number>();
    if (allowSundayBacklog) days.add(0);
    (Array.isArray(settings.backlogRecoveryDays) ? settings.backlogRecoveryDays : []).forEach((day) => {
      if (Number.isInteger(day) && day >= 0 && day <= 6) days.add(day);
    });
    return Array.from(days).sort((a, b) => a - b);
  }, [allowSundayBacklog, settings.backlogRecoveryDays]);
  const notificationSoundEnabled = settings.notificationSoundEnabled !== false;
  const notificationMinutesBefore = Number.isFinite(settings.notificationMinutesBefore)
    ? Math.min(180, Math.max(1, Math.round(settings.notificationMinutesBefore)))
    : 15;

  const updateSetting = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
    setSaveState((prev) => (prev === 'error' ? 'idle' : prev));
  };

  const updateAiDifficulty = (value: UserSettings['aiDifficulty']) => {
    const profile = getAiScheduleProfile(value);
    setSettings((prev) => ({
      ...prev,
      aiDifficulty: value,
      maxBlockMinutes: profile.focusBlockMinutes,
      breakMinutes: profile.breakMinutes,
      smartBreaks: value === 'adaptive' ? true : prev.smartBreaks,
    }));
    setStudyPrefs((prev) => ({
      ...prev,
      blockDurationMinutes: profile.focusBlockMinutes,
      focusBlockMinutes: profile.focusBlockMinutes,
      breakDurationMinutes: profile.breakMinutes,
    }));
    setHasChanges(true);
    setSaveState((prev) => (prev === 'error' ? 'idle' : prev));
  };

  const updateDailyHours = (nextHours: DailyHoursByWeekday) => {
    const activeDays = weekDayKeys
      .map((key, index) => ({ key, index, value: nextHours[key] }))
      .filter((entry) => entry.value > 0);
    const nextExcludeDays = weekDayKeys
      .map((key, index) => (nextHours[key] > 0 ? null : index))
      .filter((value): value is number => value !== null);
    const nextAverage =
      activeDays.length > 0
        ? activeDays.reduce((sum, entry) => sum + entry.value, 0) / activeDays.length
        : dailyGoalHours;

    setSettings((prev) => ({
      ...prev,
      dailyHoursByWeekday: nextHours,
      excludeDays: nextExcludeDays,
      dailyGoalHours: Number(nextAverage.toFixed(1)),
    }));
    setHasChanges(true);
    setSaveState((prev) => (prev === 'error' ? 'idle' : prev));
  };

  const updateDayHours = (dayIndex: number, hours: number) => {
    const key = weekDayKeys[dayIndex];
    const next = { ...dailyHoursByWeekday, [key]: clampHours(hours) };
    updateDailyHours(next);
  };

  const handleDailyGoalChange = (value: number) => {
    const next = { ...dailyHoursByWeekday };
    weekDayKeys.forEach((key, index) => {
      next[key] = excludeDays.includes(index) ? 0 : clampHours(value);
    });
    updateDailyHours(next);
  };

  useEffect(() => {
    latestSettingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    hasChangesRef.current = hasChanges;
  }, [hasChanges]);

  useEffect(() => {
    try {
      const ua = navigator.userAgent || '';
      const isiPhoneIPadIPod = /iPad|iPhone|iPod/.test(ua);
      const isIPadOs = ua.includes('Mac') && 'ontouchend' in document;
      setIsIOS(isiPhoneIPadIPod || isIPadOs);
    } catch {
      setIsIOS(false);
    }
  }, []);

  useEffect(() => {
    const previousSection = previousSectionRef.current;

    const isMobileViewport = window.matchMedia('(max-width: 767px)').matches;

    if (isMobileViewport) {
      // Keep separate scroll positions for the "root list" and the "detail screen" like iOS Settings.
      if (!previousSection && activeSection) {
        rootScrollYRef.current = window.scrollY;
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      } else if (previousSection && !activeSection) {
        window.scrollTo({ top: rootScrollYRef.current, left: 0, behavior: 'auto' });
      }
    }

    previousSectionRef.current = activeSection;
  }, [activeSection]);

  useEffect(() => {
    if (!sectionParam || activeSection) return;
    setSectionQuery(null, 'replace');
  }, [activeSection, sectionParam, setSectionQuery]);

  useEffect(() => {
    if (settings.dailyHoursByWeekday) return;
    const fallback = buildDailyHoursByWeekday(dailyGoalHours, settings.excludeDays ?? []);
    setSettings((prev) => ({ ...prev, dailyHoursByWeekday: fallback }));
  }, [dailyGoalHours, settings.dailyHoursByWeekday, settings.excludeDays, setSettings]);

  useEffect(() => {
    if (!session?.user) return;
    setSettings((prev) => {
      const nextName = prev.name == null ? session.user?.name || 'Estudante' : prev.name;
      const nextEmail =
        prev.email && prev.email.trim().length > 0 ? prev.email : session.user?.email || '';
      const nextAvatar = prev.avatar || session.user?.image || undefined;

      if (prev.name === nextName && prev.email === nextEmail && prev.avatar === nextAvatar) {
        return prev;
      }

      return {
        ...prev,
        name: nextName,
        email: nextEmail,
        avatar: nextAvatar,
      };
    });
  }, [session?.user, setSettings]);

  useEffect(() => {
    if (!session?.user?.id) return;
    if (hasRemotePrefs) return;
    if (hasAttemptedRemotePrefs.current) return;
    let isMounted = true;
    const loadRemotePrefs = async () => {
      hasAttemptedRemotePrefs.current = true;
      try {
        const response = await fetch('/api/preferences');
        if (!response.ok) return;
        const payload = await response.json();
        if (!payload?.success || !payload?.data) return;

        const remote = payload.data;
        const parsedRestDays =
          typeof remote.restDays === 'string'
            ? (() => {
                try {
                  return JSON.parse(remote.restDays);
                } catch {
                  return null;
                }
              })()
            : remote.restDays ?? null;
        const restDays = (() => {
          if (Array.isArray(parsedRestDays)) {
            return parsedRestDays.filter(
              (value: unknown): value is number =>
                typeof value === 'number' &&
                Number.isInteger(value) &&
                value >= 0 &&
                value <= 6
            );
          }
          if (
            parsedRestDays &&
            typeof parsedRestDays === 'object' &&
            'excludeDays' in parsedRestDays &&
            Array.isArray(parsedRestDays.excludeDays)
          ) {
            return parsedRestDays.excludeDays.filter(
              (value: unknown): value is number =>
                typeof value === 'number' &&
                Number.isInteger(value) &&
                value >= 0 &&
                value <= 6
            );
          }
          return [];
        })();
        const remoteAllowSundayBacklog =
          parsedRestDays &&
          typeof parsedRestDays === 'object' &&
          'allowSundayBacklog' in parsedRestDays &&
          typeof parsedRestDays.allowSundayBacklog === 'boolean'
            ? parsedRestDays.allowSundayBacklog
            : null;
        const remoteBacklogRecoveryDays = (() => {
          if (
            parsedRestDays &&
            typeof parsedRestDays === 'object' &&
            'backlogRecoveryDays' in parsedRestDays &&
            Array.isArray(parsedRestDays.backlogRecoveryDays)
          ) {
            return parsedRestDays.backlogRecoveryDays.filter(
              (value: unknown): value is number =>
                typeof value === 'number' &&
                Number.isInteger(value) &&
                value >= 0 &&
                value <= 6
            );
          }
          return null;
        })();
        const remoteDailyHours =
          typeof remote.dailyHoursByWeekday === 'string'
            ? (() => {
                try {
                  return JSON.parse(remote.dailyHoursByWeekday);
                } catch {
                  return null;
                }
              })()
            : remote.dailyHoursByWeekday ?? null;

        if (!isMounted || hasChangesRef.current) return;
        setSettings((prev) => ({
          ...prev,
          dailyGoalHours: remote.dailyGoalHours ?? prev.dailyGoalHours,
          preferredStart: remote.preferredStart ?? prev.preferredStart,
          preferredEnd: remote.preferredEnd ?? prev.preferredEnd,
          maxBlockMinutes: remote.maxBlockMinutes ?? prev.maxBlockMinutes,
          breakMinutes: remote.breakMinutes ?? prev.breakMinutes,
          alarmSound: remote.alarmSound ?? prev.alarmSound,
          dailyReminder:
            typeof remote.dailyReminder === 'boolean' ? remote.dailyReminder : prev.dailyReminder,
          streakReminder:
            typeof remote.streakReminder === 'boolean' ? remote.streakReminder : prev.streakReminder,
          achievementAlerts:
            typeof remote.achievementAlerts === 'boolean'
              ? remote.achievementAlerts
              : prev.achievementAlerts,
          weeklyReport:
            typeof remote.weeklyReport === 'boolean' ? remote.weeklyReport : prev.weeklyReport,
          notificationsEnabled:
            typeof remote.notificationsEnabled === 'boolean'
              ? remote.notificationsEnabled
              : prev.notificationsEnabled,
          notificationMinutesBefore:
            typeof remote.notificationMinutesBefore === 'number' &&
            Number.isFinite(remote.notificationMinutesBefore)
              ? Math.min(180, Math.max(1, Math.round(remote.notificationMinutesBefore)))
              : prev.notificationMinutesBefore,
          notificationSoundEnabled:
            typeof remote.notificationSoundEnabled === 'boolean'
              ? remote.notificationSoundEnabled
              : prev.notificationSoundEnabled,
          backlogReminderEnabled:
            typeof remote.backlogReminderEnabled === 'boolean'
              ? remote.backlogReminderEnabled
              : prev.backlogReminderEnabled,
          pushSubscription:
            remote.pushSubscription && typeof remote.pushSubscription === 'object'
              ? remote.pushSubscription
              : prev.pushSubscription ?? null,
          dailyHoursByWeekday: remoteDailyHours ?? prev.dailyHoursByWeekday,
          excludeDays: restDays.length > 0 ? restDays : prev.excludeDays,
          allowSundayBacklog:
            typeof remoteAllowSundayBacklog === 'boolean'
              ? remoteAllowSundayBacklog
              : prev.allowSundayBacklog,
          backlogRecoveryDays: remoteBacklogRecoveryDays ?? prev.backlogRecoveryDays ?? [],
          examDate: remote.examDate ?? prev.examDate,
        }));
        const resolvedDaily =
          remoteDailyHours ??
          buildDailyHoursByWeekday(
            remote.dailyGoalHours ?? dailyGoalHours,
            restDays.length > 0 ? restDays : excludeDays
          );
        const activeDays = weekDayKeys
          .map((key, index) => ({ key, index }))
          .filter((entry) => (resolvedDaily[entry.key] ?? 0) > 0)
          .map((entry) => entry.index);
        setStudyPrefs({
          hoursPerDay: remote.dailyGoalHours ?? dailyGoalHours,
          daysOfWeek: activeDays,
          mode: remote.examDate ? 'exam' : 'random',
          examDate: remote.examDate || '',
        });
        setHasRemotePrefs(true);
      } catch (error) {
        console.warn('Erro ao carregar preferências remotas:', error);
      }
    };

    if (!hasChanges) {
      loadRemotePrefs();
    }

    return () => {
      isMounted = false;
    };
  }, [dailyGoalHours, excludeDays, hasChanges, hasRemotePrefs, session?.user?.id, setSettings, setStudyPrefs]);

  useEffect(() => {
    setPendingAlarmSound(settings.alarmSound || 'pulse');
  }, [settings.alarmSound]);

  useEffect(() => {
    if (!alarmApplied) return;
    const timeout = setTimeout(() => setAlarmApplied(false), 1200);
    return () => clearTimeout(timeout);
  }, [alarmApplied]);

  useEffect(() => {
    if (deleteStep !== 'confirm') return;
    deleteInputRef.current?.focus();
  }, [deleteStep]);

  const ensureAudioContext = () => {
    try {
      if (!audioRef.current) {
        audioRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (audioRef.current.state === 'suspended') {
        audioRef.current.resume();
      }
    } catch (error) {
      console.warn('Erro ao preparar áudio:', error);
    }
  };

  const playAlarmPreview = (sound: UserSettings['alarmSound']) => {
    try {
      ensureAudioContext();
      if (!audioRef.current) return;
      const context = audioRef.current;
      const now = context.currentTime;
      const scheduleBeep = (start: number, duration: number, freq: number, type: OscillatorType) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.35, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + duration);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
        };
      };

      if (sound === 'beep') {
        const duration = 1.0;
        const gap = 0.25;
        const repeats = 4;
        for (let i = 0; i < repeats; i += 1) {
          const start = now + i * (duration + gap);
          scheduleBeep(start, duration, 880, 'sine');
        }
        return;
      }
      if (sound === 'chime') {
        const cycle = 0.9;
        const repeats = 6;
        for (let i = 0; i < repeats; i += 1) {
          const start = now + i * cycle;
          scheduleBeep(start, 0.35, 880, 'sine');
          scheduleBeep(start + 0.4, 0.45, 660, 'sine');
        }
        return;
      }
      if (sound === 'soft') {
        const duration = 0.25;
        const gap = 0.15;
        const repeats = 12;
        for (let i = 0; i < repeats; i += 1) {
          const start = now + i * (duration + gap);
          scheduleBeep(start, duration, 520, 'sine');
        }
        return;
      }

      const beepDuration = 0.24;
      const gap = 0.08;
      const repeats = 16;
      for (let i = 0; i < repeats; i += 1) {
        const start = now + i * (beepDuration + gap);
        scheduleBeep(start, beepDuration, 880, 'square');
      }
    } catch (error) {
      console.warn('Erro ao tocar alarme:', error);
    }
  };

  const toggleExcludeDay = (dayIndex: number) => {
    const key = weekDayKeys[dayIndex];
    const isRest = dailyHoursByWeekday[key] === 0;
    const next = {
      ...dailyHoursByWeekday,
      [key]: isRest ? clampHours(dailyGoalHours || 2) : 0,
    };
    updateDailyHours(next);
  };

  const toggleBacklogRecoveryDay = (dayIndex: number) => {
    const nextDays = new Set(backlogRecoveryDays);
    if (nextDays.has(dayIndex)) {
      nextDays.delete(dayIndex);
    } else {
      nextDays.add(dayIndex);
    }

    const normalized = Array.from(nextDays).sort((a, b) => a - b);
    setSettings((prev) => ({
      ...prev,
      backlogRecoveryDays: normalized,
      allowSundayBacklog: normalized.includes(0),
    }));
    setHasChanges(true);
    setSaveState((prev) => (prev === 'error' ? 'idle' : prev));
  };

  const handleSave = useCallback(async () => {
    if (saveInFlightRef.current) {
      saveQueuedRef.current = true;
      return;
    }

    saveInFlightRef.current = true;
    setSaving(true);

    try {
      do {
        saveQueuedRef.current = false;

        const snapshot = latestSettingsRef.current;
        const resolvedDaily =
          snapshot.dailyHoursByWeekday ??
          buildDailyHoursByWeekday(snapshot.dailyGoalHours, snapshot.excludeDays ?? []);
        const activeDays = weekDayKeys
          .map((key, index) => ({ key, index }))
          .filter((entry) => (resolvedDaily[entry.key] ?? 0) > 0)
          .map((entry) => entry.index);
        const activeHours = Object.values(resolvedDaily).filter((value) => value > 0);
        const averageHours =
          activeHours.length > 0
            ? activeHours.reduce((sum, value) => sum + value, 0) / activeHours.length
            : snapshot.dailyGoalHours;
        const nextStudyPrefs: StudyPreferences = {
          ...studyPrefs,
          hoursPerDay: Number(averageHours.toFixed(1)),
          daysOfWeek: activeDays,
          mode: snapshot.examDate ? 'exam' : 'random',
          examDate: snapshot.examDate || '',
          dailyHoursByWeekday: resolvedDaily,
          focusBlockMinutes: snapshot.maxBlockMinutes,
          blockDurationMinutes: snapshot.maxBlockMinutes,
          breakDurationMinutes: snapshot.breakMinutes,
        };
        const markSaved = (remoteSaved: boolean) => {
          setHasRemotePrefs(remoteSaved);
          setStudyPrefs(nextStudyPrefs);
          setHasChanges(false);
          setSaveState('saved');
        };

        setSaveState('saving');

        if (!session?.user?.id) {
          markSaved(false);
          continue;
        }

        try {
          const response = await fetch('/api/preferences', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ settings: snapshot, studyPrefs: nextStudyPrefs }),
          });
          const payload = await response.json().catch(() => null);
          if (!response.ok || payload?.success === false) {
            if (response.status === 401 && isLocalDemoAuthEnabled) {
              markSaved(false);
              continue;
            }
            throw new Error(payload?.error || 'Falha ao salvar preferências.');
          }

          markSaved(true);
        } catch (error) {
          console.warn('Falha ao salvar preferências no servidor:', error);
          setSaveState('error');
        }
      } while (saveQueuedRef.current);
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  }, [session?.user?.id, setStudyPrefs, studyPrefs]);

  useEffect(() => {
    if (!hasChanges) return;
    const timeout = setTimeout(() => {
      void handleSave();
    }, 700);
    return () => clearTimeout(timeout);
  }, [hasChanges, handleSave, settings]);

  useEffect(() => {
    if (saveState !== 'saved') return;
    const timeout = setTimeout(() => setSaveState('idle'), 1800);
    return () => clearTimeout(timeout);
  }, [saveState]);

  const clearClientProgressStore = () => {
    clearClientStoreKeys(SERVER_PROGRESS_STORE_KEYS);
    // Sem isto, o aparelho continuaria achando que já enviou o que foi apagado.
    resetSyncState();
  };

  const handleSyncNow = async () => {
    setIsSyncingNow(true);
    setSyncFeedback(null);

    try {
      const result = await syncNow({ force: true });
      if (!result.ok) {
        setSyncFeedback(result.error ?? 'Não foi possível sincronizar agora.');
      } else if (result.skipped) {
        setSyncFeedback('Tudo já estava sincronizado.');
      } else {
        const sent = result.pushed.subjects + result.pushed.blocks + result.pushed.snapshots;
        const received = result.pulled.subjects + result.pulled.blocks + result.pulled.sessions;
        setSyncFeedback(
          `Sincronizado: ${sent} enviado(s), ${received} recebido(s) — ${(
            result.bytesUp / 1024
          ).toFixed(1)} KB.`
        );
      }
    } finally {
      setIsSyncingNow(false);
    }
  };

  const clearServerProgress = async (mode: 'onboarding' | 'progress') => {
    // No modo demo local não existe sessão/banco: limpar apenas o armazenamento local.
    if (isLocalDemoAuthEnabled) return;

    const response = await fetch('/api/progress', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.success === false) {
      throw new Error(payload?.error || 'Falha ao limpar progresso no servidor.');
    }
  };

  const handleReset = () => {
    setSettings(initialSettings);
    const fallbackHours =
      initialSettings.dailyHoursByWeekday ??
      buildDailyHoursByWeekday(initialSettings.dailyGoalHours, initialSettings.excludeDays ?? []);
    const activeDays = weekDayKeys
      .map((key, index) => ({ key, index }))
      .filter((entry) => fallbackHours[entry.key] > 0)
      .map((entry) => entry.index);
    const avgHours = activeDays.length
      ? activeDays.reduce((sum, index) => sum + fallbackHours[weekDayKeys[index]], 0) /
        activeDays.length
      : initialSettings.dailyGoalHours;
    setStudyPrefs({
      hoursPerDay: Number(avgHours.toFixed(1)),
      daysOfWeek: activeDays,
      mode: 'random',
      examDate: '',
    });
    setHasChanges(true);
    setSaveState('idle');
  };

  const startResetTutorialFlow = () => {
    setResetTutorialStep('confirm');
    setResetProgressStep('idle');
    setDeleteStep('idle');
    setDeleteConfirmText('');
    setGeneralDangerFeedback(null);
    setDeleteFeedback(null);
  };

  const cancelResetTutorialFlow = () => {
    if (isResettingTutorial) return;
    setResetTutorialStep('idle');
  };

  const confirmResetTutorial = async () => {
    setIsResettingTutorial(true);
    setGeneralDangerFeedback(null);
    setDeleteFeedback(null);

    try {
      await clearServerProgress('onboarding');
      resetOnboarding();
      setHasRemotePrefs(false);
      setGeneralDangerFeedback({ type: 'success', message: 'Tutorial reiniciado. Recarregando...' });
      setTimeout(() => window.location.reload(), 350);
    } catch (error) {
      console.warn('Erro ao reiniciar tutorial:', error);
      setGeneralDangerFeedback({ type: 'error', message: 'Falha ao reiniciar tutorial. Tente novamente.' });
    } finally {
      setIsResettingTutorial(false);
      setResetTutorialStep('idle');
    }
  };

  const startResetProgressFlow = () => {
    setResetProgressStep('confirm');
    setResetTutorialStep('idle');
    setDeleteStep('idle');
    setDeleteConfirmText('');
    setGeneralDangerFeedback(null);
    setDeleteFeedback(null);
  };

  const cancelResetProgressFlow = () => {
    if (isResettingProgress) return;
    setResetProgressStep('idle');
  };

  const confirmResetProgress = async () => {
    setIsResettingProgress(true);
    setGeneralDangerFeedback(null);
    setDeleteFeedback(null);

    try {
      await clearServerProgress('progress');
      clearClientProgressStore();
      resetOnboarding();
      setHasRemotePrefs(false);
      setGeneralDangerFeedback({ type: 'success', message: 'Progresso resetado. Recarregando...' });
      setTimeout(() => window.location.reload(), 350);
    } catch (error) {
      console.warn('Erro ao resetar progresso:', error);
      setGeneralDangerFeedback({ type: 'error', message: 'Falha ao resetar progresso. Tente novamente.' });
    } finally {
      setIsResettingProgress(false);
      setResetProgressStep('idle');
    }
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    setResetTutorialStep('idle');
    setResetProgressStep('idle');
    setDeleteStep('idle');
    setDeleteConfirmText('');
    setGeneralDangerFeedback(null);
    setDeleteFeedback(null);

    try {
      if (isLocalDemoAuthEnabled) {
        clearLocalDemoSession();
        router.replace('/login');
        return;
      }

      await signOut({ callbackUrl: '/login' });
    } catch (error) {
      setGeneralDangerFeedback({
        type: 'error',
        message: 'Falha ao sair da conta. Tente novamente.',
      });
    } finally {
      setIsSigningOut(false);
    }
  };

  const startDeleteFlow = () => {
    setDeleteStep('confirm');
    setDeleteConfirmText('');
    setResetTutorialStep('idle');
    setResetProgressStep('idle');
    setGeneralDangerFeedback(null);
    setDeleteFeedback(null);
  };

  const cancelDeleteFlow = () => {
    if (isDeletingAccount) return;
    setDeleteStep('idle');
    setDeleteConfirmText('');
    setDeleteFeedback(null);
  };

  const handleDeleteAccount = async () => {
    const confirmationKeyword = 'EXCLUIR';

    if (deleteConfirmText.trim().toUpperCase() !== confirmationKeyword) {
      setDeleteFeedback({
        type: 'error',
        message: `Digite "${confirmationKeyword}" para confirmar a exclusão da conta.`,
      });
      return;
    }

    setIsDeletingAccount(true);
    setDeleteFeedback(null);

    try {
      if (isLocalDemoAuthEnabled) {
        clearClientProgressStore();
        clearLocalDemoSession();
        setDeleteConfirmText('');
        setDeleteStep('idle');
        setDeleteFeedback({
          type: 'success',
          message: 'Sessao de teste limpa. Redirecionando...',
        });
        setTimeout(() => router.replace('/login'), 350);
        return;
      }

      const response = await fetch('/api/auth/delete-account', { method: 'DELETE' });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'Não foi possível excluir sua conta agora.');
      }

      clearClientProgressStore();
      setDeleteConfirmText('');
      setDeleteStep('idle');
      setDeleteFeedback({
        type: 'success',
        message: 'Conta excluida. Redirecionando...',
      });
      await signOut({ callbackUrl: '/login' });
    } catch (error) {
      setDeleteFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'Falha ao excluir conta.',
      });
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const saveFeedback = useMemo(() => {
    if (saveState === 'saving') {
      return {
        text: 'Salvando alterações...',
        className: 'text-text-muted',
      };
    }
    if (saveState === 'saved') {
      return {
        text: 'Alterações salvas',
        className: 'text-neon-cyan',
      };
    }
    if (saveState === 'error') {
      return {
        text: 'Falha ao salvar. Tente novamente.',
        className: 'text-red-300',
      };
    }
    if (hasChanges) {
      return {
        text: 'Alterações pendentes',
        className: 'text-text-muted',
      };
    }
    return null;
  }, [hasChanges, saveState]);

  const showActionButtons = hasChanges || saveState === 'error';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="ios-settings-page app-page w-full min-w-0 max-w-[760px] mx-auto overflow-x-hidden pb-[calc(var(--bottom-nav-safe-height)+1.25rem)] md:pb-6"
    >
      {/* Cabeçalho */}
            <div className="space-y-3 md:hidden">
        {!activeSection ? (
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-heading font-bold text-white">Configurações</h1>
              <p className="text-sm text-text-secondary mt-1">Personalize sua experiência de estudos</p>
            </div>
            {showActionButtons && (
              <Button variant="primary" size="sm" onClick={handleSave} loading={saving} className="shrink-0">
                Salvar
              </Button>
            )}
          </div>
        ) : (
          <div className="flex min-w-0 items-center justify-between gap-2">
            <button
              type="button"
              onClick={closeSection}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2.5 py-2 text-sm text-neon-blue hover:bg-card-bg touch-manipulation active:scale-[0.99]"
            >
              <ChevronLeft className="w-4 h-4" />
              Voltar
            </button>
            <p className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-white">
              {sectionMeta[activeSection].title}
            </p>
            {showActionButtons ? (
              <Button variant="primary" size="sm" onClick={handleSave} loading={saving} className="shrink-0">
                Salvar
              </Button>
            ) : (
              <span className="w-[68px] shrink-0" aria-hidden />
            )}
          </div>
        )}
        {saveFeedback && <p className={cn('text-xs', saveFeedback.className)}>{saveFeedback.text}</p>}
      </div>

      <div className="hidden min-w-0 flex-col gap-3 md:flex sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-heading font-bold text-white">Configurações</h1>
          <p className="text-sm text-text-secondary mt-1">
            Personalize sua experiência de estudos
          </p>
          {saveFeedback && <p className={cn('mt-2 text-xs', saveFeedback.className)}>{saveFeedback.text}</p>}
        </div>
        {showActionButtons && (
          <div className="flex w-full sm:w-auto flex-col sm:flex-row gap-2 sm:gap-3">
            <Button variant="ghost" onClick={handleReset} className="w-full sm:w-auto">
              <RefreshCw className="w-4 h-4 mr-2" />
              Resetar
            </Button>
            <Button variant="primary" onClick={handleSave} loading={saving} className="w-full sm:w-auto">
              <Save className="w-4 h-4 mr-2" />
              Salvar Alterações
            </Button>
          </div>
        )}
      </div>

      <div className="relative min-w-0 overflow-x-hidden">
        <AnimatePresence initial={false} custom={transitionDirection} mode="popLayout">
        {!activeSection && (
          <motion.div
            key="settings-sections-list"
            variants={mobileRootScreenVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={mobileStackTransition}
            className="relative z-0 mx-auto max-w-[560px] space-y-5"
          >
            {!hasRemotePrefs && (
              <Card className="border-neon-cyan/40 bg-neon-cyan/5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <p className="text-sm text-white font-medium">Ainda não configurado</p>
                    <p className="text-xs text-text-secondary">
                      Escolha um modelo na página de disciplinas para aplicar um plano automático.
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => router.push('/subjects')}
                    className="w-full sm:w-auto"
                  >
                    Configurar agora
                  </Button>
                </div>
              </Card>
            )}
            {sectionGroups.map((group) => (
              <Card key={group.title} padding="none" className="overflow-hidden">
                <div className="border-b border-card-border/70 px-4 py-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-text-muted">{group.title}</p>
                </div>
                {group.sections.map((section, index) => (
                  <button
                    key={section}
                    type="button"
                    onClick={() => openSection(section)}
                    className={cn(
                      'flex w-full min-h-[56px] min-w-0 items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/5 touch-manipulation active:scale-[0.995]',
                      index !== group.sections.length - 1 && 'border-b border-card-border/70'
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <SettingsSectionIcon section={section} />
                      <div className="min-w-0">
                        <p className="truncate text-[16px] font-normal text-white">
                          {sectionMeta[section].title}
                        </p>
                        <p className="truncate text-xs text-text-secondary">
                          {sectionMeta[section].description}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[#c7c7cc] shrink-0" />
                  </button>
                ))}
              </Card>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Seção de Perfil */}
      <AnimatePresence initial={false} custom={transitionDirection} mode="popLayout">
        <motion.div
          key={activeSection ?? 'all-sections'}
          variants={mobileDetailScreenVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={mobileStackTransition}
          className="relative z-10 md:!transform-none md:!opacity-100"
        >
      {activeSection && (
        <div className="mb-4 hidden items-center justify-between md:flex">
          <button
            type="button"
            onClick={closeSection}
            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg pr-3 text-sm font-medium text-[#007aff] transition hover:bg-black/5"
          >
            <ChevronLeft className="w-4 h-4" />
            Ajustes
          </button>
          {showActionButtons && (
            <Button variant="primary" size="sm" onClick={handleSave} loading={saving}>
              Salvar
            </Button>
          )}
        </div>
      )}
      <Card className={cn(activeSection === 'profile' ? 'block' : 'hidden')}>
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-neon-blue/20 flex items-center justify-center">
            <User className="w-5 h-5 text-neon-blue" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-heading font-bold text-white">Perfil</h2>
            <p className="text-sm text-text-secondary">Suas informações pessoais</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="min-w-0">
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Nome de Exibição
            </label>
            <input
              type="text"
              value={settings.name ?? ''}
              onChange={(e) => updateSetting('name', e.target.value)}
              className="input-field"
            />
          </div>
          <div className="min-w-0">
            <label className="block text-sm font-medium text-text-secondary mb-2">
              E-mail
            </label>
            <input
              type="email"
              value={emailValue}
              readOnly
              className="input-field opacity-80 cursor-not-allowed"
            />
          </div>
        </div>
      </Card>

      {/* Preferências de Estudo */}
      <Card className={cn(activeSection === 'appearance' ? 'block' : 'hidden')}>
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-500/20 flex items-center justify-center">
            <Palette className="w-5 h-5 text-slate-500" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-heading font-bold text-white">Aparência</h2>
            <p className="text-sm text-text-secondary">Escolha como o Nexora aparece para você</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            {
              value: 'light' as const,
              label: 'Claro',
              description: 'Visual limpo, parecido com Ajustes do iPhone.',
              icon: Sun,
            },
            {
              value: 'dark' as const,
              label: 'Escuro',
              description: 'Visual original do Nexora com fundo profundo.',
              icon: Moon,
            },
          ].map((option) => {
            const Icon = option.icon;
            const isSelected = (settings.theme || 'dark') === option.value;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => updateSetting('theme', option.value)}
                aria-pressed={isSelected}
                className={cn(
                  'min-h-[126px] rounded-2xl border p-4 text-left transition touch-manipulation active:scale-[0.99]',
                  isSelected
                    ? 'border-[#007aff] bg-[#007aff]/10'
                    : 'border-card-border bg-card-bg hover:border-[#007aff]/50'
                )}
              >
                <div
                  className={cn(
                    'mb-4 flex h-11 w-11 items-center justify-center rounded-full',
                    option.value === 'light' ? 'bg-white text-[#ff9500]' : 'bg-[#1c1c1e] text-white'
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="font-semibold text-white">{option.label}</div>
                <div className="mt-1 text-sm text-text-secondary">{option.description}</div>
              </button>
            );
          })}
        </div>
      </Card>

      <Card className={cn(activeSection === 'study' ? 'block' : 'hidden')}>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-neon-purple/20 flex items-center justify-center">
            <Clock className="w-5 h-5 text-neon-violet" />
          </div>
          <div>
            <h2 className="text-lg font-heading font-bold text-white">
              Preferências de Estudo
            </h2>
            <p className="text-sm text-text-secondary">
              Configure sua agenda de estudos
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Meta Diária */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Meta diaria de estudo: {formatHours(dailyGoalHours)}
            </label>
            <input
              type="range"
              min="1"
              max="12"
              step="0.5"
              value={dailyGoalHours}
              onChange={(e) => handleDailyGoalChange(Number(e.target.value))}
              className="w-full accent-neon-purple"
            />
            <div className="flex justify-between text-xs text-text-muted mt-1">
              <span>1h</span>
              <span>12h</span>
            </div>
          </div>

          <div className="rounded-xl border border-card-border bg-card-bg/50 p-4 overflow-hidden">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-white">Horas por dia</p>
                <p className="text-xs text-text-muted">
                  Ajuste por dia quando sua rotina variar.
                </p>
              </div>
              <div className="text-xs text-text-secondary">
                Total semanal: <span className="text-white">{formatHours(weeklyTotalHours)}</span>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {weekDays.map((label, index) => {
                const key = weekDayKeys[index];
                const hours = dailyHoursByWeekday[key] ?? 0;
                const isActive = hours > 0;

                return (
                  <div
                    key={label}
                    className="rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                          onClick={() => updateDayHours(index, isActive ? 0 : dailyGoalHours)}
                          className={cn(
                            'h-11 min-w-[48px] rounded-lg border px-2 text-sm font-medium transition',
                            isActive
                              ? 'border-neon-purple/60 text-white'
                              : 'border-slate-800 text-text-muted'
                          )}
                        >
                        {label}
                      </button>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                            max={12}
                            step={0.5}
                            value={hours}
                            onChange={(e) => updateDayHours(index, Number(e.target.value))}
                            className={cn('input-field h-11 w-20 px-3 py-2 text-sm', !isActive && 'opacity-70')}
                          />
                        <span className="min-w-[38px] text-right text-xs text-text-muted">{formatHours(hours)}</span>
                      </div>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={12}
                      step={0.5}
                      value={hours}
                      onChange={(e) => updateDayHours(index, Number(e.target.value))}
                      className={cn('mt-3 w-full accent-neon-purple', !isActive && 'opacity-40')}
                    />
                  </div>
                );
              })}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-text-muted">
              <span>
                Media diaria: <span className="text-white">{formatHours(averageDailyHours)}</span>
              </span>
              <span>
                Dias ativos: <span className="text-white">{activeDayValues.length}</span>
              </span>
            </div>
          </div>

          {/* Janela de Tempo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Horário de Início Preferido
              </label>
              {isMobile && isIOS ? (
                <TimePickerField
                  label="Horário de início preferido"
                  value={preferredStart}
                  onChange={(next) => updateSetting('preferredStart', next)}
                />
              ) : (
                <input
                  type="time"
                  value={preferredStart}
                  onChange={(e) => updateSetting('preferredStart', e.target.value)}
                  className="input-field py-2.5"
                />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Horário de Término Preferido
              </label>
              {isMobile && isIOS ? (
                <TimePickerField
                  label="Horário de término preferido"
                  value={preferredEnd}
                  onChange={(next) => updateSetting('preferredEnd', next)}
                />
              ) : (
                <input
                  type="time"
                  value={preferredEnd}
                  onChange={(e) => updateSetting('preferredEnd', e.target.value)}
                  className="input-field py-2.5"
                />
              )}
            </div>
          </div>

          {/* Duração dos Blocos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Duração Máxima do Bloco (min)
              </label>
              <input
                type="number"
                min="30"
                max="180"
                step="15"
                value={maxBlockMinutes}
                onChange={(e) => updateSetting('maxBlockMinutes', Number(e.target.value))}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Duração do Intervalo (min)
              </label>
              <input
                type="number"
                min="5"
                max="30"
                step="5"
                value={breakMinutes}
                onChange={(e) => updateSetting('breakMinutes', Number(e.target.value))}
                className="input-field"
              />
            </div>
          </div>

          {/* Dias de Descanso */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-3">
              Dias de Descanso (sem agendamento automático)
            </label>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
              {weekDays.map((day, index) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleExcludeDay(index)}
                  aria-pressed={excludeDays.includes(index)}
                  className={cn(
                    'w-full h-11 rounded-xl font-medium text-sm transition-all touch-manipulation active:scale-[0.99]',
                    excludeDays.includes(index)
                      ? 'bg-neon-purple/20 text-neon-violet border border-neon-purple/50'
                      : 'bg-card-bg text-text-secondary border border-card-border hover:border-neon-purple/30'
                  )}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-3">
              Dias extras para recuperação
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {weekDays.map((day, index) => {
                const enabled = backlogRecoveryDays.includes(index);
                const isStudyDay = !excludeDays.includes(index);

                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => {
                      if (!isStudyDay) toggleBacklogRecoveryDay(index);
                    }}
                    aria-pressed={isStudyDay || enabled}
                    disabled={isStudyDay}
                    className={cn(
                      'min-h-[58px] rounded-xl border px-3 py-2 text-left transition-all touch-manipulation active:scale-[0.99]',
                      isStudyDay
                        ? 'cursor-not-allowed border-emerald-400/25 bg-emerald-400/10 text-emerald-100'
                        : enabled
                        ? 'border-neon-cyan/60 bg-neon-cyan/15 text-white shadow-[0_0_0_1px_rgba(0,212,255,0.16)]'
                        : 'border-card-border bg-card-bg text-text-secondary hover:border-neon-cyan/30 hover:text-white'
                    )}
                  >
                    <span className="block text-sm font-semibold">{day}</span>
                    <span className="mt-0.5 block text-[11px] leading-tight text-text-muted">
                      {isStudyDay ? 'já estuda' : enabled ? 'recuperação' : 'descanso'}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-text-muted">
              Mantém a grade normal intacta, mas permite usar esses dias para pendências e
              reagendamentos quando você escolher.
            </p>
          </div>
        </div>
      </Card>

      {/* Configurações da IA */}
      <Card className={cn(activeSection === 'ai' ? 'block' : 'hidden')}>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-neon-cyan/20 flex items-center justify-center">
            <Brain className="w-5 h-5 text-neon-cyan" />
          </div>
          <div>
            <h2 className="text-lg font-heading font-bold text-white">
              Configurações da IA
            </h2>
            <p className="text-sm text-text-secondary">
              Personalize o comportamento da IA e agendamento
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Modo de Dificuldade */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-3">
              Modo de Dificuldade da IA
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {aiDifficultyOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => updateAiDifficulty(option.value)}
                  aria-pressed={settings.aiDifficulty === option.value}
                  className={cn(
                    'min-h-[84px] p-4 rounded-xl text-left transition-all touch-manipulation active:scale-[0.99]',
                    settings.aiDifficulty === option.value
                      ? 'bg-neon-cyan/20 border-2 border-neon-cyan'
                      : 'bg-card-bg border border-card-border hover:border-neon-cyan/30'
                  )}
                >
                  <div className="font-medium text-white mb-1">{option.label}</div>
                  <div className="text-xs text-text-muted">{option.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Configurações Toggle */}
          <div className="space-y-4">
            {[
              {
                key: 'focusMode' as const,
                label: 'Modo Foco',
                description: 'Blocos um pouco mais longos e pausas menores',
              },
              {
                key: 'autoSchedule' as const,
                label: 'Agendamento Automático',
                description: 'A IA cria automaticamente agendas semanais',
              },
              {
                key: 'smartBreaks' as const,
                label: 'Pausas Inteligentes',
                description: 'Ajusta pausas de acordo com o ritmo escolhido',
              },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => updateSetting(item.key, !settings[item.key])}
                aria-pressed={settings[item.key]}
                className="w-full flex items-center justify-between gap-3 p-4 rounded-xl bg-card-bg border border-card-border text-left touch-manipulation active:scale-[0.995]"
              >
                <div className="min-w-0 pr-2">
                  <div className="font-medium text-white">{item.label}</div>
                  <div className="text-sm text-text-secondary">
                    {item.description}
                  </div>
                </div>
                <span
                  aria-hidden
                  className={cn(
                    'relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors duration-200',
                    settings[item.key] ? 'bg-neon-cyan' : 'bg-card-border'
                  )}
                >
                  <span
                    className={cn(
                      'pointer-events-none inline-block h-5 w-5 rounded-full bg-white transition-transform duration-200',
                      settings[item.key] ? 'translate-x-8' : 'translate-x-1'
                    )}
                  />
                </span>
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Notificações */}
      <Card className={cn(activeSection === 'notifications' ? 'block' : 'hidden')}>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center">
            <Bell className="w-5 h-5 text-orange-500" />
          </div>
          <div>
            <h2 className="text-lg font-heading font-bold text-white">
              Notificações
            </h2>
            <p className="text-sm text-text-secondary">
              Gerencie suas preferências de notificação
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <SystemNotificationsCard />
          <div className="p-4 rounded-xl bg-card-bg border border-card-border space-y-4">
            <div>
              <div className="font-medium text-white">Notificações de estudo</div>
              <div className="text-sm text-text-secondary">
                Avisos dinâmicos baseados no horário real dos blocos da agenda.
              </div>
            </div>

            <button
              type="button"
              onClick={() => updateSetting('notificationsEnabled', !notificationsEnabled)}
              aria-pressed={notificationsEnabled}
              className="w-full flex items-center justify-between gap-3 p-4 rounded-xl bg-background-light border border-card-border text-left touch-manipulation active:scale-[0.995]"
            >
              <div className="min-w-0 pr-2">
                <div className="font-medium text-white">Ativar notificações por bloco</div>
                <div className="text-sm text-text-secondary">
                  Agenda alerta antes de cada sessão não concluída do dia.
                </div>
              </div>
              <span
                aria-hidden
                className={cn(
                  'relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors duration-200',
                  notificationsEnabled ? 'bg-orange-500' : 'bg-card-border'
                )}
              >
                <span
                  className={cn(
                    'pointer-events-none inline-block h-5 w-5 rounded-full bg-white transition-transform duration-200',
                    notificationsEnabled ? 'translate-x-8' : 'translate-x-1'
                  )}
                />
              </span>
            </button>

            <div className="space-y-2">
              <label className="text-sm text-text-secondary">
                Quantos minutos antes?
              </label>
              <div className="flex flex-wrap gap-2">
                {notificationLeadOptions.map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    onClick={() => updateSetting('notificationMinutesBefore', minutes)}
                    className={cn(
                      'rounded-lg border px-3 py-1.5 text-sm transition-colors',
                      notificationMinutesBefore === minutes
                        ? 'border-neon-cyan bg-neon-cyan/10 text-neon-cyan'
                        : 'border-card-border text-text-secondary hover:border-neon-cyan/40 hover:text-white'
                    )}
                  >
                    {minutes} min
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-secondary">Personalizado</span>
                <input
                  type="number"
                  min={1}
                  max={180}
                  value={notificationMinutesBefore}
                  onChange={(event) => {
                    const parsed = Number(event.target.value);
                    if (!Number.isFinite(parsed)) return;
                    updateSetting(
                      'notificationMinutesBefore',
                      Math.min(180, Math.max(1, Math.round(parsed)))
                    );
                  }}
                  className="input-field max-w-[110px] py-1.5 text-sm"
                />
                <span className="text-xs text-text-muted">1-180 min</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => updateSetting('backlogReminderEnabled', !backlogReminderEnabled)}
              aria-pressed={backlogReminderEnabled}
              className="w-full flex items-center justify-between gap-3 p-4 rounded-xl bg-background-light border border-card-border text-left touch-manipulation active:scale-[0.995]"
            >
              <div className="min-w-0 pr-2">
                <div className="font-medium text-white">Avisar backlog acumulado</div>
                <div className="text-sm text-text-secondary">
                  Envia alerta quando houver pendências vencidas para replanejar.
                </div>
              </div>
              <span
                aria-hidden
                className={cn(
                  'relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors duration-200',
                  backlogReminderEnabled ? 'bg-orange-500' : 'bg-card-border'
                )}
              >
                <span
                  className={cn(
                    'pointer-events-none inline-block h-5 w-5 rounded-full bg-white transition-transform duration-200',
                    backlogReminderEnabled ? 'translate-x-8' : 'translate-x-1'
                  )}
                />
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                updateSetting('notificationSoundEnabled', !notificationSoundEnabled)
              }
              aria-pressed={notificationSoundEnabled}
              className="w-full flex items-center justify-between gap-3 p-4 rounded-xl bg-background-light border border-card-border text-left touch-manipulation active:scale-[0.995]"
            >
              <div className="min-w-0 pr-2">
                <div className="font-medium text-white">Som nas notificações</div>
                <div className="text-sm text-text-secondary">
                  Mantém áudio ativo nos alertas de estudo deste dispositivo.
                </div>
              </div>
              <span
                aria-hidden
                className={cn(
                  'relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors duration-200',
                  notificationSoundEnabled ? 'bg-orange-500' : 'bg-card-border'
                )}
              >
                <span
                  className={cn(
                    'pointer-events-none inline-block h-5 w-5 rounded-full bg-white transition-transform duration-200',
                    notificationSoundEnabled ? 'translate-x-8' : 'translate-x-1'
                  )}
                />
              </span>
            </button>
          </div>

          {[
            {
              key: 'dailyReminder' as const,
              label: 'Lembrete Diário de Estudo',
              description: 'Receba notificações sobre sua agenda diária',
            },
            {
              key: 'streakReminder' as const,
              label: 'Lembrete de Sequência',
              description: 'Avise-me antes da sequência estar em risco',
            },
            {
              key: 'achievementAlerts' as const,
              label: 'Alertas de Conquistas',
              description: 'Notificar quando desbloquear novas conquistas',
            },
            {
              key: 'weeklyReport' as const,
              label: 'Relatório Semanal',
              description: 'Receber resumo semanal de desempenho',
            },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => updateSetting(item.key, !settings[item.key])}
                aria-pressed={settings[item.key]}
                className="w-full flex items-center justify-between gap-3 p-4 rounded-xl bg-card-bg border border-card-border text-left touch-manipulation active:scale-[0.995]"
              >
                <div className="min-w-0 pr-2">
                  <div className="font-medium text-white">{item.label}</div>
                  <div className="text-sm text-text-secondary">
                    {item.description}
                  </div>
                </div>
                <span
                  aria-hidden
                  className={cn(
                    'relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors duration-200',
                    settings[item.key] ? 'bg-orange-500' : 'bg-card-border'
                  )}
                >
                  <span
                    className={cn(
                      'pointer-events-none inline-block h-5 w-5 rounded-full bg-white transition-transform duration-200',
                      settings[item.key] ? 'translate-x-8' : 'translate-x-1'
                    )}
                  />
                </span>
              </button>
            ))}
          <div className="p-4 rounded-xl bg-card-bg border border-card-border space-y-4">
            <div>
              <div className="font-medium text-white">Som do alarme</div>
              <div className="text-sm text-text-secondary">
                Escolha o som usado quando um bloco terminar
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {alarmSoundOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setPendingAlarmSound(option.value)}
                  aria-pressed={(pendingAlarmSound || 'pulse') === option.value}
                  className={cn(
                    'rounded-xl border px-4 py-3 text-left transition touch-manipulation active:scale-[0.99]',
                    (pendingAlarmSound || 'pulse') === option.value
                      ? 'border-neon-cyan bg-neon-cyan/10 text-white'
                      : 'border-slate-800 text-text-secondary hover:border-neon-cyan/60'
                  )}
                >
                  <div className="font-semibold">{option.label}</div>
                  <div className="text-xs text-text-muted mt-1">{option.description}</div>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="secondary"
                onClick={() => playAlarmPreview(pendingAlarmSound || 'pulse')}
              >
                Ouvir antes
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  updateSetting('alarmSound', pendingAlarmSound || 'pulse');
                  setAlarmApplied(true);
                }}
              >
                {alarmApplied ? 'Aplicado' : 'Aplicar som'}
              </Button>
              <AnimatePresence>
                {alarmApplied && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.96 }}
                    className="flex items-center gap-2 text-neon-cyan text-xs"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Som aplicado com sucesso
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </Card>

      {/* Progresso na nuvem */}
      <Card className={cn(activeSection === 'study' ? 'block' : 'hidden')}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/25 flex items-center justify-center">
            <UploadCloud className="w-5 h-5 text-cyan-300" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-heading font-bold text-white">Progresso na nuvem</h2>
            <p className="text-sm text-text-secondary">
              Envia só o que mudou e mantém celular e computador iguais
            </p>
          </div>
        </div>

        {isLocalDemoAuthEnabled ? (
          <p className="text-xs sm:text-sm text-text-secondary">
            No modo demo o progresso fica apenas neste navegador. Entre com uma conta para
            sincronizar entre aparelhos.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-3 text-xs sm:text-sm text-text-secondary">
              {syncStatus?.at ? (
                <>
                  Última sincronização:{' '}
                  <span className="text-white">
                    {formatDate(new Date(syncStatus.at), 'short')} às{' '}
                    {new Date(syncStatus.at).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  {typeof syncStatus.bytesUp === 'number' && (
                    <> · {((syncStatus.bytesUp ?? 0) / 1024).toFixed(1)} KB enviados</>
                  )}
                  {syncStatus.ok === false && (
                    <span className="block text-amber-300 mt-1">
                      {syncStatus.error ?? 'Última tentativa falhou.'}
                    </span>
                  )}
                </>
              ) : (
                <>Ainda não sincronizou nesta sessão. O envio acontece sozinho a cada alteração.</>
              )}
            </div>

            <Button
              variant="secondary"
              className="w-full border-cyan-500/35 text-cyan-200 hover:bg-cyan-500/10"
              onClick={handleSyncNow}
              loading={isSyncingNow}
              leftIcon={<RefreshCw className="w-4 h-4" />}
            >
              Sincronizar agora
            </Button>

            {syncFeedback && <p className="text-xs text-text-secondary">{syncFeedback}</p>}
          </div>
        )}
      </Card>

      {/* Zona de Perigo */}
      <Card
        className={cn(
          'border-red-500/35 bg-gradient-to-br from-red-950/20 via-background-light to-background-light',
          activeSection === 'danger' ? 'block' : 'hidden',
          ''
        )}
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-red-500/20 border border-red-500/25 flex items-center justify-center">
            <Shield className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h2 className="text-lg font-heading font-bold text-white">
              Zona de Perigo
            </h2>
            <p className="text-sm text-text-secondary">
              Ações irreversíveis
            </p>
          </div>
          <Badge variant="danger" size="sm">Irreversível</Badge>
        </div>

        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.06] p-3 mb-4">
          <p className="text-xs sm:text-sm text-red-200/85 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-300 shrink-0" />
            Revise antes de confirmar. Algumas ações removem dados permanentemente.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Button
            variant="ghost"
            className="w-full border border-slate-700 text-slate-200 hover:bg-slate-800/70"
            onClick={handleSignOut}
            loading={isSigningOut}
            leftIcon={<LogOut className="w-4 h-4" />}
          >
            Sair da Conta
          </Button>

          {resetTutorialStep === 'idle' ? (
            <Button
              variant="secondary"
              className="w-full border-orange-500/35 text-orange-300 hover:bg-orange-500/10"
              onClick={startResetTutorialFlow}
              leftIcon={<RotateCcw className="w-4 h-4" />}
            >
              Reiniciar Tutorial
            </Button>
          ) : (
            <div className="rounded-xl border border-orange-500/25 bg-orange-500/[0.06] p-3 space-y-2">
              <p className="text-xs text-orange-200/80">Etapa 2 de 2: confirmar reinício do tutorial.</p>
              <div className="grid grid-cols-1 gap-2">
                <Button
                  variant="ghost"
                  className="w-full border border-slate-700 text-slate-200"
                  onClick={cancelResetTutorialFlow}
                  disabled={isResettingTutorial}
                >
                  Cancelar
                </Button>
                <Button
                  variant="secondary"
                  className="w-full border-orange-500/35 text-orange-300 hover:bg-orange-500/10"
                  onClick={confirmResetTutorial}
                  loading={isResettingTutorial}
                  leftIcon={<RotateCcw className="w-4 h-4" />}
                >
                  Confirmar
                </Button>
              </div>
            </div>
          )}

          {resetProgressStep === 'idle' ? (
            <Button
              variant="secondary"
              className="w-full sm:col-span-2 border-red-500/35 text-red-300 hover:bg-red-500/10"
              onClick={startResetProgressFlow}
              leftIcon={<RefreshCw className="w-4 h-4" />}
            >
              Resetar Todo o Progresso
            </Button>
          ) : (
            <div className="sm:col-span-2 rounded-xl border border-red-500/25 bg-red-500/[0.06] p-3 space-y-2">
              <p className="text-xs text-red-200/80">Etapa 2 de 2: confirmar reset do progresso.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Button
                  variant="ghost"
                  className="w-full border border-slate-700 text-slate-200"
                  onClick={cancelResetProgressFlow}
                  disabled={isResettingProgress}
                >
                  Cancelar
                </Button>
                <Button
                  variant="danger"
                  className="w-full"
                  onClick={confirmResetProgress}
                  loading={isResettingProgress}
                  leftIcon={<RefreshCw className="w-4 h-4" />}
                >
                  Confirmar reset
                </Button>
              </div>
            </div>
          )}
        </div>

        {generalDangerFeedback && (
          <p
            className={cn(
              'mt-3 text-xs',
              generalDangerFeedback.type === 'error' ? 'text-red-300' : 'text-neon-cyan'
            )}
          >
            {generalDangerFeedback.message}
          </p>
        )}

        <div className="mt-4 rounded-xl border border-red-500/35 bg-red-950/20 p-4 space-y-3">
          <div className="flex items-center gap-2 text-red-200">
            <Trash2 className="w-4 h-4" />
            <p className="text-sm font-semibold">Excluir conta permanentemente</p>
          </div>

          {deleteStep === 'idle' ? (
            <>
              <p className="text-xs text-red-200/80">Etapa 1 de 2: iniciar exclusão da conta.</p>
              <Button
                variant="danger"
                className="w-full"
                onClick={startDeleteFlow}
                leftIcon={<Trash2 className="w-4 h-4" />}
              >
                Iniciar exclusão
              </Button>
            </>
          ) : (
            <>
              <p className="text-xs text-red-200/80">
                Etapa 2 de 2: digite <span className="font-semibold text-red-100">EXCLUIR</span> para confirmar.
              </p>
              <input
                ref={deleteInputRef}
                autoFocus
                type="text"
                value={deleteConfirmText}
                onChange={(e) => {
                  setDeleteConfirmText(e.target.value);
                  if (deleteFeedback) setDeleteFeedback(null);
                }}
                disabled={isDeletingAccount}
                placeholder="Digite EXCLUIR"
                className="input-field border-red-500/30 focus:border-red-400 focus:shadow-none"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Button
                  variant="ghost"
                  className="w-full border border-slate-700 text-slate-200"
                  onClick={cancelDeleteFlow}
                  disabled={isDeletingAccount}
                >
                  Cancelar
                </Button>
                <Button
                  variant="danger"
                  className="w-full"
                  onClick={handleDeleteAccount}
                  loading={isDeletingAccount}
                  leftIcon={<Trash2 className="w-4 h-4" />}
                >
                  Confirmar exclusão
                </Button>
              </div>
            </>
          )}
          {deleteFeedback && (
            <p
              className={cn(
                'text-xs',
                deleteFeedback.type === 'error' ? 'text-red-300' : 'text-neon-cyan'
              )}
            >
              {deleteFeedback.message}
            </p>
          )}
        </div>
      </Card>
        </motion.div>
      </AnimatePresence>
      </div>
    </motion.div>
  );
}
