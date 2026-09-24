'use client';

/**
 * Card Component
 * Glassmorphism card with optional glow effects
 */

import { motion, HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useMotionPrefs } from '@/hooks/useMotionPrefs';

interface CardProps extends HTMLMotionProps<'div'> {
  children: React.ReactNode;
  className?: string;
  glow?: 'blue' | 'purple' | 'cyan' | 'none';
  hover?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const glowStyles = {
  blue: 'hover:shadow-neon-blue',
  purple: 'hover:shadow-neon-purple',
  cyan: 'hover:shadow-neon-cyan',
  none: '',
};

const paddingStyles = {
  none: 'p-0',
  sm: 'p-3 sm:p-4',
  md: 'p-4 sm:p-6',
  lg: 'p-5 sm:p-8',
};

export default function Card({
  children,
  className,
  glow = 'blue',
  hover = true,
  padding = 'md',
  ...props
}: CardProps) {
  const { hoverEffects } = useMotionPrefs();

  return (
    <motion.div
      // Sem mouse de verdade (celular/tablet) ou com movimento reduzido, o card
      // não "levanta" — no toque isso ficava grudado depois do tap.
      whileHover={hover && hoverEffects ? { y: -2 } : undefined}
      transition={{ duration: hoverEffects ? 0.2 : 0 }}
      className={cn(
        'glass-card w-full min-w-0',
        paddingStyles[padding],
        hover && glowStyles[glow],
        className
      )}
      {...props}
    >
      {children}
    </motion.div>
  );
}
