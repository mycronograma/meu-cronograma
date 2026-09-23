'use client';

/**
 * ProgressBar Component
 * Animated progress bar with customizable colors
 */

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface ProgressBarProps {
  value: number; // 0-100
  max?: number;
  color?: 'blue' | 'purple' | 'cyan' | 'gradient';
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  label?: string;
  className?: string;
  animated?: boolean;
}

const colorStyles = {
  blue: 'bg-neon-blue',
  purple: 'bg-neon-purple',
  cyan: 'bg-neon-cyan',
  gradient: 'bg-gradient-to-r from-neon-blue via-neon-purple to-neon-cyan',
};

const sizeStyles = {
  sm: 'h-1.5',
  md: 'h-2.5',
  lg: 'h-4',
};

export default function ProgressBar({
  value,
  max = 100,
  color = 'gradient',
  size = 'md',
  showLabel = false,
  label,
  className,
  animated = true,
}: ProgressBarProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className={cn('w-full', className)}>
      {/* Label */}
      {(showLabel || label) && (
        <div className="flex justify-between items-center mb-2">
          {label && (
            <span className="text-sm text-text-secondary">{label}</span>
          )}
          {showLabel && (
            <span className="text-sm font-medium text-white">
              {Math.round(percentage)}%
            </span>
          )}
        </div>
      )}

      {/* Progress Track */}
      <div
        className={cn(
          'w-full rounded-full overflow-hidden',
          'bg-card-bg border border-card-border',
          sizeStyles[size]
        )}
      >
        {/* Progress Fill */}
        <motion.div
          initial={animated ? { width: 0 } : { width: `${percentage}%` }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 1, ease: 'easeOut' }}
          className={cn(
            'h-full rounded-full',
            colorStyles[color]
          )}
          style={{
            boxShadow: percentage > 0 
              ? `0 0 10px ${color === 'cyan' ? 'rgba(0, 255, 200, 0.5)' : 'rgba(0, 180, 255, 0.5)'}` 
              : 'none',
          }}
        />
      </div>
    </div>
  );
}
