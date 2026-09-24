import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import type { StudyPreferences, UserSettings } from '@/types';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    try {
      const prefs = await prisma.userPreferences.findUnique({
        where: { userId },
      });
      return NextResponse.json({ success: true, data: prefs });
    } catch (error) {
      console.warn('Preferences API: failed to load preferences from DB.', error);
    }

    return NextResponse.json({ success: true, data: null });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Falha ao carregar preferencias.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const settings = body.settings as UserSettings;
    const studyPrefs = body.studyPrefs as StudyPreferences | undefined;
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!settings) {
      return NextResponse.json(
        { success: false, error: 'Configurações ausentes.' },
        { status: 400 }
      );
    }

    const persistedDailyHours = settings.dailyHoursByWeekday ?? studyPrefs?.dailyHoursByWeekday ?? null;
    const persistedExamDate = settings.examDate || studyPrefs?.examDate || null;
    const persistedMaxBlock =
      settings.maxBlockMinutes ??
      studyPrefs?.focusBlockMinutes ??
      studyPrefs?.blockDurationMinutes ??
      120;
    const persistedBreak = settings.breakMinutes ?? studyPrefs?.breakDurationMinutes ?? 15;

    const notificationMinutesBefore = Number.isFinite(settings.notificationMinutesBefore)
      ? Math.min(180, Math.max(1, Math.round(settings.notificationMinutesBefore)))
      : 15;
    const notificationsEnabled = settings.notificationsEnabled ?? false;
    const notificationSoundEnabled = settings.notificationSoundEnabled ?? true;
    const backlogReminderEnabled = settings.backlogReminderEnabled ?? false;
    const serializedRestDays = JSON.stringify({
      excludeDays: settings.excludeDays ?? [],
      allowSundayBacklog: settings.allowSundayBacklog ?? false,
      backlogRecoveryDays: settings.backlogRecoveryDays ?? [],
    });

    const dailyHoursByWeekdayJson =
      persistedDailyHours == null
        ? Prisma.JsonNull
        : (persistedDailyHours as unknown as Prisma.InputJsonValue);

    try {
      if (settings.name) {
        await prisma.user.update({
          where: { id: userId },
          data: { name: settings.name },
        });
      }
    } catch (error) {
      console.warn('Preferences API: failed to update user profile.', error);
    }

    try {
      await prisma.userPreferences.upsert({
        where: { userId },
        update: {
          dailyGoalHours: settings.dailyGoalHours,
          preferredStart: settings.preferredStart,
          preferredEnd: settings.preferredEnd,
          maxBlockMinutes: persistedMaxBlock,
          breakMinutes: persistedBreak,
          alarmSound: settings.alarmSound ?? 'pulse',
          dailyReminder: settings.dailyReminder ?? true,
          streakReminder: settings.streakReminder ?? true,
          achievementAlerts: settings.achievementAlerts ?? true,
          weeklyReport: settings.weeklyReport ?? true,
          notificationsEnabled,
          notificationMinutesBefore,
          notificationSoundEnabled,
          backlogReminderEnabled,
          dailyHoursByWeekday: dailyHoursByWeekdayJson,
          restDays: serializedRestDays,
          examDate: persistedExamDate,
        },
        create: {
          userId,
          dailyGoalHours: settings.dailyGoalHours,
          preferredStart: settings.preferredStart,
          preferredEnd: settings.preferredEnd,
          maxBlockMinutes: persistedMaxBlock,
          breakMinutes: persistedBreak,
          alarmSound: settings.alarmSound ?? 'pulse',
          dailyReminder: settings.dailyReminder ?? true,
          streakReminder: settings.streakReminder ?? true,
          achievementAlerts: settings.achievementAlerts ?? true,
          weeklyReport: settings.weeklyReport ?? true,
          notificationsEnabled,
          notificationMinutesBefore,
          notificationSoundEnabled,
          backlogReminderEnabled,
          dailyHoursByWeekday: dailyHoursByWeekdayJson,
          restDays: serializedRestDays,
          examDate: persistedExamDate,
        },
      });
    } catch (error) {
      console.warn('Preferences API: database unavailable, using local fallback.', error);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao salvar preferencias:', error);
    return NextResponse.json(
      { success: false, error: 'Falha ao salvar preferencias.' },
      { status: 500 }
    );
  }
}
