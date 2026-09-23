import type { AIDifficulty, BreakDuration, FocusDuration } from '@/types';

export type AIScheduleProfile = {
  label: string;
  description: string;
  focusBlockMinutes: FocusDuration;
  breakMinutes: BreakDuration;
};

export const AI_SCHEDULE_PROFILES: Record<AIDifficulty, AIScheduleProfile> = {
  easy: {
    label: 'Leve',
    description: '30 min de foco + 15 min de pausa',
    focusBlockMinutes: 30,
    breakMinutes: 15,
  },
  medium: {
    label: 'Moderado',
    description: '50 min de foco + 10 min de pausa',
    focusBlockMinutes: 50,
    breakMinutes: 10,
  },
  hard: {
    label: 'Intenso',
    description: '90 min de foco + 5 min de pausa',
    focusBlockMinutes: 90,
    breakMinutes: 5,
  },
  adaptive: {
    label: 'Adaptativo',
    description: 'Ajusta entre Leve, Moderado e Intenso',
    focusBlockMinutes: 50,
    breakMinutes: 10,
  },
};

export function getAiScheduleProfile(value?: AIDifficulty): AIScheduleProfile {
  return AI_SCHEDULE_PROFILES[value || 'medium'] ?? AI_SCHEDULE_PROFILES.medium;
}
