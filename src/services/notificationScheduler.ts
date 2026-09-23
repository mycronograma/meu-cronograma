import { getStudyBlockDisplayTitle } from '@/lib/studyBlockLabels';
import type { StudyBlock, UserSettings } from '@/types';
import { getBacklogEntries } from '@/services/backlogRescheduler';
import { parseBlockDate } from '@/lib/utils';

export interface StudyNotificationSettings {
  notificationsEnabled: boolean;
  notificationMinutesBefore: number;
  notificationSoundEnabled: boolean;
  backlogReminderEnabled: boolean;
}

export interface StudyNotificationPreview {
  isActive: boolean;
  reason:
    | 'disabled'
    | 'break'
    | 'completed'
    | 'not_today'
    | 'invalid_time'
    | 'already_due'
    | 'scheduled';
  startAt: Date | null;
  notifyAt: Date | null;
  minutesBefore: number;
}

export interface StudyNotificationScheduleResult {
  scheduledCount: number;
  backlogReminderScheduled: boolean;
  permission: NotificationPermission | 'unsupported';
  reason:
    | 'ok'
    | 'disabled'
    | 'unsupported'
    | 'permission_required'
    | 'permission_denied';
}

interface StudyNotificationSchedulerInput {
  blocks: StudyBlock[];
  settings: Pick<
    UserSettings,
    | 'notificationsEnabled'
    | 'notificationMinutesBefore'
    | 'notificationSoundEnabled'
    | 'backlogReminderEnabled'
  >;
  now?: Date;
}

const MIN_NOTIFICATION_MINUTES = 1;
const MAX_NOTIFICATION_MINUTES = 180;
const BACKLOG_REMINDER_LOCAL_KEY = 'nexora_backlog_notification_day';

const schedulerState = {
  timers: new Map<string, ReturnType<typeof setTimeout>>(),
  backlogTimer: null as ReturnType<typeof setTimeout> | null,
};

const toLocalKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;

const normalizeMinutesBefore = (value: number | undefined | null) => {
  if (!Number.isFinite(value)) return 15;
  return Math.min(MAX_NOTIFICATION_MINUTES, Math.max(MIN_NOTIFICATION_MINUTES, Math.round(value as number)));
};

const resolveSettings = (
  settings: Pick<
    UserSettings,
    | 'notificationsEnabled'
    | 'notificationMinutesBefore'
    | 'notificationSoundEnabled'
    | 'backlogReminderEnabled'
  >
): StudyNotificationSettings => ({
  notificationsEnabled: Boolean(settings.notificationsEnabled),
  notificationMinutesBefore: normalizeMinutesBefore(settings.notificationMinutesBefore),
  notificationSoundEnabled: settings.notificationSoundEnabled !== false,
  backlogReminderEnabled: Boolean(settings.backlogReminderEnabled),
});

const resolveBlockStartDate = (block: StudyBlock): Date | null => {
  const date = parseBlockDate(block.date);
  if (Number.isNaN(date.getTime())) return null;

  const [hourString, minuteString] = block.startTime.split(':');
  const hour = Number(hourString);
  const minute = Number(minuteString);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;

  const start = new Date(date);
  start.setHours(hour, minute, 0, 0);
  return Number.isNaN(start.getTime()) ? null : start;
};

const buildNotificationBody = (block: StudyBlock, startAt: Date, minutesBefore: number) => {
  const title = getStudyBlockDisplayTitle(block);
  const start = `${String(startAt.getHours()).padStart(2, '0')}:${String(startAt.getMinutes()).padStart(2, '0')}`;
  return `${title} comeca as ${start}. Falta ${minutesBefore} min para iniciar.`;
};

const showStudyNotification = async ({
  title,
  body,
  tag,
  silent,
}: {
  title: string;
  body: string;
  tag: string;
  silent: boolean;
}) => {
  if (typeof window === 'undefined') return;
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const options: NotificationOptions = {
    body,
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag,
    silent,
    data: {
      url: '/planner',
    },
  };

  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.showNotification(title, options);
        return;
      }
    }

    new Notification(title, options);
  } catch (error) {
    console.warn('Falha ao exibir notificacao de estudo:', error);
  }
};

export const clearStudyNotificationSchedule = () => {
  schedulerState.timers.forEach((timerId) => clearTimeout(timerId));
  schedulerState.timers.clear();

  if (schedulerState.backlogTimer) {
    clearTimeout(schedulerState.backlogTimer);
    schedulerState.backlogTimer = null;
  }
};

