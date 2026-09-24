'use client';

/**
 * Button Component
 * Customizable button with multiple variants and states
 */

import { forwardRef } from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMotionPrefs } from '@/hooks/useMotionPrefs';

interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const variantStyles = {
  primary: [
    'bg-gradient-to-r from-neon-blue to-neon-purple',
    'text-white font-medium',
    'border-none',
    'hover:shadow-neon-blue',
  ].join(' '),
  secondary: [
    'bg-transparent',
    'text-neon-blue',
    'border border-neon-blue/30',
    'hover:bg-neon-blue/10 hover:border-neon-blue',
  ].join(' '),
  ghost: [
    'bg-transparent',
    'text-text-secondary',
    'border-none',
    'hover:bg-card-bg hover:text-white',
  ].join(' '),
  danger: [
    'bg-red-500/20',
    'text-red-400',
    'border border-red-500/30',
    'hover:bg-red-500/30',
  ].join(' '),
};

const sizeStyles = {
  sm: 'min-h-[44px] px-3 py-2 text-sm rounded-lg',
  md: 'min-h-[44px] px-4 py-2.5 text-sm rounded-xl',
  lg: 'min-h-[46px] px-6 py-3 text-base rounded-xl',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      loading = false,
      leftIcon,
      rightIcon,
      className,
      disabled,
      type = 'button',
      ...props
    },
    ref
  ) => {
    const { hoverEffects } = useMotionPrefs();
    const isInactive = Boolean(disabled || loading);

    return (
      <motion.button
        ref={ref}
        type={type}
        whileHover={isInactive || !hoverEffects ? undefined : { scale: 1.02, y: -1 }}
        whileTap={isInactive ? undefined : { scale: hoverEffects ? 0.98 : 1 }}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(
          'inline-flex min-w-0 max-w-full items-center justify-center gap-2 text-center leading-tight',
          'transition-all duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-blue/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
          'cursor-pointer',
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        ) : (
          leftIcon
        )}
        {children}
        {!loading && rightIcon}
      </motion.button>
    );
  }
);

Button.displayName = 'Button';

export default Button;
