'use client';

/**
 * DayColumn Component
 * Representa um único dia no planner semanal
 */

import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { cn, formatDuration, isSameDay } from '@/lib/utils';
import TimeBlock from './TimeBlock';
import type { StudyBlock } from '@/types';

interface DayColumnProps {
  date: Date;
  blocks: StudyBlock[];
  studyTargetMinutes?: number;
  windowCapacityMinutes?: number;
  onAdjustStudyLoad?: (date: Date, direction: -1 | 1) => void;
  onAddBlock: (date: Date) => void;
  onEditBlock: (block: StudyBlock) => void;
  onDeleteBlock: (blockId: string) => void;
  onStartBlock?: (block: StudyBlock) => void;
  onMarkBlockDone?: (block: StudyBlock) => void;
  onSkipBlockToday?: (block: StudyBlock) => void;
  onQuickRescheduleBlock?: (block: StudyBlock) => void;
  notificationsEnabled?: boolean;
  notificationMinutesBefore?: number;
}

// Mapa de dias da semana em português
const dayNamesLong: { [key: string]: string } = {
  'Sunday': 'Domingo',
  'Monday': 'Segunda-feira',
  'Tuesday': 'Terça-feira',
  'Wednesday': 'Quarta-feira',
  'Thursday': 'Quinta-feira',
  'Friday': 'Sexta-feira',
  'Saturday': 'Sábado',
};

