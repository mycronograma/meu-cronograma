'use client';

/**
 * EmptyState Component
 * Estados vazios com CTAs para guiar o usuário
 */

import { motion } from 'framer-motion';
import { Plus, Sparkles, ArrowRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, Card } from '@/components/ui';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  actionDataTutorial?: string;
  secondaryLabel?: string;
  onSecondary?: () => void;
  secondaryDataTutorial?: string;
  variant?: 'default' | 'card' | 'inline';
  motivationalMessage?: string;
  className?: string;
}

export default function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  actionDataTutorial,
  secondaryLabel,
  onSecondary,
  secondaryDataTutorial,
  variant = 'default',
  motivationalMessage,
  className,
}: EmptyStateProps) {
  const content = (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'flex flex-col items-center justify-center text-center',
        variant === 'inline' ? 'py-8' : 'py-12',
        className
      )}
    >
      {/* Animated Icon */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
        className="relative mb-6"
      >
        <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-neon-blue/20 to-neon-purple/20 flex items-center justify-center">
          <Icon className="w-12 h-12 text-neon-blue" />
        </div>
        {/* Decorative rings */}
        <div className="absolute inset-0 w-24 h-24 rounded-2xl border border-neon-blue/20 animate-ping" />
      </motion.div>

      {/* Title */}
      <motion.h3
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="text-xl font-heading font-bold text-white mb-2"
      >
        {title}
      </motion.h3>

      {/* Description */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="text-text-secondary max-w-md mb-6"
      >
        {description}
      </motion.p>

      {/* Motivational Message */}
      {motivationalMessage && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5 }}
          className="mb-6 px-4 py-3 rounded-xl bg-gradient-to-r from-neon-blue/10 to-neon-purple/10 border border-neon-blue/20"
        >
          <p className="text-sm text-neon-blue flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            {motivationalMessage}
          </p>
        </motion.div>
      )}

      {/* Actions */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="flex flex-col sm:flex-row items-center gap-3"
      >
        {actionLabel && onAction && (
          <Button
            variant="primary"
            onClick={onAction}
            leftIcon={<Plus className="w-4 h-4" />}
            data-tutorial={actionDataTutorial}
          >
            {actionLabel}
          </Button>
        )}
        {secondaryLabel && onSecondary && (
          <Button
            variant="secondary"
            onClick={onSecondary}
            rightIcon={<ArrowRight className="w-4 h-4" />}
            data-tutorial={secondaryDataTutorial}
          >
            {secondaryLabel}
          </Button>
        )}
      </motion.div>
    </motion.div>
  );

  if (variant === 'card') {
    return <Card className={className}>{content}</Card>;
  }

  return content;
}

// Preset empty states for common scenarios
export function EmptyDashboard({
  onAddSubject,
}: {
  onAddSubject: () => void;
}) {
  return (
    <EmptyState
      icon={Sparkles}
      title="Sua jornada começa aqui!"
      description="Adicione suas primeiras disciplinas para que a IA possa criar um cronograma de estudos personalizado para você."
      actionLabel="Adicionar Disciplina"
      onAction={onAddSubject}
      actionDataTutorial="empty-add-subject"
      motivationalMessage="Cada grande conquista começa com um pequeno passo. Vamos começar! 💪"
    />
  );
}

export function EmptySubjects({
  onAddSubject,
}: {
  onAddSubject: () => void;
}) {
  return (
    <EmptyState
      icon={Plus}
      title="Nenhuma disciplina cadastrada"
      description="Comece adicionando as matérias que você precisa estudar. Você pode definir prioridades e níveis de dificuldade."
      actionLabel="Adicionar Primeira Disciplina"
      onAction={onAddSubject}
      motivationalMessage="Organize seus estudos e alcance seus objetivos!"
    />
  );
}

export function EmptyPlan() {
  return (
    <EmptyState
      icon={Sparkles}
      title="Nenhum bloco agendado"
      description="Gere um cronograma automático ou adicione blocos de estudo manualmente."
      variant="inline"
    />
  );
}