export const getStudyBlockNotificationPreview = (
  block: StudyBlock,
  settings: Pick<UserSettings, 'notificationsEnabled' | 'notificationMinutesBefore'>,
  now = new Date()
): StudyNotificationPreview => {
  const normalizedMinutes = normalizeMinutesBefore(settings.notificationMinutesBefore);

  if (!settings.notificationsEnabled) {
    return {
      isActive: false,
      reason: 'disabled',
      startAt: null,
      notifyAt: null,
      minutesBefore: normalizedMinutes,
    };
  }

  if (block.isBreak) {
    return {
      isActive: false,
      reason: 'break',
      startAt: null,
      notifyAt: null,
      minutesBefore: normalizedMinutes,
    };
  }

  if (block.status === 'completed') {
    return {
      isActive: false,
      reason: 'completed',
      startAt: null,
      notifyAt: null,
      minutesBefore: normalizedMinutes,
    };
  }

  const startAt = resolveBlockStartDate(block);
  if (!startAt) {
    return {
      isActive: false,
      reason: 'invalid_time',
      startAt: null,
      notifyAt: null,
      minutesBefore: normalizedMinutes,
    };
  }

  const nowDayKey = toLocalKey(now);
  if (toLocalKey(startAt) !== nowDayKey) {
    return {
      isActive: false,
      reason: 'not_today',
      startAt,
      notifyAt: null,
      minutesBefore: normalizedMinutes,
    };
  }

  const notifyAt = new Date(startAt.getTime() - normalizedMinutes * 60_000);
  if (notifyAt.getTime() <= now.getTime()) {
    return {
      isActive: false,
      reason: 'already_due',
      startAt,
      notifyAt,
      minutesBefore: normalizedMinutes,
    };
  }

  return {
    isActive: true,
    reason: 'scheduled',
    startAt,
    notifyAt,
    minutesBefore: normalizedMinutes,
  };
};

export const recalculateStudyNotificationSchedule = ({
  blocks,
  settings,
  now = new Date(),
}: StudyNotificationSchedulerInput): StudyNotificationScheduleResult => {
  clearStudyNotificationSchedule();

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return {
      scheduledCount: 0,
      backlogReminderScheduled: false,
      permission: 'unsupported',
      reason: 'unsupported',
    };
  }

  if (!('Notification' in window)) {
    return {
      scheduledCount: 0,
      backlogReminderScheduled: false,
      permission: 'unsupported',
      reason: 'unsupported',
    };
  }

  const normalized = resolveSettings(settings);
  if (!normalized.notificationsEnabled) {
    return {
      scheduledCount: 0,
      backlogReminderScheduled: false,
      permission: Notification.permission,
      reason: 'disabled',
    };
  }

  if (Notification.permission === 'denied') {
    return {
      scheduledCount: 0,
      backlogReminderScheduled: false,
      permission: 'denied',
      reason: 'permission_denied',
    };
  }

  if (Notification.permission !== 'granted') {
    return {
      scheduledCount: 0,
      backlogReminderScheduled: false,
      permission: Notification.permission,
      reason: 'permission_required',
    };
  }

  const scheduledCandidates = blocks
    .map((block) => ({ block, preview: getStudyBlockNotificationPreview(block, normalized, now) }))
    .filter((entry) => entry.preview.isActive && entry.preview.notifyAt && entry.preview.startAt)
    .sort((a, b) => (a.preview.notifyAt as Date).getTime() - (b.preview.notifyAt as Date).getTime());

  let scheduledCount = 0;

  for (const entry of scheduledCandidates) {
    const notifyAt = entry.preview.notifyAt as Date;
    const startAt = entry.preview.startAt as Date;
    const timeoutMs = notifyAt.getTime() - now.getTime();

    if (timeoutMs <= 0) continue;

    const timerId = setTimeout(() => {
      const blockTitle = getStudyBlockDisplayTitle(entry.block);
      void showStudyNotification({
        title: `Proxima sessao: ${blockTitle}`,
        body: buildNotificationBody(entry.block, startAt, entry.preview.minutesBefore),
        tag: `study-block-${entry.block.id}-${notifyAt.getTime()}`,
        silent: !normalized.notificationSoundEnabled,
      });
    }, timeoutMs);

    schedulerState.timers.set(entry.block.id, timerId);
    scheduledCount += 1;
  }

  let backlogReminderScheduled = false;

  if (normalized.backlogReminderEnabled) {
    const todayKey = toLocalKey(now);
    const lastBacklogReminderDay = window.localStorage.getItem(BACKLOG_REMINDER_LOCAL_KEY) || '';
    const backlogEntries = getBacklogEntries(blocks, now);
    const overdueCount = backlogEntries.filter((entry) => entry.dateKey < todayKey).length;

    if (overdueCount > 0 && lastBacklogReminderDay !== todayKey) {
      schedulerState.backlogTimer = setTimeout(() => {
        void showStudyNotification({
          title: 'Backlog acumulado',
          body: `Voce tem ${overdueCount} pendencia(s) vencida(s). Replaneje sua agenda hoje.`,
          tag: `study-backlog-${todayKey}`,
          silent: !normalized.notificationSoundEnabled,
        });
      }, 1_500);
      window.localStorage.setItem(BACKLOG_REMINDER_LOCAL_KEY, todayKey);
      backlogReminderScheduled = true;
    }
  }

  return {
    scheduledCount,
    backlogReminderScheduled,
    permission: Notification.permission,
    reason: 'ok',
  };
};

