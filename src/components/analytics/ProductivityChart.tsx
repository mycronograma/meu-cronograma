'use client';

/**
 * ProductivityChart Component
 * Gráfico de linha mostrando tendências de produtividade e foco ao longo do tempo
 */

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui';
import { formatHoursDuration } from '@/lib/utils';

interface ProductivityChartProps {
  data: {
    date: string;
    focusScore: number;
    productivityScore: number;
    hours: number;
  }[];
}

type ProductivityTooltipEntry = {
  name?: string;
  value?: number;
  color?: string;
};

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: ProductivityTooltipEntry[];
  label?: string;
}) => {
  if (active && payload && payload.length) {
    return (
      <div className="glass-card p-3">
        <p className="text-sm font-medium text-white mb-2">{label}</p>
        {payload.map((entry, index) => (
          <p key={index} className="text-sm" style={{ color: entry.color }}>
            {entry.name === 'Horas'
              ? `${entry.name}: ${formatHoursDuration(entry.value ?? 0)}`
              : `${entry.name}: ${entry.value ?? 0}%`}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default function ProductivityChart({ data }: ProductivityChartProps) {
  const [isCompactMobile, setIsCompactMobile] = useState(false);

  useEffect(() => {
    const update = () => setIsCompactMobile(window.innerWidth < 480);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return (
    <Card className="h-full min-w-0">
      <h2 className="text-xl max-[479px]:text-lg font-heading font-bold text-white mb-2 max-[479px]:mb-1">
        Tendências de Produtividade
      </h2>
      <p className="text-sm max-[479px]:text-xs text-text-secondary mb-6 max-[479px]:mb-4">
        Acompanhe seu foco e produtividade ao longo do tempo
      </p>

      <div className="h-72 max-[479px]:h-48">
        <div className="h-full w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(0, 180, 255, 0.1)"
              />
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#8892A6', fontSize: 12 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#8892A6', fontSize: 12 }}
                domain={[0, 100]}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ paddingTop: isCompactMobile ? 12 : 20 }}
                formatter={(value) => (
                  <span className="text-sm max-[479px]:text-xs text-text-secondary">{value}</span>
                )}
              />
              <Line
                type="monotone"
                dataKey="focusScore"
                name="Foco"
                stroke="#00B4FF"
                strokeWidth={2}
                dot={{ fill: '#00B4FF', strokeWidth: 0, r: 4 }}
                activeDot={{ r: 6, stroke: '#00B4FF', strokeWidth: 2 }}
              />
              <Line
                type="monotone"
                dataKey="productivityScore"
                name="Produtividade"
                stroke="#7F00FF"
                strokeWidth={2}
                dot={{ fill: '#7F00FF', strokeWidth: 0, r: 4 }}
                activeDot={{ r: 6, stroke: '#7F00FF', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Card>
  );
}
