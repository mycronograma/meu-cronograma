/**
 * Regras de agendamento usadas pelo planejador (e testáveis sem React).
 *
 * Antes essas funções viviam dentro do `WeeklyPlanner.tsx` (2.500 linhas) e não
 * davam para testar: era impossível garantir, por exemplo, que um estudo já
 * concluído nunca é "reagendado" para outro dia — o que apagaria o registro da
 * conclusão e as horas dele na semana.
 */

import type { StudyBlock } from '@/types';
import { minutesToTime, parseBlockDate, timeToMinutes } from '@/lib/utils';

/**
 * Blocos que o app não mexe automaticamente: concluídos (histórico) e em
 * andamento (a sessão está rodando).
 */
export const isLockedScheduleBlock = (block: StudyBlock) =>
  block.status === 'completed' || block.status === 'in-progress';

/** Estudo ainda pendente (nem concluído, nem pulado, nem intervalo). */
export const isPendingStudyBlock = (block: StudyBlock) =>
  !block.isBreak && block.status !== 'completed' && block.status !== 'skipped';

/** Bloco que ocupa tempo de estudo no dia (intervalos e pulados não contam). */
export const isCapacityStudyBlock = (block: StudyBlock) =>
  !block.isBreak && block.status !== 'skipped';

/** Estudos que podem voltar para a agenda: pendentes e não travados. */
export function selectReschedulableBlocks(blocks: StudyBlock[]): StudyBlock[] {
  return blocks.filter((block) => !block.isBreak && !isLockedScheduleBlock(block));
}

export function sumStudyMinutes(blocks: StudyBlock[]): number {
  return blocks.reduce(
    (sum, block) =>
      sum + (isCapacityStudyBlock(block) && Number.isFinite(block.durationMinutes)
        ? Math.max(0, block.durationMinutes)
        : 0),
    0
  );
}

/**
 * Blocos de um dia que passam do limite configurado, na ordem em que devem sair
 * (os mais tarde primeiro, para preservar o começo do dia).
 */
export function selectOverflowBlocks(dayBlocks: StudyBlock[], limitMinutes: number): StudyBlock[] {
  if (!Number.isFinite(limitMinutes) || limitMinutes <= 0) return [];

  const ordered = [...dayBlocks].sort((a, b) => a.startTime.localeCompare(b.startTime));
  let total = sumStudyMinutes(ordered);
  const overflow: StudyBlock[] = [];

  for (let index = ordered.length - 1; index >= 0 && total > limitMinutes; index -= 1) {
    const block = ordered[index];
    if (!isCapacityStudyBlock(block) || isLockedScheduleBlock(block)) continue;

    total -= Math.max(0, block.durationMinutes);
    overflow.push(block);
  }

  return overflow;
}

export interface MoveBlockOptions {
  block: StudyBlock;
  date: Date;
  startMinutes: number;
  endMinutes?: number;
  /** Novo status quando o bloco é realmente movido. */
  status?: StudyBlock['status'];
}

/**
 * Cria a versão movida de um bloco. Bloco travado (concluído/em andamento)
 * volta igual — nunca muda de dia, de horário nem de status. Intervalos mudam
 * de horário mas mantêm o status e não contam como reagendamento.
 */
export function buildRescheduledBlock({
  block,
  date,
  startMinutes,
  endMinutes,
  status = 'rescheduled',
}: MoveBlockOptions): StudyBlock {
  if (isLockedScheduleBlock(block)) return block;

  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);

  const start = Math.max(0, Math.round(startMinutes));
  const end =
    typeof endMinutes === 'number'
      ? Math.round(endMinutes)
      : start + Math.max(0, block.durationMinutes);

  const originalDate = block.originalDate
    ? parseBlockDate(block.originalDate)
    : parseBlockDate(block.date);
  originalDate.setHours(0, 0, 0, 0);

  return {
    ...block,
    date: targetDate,
    startTime: minutesToTime(start),
    endTime: minutesToTime(end),
    status: block.isBreak ? block.status : status,
    originalDate: block.isBreak ? block.originalDate : originalDate,
    rescheduleCount: block.isBreak
      ? block.rescheduleCount
      : (block.rescheduleCount || 0) + 1,
    updatedAt: new Date(),
  };
}

/** Duração real de um bloco a partir dos horários (nunca negativa, nunca NaN). */
export function getBlockDurationMinutes(block: StudyBlock): number {
  const start = timeToMinutes(block.startTime || '');
  const end = timeToMinutes(block.endTime || '');
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  const minutes = end > start ? end - start : end + 24 * 60 - start;
  return Math.max(0, minutes);
}
