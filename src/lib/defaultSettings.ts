import type { UserSettings } from '@/types';

export const defaultSettings: UserSettings = {
  // Perfil
  name: 'Estudante',
  email: '',
  avatar: '',
  theme: 'dark',

  // Preferências de Estudo
  dailyGoalHours: 4,
  dailyHoursByWeekday: {
    dom: 0,
    seg: 4,
    ter: 4,
    qua: 4,
    qui: 4,
    sex: 4,
    sab: 4,
  },
  preferredStart: '09:00',
  preferredEnd: '21:00',
  maxBlockMinutes: 120,
  breakMinutes: 15,
  excludeDays: [0],

  // IA
  aiDifficulty: 'adaptive',
  focusMode: false,
  autoSchedule: true,
  smartBreaks: true,

  // Notificações
  dailyReminder: true,
  streakReminder: true,
  achievementAlerts: true,
  weeklyReport: true,
  notificationsEnabled: false,
  notificationMinutesBefore: 15,
  notificationSoundEnabled: true,
  backlogReminderEnabled: false,
  allowSundayBacklog: false,
  backlogRecoveryDays: [],
  alarmSound: 'pulse',

  // Prova
  examDate: '',
};
