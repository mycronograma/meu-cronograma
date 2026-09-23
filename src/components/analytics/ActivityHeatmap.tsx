'use client';

/**
 * ActivityHeatmap Component
 * Mapa de calor estilo GitHub mostrando consistência nos estudos
 */

import { motion } from 'framer-motion';
import { cn, formatHoursDuration, toLocalDateKey, parseBlockDate } from '@/lib/utils';
import { Card } from '@/components/ui';

interface HeatmapData {
  date: string;
  hours: number;
  level: 0 | 1 | 2 | 3 | 4;
}

interface ActivityHeatmapProps {
  data: HeatmapData[];
  weeks?: number;
}

const levelColors = [
  'bg-card-bg',
  'bg-neon-blue/20',
  'bg-neon-blue/40',
  'bg-neon-blue/60',
  'bg-neon-blue',
];

const dayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export default function ActivityHeatmap({ data, weeks = 12 }: ActivityHeatmapProps) {
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - weeks * 7 + 1);

  const dataMap = new Map(data.map((d) => [d.date, d]));

  const weeksData: HeatmapData[][] = [];
  let currentDate = new Date(startDate);

  const dayOfWeek = currentDate.getDay();
  currentDate.setDate(currentDate.getDate() - dayOfWeek);

  for (let week = 0; week < weeks; week++) {
    const weekData: HeatmapData[] = [];
    for (let day = 0; day < 7; day++) {
      const dateStr = toLocalDateKey(currentDate);
      const existingData = dataMap.get(dateStr);
      weekData.push(
        existingData || {
          date: dateStr,
          hours: 0,
          level: 0,
        }
      );
      currentDate.setDate(currentDate.getDate() + 1);
    }
    weeksData.push(weekData);
  }

  const totalHours = data.reduce((sum, d) => sum + d.hours, 0);
  const activeDays = data.filter((d) => d.hours > 0).length;

  return (
    <Card className="h-full">
      <div className="mb-6 flex min-w-0 flex-col gap-4 max-[479px]:mb-4 max-[479px]:gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl max-[479px]:text-lg font-heading font-bold text-white">
            Mapa de Atividades
          </h2>
          <p className="text-sm max-[479px]:text-xs text-text-secondary mt-1">
            Sua consistência de estudos nas últimas {weeks} semanas
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm max-[479px]:gap-2 max-[479px]:text-xs sm:gap-4">
          <div>
            <span className="text-text-secondary">Total: </span>
            <span className="font-bold text-white">{formatHoursDuration(totalHours)}</span>
          </div>
          <div>
            <span className="text-text-secondary">Dias Ativos: </span>
            <span className="font-bold text-neon-cyan">{activeDays}</span>
          </div>
        </div>
      </div>

      <div className="max-w-full overflow-hidden">
        <div className="w-full min-w-0">
          <div className="flex mb-2 max-[479px]:mb-1.5 ml-8 max-[479px]:ml-6">
            {dayLabels.map((day, i) => (
              <div
                key={day}
                className="text-xs max-[479px]:text-[10px] text-text-muted w-[14px] max-[479px]:w-[11px] mr-[3px] max-[479px]:mr-[2px]"
                style={{
                  visibility: i % 2 === 1 ? 'visible' : 'hidden',
                }}
              >
                {day.slice(0, 1)}
              </div>
            ))}
          </div>

          <div className="flex gap-1 max-[479px]:gap-[3px]">
            <div className="w-6 max-[479px]:w-5" />

            {weeksData.map((week, weekIndex) => (
              <div key={weekIndex} className="flex flex-col gap-1 max-[479px]:gap-[3px]">
                {week.map((day, dayIndex) => (
                  <motion.div
                    key={day.date}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: (weekIndex * 7 + dayIndex) * 0.002 }}
                    className="relative group"
                  >
                    <div
                      className={cn(
                        'w-[14px] h-[14px] max-[479px]:w-[11px] max-[479px]:h-[11px] rounded-sm border border-card-border',
                        levelColors[day.level],
                        day.level > 0 && 'border-transparent'
                      )}
                    />

                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                      <div className="glass-card px-2 py-1 text-xs whitespace-nowrap">
                        <div className="font-medium text-white">
                          {parseBlockDate(day.date).toLocaleDateString('pt-BR', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </div>
                        <div className="text-text-secondary">
                          {day.hours > 0 ? formatHoursDuration(day.hours) : 'Sem atividade'}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 max-[479px]:gap-1.5 mt-4 max-[479px]:mt-3">
        <span className="text-xs text-text-muted">Menos</span>
        {levelColors.map((color, i) => (
          <div
            key={i}
            className={cn('w-3 h-3 max-[479px]:w-2.5 max-[479px]:h-2.5 rounded-sm', color, i > 0 && 'border-none')}
            style={{ borderColor: i === 0 ? 'rgba(0,180,255,0.2)' : 'transparent' }}
          />
        ))}
        <span className="text-xs text-text-muted">Mais</span>
      </div>
    </Card>
  );
}
