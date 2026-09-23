'use client';

/**
 * StatsCard Component
 * Displays a single statistic with icon and trend indicator
 */

import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import Card from './Card';

interface StatsCardProps {
  title: string;
  titleShort?: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  color?: 'blue' | 'purple' | 'cyan' | 'orange';
  variant?: 'default' | 'mobile';
  className?: string;
}

const colorStyles = {
  blue: {
    iconBg: 'bg-neon-blue/20',
    iconColor: 'text-neon-blue',
    glow: 'blue',
  },
  purple: {
    iconBg: 'bg-neon-purple/20',
    iconColor: 'text-neon-purple',
    glow: 'purple',
  },
  cyan: {
    iconBg: 'bg-neon-cyan/20',
    iconColor: 'text-neon-cyan',
    glow: 'cyan',
  },
  orange: {
    iconBg: 'bg-orange-500/20',
    iconColor: 'text-orange-500',
    glow: 'none',
  },
} as const;

export default function StatsCard({
  title,
  titleShort,
  value,
  subtitle,
  icon: Icon,
  trend,
  color = 'blue',
  variant = 'default',
  className,
}: StatsCardProps) {
  const styles = colorStyles[color];
  const isMobile = variant === 'mobile';
  const displayTitle = isMobile && titleShort ? titleShort : title;
  const showTrend = Boolean(trend && trend.value !== 0);

  return (
    <Card
      className={cn(
        'stats-card',
        isMobile
          ? 'p-3 sm:p-6 max-[479px]:p-2.5 max-[479px]:rounded-lg max-[479px]:min-h-[114px]'
          : 'p-4 sm:p-6',
        'max-[479px]:rounded-xl',
        className
      )}
      glow={styles.glow as 'blue' | 'purple' | 'cyan' | 'none'}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        {/* Icon */}
        <motion.div
          whileHover={{ scale: 1.1, rotate: 5 }}
          className={cn(
            isMobile
              ? 'w-8 h-8 sm:w-12 sm:h-12 max-[479px]:w-7 max-[479px]:h-7 rounded-xl flex items-center justify-center'
              : 'w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center',
            styles.iconBg
          )}
        >
          <Icon
            className={cn(
              isMobile
                ? 'w-4 h-4 sm:w-6 sm:h-6 max-[479px]:w-[15px] max-[479px]:h-[15px]'
                : 'w-5 h-5 sm:w-6 sm:h-6',
              styles.iconColor
            )}
          />
        </motion.div>

        {/* Trend Indicator */}
        {showTrend && trend && (
          <div
            className={cn(
              isMobile
                ? 'flex items-center gap-1 text-[11px] max-[479px]:text-[10px] font-medium'
                : 'flex items-center gap-1 text-sm font-medium',
              trend.isPositive ? 'text-neon-cyan' : 'text-red-400'
            )}
          >
            {trend.isPositive ? (
              <TrendingUp className={cn(isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4')} />
            ) : (
              <TrendingDown className={cn(isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4')} />
            )}
            <span>{Math.abs(trend.value)}%</span>
          </div>
        )}
      </div>

      {/* Value */}
      <div className={cn(isMobile ? 'mt-2 max-[479px]:mt-1.5' : 'mt-3', 'min-w-0')}>
        <motion.h3
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            isMobile ? 'text-xl sm:text-3xl max-[479px]:text-[22px]' : 'text-2xl sm:text-3xl',
            'font-heading font-bold text-white'
          )}
        >
          {value}
        </motion.h3>
        <p
          className={cn(
            isMobile ? 'text-xs max-[479px]:text-[12px]' : 'text-sm',
            'mt-1 truncate text-text-secondary max-[479px]:mt-0.5'
          )}
        >
          {displayTitle}
        </p>
        {subtitle && (
          <p className={cn(isMobile ? 'mt-1 hidden truncate text-xs text-text-muted sm:block' : 'mt-1 truncate text-xs text-text-muted')}>
            {subtitle}
          </p>
        )}
      </div>
    </Card>
  );
}
