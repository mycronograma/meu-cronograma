'use client';

/**
 * SubjectDistribution Component
 * Gráfico de pizza mostrando distribuição de tempo entre disciplinas
 */

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui';
import { formatHoursDuration } from '@/lib/utils';

interface SubjectDistributionProps {
  data: {
    name: string;
    hours: number;
    color: string;
  }[];
}

type SubjectDistributionDatum = {
  name: string;
  hours: number;
  color: string;
  percentage: number;
};

type SubjectDistributionTooltipEntry = {
  payload: SubjectDistributionDatum;
};

const CustomTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: SubjectDistributionTooltipEntry[];
}) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="glass-card p-3">
        <p className="text-sm font-medium text-white">{data.name}</p>
        <p className="text-sm" style={{ color: data.color }}>
          {formatHoursDuration(data.hours)}
        </p>
        <p className="text-xs text-text-muted">
          {data.percentage.toFixed(1)}% do total
        </p>
      </div>
    );
  }
  return null;
};

export default function SubjectDistribution({ data }: SubjectDistributionProps) {
  const [isCompactMobile, setIsCompactMobile] = useState(false);

  useEffect(() => {
    const update = () => setIsCompactMobile(window.innerWidth < 480);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Calcular porcentagens
  const totalHours = data.reduce((sum, d) => sum + d.hours, 0);
  const dataWithPercentage = data.map((d) => ({
    ...d,
    percentage: totalHours > 0 ? (d.hours / totalHours) * 100 : 0,
  }));

  return (
    <Card className="h-full min-w-0">
      <h2 className="text-xl max-[479px]:text-lg font-heading font-bold text-white mb-2 max-[479px]:mb-1">
        Distribuição por Disciplina
      </h2>
      <p className="text-sm max-[479px]:text-xs text-text-secondary mb-6 max-[479px]:mb-4">
        Tempo dedicado a cada disciplina esta semana
      </p>

      <div className="h-72 max-[479px]:h-48">
        <div className="h-full w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={dataWithPercentage}
                dataKey="hours"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={isCompactMobile ? 52 : 60}
                outerRadius={isCompactMobile ? 84 : 90}
                paddingAngle={2}
                stroke="none"
              >
                {dataWithPercentage.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Legenda */}
      <div className="mt-4 grid grid-cols-1 gap-2 max-[479px]:mt-3 max-[479px]:gap-1.5 sm:grid-cols-2">
        {dataWithPercentage.map((subject) => (
          <div key={subject.name} className="flex min-w-0 items-center gap-2 max-[479px]:gap-1.5">
            <div
              className="w-3 h-3 max-[479px]:w-2.5 max-[479px]:h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: subject.color }}
            />
            <span className="min-w-0 flex-1 truncate text-sm text-text-secondary max-[479px]:text-xs">
              {subject.name}
            </span>
            <span className="shrink-0 text-sm font-medium text-white max-[479px]:text-xs">
              {formatHoursDuration(subject.hours)}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