export default function DayColumn({
  date,
  blocks,
  studyTargetMinutes = 0,
  windowCapacityMinutes = 0,
  onAdjustStudyLoad,
  onAddBlock,
  onEditBlock,
  onDeleteBlock,
  onStartBlock,
  onMarkBlockDone,
  onSkipBlockToday,
  onQuickRescheduleBlock,
  notificationsEnabled = false,
  notificationMinutesBefore = 15,
}: DayColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: date.toISOString(),
  });

  const isPendingStudyBlock = (block: StudyBlock) =>
    !block.isBreak && block.status !== 'completed' && block.status !== 'skipped';
  const isCapacityConsumedStudyBlock = (block: StudyBlock) =>
    !block.isBreak && block.status !== 'skipped';

  const isToday = isSameDay(date, new Date());
  const studyMinutes = blocks
    .filter((b) => isCapacityConsumedStudyBlock(b))
    .reduce((sum, b) => sum + b.durationMinutes, 0);
  const breakMinutes = blocks
    .filter((b) => b.isBreak && b.status !== 'skipped')
    .reduce((sum, b) => sum + b.durationMinutes, 0);
  const occupiedMinutes = studyMinutes + breakMinutes;
  const studyHours = formatDuration(studyMinutes);
  const occupiedHours = formatDuration(occupiedMinutes);
  const breakHours = formatDuration(breakMinutes);
  const pendingBlocksCount = blocks.filter((b) => isPendingStudyBlock(b)).length;
  const targetHours = studyTargetMinutes > 0 ? formatDuration(studyTargetMinutes) : null;
  const windowHours = windowCapacityMinutes > 0 ? formatDuration(windowCapacityMinutes) : null;
  const studyOverMinutes = studyTargetMinutes > 0 ? Math.max(0, studyMinutes - studyTargetMinutes) : 0;
  const windowOverMinutes = windowCapacityMinutes > 0 ? Math.max(0, occupiedMinutes - windowCapacityMinutes) : 0;
  const usageRatio =
    windowCapacityMinutes > 0 ? Math.min(1, occupiedMinutes / windowCapacityMinutes) : 0;

  const dayNameEn = date.toLocaleDateString('en-US', { weekday: 'long' });
  const dayNamePt = dayNamesLong[dayNameEn] || dayNameEn;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'mx-auto md:mx-0 flex w-full max-w-[34rem] min-w-0 flex-col md:max-w-none md:min-w-[320px] xl:min-w-[340px]',
        'rounded-[1.5rem] border bg-[linear-gradient(175deg,rgba(24,30,44,0.95),rgba(15,20,32,0.97))] shadow-[0_18px_36px_rgba(0,0,0,0.35)]',
        'md:rounded-3xl',
        isToday ? 'border-neon-blue/45' : 'border-white/10 md:border-card-border',
        isOver && 'ring-2 ring-neon-blue/30 bg-neon-blue/5'
      )}
    >
      {/* Cabeçalho do Dia */}
      <div
        className={cn(
          'border-b border-white/10 p-3.5 sm:p-4 md:border-card-border',
          isToday && 'bg-neon-blue/10'
        )}
      >
        <div className="flex items-center justify-between">
          <div>
            <h3
              className={cn(
                'font-heading text-base font-bold sm:text-lg',
                isToday ? 'text-neon-blue' : 'text-white'
              )}
            >
              {dayNamePt}
            </h3>
            <p className="text-xs text-text-secondary sm:text-sm">
              {date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}
            </p>
          </div>
          {isToday && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="px-2 py-1 text-xs font-medium rounded-full bg-neon-blue/20 text-neon-blue"
            >
              Hoje
            </motion.span>
          )}
        </div>

        {/* Estatísticas do Dia */}
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-text-secondary">
          <span>{pendingBlocksCount} estudos</span>
          <span className="font-semibold text-white">Estudo: {studyHours}</span>
        </div>
        <div className="mt-2 flex flex-col gap-2 text-xs text-text-secondary">
          <div className="flex items-center justify-between gap-2">
            <span>{targetHours ? `Meta: ${targetHours}` : 'Meta livre'}</span>
            {breakMinutes > 0 && (
              <span className="shrink-0 text-text-muted">Intervalos: {breakHours}</span>
            )}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>
              Ocupado: {occupiedHours}
              {windowHours ? ` / Janela: ${windowHours}` : ' / Janela livre'}
            </span>
          </div>
          {onAdjustStudyLoad && (
            <div className="flex shrink-0 flex-col items-stretch gap-1.5 sm:flex-row">
              <button
                type="button"
                onClick={() => onAdjustStudyLoad(date, -1)}
                className="min-h-[34px] rounded-lg border border-white/15 bg-white/[0.02] px-2.5 py-1 text-xs text-text-secondary transition-colors hover:border-neon-blue/50 hover:text-neon-blue"
                aria-label="Diminuir uma materia deste dia"
              >
                Diminuir matéria
              </button>
              <button
                type="button"
                onClick={() => onAdjustStudyLoad(date, 1)}
                className="min-h-[34px] rounded-lg border border-white/15 bg-white/[0.02] px-2.5 py-1 text-xs text-text-secondary transition-colors hover:border-neon-blue/50 hover:text-neon-blue"
                aria-label="Aumentar uma materia neste dia"
              >
                Aumentar matéria
              </button>
            </div>
          )}
        </div>
        {studyOverMinutes > 0 && (
          <p className="mt-2 text-xs text-amber-300">
            Acima da meta de estudo: {formatDuration(studyOverMinutes)}
          </p>
        )}
        {windowOverMinutes > 0 && (
          <p className="mt-2 text-xs text-red-400">
            Fora da janela disponivel: {formatDuration(windowOverMinutes)}
          </p>
        )}
        {windowCapacityMinutes > 0 && (
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-300',
                windowOverMinutes > 0
                  ? 'bg-red-400'
                  : usageRatio >= 0.85
                  ? 'bg-amber-300'
                  : 'bg-neon-cyan'
              )}
              style={{ width: usageRatio > 0 ? `${Math.max(6, Math.round(usageRatio * 100))}%` : '0%' }}
            />
          </div>
        )}

      </div>

      {/* Container de Blocos */}
      <div className="space-y-1.5 overflow-y-auto overflow-x-visible p-1.5 sm:space-y-2 sm:p-2.5 md:max-h-[min(58dvh,44rem)]">
        <SortableContext
          items={blocks.map((b) => b.id)}
          strategy={verticalListSortingStrategy}
        >
          {blocks.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-center">
              <p className="text-sm text-text-muted">Nenhum estudo planejado</p>
              <p className="mt-1 text-xs text-text-muted">Toque abaixo para adicionar um estudo</p>
            </div>
          ) : (
            blocks.map((block) => (
              <TimeBlock
                key={block.id}
                block={block}
                onStart={onStartBlock}
                onMarkDone={onMarkBlockDone}
                onSkipToday={onSkipBlockToday}
                onQuickReschedule={onQuickRescheduleBlock}
                notificationsEnabled={notificationsEnabled}
                notificationMinutesBefore={notificationMinutesBefore}
                onEdit={onEditBlock}
                onDelete={onDeleteBlock}
              />
            ))
          )}
        </SortableContext>
      </div>

      {/* Botão Adicionar Bloco */}
      <div className="border-t border-white/10 p-3 md:border-card-border">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onAddBlock(date)}
          className={cn(
            'flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/[0.02] p-3 text-sm text-text-secondary',
            'hover:border-neon-blue/50 hover:bg-neon-blue/5 hover:text-neon-blue',
            'transition-all duration-200'
          )}
        >
          <Plus className="w-4 h-4" />
          Adicionar estudo
        </motion.button>
      </div>
    </div>
  );
}
