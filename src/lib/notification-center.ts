import { prisma } from '@/lib/prisma';
import { hasWebPush } from '@/lib/env';
import { sendWebPushNotification } from '@/lib/web-push';
import { parseBlockDate } from '@/lib/utils';
import type { Prisma } from '@prisma/client';

export type NotificationType =
  | 'daily'
  | 'streak'
  | 'weekly'
  | 'achievement'
  | 'study'
  | 'backlog'
  | 'system';

interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message?: string;
  url?: string;
  dedupeKey?: string;
  metadata?: Prisma.JsonObject;
  sendPush?: boolean;
}

interface WebPushError extends Error {
  statusCode?: number;
}

const STUDY_NOTIFICATION_DISPATCH_WINDOW_MINUTES = 15;
const BLOCK_LOOKAROUND_HOURS = 36;

const toUtcDayStart = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const toDayKey = (date: Date) => {
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${date.getUTCDate()}`.padStart(2, '0');
  return `${date.getUTCFullYear()}-${month}-${day}`;
};

const toIsoWeekKey = (date: Date) => {
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${utcDate.getUTCFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
};

const formatHoursFromMinutes = (minutes: number) => {
  const safeMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const remainingMinutes = safeMinutes % 60;
  if (safeMinutes < 60) return `${safeMinutes} min`;
  return `${hours}:${String(remainingMinutes).padStart(2, '0')}`;
};

const formatClock = (date: Date) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

const resolveBlockStartDateTime = (date: Date, startTime: string) => {
  const [hourValue, minuteValue] = startTime.split(':').map(Number);
  if (!Number.isFinite(hourValue) || !Number.isFinite(minuteValue)) return null;
  const startAt = new Date(date);
  startAt.setHours(hourValue, minuteValue, 0, 0);
  return Number.isNaN(startAt.getTime()) ? null : startAt;
};

const buildStudyBlockLabel = (subjectName: string | null | undefined, blockType: string | null) => {
  const baseName = subjectName?.trim() || 'Sessão de estudo';
  if (!blockType) return baseName;

  const typeLabelMap: Record<string, string> = {
    AULA: 'Aula',
    EXERCICIOS: 'Exercícios',
    REVISAO: 'Revisão',
    SIMULADO_AREA: 'Simulado',
    SIMULADO_COMPLETO: 'Simulado completo',
    ANALISE: 'Análise',
  };

  const typeLabel = typeLabelMap[blockType] || 'Sessão';
  return `${baseName} - ${typeLabel}`;
};

interface ScheduledNotificationBlockCandidate {
  id: string;
  date: Date;
  startTime: string;
  type: string | null;
  subjectName?: string | null;
}

interface SnapshotStudySignals {
  studiedToday: boolean;
  weekMinutes: number;
  weekSessions: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseDateKeyToUtc = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  const utc = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(utc.getTime()) ? null : utc;
};

const toLocalDayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;

const extractStudySignalsFromSnapshot = async ({
  userId,
  todayKeyUtc,
  todayLocalKey,
  todayStartUtc,
  tomorrowStartUtc,
  weekStartUtc,
  weekEndUtc,
}: {
  userId: string;
  todayKeyUtc: string;
  todayLocalKey: string;
  todayStartUtc: Date;
  tomorrowStartUtc: Date;
  weekStartUtc: Date;
  weekEndUtc: Date;
}): Promise<SnapshotStudySignals> => {
  const snapshot = await prisma.userProgressSnapshot.findUnique({
    where: { userId },
    select: { payload: true },
  });

  const payload = snapshot?.payload;
  if (!payload || !isRecord(payload)) {
    return { studiedToday: false, weekMinutes: 0, weekSessions: 0 };
  }

  let studiedToday = false;
  let analyticsWeekMinutes = 0;
  let analyticsWeekSessions = 0;
  let blockWeekMinutes = 0;
  let blockWeekSessions = 0;

  const analyticsRaw = payload.nexora_analytics;
  if (isRecord(analyticsRaw) && isRecord(analyticsRaw.daily)) {
    for (const [dateKey, record] of Object.entries(analyticsRaw.daily)) {
      if (!isRecord(record)) continue;

      const hours = typeof record.hours === 'number' && Number.isFinite(record.hours) ? record.hours : 0;
      const sessions = typeof record.sessions === 'number' && Number.isFinite(record.sessions) ? record.sessions : 0;

      if ((dateKey === todayKeyUtc || dateKey === todayLocalKey) && (hours > 0 || sessions > 0)) {
        studiedToday = true;
      }

      const parsedKeyUtc = parseDateKeyToUtc(dateKey);
      if (!parsedKeyUtc) continue;
      if (parsedKeyUtc < weekStartUtc || parsedKeyUtc >= weekEndUtc) continue;

      analyticsWeekMinutes += Math.max(0, Math.round(hours * 60));
      analyticsWeekSessions += Math.max(0, Math.round(sessions));
    }
  }

  const blocksRaw = payload.nexora_planner_blocks;
  if (Array.isArray(blocksRaw)) {
    blocksRaw.forEach((rawBlock) => {
      if (!isRecord(rawBlock)) return;
      if (rawBlock.isBreak === true) return;
      if (rawBlock.status !== 'completed') return;

      const completedAtRaw = rawBlock.completedAt;
      const fallbackDateRaw = rawBlock.date;
      const reference =
        typeof completedAtRaw === 'string'
          ? completedAtRaw
          : typeof fallbackDateRaw === 'string'
            ? fallbackDateRaw
            : null;
      if (!reference) return;

      const completedAt = new Date(reference);
      if (Number.isNaN(completedAt.getTime())) return;

      const minutesRaw = rawBlock.durationMinutes;
      const minutes =
        typeof minutesRaw === 'number' && Number.isFinite(minutesRaw) ? Math.max(0, Math.round(minutesRaw)) : 0;

      if (completedAt >= todayStartUtc && completedAt < tomorrowStartUtc) {
        studiedToday = true;
      }

      if (completedAt >= weekStartUtc && completedAt < weekEndUtc) {
        blockWeekMinutes += minutes;
        blockWeekSessions += 1;
      }
    });
  }

  const hasAnalyticsWeeklyData = analyticsWeekMinutes > 0 || analyticsWeekSessions > 0;
  const weekMinutes = hasAnalyticsWeeklyData ? analyticsWeekMinutes : blockWeekMinutes;
  const weekSessions = hasAnalyticsWeeklyData ? analyticsWeekSessions : blockWeekSessions;

  return { studiedToday, weekMinutes, weekSessions };
};

const extractCandidatesFromProgressSnapshot = async ({
  userId,
  rangeStart,
  rangeEnd,
}: {
  userId: string;
  rangeStart: Date;
  rangeEnd: Date;
}): Promise<ScheduledNotificationBlockCandidate[]> => {
  const snapshot = await prisma.userProgressSnapshot.findUnique({
    where: { userId },
    select: { payload: true },
  });

  const payload = snapshot?.payload;
  if (!payload || !isRecord(payload)) return [];

  const rawBlocks = payload.nexora_planner_blocks;
  if (!Array.isArray(rawBlocks) || rawBlocks.length === 0) return [];

  const acceptedStatuses = new Set(['scheduled', 'rescheduled']);
  const normalized: ScheduledNotificationBlockCandidate[] = [];
  const seen = new Set<string>();

  rawBlocks.forEach((rawBlock, index) => {
    if (!isRecord(rawBlock)) return;

    if (rawBlock.isBreak === true) return;
    if (typeof rawBlock.status !== 'string' || !acceptedStatuses.has(rawBlock.status)) return;

    const rawDate = rawBlock.date;
    const parsedDate = new Date(typeof rawDate === 'string' || rawDate instanceof Date ? rawDate : Number.NaN);
    if (Number.isNaN(parsedDate.getTime())) return;
    if (parsedDate < rangeStart || parsedDate > rangeEnd) return;

    const startTime = typeof rawBlock.startTime === 'string' ? rawBlock.startTime : '';
    if (!/^\d{2}:\d{2}$/.test(startTime)) return;

    const rawType = rawBlock.type;
    const type = typeof rawType === 'string' ? rawType : null;
    const rawId = typeof rawBlock.id === 'string' && rawBlock.id.trim().length > 0
      ? rawBlock.id.trim()
      : `snapshot-${parsedDate.toISOString()}-${startTime}-${index}`;

    const subjectName = isRecord(rawBlock.subject) && typeof rawBlock.subject.name === 'string'
      ? rawBlock.subject.name
      : null;

    if (seen.has(rawId)) return;
    seen.add(rawId);

    normalized.push({
      id: rawId,
      date: parsedDate,
      startTime,
      type,
      subjectName,
    });
  });

  return normalized;
};

const extractOverdueBacklogCountFromProgressSnapshot = async ({
  userId,
  todayStart,
}: {
  userId: string;
  todayStart: Date;
}): Promise<number> => {
  const snapshot = await prisma.userProgressSnapshot.findUnique({
    where: { userId },
    select: { payload: true },
  });

  const payload = snapshot?.payload;
  if (!payload || !isRecord(payload)) return 0;

  const rawBlocks = payload.nexora_planner_blocks;
  if (!Array.isArray(rawBlocks) || rawBlocks.length === 0) return 0;

  const backlogStatuses = new Set(['scheduled', 'rescheduled', 'skipped', 'in-progress']);

  return rawBlocks.reduce<number>((count, rawBlock) => {
    if (!isRecord(rawBlock)) return count;
    if (rawBlock.isBreak === true) return count;
    if (typeof rawBlock.status !== 'string' || !backlogStatuses.has(rawBlock.status)) return count;

    const rawDate = rawBlock.date;
    const blockDate = new Date(
      typeof rawDate === 'string' || rawDate instanceof Date ? rawDate : Number.NaN
    );
    if (Number.isNaN(blockDate.getTime())) return count;
    if (blockDate >= todayStart) return count;

    return count + 1;
  }, 0);
};

const dispatchScheduledStudyNotifications = async ({
  userId,
  firstName,
  now,
  todayKey,
  todayStart,
  notificationsEnabled,
  notificationMinutesBefore,
  backlogReminderEnabled,
}: {
  userId: string;
  firstName: string;
  now: Date;
  todayKey: string;
  todayStart: Date;
  notificationsEnabled: boolean;
  notificationMinutesBefore: number;
  backlogReminderEnabled: boolean;
}) => {
  if (!notificationsEnabled) {
    return 0;
  }

  const sanitizedMinutesBefore = Math.min(
    180,
    Math.max(1, Math.round(notificationMinutesBefore ?? 15))
  );
  const rangeStart = new Date(now.getTime() - BLOCK_LOOKAROUND_HOURS * 60 * 60 * 1000);
  const rangeEnd = new Date(now.getTime() + BLOCK_LOOKAROUND_HOURS * 60 * 60 * 1000);
  const dispatchWindowMs = STUDY_NOTIFICATION_DISPATCH_WINDOW_MINUTES * 60 * 1000;

  let createdCount = 0;

  const dbBlocks = await prisma.studyBlock.findMany({
    where: {
      userId,
      isBreak: false,
      status: {
        in: ['scheduled', 'rescheduled'],
      },
      date: {
        gte: rangeStart,
        lte: rangeEnd,
      },
    },
    select: {
      id: true,
      date: true,
      startTime: true,
      type: true,
      subject: {
        select: {
          name: true,
        },
      },
    },
  });

  const snapshotBlocks = await extractCandidatesFromProgressSnapshot({
    userId,
    rangeStart,
    rangeEnd,
  });

  const candidateBlocks: ScheduledNotificationBlockCandidate[] = [];
  const seenIds = new Set<string>();

  dbBlocks.forEach((block) => {
    if (seenIds.has(block.id)) return;
    seenIds.add(block.id);
    candidateBlocks.push({
      id: block.id,
      date: parseBlockDate(block.date),
      startTime: block.startTime,
      type: block.type,
      subjectName: block.subject?.name,
    });
  });

  snapshotBlocks.forEach((block) => {
    if (seenIds.has(block.id)) return;
    seenIds.add(block.id);
    candidateBlocks.push(block);
  });

  for (const block of candidateBlocks) {
    const startAt = resolveBlockStartDateTime(block.date, block.startTime);
    if (!startAt) continue;

    const notifyAt = new Date(startAt.getTime() - sanitizedMinutesBefore * 60 * 1000);
    const delayMs = now.getTime() - notifyAt.getTime();

    if (delayMs < 0 || delayMs > dispatchWindowMs) continue;

    const label = buildStudyBlockLabel(block.subjectName, block.type ?? null);
    const result = await createNotificationForUser({
      userId,
      type: 'study',
      title: 'Lembrete de estudo',
      message: `${firstName}, ${label} comeca as ${formatClock(startAt)}.`,
      url: '/planner',
      dedupeKey: `study:block:${block.id}:${sanitizedMinutesBefore}:${notifyAt.toISOString()}`,
      sendPush: true,
      metadata: {
        source: 'cron_block_scheduler',
        blockId: block.id,
        notifyAtIso: notifyAt.toISOString(),
        blockStartIso: startAt.toISOString(),
        minutesBefore: sanitizedMinutesBefore,
      },
    });

    if (result.created) {
      createdCount += 1;
    }
  }

  if (backlogReminderEnabled) {
    let overdueBacklogCount = await prisma.studyBlock.count({
      where: {
        userId,
        isBreak: false,
        status: {
          in: ['scheduled', 'rescheduled', 'skipped', 'in-progress'],
        },
        date: {
          lt: todayStart,
        },
      },
    });

    if (overdueBacklogCount === 0) {
      overdueBacklogCount = await extractOverdueBacklogCountFromProgressSnapshot({
        userId,
        todayStart,
      });
    }

    if (overdueBacklogCount > 0) {
      const backlogResult = await createNotificationForUser({
        userId,
        type: 'backlog',
        title: 'Pendências acumuladas',
        message: `${firstName}, você tem ${overdueBacklogCount} pendência(s) vencida(s). Replaneje sua agenda hoje.`,
        url: '/planner',
        dedupeKey: `backlog:auto:${todayKey}`,
        sendPush: true,
        metadata: {
          source: 'cron_backlog_scheduler',
          overdueBacklogCount,
        },
      });

      if (backlogResult.created) {
        createdCount += 1;
      }
    }
  }

  return createdCount;
};

const pushToUser = async ({
  userId,
  title,
  body,
  url,
  tag,
}: {
  userId: string;
  title: string;
  body: string;
  url?: string;
  tag: string;
}) => {
  if (!hasWebPush) return 0;

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
    select: {
      endpoint: true,
      p256dh: true,
      auth: true,
    },
  });

  if (subscriptions.length === 0) return 0;

  let deliveredCount = 0;

  for (const subscription of subscriptions) {
    try {
      await sendWebPushNotification({
        subscription: {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        payload: {
          title,
          body,
          url: url || '/dashboard',
          tag,
        },
      });
      deliveredCount += 1;
    } catch (error) {
      const typedError = error as WebPushError;
      if (typedError.statusCode === 404 || typedError.statusCode === 410) {
        await prisma.pushSubscription.deleteMany({
          where: { endpoint: subscription.endpoint },
        });
      } else {
        console.error('Erro ao enviar push:', error);
      }
    }
  }

  return deliveredCount;
};

export const createNotificationForUser = async ({
  userId,
  type,
  title,
  message,
  url,
  dedupeKey,
  metadata,
  sendPush = false,
}: CreateNotificationInput) => {
  if (dedupeKey) {
    const existing = await prisma.userNotification.findUnique({
      where: {
        userId_dedupeKey: {
          userId,
          dedupeKey,
        },
      },
    });

    if (existing) {
      return { notification: existing, created: false, pushDelivered: 0 };
    }
  }

  const notification = await prisma.userNotification.create({
    data: {
      userId,
      type,
      title,
      message,
      url,
      dedupeKey,
      metadata,
    },
  });

  let pushDelivered = 0;

  if (sendPush) {
    pushDelivered = await pushToUser({
      userId,
      title,
      body: message || title,
      url,
      tag: dedupeKey || `notification:${notification.id}`,
    });

    if (pushDelivered > 0) {
      await prisma.userNotification.update({
        where: { id: notification.id },
        data: { pushedAt: new Date() },
      });
    }
  }

  return { notification, created: true, pushDelivered };
};

export const listNotificationsForUser = async (userId: string, take = 25) => {
  const notifications = await prisma.userNotification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take,
  });

  return notifications.map((item) => ({
    id: item.id,
    type: item.type as NotificationType,
    title: item.title,
    message: item.message || undefined,
    url: item.url || undefined,
    createdAt: item.createdAt.toISOString(),
    read: Boolean(item.readAt),
  }));
};

export const markNotificationAsRead = async ({
  userId,
  notificationId,
}: {
  userId: string;
  notificationId: string;
}) => {
  await prisma.userNotification.updateMany({
    where: {
      id: notificationId,
      userId,
      readAt: null,
    },
    data: {
      readAt: new Date(),
    },
  });
};

export const markAllNotificationsAsRead = async (userId: string) => {
  await prisma.userNotification.updateMany({
    where: {
      userId,
      readAt: null,
    },
    data: {
      readAt: new Date(),
    },
  });
};

export const syncNotificationsForUser = async (userId: string) => {
  const now = new Date();
  const todayStart = toUtcDayStart(now);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1);
  const todayKey = toDayKey(now);
  const todayLocalKey = toLocalDayKey(now);
  const weekKey = toIsoWeekKey(now);
  const previousWeekStart = new Date(todayStart);
  previousWeekStart.setUTCDate(previousWeekStart.getUTCDate() - 7);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      streak: true,
      lastStudyDate: true,
      preferences: {
        select: {
          dailyReminder: true,
          streakReminder: true,
          weeklyReport: true,
          achievementAlerts: true,
          notificationsEnabled: true,
          notificationMinutesBefore: true,
          backlogReminderEnabled: true,
        },
      },
    },
  });

  if (!user) {
    return { createdCount: 0 };
  }

  const preferences = user.preferences;
  const dailyReminderEnabled = preferences?.dailyReminder ?? true;
  const streakReminderEnabled = preferences?.streakReminder ?? true;
  const weeklyReportEnabled = preferences?.weeklyReport ?? true;
  const achievementAlertsEnabled = preferences?.achievementAlerts ?? true;
  const studyNotificationsEnabled = preferences?.notificationsEnabled ?? false;
  const notificationMinutesBefore = preferences?.notificationMinutesBefore ?? 15;
  const backlogReminderEnabled = preferences?.backlogReminderEnabled ?? false;

  const fullName = user.name?.trim() || 'Estudante';
  const firstName = fullName.split(' ')[0] || fullName;

  let createdCount = 0;

  let snapshotSignalsPromise: Promise<SnapshotStudySignals> | null = null;
  const getSnapshotSignals = () => {
    if (!snapshotSignalsPromise) {
      snapshotSignalsPromise = extractStudySignalsFromSnapshot({
        userId,
        todayKeyUtc: todayKey,
        todayLocalKey,
        todayStartUtc: todayStart,
        tomorrowStartUtc: tomorrowStart,
        weekStartUtc: previousWeekStart,
        weekEndUtc: todayStart,
      });
    }
    return snapshotSignalsPromise;
  };

  const sessionsToday = await prisma.studySession.count({
    where: {
      userId,
      startedAt: {
        gte: todayStart,
        lt: tomorrowStart,
      },
    },
  });
  let hasStudiedToday = sessionsToday > 0;
  if (!hasStudiedToday) {
    const snapshotSignals = await getSnapshotSignals();
    hasStudiedToday = snapshotSignals.studiedToday;
  }

  if (dailyReminderEnabled && !hasStudiedToday) {
    const dailyReminder = await createNotificationForUser({
      userId,
      type: 'daily',
      title: 'Hora de estudar',
      message: `${firstName}, seu plano de hoje já está pronto para começar.`,
      url: '/dashboard',
      dedupeKey: `daily:${todayKey}`,
      sendPush: true,
    });

    if (dailyReminder.created) {
      createdCount += 1;
    }
  }

  if (streakReminderEnabled && user.streak > 0 && !hasStudiedToday) {
    const streakReminder = await createNotificationForUser({
      userId,
      type: 'streak',
      title: 'Mantenha sua sequência',
      message: `Você está com ${user.streak} dias seguidos. Faça uma sessão hoje para não perder.`,
      url: '/dashboard',
      dedupeKey: `streak:${todayKey}`,
      sendPush: true,
    });

    if (streakReminder.created) {
      createdCount += 1;
    }
  }

  if (weeklyReportEnabled && now.getUTCDay() === 1) {
    const weeklyStats = await prisma.studySession.aggregate({
      where: {
        userId,
        startedAt: {
          gte: previousWeekStart,
          lt: todayStart,
        },
      },
      _sum: {
        actualMinutes: true,
      },
      _count: {
        _all: true,
      },
    });

    let totalMinutes = weeklyStats._sum.actualMinutes ?? 0;
    let totalSessions = weeklyStats._count._all;

    if (totalMinutes <= 0 && totalSessions <= 0) {
      const snapshotSignals = await getSnapshotSignals();
      totalMinutes = snapshotSignals.weekMinutes;
      totalSessions = snapshotSignals.weekSessions;
    }

    const weeklyReport = await createNotificationForUser({
      userId,
      type: 'weekly',
      title: 'Resumo semanal',
      message: `Semana passada: ${formatHoursFromMinutes(totalMinutes)} em ${totalSessions} sessões.`,
      url: '/analytics',
      dedupeKey: `weekly:${weekKey}`,
      sendPush: true,
      metadata: {
        totalMinutes,
        totalSessions,
      },
    });

    if (weeklyReport.created) {
      createdCount += 1;
    }
  }

  if (achievementAlertsEnabled) {
    const achievementWindowStart = new Date(now.getTime() - 1000 * 60 * 60 * 24);
    const recentAchievements = await prisma.userAchievement.findMany({
      where: {
        userId,
        unlockedAt: {
          gte: achievementWindowStart,
        },
      },
      include: {
        achievement: {
          select: {
            id: true,
            name: true,
            rarity: true,
          },
        },
      },
      orderBy: {
        unlockedAt: 'desc',
      },
      take: 3,
    });

    for (const unlockedAchievement of recentAchievements) {
      const result = await createNotificationForUser({
        userId,
        type: 'achievement',
        title: 'Nova conquista desbloqueada',
        message: `${unlockedAchievement.achievement.name} (${unlockedAchievement.achievement.rarity})`,
        url: '/dashboard',
        dedupeKey: `achievement:${unlockedAchievement.achievement.id}`,
        sendPush: true,
      });

      if (result.created) {
        createdCount += 1;
      }
    }
  }

  const studyNotificationsCreated = await dispatchScheduledStudyNotifications({
    userId,
    firstName,
    now,
    todayKey,
    todayStart,
    notificationsEnabled: studyNotificationsEnabled,
    notificationMinutesBefore,
    backlogReminderEnabled,
  });
  createdCount += studyNotificationsCreated;

  return { createdCount };
};
