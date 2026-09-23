/**
 * Nexora Utility Functions
 * Common helper functions used throughout the application
 */

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// ============================================
// Class Name Utilities
// ============================================

/**
 * Merge Tailwind classes with clsx
 * Handles conditional classes and removes conflicts
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ============================================
// Time & Date Utilities
// ============================================

/**
 * Format time string (HH:MM) to display format
 */
export function formatTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
}

/**
 * Format minutes to hours and minutes display
 */
export function formatDuration(minutes: number): string {
  const safeMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;

  if (safeMinutes < 60) return `${safeMinutes} min`;
  return `${hours}:${mins.toString().padStart(2, '0')}`;
}

/**
 * Format decimal hours to display duration (e.g. 0.8 -> 50 min, 1.8 -> 1:50)
 */
export function formatHoursDuration(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return '0 min';

  const safeHours = Math.max(0, hours);
  const hasSingleDecimalPrecision =
    Math.abs(safeHours * 10 - Math.round(safeHours * 10)) < 0.000001;

  let minutes = safeHours * 60;

  // Legacy snapshots sometimes store hours with only one decimal place (e.g. 0.8),
  // which can display odd values like 48 min for a 50 min block.
  if (hasSingleDecimalPrecision) {
    const roundingStep = minutes < 30 ? 5 : 10;
    minutes = Math.round(minutes / roundingStep) * roundingStep;
  }

  return formatDuration(minutes);
}

/**
 * Get time string from Date object
 */
export function getTimeString(date: Date): string {
  return date.toTimeString().slice(0, 5);
}

/**
 * Parse time string to minutes since midnight
 */
export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Convert minutes since midnight to time string
 */
export function minutesToTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * Get the start of the current week (Monday)
 */
export function getWeekStart(date: Date = new Date()): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Format date for display
 */
export function formatDate(date: Date, format: 'short' | 'long' | 'iso' = 'short'): string {
  switch (format) {
    case 'short':
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    case 'long':
      return date.toLocaleDateString('en-US', { 
        weekday: 'long', 
        month: 'long', 
        day: 'numeric' 
      });
    case 'iso':
      return toLocalDateKey(date);
    default:
      return date.toLocaleDateString();
  }
}

/**
 * Build a local date key (YYYY-MM-DD) without UTC conversion.
 */
export function toLocalDateKey(value: Date | string | number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

/**
 * Parse a local date key (YYYY-MM-DD) to local midnight Date.
 */
export function parseLocalDateKey(value?: string | null): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;

  const parsed = new Date(year, month - 1, day);
  parsed.setHours(0, 0, 0, 0);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Parse a block date (date-only or ISO string) into a local midnight Date.
 * Avoids timezone shifting when the backend stores midnight UTC.
 */
export function parseBlockDate(value?: Date | string | null): Date {
  if (!value) return new Date(Number.NaN);
  if (value instanceof Date) {
    const parsed = new Date(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
    parsed.setHours(0, 0, 0, 0);
    return parsed;
  }
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) {
      const [year, month, day] = match[1].split('-').map(Number);
      if (year && month && day) {
        const parsed = new Date(year, month - 1, day);
        parsed.setHours(0, 0, 0, 0);
        return parsed;
      }
    }
  }
  return new Date(value);
}

/**
 * Get day name from date
 */
export function getDayName(date: Date, format: 'short' | 'long' = 'short'): string {
  return date.toLocaleDateString('en-US', { 
    weekday: format === 'short' ? 'short' : 'long' 
  });
}

/**
 * Check if two dates are the same day
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

/**
 * Get array of dates for current week
 */
export function getWeekDates(startDate: Date = getWeekStart()): Date[] {
  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    dates.push(date);
  }
  return dates;
}

// ============================================
// Number & Stats Utilities
// ============================================

/**
 * Calculate percentage with bounds
 */
export function percentage(value: number, total: number, decimals: number = 0): number {
  if (total === 0) return 0;
  const pct = (value / total) * 100;
  return Math.min(100, Math.max(0, Number(pct.toFixed(decimals))));
}

/**
 * Format large numbers with K/M suffixes
 */
export function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

/**
 * Generate random number in range
 */
export function randomInRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ============================================
// Gamification Utilities
// ============================================

/**
 * Calculate XP required for a level
 * Uses exponential scaling: base * (multiplier ^ level)
 */
export function xpForLevel(level: number): number {
  const base = 100;
  const multiplier = 1.5;
  return Math.floor(base * Math.pow(multiplier, level - 1));
}

/**
 * Calculate total XP required to reach a level
 */
export function totalXpForLevel(level: number): number {
  let total = 0;
  for (let i = 1; i < level; i++) {
    total += xpForLevel(i);
  }
  return total;
}

/**
 * Calculate level from total XP
 */
export function levelFromXp(totalXp: number): { level: number; xpInLevel: number; xpForNext: number } {
  let level = 1;
  let remainingXp = totalXp;
  
  while (remainingXp >= xpForLevel(level)) {
    remainingXp -= xpForLevel(level);
    level++;
  }
  
  return {
    level,
    xpInLevel: remainingXp,
    xpForNext: xpForLevel(level),
  };
}

/**
 * Calculate XP earned from a study session
 */
export function calculateSessionXp(
  minutes: number, 
  focusScore: number, 
  difficulty: number,
  streakBonus: number = 0
): number {
  // Base XP: 1 XP per minute
  let xp = minutes;
  
  // Focus multiplier: 0.5x to 1.5x based on focus score
  const focusMultiplier = 0.5 + (focusScore / 100);
  xp *= focusMultiplier;
  
  // Difficulty bonus: up to 50% extra for hard subjects
  const difficultyBonus = 1 + (difficulty / 20);
  xp *= difficultyBonus;
  
  // Streak bonus: 5% per streak day, max 50%
  const streakMultiplier = 1 + Math.min(streakBonus * 0.05, 0.5);
  xp *= streakMultiplier;
  
  return Math.floor(xp);
}

// ============================================
// Color Utilities
// ============================================

/**
 * Predefined subject colors
 */
export const subjectColors = [
  '#00B4FF', // Neon Blue
  '#7F00FF', // Neon Purple
  '#00FFC8', // Neon Cyan
  '#FF00AA', // Neon Pink
  '#FFAA00', // Orange
  '#00FF88', // Green
  '#FF5555', // Red
  '#AA88FF', // Lavender
];

/**
 * Get a color based on index
 */
export function getColorByIndex(index: number): string {
  return subjectColors[index % subjectColors.length];
}

/**
 * Convert hex to RGBA
 */
export function hexToRgba(hex: string, alpha: number = 1): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ============================================
// String Utilities
// ============================================

/**
 * Truncate string with ellipsis
 */
export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length - 3) + '...';
}

/**
 * Generate a unique ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Capitalize first letter
 */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ============================================
// Validation Utilities
// ============================================

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate time format (HH:MM)
 */
export function isValidTime(time: string): boolean {
  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
  return timeRegex.test(time);
}
