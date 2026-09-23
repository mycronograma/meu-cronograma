'use client';

/**
 * TodayPlan Component
 * Exibe os blocos de estudo do dia com horário e status
 */

import { motion } from 'framer-motion';
import { Clock, Play, CheckCircle2, SkipForward, Coffee } from 'lucide-react';
import { cn, formatDuration } from '@/lib/utils';
import { getStudyBlockDisplayTitle } from '@/lib/studyBlockLabels';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import type { StudyBlock } from '@/types';

interface TodayPlanProps {
  blocks: StudyBlock[];
  onStartSession: (blockId: string) => void;
  onSkipBlock: (blockId: string) => void;
  onCompleteBlock?: (blockId: string, minutesSpent?: number) => void;
  onStartBlock?: (block: StudyBlock) => void;
  title?: string;
  subtitle?: string;
}

const statusConfig = {
  scheduled: { badge: 'default', icon: Clock, label: 'Agendado' },
  rescheduled: { badge: 'warning', icon: Clock, label: 'Reagendado' },
  'in-progress': { badge: 'warning', icon: Play, label: 'Em Andamento' },
  completed: { badge: 'success', icon: CheckCircle2, label: 'Concluído' },
  skipped: { badge: 'danger', icon: SkipForward, label: 'Pulado' },
} as const;

export default function TodayPlan({
  blocks,
  onStartSession,
  onSkipBlock,
  onCompleteBlock,
  onStartBlock,
  title = 'Plano de Hoje',
  subtitle,
}: TodayPlanProps) {
  const currentTime = new Date().toTimeString().slice(0, 5);
  
  // Encontrar bloco atual ou próximo
  const currentBlockIndex = blocks.findIndex(
    (block) =>
      (block.status === 'scheduled' || block.status === 'rescheduled') &&
      block.startTime <= currentTime &&
      block.endTime > currentTime
  );
  const nextBlockIndex = blocks.findIndex(
    (block) => (block.status === 'scheduled' || block.status === 'rescheduled') && block.startTime > currentTime
  );

  return (
    <Card padding="none">
      <div className="p-4 max-[479px]:p-3 sm:p-6 border-b border-card-border">
        <h2 className="text-xl max-[479px]:text-lg font-heading font-bold text-white">{title}</h2>
        <p className="text-sm max-[479px]:text-xs text-text-secondary mt-1">
          {subtitle ??
            `${blocks.filter((b) => b.status === 'completed').length} de ${blocks.length} estudos concluídos`}
        </p>
      </div>

      <div className="p-3 max-[479px]:p-2.5 sm:p-4 space-y-3 max-[479px]:space-y-2 max-h-[420px] max-[479px]:max-h-[360px] sm:max-h-[500px] overflow-y-auto">
        {blocks.length === 0 ? (
          <div className="text-center py-8 max-[479px]:py-6">
            <Coffee className="w-12 h-12 max-[479px]:w-10 max-[479px]:h-10 text-text-muted mx-auto mb-4 max-[479px]:mb-2" />
            <p className="text-text-secondary">Nenhum estudo planejado para hoje</p>
            <p className="text-sm max-[479px]:text-xs text-text-muted mt-1">
              Abra a Agenda para gerar ou ajustar seu cronograma.
            </p>
          </div>
        ) : (
          blocks.map((block, index) => {
            const config = statusConfig[block.status];
            const Icon = config.icon;
            const isActive = index === currentBlockIndex;
            const isNext = index === nextBlockIndex && currentBlockIndex === -1;

            return (
              <motion.div
                key={block.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className={cn(
                  'relative p-4 max-[479px]:p-3 rounded-xl border transition-all duration-200',
                  block.isBreak
                    ? 'bg-neon-cyan/5 border-neon-cyan/20'
                    : 'bg-card-bg border-card-border',
                  isActive && 'ring-2 ring-neon-blue shadow-neon-blue',
                  isNext && 'ring-2 ring-neon-purple/50',
                  block.status === 'completed' && 'opacity-60',
                  block.status === 'skipped' && 'opacity-40'
                )}
              >
                {/* Linha indicadora de cor */}
                {block.subject && (
                  <div
                    className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
                    style={{ backgroundColor: block.subject.color }}
                  />
                )}

                <div className="ml-2 flex min-w-0 flex-col gap-3 max-[479px]:gap-2 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1">
                    {/* Título do Bloco */}
                    <div className="flex min-w-0 items-center gap-2 max-[479px]:gap-1.5">
                      {block.isBreak ? (
                        <Coffee className="w-4 h-4 max-[479px]:w-3.5 max-[479px]:h-3.5 text-neon-cyan" />
                      ) : (
                        <div
                          className="w-3 h-3 max-[479px]:w-2.5 max-[479px]:h-2.5 rounded-full"
                          style={{ backgroundColor: block.subject?.color || '#00B4FF' }}
                        />
                      )}
                      <h4 className="min-w-0 break-words font-medium text-white max-[479px]:text-sm">
                        {getStudyBlockDisplayTitle(block)}
                      </h4>
                    </div>

                    {/* Informações de Horário */}
                    <div className="flex items-center gap-4 mt-2 max-[479px]:mt-1.5 text-sm max-[479px]:text-xs text-text-secondary">
                      <span>{formatDuration(block.durationMinutes)}</span>
                      {!block.isBreak && block.pedagogicalStepIndex && (
                        <span>
                          Ciclo {block.pedagogicalStepIndex}/{block.pedagogicalStepTotal ?? 4}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Status e Ações */}
                  <div className="flex flex-col items-start md:items-end gap-2 w-full md:w-auto">
                    <Badge variant={config.badge as 'default' | 'success' | 'warning' | 'danger'} size="sm">
                      <Icon className="w-3 h-3 mr-1" />
                      {config.label}
                    </Badge>

                    <div className="flex w-full flex-wrap justify-start gap-2 max-[479px]:gap-1.5 md:w-auto md:justify-end">
                      {onStartBlock && (
                        <Button
                          variant={block.isBreak ? 'secondary' : 'primary'}
                          size="sm"
                          onClick={() => onStartBlock(block)}
                          className="min-h-[40px] max-[479px]:min-h-[34px]"
                        >
                          <Play className="w-3 h-3" />
                          Iniciar
                        </Button>
                      )}
                      {(block.status === 'scheduled' || block.status === 'rescheduled') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onSkipBlock(block.id)}
                          className="min-h-[40px] max-[479px]:min-h-[34px]"
                        >
                          Pular
                        </Button>
                      )}
                      {onCompleteBlock && block.status !== 'completed' && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => onCompleteBlock(block.id)}
                          className="min-h-[40px] max-[479px]:min-h-[34px]"
                        >
                          Concluir
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Indicador ativo */}
                {isActive && (
                  <motion.div
                    className="absolute -right-1 -top-1 w-3 h-3 bg-neon-blue rounded-full"
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                  />
                )}
              </motion.div>
            );
          })
        )}
      </div>
    </Card>
  );
}

