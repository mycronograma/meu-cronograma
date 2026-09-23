'use client';

/**
 * Badge Component
 * Small label for tags, statuses, and indicators
 */

import { cn } from '@/lib/utils';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'purple';
  size?: 'sm' | 'md';
  className?: string;
}

const variantStyles = {
  default: 'bg-neon-blue/15 text-neon-blue border-neon-blue/30',
  success: 'bg-neon-cyan/15 text-neon-cyan border-neon-cyan/30',
  warning: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  danger: 'bg-red-500/15 text-red-400 border-red-500/30',
  purple: 'bg-neon-purple/15 text-neon-purple border-neon-purple/30',
};

const sizeStyles = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-3 py-1 text-sm',
};

export default function Badge({
  children,
  variant = 'default',
  size = 'md',
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded-full border',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
    >
      {children}
    </span>
  );
}
