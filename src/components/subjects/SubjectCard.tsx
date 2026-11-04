'use client';

/**
 * SubjectCard Component
 * Exibe uma disciplina com estatisticas e acoes
 */

import {
  BookOpen,
  Clock,
  Target,
  Edit,
  Trash2,
  Star,
} from 'lucide-react';
import { formatHoursDuration, percentage } from '@/lib/utils';
import { Card, Badge, ProgressBar, Button } from '@/components/ui';
import type { Subject } from '@/types';

interface SubjectCardProps {
  subject: Subject;
  onEdit: (subject: Subject) => void;
  onDelete: (subjectId: string) => void;
  /**
   * Horas concluídas na semana atual. Antes o card usava `subject.completedHours`
   * (acumulado de sempre) contra a meta semanal, então a barra enchia e nunca
   * mais voltava a zero.
   */
  weeklyCompletedHours?: number;
}

const difficultyLabels = ['Muito Fácil', 'Fácil', 'Médio', 'Difícil', 'Muito Difícil'];
const getPriorityLabel = (priority: number) => {
  if (priority >= 8) return 'Alta';
  if (priority >= 5) return 'Média';
  return 'Leve';
};

export default function SubjectCard({
  subject,
  onEdit,
  onDelete,
  weeklyCompletedHours,
}: SubjectCardProps) {
  const weekHours = Math.max(0, weeklyCompletedHours ?? 0);
  const completionPercent = percentage(weekHours, subject.targetHours);
  const difficultyLabel = difficultyLabels[Math.floor((subject.difficulty - 1) / 2)];
  const priorityLabel = getPriorityLabel(subject.priority);

  return (
    <Card className="group relative overflow-visible" glow="none" padding="none">
      <div className="h-2 rounded-t-xl" style={{ backgroundColor: subject.color }} />

      <div className="p-4 sm:p-6">
        <div className="mb-4 flex min-w-0 items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:h-12 sm:w-12"
              style={{ backgroundColor: `${subject.color}20` }}
            >
              <BookOpen className="h-5 w-5 sm:h-6 sm:w-6" style={{ color: subject.color }} />
            </div>

            <div className="min-w-0">
              <h3 className="truncate text-base font-heading font-bold text-white sm:text-lg">
                {subject.name}
              </h3>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Badge
                  variant={
                    subject.priority >= 8
                      ? 'danger'
                      : subject.priority >= 5
                        ? 'warning'
                        : 'default'
                  }
                  size="sm"
                >
                  {priorityLabel}
                </Badge>
                <span className="text-xs text-text-muted">{difficultyLabel}</span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(subject)}
              aria-label={`Editar ${subject.name}`}
              title={`Editar ${subject.name}`}
            >
              <Edit className="w-4 h-4" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(subject.id)}
              className="hover:text-red-400"
              aria-label={`Excluir ${subject.name}`}
              title={`Excluir ${subject.name}`}
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

        <div className="mb-4">
          <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
            <span className="min-w-0 text-sm text-text-secondary">Meta da semana</span>
            <span className="shrink-0 text-sm font-medium text-white">
              {formatHoursDuration(weekHours)} / {formatHoursDuration(subject.targetHours)}
            </span>
          </div>
          <ProgressBar
            value={weekHours}
            max={subject.targetHours}
            color={completionPercent >= 100 ? 'cyan' : 'blue'}
            size="md"
          />
        </div>

        <div className="grid grid-cols-3 gap-2 border-t border-card-border pt-4 sm:gap-4">
          <div className="min-w-0 text-center">
            <div className="mb-1 flex items-center justify-center gap-1 text-text-muted">
              <Clock className="w-3 h-3" />
            </div>
            <p className="truncate text-lg font-bold text-white">{formatHoursDuration(subject.totalHours)}</p>
            <p className="text-xs text-text-muted">Total geral</p>
          </div>

          <div className="min-w-0 text-center">
            <div className="mb-1 flex items-center justify-center gap-1 text-text-muted">
              <Target className="w-3 h-3" />
            </div>
            <p className="text-lg font-bold text-white">{subject.sessionsCount}</p>
            <p className="text-xs text-text-muted">Sessões</p>
          </div>

          <div className="min-w-0 text-center">
            <div className="mb-1 flex items-center justify-center gap-1 text-text-muted">
              <Star className="w-3 h-3" />
            </div>
            <p className="truncate text-lg font-bold text-white">
              {subject.averageScore > 0 ? `${subject.averageScore}%` : '--'}
            </p>
            <p className="text-xs text-text-muted">Média acertos</p>
          </div>
        </div>
      </div>
    </Card>
  );
}
