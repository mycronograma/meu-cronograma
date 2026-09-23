'use client';

/**
 * TimeBlock Component
 * Bloco de estudo arrastável para o planner
 */

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion } from 'framer-motion';
import {
  GripVertical,
  Bell,
  Coffee,
  Trash2,
  Edit,
  Play,
  BookOpen,
  PenTool,
  Repeat,
  Timer,
  CheckCircle2,
  SkipForward,
  CalendarClock,
} from 'lucide-react';
import { cn, formatDuration } from '@/lib/utils';
import { getStudyBlockDisplayTitle } from '@/lib/studyBlockLabels';
import { getStudyBlockNotificationPreview } from '@/services/notificationScheduler';
import type { StudyBlock } from '@/types';

interface TimeBlockProps {
  block: StudyBlock;
  onEdit?: (block: StudyBlock) => void;
  onDelete?: (blockId: string) => void;
  onStart?: (block: StudyBlock) => void;
  onMarkDone?: (block: StudyBlock) => void;
  onSkipToday?: (block: StudyBlock) => void;
  onQuickReschedule?: (block: StudyBlock) => void;
  notificationsEnabled?: boolean;
  notificationMinutesBefore?: number;
  isDragging?: boolean;
}

export default function TimeBlock({
  block,
  onEdit,
  onDelete,
  onStart,
  onMarkDone,
  onSkipToday,
  onQuickReschedule,
  notificationsEnabled = false,
  notificationMinutesBefore = 15,
  isDragging = false,
}: TimeBlockProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const statusColors = {
    scheduled: 'border-white/10 bg-[linear-gradient(160deg,rgba(23,26,36,0.97),rgba(16,19,30,0.97))]',
    'in-progress': 'border-yellow-400/45 bg-[linear-gradient(160deg,rgba(77,57,24,0.34),rgba(24,23,31,0.96))]',
    completed: 'border-neon-cyan/45 bg-[linear-gradient(160deg,rgba(15,71,76,0.35),rgba(18,26,38,0.96))]',
    skipped: 'border-red-500/30 bg-[linear-gradient(160deg,rgba(89,30,40,0.28),rgba(24,19,29,0.92))] opacity-70',
    rescheduled: 'border-amber-400/40 bg-[linear-gradient(160deg,rgba(85,62,28,0.26),rgba(25,23,33,0.96))]',
  };
  const statusLabelMap: Record<StudyBlock['status'], string> = {
    scheduled: 'Pendente',
    'in-progress': 'Em andamento',
    completed: 'Concluído',
    skipped: 'Pulado',
    rescheduled: 'Reagendado',
  };

  const typeBadge = block.type
    ? {
        AULA: { label: 'Aula', icon: BookOpen, className: 'bg-neon-blue/15 text-neon-blue border-neon-blue/30' },
        EXERCICIOS: { label: 'Exercícios', icon: PenTool, className: 'bg-neon-purple/15 text-neon-purple border-neon-purple/30' },
        REVISAO: { label: 'Revisão', icon: Repeat, className: 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30' },
        SIMULADO_AREA: { label: 'Simulado (Área)', icon: Timer, className: 'bg-amber-400/15 text-amber-300 border-amber-400/30' },
        SIMULADO_COMPLETO: { label: 'Simulado (Completo)', icon: Timer, className: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
        ANALISE: { label: 'Correção', icon: Repeat, className: 'bg-slate-400/15 text-slate-200 border-slate-400/30' },
      }[block.type]
    : null;
  const displayTitle =
    !block.isBreak && block.subject?.name
      ? block.subject.name
      : getStudyBlockDisplayTitle(block);

  const notificationPreview = getStudyBlockNotificationPreview(
    block,
    {
      notificationsEnabled,
      notificationMinutesBefore,
    },
    new Date()
  );
  const showNotificationBadge = notificationPreview.isActive;

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        'group relative overflow-hidden rounded-2xl border p-2.5 sm:p-3.5',
        'transition-all duration-200 hover:-translate-y-[1px]',
        statusColors[block.status],
        isDragging && 'shadow-lg shadow-neon-blue/20 z-50'
      )}
    >
      {/* Indicador de cor */}
      {!block.isBreak && block.subject && (
        <div
          className="absolute bottom-1.5 left-0 top-1.5 w-1 rounded-r-full sm:bottom-2 sm:top-2"
          style={{ backgroundColor: block.subject.color }}
        />
      )}

      <div className="ml-1 grid min-w-0 grid-cols-[2.25rem_minmax(0,1fr)] items-start gap-2 sm:ml-2 sm:grid-cols-[2.5rem_minmax(0,1fr)] sm:items-center sm:gap-2.5">
        {/* Alça de Arrastar */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="flex h-9 w-9 shrink-0 cursor-grab items-center justify-center rounded-lg hover:bg-white/5 active:cursor-grabbing sm:h-10 sm:w-10"
          aria-label="Arrastar estudo"
        >
          <GripVertical className="w-3 h-3 text-text-muted sm:w-3.5 sm:h-3.5" />
        </button>

        {/* Conteúdo do Bloco */}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
            {block.isBreak ? (
              <Coffee className="w-3.5 h-3.5 text-neon-cyan sm:w-4 sm:h-4" />
            ) : (
              <div
                className="h-2.5 w-2.5 rounded-full flex-shrink-0 sm:h-3 sm:w-3"
                style={{ backgroundColor: block.subject?.color || '#00B4FF' }}
              />
            )}
            <h4 className="min-w-0 max-w-full truncate text-sm font-medium text-white sm:text-[1rem]">
              {displayTitle}
            </h4>
            {showNotificationBadge && (
              <span
                className="inline-flex shrink-0 items-center justify-center rounded-full border border-neon-cyan/40 bg-neon-cyan/10 p-1 text-neon-cyan"
                title={`Notificacao ${notificationPreview.minutesBefore} min antes`}
                aria-label={`Notificacao ${notificationPreview.minutesBefore} minutos antes`}
              >
                <Bell className="h-3 w-3" />
              </span>
            )}
          </div>

          <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-text-secondary sm:mt-1 sm:gap-1.5 sm:text-xs">
            <span className="text-text-muted text-[11px] sm:text-[12px]">
              {formatDuration(block.durationMinutes)}
            </span>
            {!block.isBreak && (
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-1.5 py-0 text-[9px] text-text-secondary sm:px-2 sm:py-0.5 sm:text-[10px]">
                {statusLabelMap[block.status]}
              </span>
            )}
            {typeBadge && !block.isBreak && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-1.5 py-0 text-[9px] font-medium sm:px-2 sm:py-0.5 sm:text-[10px]',
                  typeBadge.className
                )}
              >
                <typeBadge.icon className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                {typeBadge.label}
              </span>
            )}
            {!block.isBreak && block.pedagogicalStepIndex && (
              <span className="hidden sm:inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-text-secondary">
                Ciclo {block.pedagogicalStepIndex}/{block.pedagogicalStepTotal ?? 4}
              </span>
            )}
          </div>

          {!block.isBreak && block.description && (
            <p className="mt-2 hidden overflow-hidden break-words text-xs leading-relaxed text-text-muted sm:[display:-webkit-box] sm:[-webkit-box-orient:vertical] sm:[-webkit-line-clamp:2]">
              {block.description}
            </p>
          )}
        </div>

        {/* Ações */}
        <div className="col-start-2 mt-2 flex w-full flex-wrap items-center gap-1 sm:flex-nowrap">
          {!block.isBreak && onMarkDone && block.status !== 'completed' && (
            <button
              type="button"
              onClick={() => onMarkDone(block)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-emerald-500/10 text-emerald-300 hover:text-emerald-200 transition-colors sm:h-9 sm:w-9"
              aria-label="Marcar estudo como feito"
              title="Concluir"
            >
              <CheckCircle2 className="w-3 h-3 sm:w-4 sm:h-4" />
            </button>
          )}
          {onSkipToday && block.status !== 'completed' && (
            <button
              type="button"
              onClick={() => onSkipToday(block)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-red-500/10 text-red-300 hover:text-red-200 transition-colors sm:h-9 sm:w-9"
              aria-label={block.isBreak ? 'Pular intervalo' : 'Pular hoje'}
              title={block.isBreak ? 'Pular intervalo' : 'Pular hoje'}
            >
              <SkipForward className="w-3 h-3 sm:w-4 sm:h-4" />
            </button>
          )}
          {!block.isBreak && onQuickReschedule && block.status !== 'completed' && (
            <button
              type="button"
              onClick={() => onQuickReschedule(block)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-amber-500/10 text-amber-300 hover:text-amber-200 transition-colors sm:h-9 sm:w-9"
              aria-label="Reagendar estudo"
              title="Reagendar"
            >
              <CalendarClock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          )}
          {onStart && (
            <button
              type="button"
              onClick={() => onStart(block)}
              className={cn(
                'inline-flex h-10 w-10 items-center justify-center rounded-lg transition-colors sm:h-9 sm:w-9',
                block.isBreak
                  ? 'hover:bg-neon-cyan/10 text-neon-cyan hover:text-neon-cyan'
                  : 'hover:bg-neon-blue/10 text-neon-blue hover:text-neon-cyan'
              )}
              aria-label={block.isBreak ? 'Iniciar intervalo' : 'Iniciar estudo'}
            >
              <Play className="w-3 h-3 sm:w-4 sm:h-4" />
            </button>
          )}
          {onEdit && !block.isBreak && (
            <button
              type="button"
              onClick={() => onEdit(block)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-white/5 text-text-secondary hover:text-white transition-colors sm:h-9 sm:w-9"
              aria-label="Editar estudo"
            >
              <Edit className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(block.id)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-red-500/10 text-text-secondary hover:text-red-400 transition-colors sm:h-9 sm:w-9"
              aria-label="Excluir estudo"
            >
              <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
