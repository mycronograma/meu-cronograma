'use client';

/**
 * Skeleton Component
 * Placeholder loading states with animated shimmer effect
 */

import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular' | 'chart';
  width?: string | number;
  height?: string | number;
  lines?: number;
}

export default function Skeleton({
  className,
  variant = 'rectangular',
  width,
  height,
  lines = 1,
}: SkeletonProps) {
  const baseClasses = 'animate-pulse bg-gradient-to-r from-card-bg via-card-border/30 to-card-bg bg-[length:200%_100%] animate-shimmer';

  if (variant === 'text' && lines > 1) {
    return (
      <div className={cn('space-y-2', className)}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={cn(
              baseClasses,
              'h-4 rounded',
              i === lines - 1 && 'w-3/4'
            )}
            style={{ width: i === lines - 1 ? '75%' : width }}
          />
        ))}
      </div>
    );
  }

  if (variant === 'chart') {
    const chartHeights = [55, 35, 80, 45, 70, 60, 50];
    return (
      <div className={cn('space-y-4', className)}>
        {/* Chart bars */}
        <div className="flex items-end justify-between gap-2 h-40">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className={cn(baseClasses, 'flex-1 rounded-t')}
              style={{ height: `${chartHeights[i % chartHeights.length]}%` }}
            />
          ))}
        </div>
        {/* X-axis labels */}
        <div className="flex justify-between gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className={cn(baseClasses, 'h-3 flex-1 rounded')} />
          ))}
        </div>
      </div>
    );
  }

  const variantClasses = {
    text: 'h-4 rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-xl',
    chart: '',
  };

  return (
    <div
      className={cn(baseClasses, variantClasses[variant], className)}
      style={{ width, height }}
    />
  );
}

// Skeleton card component for stats
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('glass-card p-6', className)}>
      <div className="flex items-start justify-between mb-4">
        <Skeleton variant="rectangular" className="w-12 h-12" />
        <Skeleton variant="text" className="w-16 h-5" />
      </div>
      <Skeleton variant="text" className="w-20 h-8 mb-2" />
      <Skeleton variant="text" className="w-32 h-4" />
    </div>
  );
}

// Skeleton for weekly chart
export function SkeletonChart({ className }: { className?: string }) {
  return (
    <div className={cn('glass-card p-6', className)}>
      <Skeleton variant="text" className="w-48 h-6 mb-2" />
      <Skeleton variant="text" className="w-32 h-4 mb-6" />
      <Skeleton variant="chart" className="h-64" />
    </div>
  );
}

// Skeleton for today's plan
export function SkeletonPlan({ className }: { className?: string }) {
  return (
    <div className={cn('glass-card', className)}>
      <div className="p-6 border-b border-card-border">
        <Skeleton variant="text" className="w-40 h-6 mb-2" />
        <Skeleton variant="text" className="w-24 h-4" />
      </div>
      <div className="p-4 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="p-4 rounded-xl border border-card-border bg-card-bg">
            <div className="flex items-center gap-3">
              <Skeleton variant="rectangular" className="w-4 h-4" />
              <div className="flex-1">
                <Skeleton variant="text" className="w-32 h-5 mb-2" />
                <Skeleton variant="text" className="w-48 h-4" />
              </div>
              <Skeleton variant="rectangular" className="w-20 h-6 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
