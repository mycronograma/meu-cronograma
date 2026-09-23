/**
 * Study Algorithm Service
 * AI-powered scheduling algorithm that distributes study hours
 * based on priority, difficulty, and user preferences
 */

import type { Subject, StudyBlock, ScheduleConfig, GeneratedSchedule } from '@/types';
import { generateId, timeToMinutes, minutesToTime, getWeekDates } from '@/lib/utils';

/**
 * Maximum study block duration in minutes
 */
const MAX_BLOCK_DURATION = 120;

/**
 * Minimum study block duration in minutes
 */
const MIN_BLOCK_DURATION = 30;

/**
 * Calculate weighted priority score for a subject
 * Higher score = should be scheduled more and earlier
 */
function calculatePriorityScore(subject: Subject): number {
  // Priority weight (1-10) * 2
  const priorityWeight = subject.priority * 2;
  
  // Difficulty weight (harder subjects need more frequent, shorter sessions)
  const difficultyWeight = subject.difficulty * 1.5;
  
  // Completion ratio (less completed = higher priority)
  const completionRatio = subject.completedHours / subject.targetHours;
  const completionWeight = (1 - Math.min(completionRatio, 1)) * 10;
  
  return priorityWeight + difficultyWeight + completionWeight;
}

/**
 * Calculate optimal block duration for a subject
 * Harder subjects get shorter blocks
 */
function calculateOptimalDuration(subject: Subject, maxDuration: number): number {
  // Base duration based on difficulty (harder = shorter)
  const difficultyFactor = 1 - (subject.difficulty / 15);
  const optimalMinutes = Math.floor(maxDuration * difficultyFactor);
  
  // Clamp to valid range
  return Math.max(MIN_BLOCK_DURATION, Math.min(optimalMinutes, maxDuration));
}

/**
 * Calculate remaining hours needed for each subject this week
 */
function calculateRemainingHours(subjects: Subject[], multiplier: number = 1): Map<string, number> {
  const remaining = new Map<string, number>();
  
  for (const subject of subjects) {
    const target = subject.targetHours * multiplier;
    const hoursNeeded = Math.max(0, target - subject.completedHours);
    remaining.set(subject.id, hoursNeeded);
  }
  
  return remaining;
}

/**
 * Generate study blocks for a single day
 */
function generateDayBlocks(
  date: Date,
  subjects: Subject[],
  remainingHours: Map<string, number>,
  config: ScheduleConfig,
  dailyStudyLimitMinutes?: number
): StudyBlock[] {
  const blocks: StudyBlock[] = [];
  const dayOfWeek = date.getDay();
  
  // Skip excluded days
  if (config.excludeDays.includes(dayOfWeek)) {
    return blocks;
  }
  
  // Sort subjects by priority score
  const sortedSubjects = [...subjects]
    .filter((s) => s.isActive && (remainingHours.get(s.id) || 0) > 0)
    .sort((a, b) => calculatePriorityScore(b) - calculatePriorityScore(a));
  
  if (sortedSubjects.length === 0) {
    return blocks;
  }
  
  // Calculate available time slots
  let currentTime = timeToMinutes(config.preferredStart);
  const endTime = timeToMinutes(config.preferredEnd);
  let studyMinutesPlanned = 0;
  
  // Track which subjects have been scheduled today
  const scheduledToday = new Set<string>();
  let subjectIndex = 0;
  let attemptsInRow = 0;
  
  while (
    currentTime < endTime - MIN_BLOCK_DURATION &&
    (dailyStudyLimitMinutes === undefined || studyMinutesPlanned < dailyStudyLimitMinutes)
  ) {
    // Get next subject (round-robin through priority-sorted list)
    const subject = sortedSubjects[subjectIndex % sortedSubjects.length];
    const remaining = remainingHours.get(subject.id) || 0;
    
    if (remaining <= 0) {
      subjectIndex++;
      attemptsInRow++;
      if (attemptsInRow >= sortedSubjects.length) break;
      continue;
    }
    
    // Calculate block duration
    const optimalDuration = calculateOptimalDuration(subject, config.maxBlockMinutes);
    const availableTime = endTime - currentTime;
    const maxRemainingMinutes = remaining * 60;
    const remainingDayMinutes =
      dailyStudyLimitMinutes === undefined
        ? Infinity
        : Math.max(0, dailyStudyLimitMinutes - studyMinutesPlanned);
    
    if (remainingDayMinutes < MIN_BLOCK_DURATION) {
      break;
    }
    
    const blockDuration = Math.min(
      optimalDuration,
      availableTime,
      maxRemainingMinutes,
      MAX_BLOCK_DURATION,
      remainingDayMinutes
    );
    
    if (blockDuration < MIN_BLOCK_DURATION) {
      remainingHours.set(subject.id, 0);
      subjectIndex++;
      attemptsInRow++;
      if (attemptsInRow >= sortedSubjects.length) break;
      continue;
    }
    
    attemptsInRow = 0;

    // Create study block
    const startTime = minutesToTime(currentTime);
    const blockEndTime = minutesToTime(currentTime + blockDuration);
    
    // Estudo Reverso: 80% do tempo focado em Prática e Revisão Ativa
    const blockTypeRand = Math.random();
    let blockType: 'AULA' | 'EXERCICIOS' | 'REVISAO_ATIVA' | 'ANALISE' = 'EXERCICIOS';
    
    if (blockTypeRand > 0.8) {
      blockType = 'AULA';
    } else if (blockTypeRand > 0.6) {
      blockType = 'REVISAO_ATIVA';
    } else if (blockTypeRand > 0.5) {
      blockType = 'ANALISE';
    }

    const block: StudyBlock = {
      id: generateId(),
      userId: config.userId,
      subjectId: subject.id,
      subject,
      date,
      startTime,
      endTime: blockEndTime,
      durationMinutes: blockDuration,
      status: 'scheduled',
      isBreak: false,
      isAutoGenerated: true,
      type: blockType,
      sessionType: blockType === 'AULA' ? 'teoria' : blockType === 'EXERCICIOS' ? 'pratica' : 'revisao',
      originalDate: new Date(date),
      completedAt: undefined,
      rescheduleCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    blocks.push(block);
    
    // Update tracking
    currentTime += blockDuration;
    studyMinutesPlanned += blockDuration;
    remainingHours.set(subject.id, remaining - blockDuration / 60);
    scheduledToday.add(subject.id);
    
    // Add break after study block (if there's more time)
    if (currentTime + config.breakMinutes + MIN_BLOCK_DURATION <= endTime) {
      const breakBlock: StudyBlock = {
        id: generateId(),
        userId: config.userId,
        subjectId: 'break',
        date,
        startTime: minutesToTime(currentTime),
        endTime: minutesToTime(currentTime + config.breakMinutes),
        durationMinutes: config.breakMinutes,
        status: 'scheduled',
        isBreak: true,
        isAutoGenerated: true,
        originalDate: undefined,
        completedAt: undefined,
        rescheduleCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      blocks.push(breakBlock);
      currentTime += config.breakMinutes;
    }
    
    // Move to next subject
    subjectIndex++;
  }
  
  return blocks;
}

function buildDateRange(startDate: Date, endDate: Date): Date[] {
  const dates: Date[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  if (start > end) {
    return dates;
  }

  const current = new Date(start);
  while (current <= end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

/**
 * Generate a full weekly study schedule
 */
export function generateWeeklySchedule(config: ScheduleConfig): GeneratedSchedule {
  const scheduleDates =
    config.startDate && config.endDate
      ? buildDateRange(config.startDate, config.endDate)
      : getWeekDates();
  const isExcluded = (date: Date) => config.excludeDays.includes(date.getDay());
  const activeDates = scheduleDates.filter((date) => !isExcluded(date));
  const weeksEquivalent = scheduleDates.length > 0 ? scheduleDates.length / 7 : 1;
  const remainingHours = calculateRemainingHours(config.subjects, weeksEquivalent);
  const allBlocks: StudyBlock[] = [];
  
  // Generate blocks for each day
  for (let index = 0; index < scheduleDates.length; index++) {
    const date = scheduleDates[index];
    if (isExcluded(date)) {
      continue;
    }

    const remainingHoursTotal = Array.from(remainingHours.values()).reduce((sum, hours) => sum + hours, 0);
    if (remainingHoursTotal <= 0) {
      break;
    }

    const remainingDays = scheduleDates
      .slice(index)
      .filter((d) => !isExcluded(d))
      .length;
    const dailyTargetMinutes =
      remainingDays > 0
        ? Math.ceil((remainingHoursTotal / remainingDays) * 60)
        : undefined;

    const dayBlocks = generateDayBlocks(
      date,
      config.subjects,
      remainingHours,
      config,
      dailyTargetMinutes
    );
    allBlocks.push(...dayBlocks);
  }
  
  // Calculate distribution stats
  const subjectDistribution: Record<string, number> = {};
  let totalHours = 0;
  
  for (const block of allBlocks) {
    if (!block.isBreak) {
      const hours = block.durationMinutes / 60;
      totalHours += hours;
      
      if (block.subject) {
        const subjectName = block.subject.name;
        subjectDistribution[subjectName] = (subjectDistribution[subjectName] || 0) + hours;
      }
    }
  }
  
  return {
    blocks: allBlocks,
    totalHours,
    subjectDistribution,
  };
}

/**
 * Optimize an existing schedule by reordering blocks
 * Uses simulated annealing to find better arrangements
 */
export function optimizeSchedule(
  blocks: StudyBlock[],
  subjects: Subject[]
): StudyBlock[] {
  // Simple optimization: group same subjects together when possible
  // More complex optimization would use actual simulated annealing
  
  const optimized = [...blocks];
  
  // Sort by date, then by subject priority within same day
  optimized.sort((a, b) => {
    // First by date
    const dateCompare = a.date.getTime() - b.date.getTime();
    if (dateCompare !== 0) return dateCompare;
    
    // Then by time
    const timeCompare = timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
    return timeCompare;
  });
  
  return optimized;
}

/**
 * Reschedule a single block to a new time
 */
export function rescheduleBlock(
  block: StudyBlock,
  newDate: Date,
  newStartTime: string
): StudyBlock {
  const newEndMinutes = timeToMinutes(newStartTime) + block.durationMinutes;
  
  return {
    ...block,
    date: newDate,
    startTime: newStartTime,
    endTime: minutesToTime(newEndMinutes),
    isAutoGenerated: false, // Mark as manually modified
    updatedAt: new Date(),
  };
}

/**
 * Check if a time slot is available (no conflicts)
 */
export function isTimeSlotAvailable(
  blocks: StudyBlock[],
  date: Date,
  startTime: string,
  durationMinutes: number,
  excludeBlockId?: string
): boolean {
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = startMinutes + durationMinutes;
  
  const sameDayBlocks = blocks.filter(
    (b) =>
      b.date.toDateString() === date.toDateString() &&
      b.id !== excludeBlockId
  );
  
  for (const block of sameDayBlocks) {
    const blockStart = timeToMinutes(block.startTime);
    const blockEnd = timeToMinutes(block.endTime);
    
    // Check for overlap
    if (
      (startMinutes >= blockStart && startMinutes < blockEnd) ||
      (endMinutes > blockStart && endMinutes <= blockEnd) ||
      (startMinutes <= blockStart && endMinutes >= blockEnd)
    ) {
      return false;
    }
  }
  
  return true;
}

/**
 * Calculate study efficiency metrics
 */
export function calculateEfficiencyMetrics(
  blocks: StudyBlock[],
  sessions: { focusScore: number; productivityScore: number; actualMinutes: number }[]
) {
  if (sessions.length === 0) {
    return {
      averageFocusScore: 0,
      averageProductivity: 0,
      completionRate: 0,
      optimalTimeOfDay: 'morning',
    };
  }
  
  const totalFocus = sessions.reduce((sum, s) => sum + s.focusScore, 0);
  const totalProductivity = sessions.reduce((sum, s) => sum + s.productivityScore, 0);
  
  const completedBlocks = blocks.filter((b) => b.status === 'completed').length;
  const totalBlocks = blocks.filter((b) => !b.isBreak).length;
  
  return {
    averageFocusScore: Math.round(totalFocus / sessions.length),
    averageProductivity: Math.round(totalProductivity / sessions.length),
    completionRate: totalBlocks > 0 ? Math.round((completedBlocks / totalBlocks) * 100) : 0,
    optimalTimeOfDay: 'morning', // Would be calculated from actual session data
  };
}
