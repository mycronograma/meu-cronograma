'use client';

/**
 * LevelProgress Component
 * Exibe nível do usuário, progresso de XP e próximo marco
 */

import { motion } from 'framer-motion';
import { Trophy, Star, Zap, Target } from 'lucide-react';
import { cn, formatNumber, percentage } from '@/lib/utils';
import Card from '@/components/ui/Card';
import ProgressBar from '@/components/ui/ProgressBar';

interface LevelProgressProps {
  level: number;
  currentXp: number;
  xpForNextLevel: number;
  totalXp: number;
  achievements: number;
  className?: string;
}

export default function LevelProgress({
  level,
  currentXp,
  xpForNextLevel,
  totalXp,
  achievements,
  className,
}: LevelProgressProps) {
  const safeXpForNext = xpForNextLevel > 0 ? xpForNextLevel : 0;
  const progress = safeXpForNext > 0 ? percentage(currentXp, safeXpForNext) : 0;
  const xpNeeded = safeXpForNext > 0 ? safeXpForNext - currentXp : 0;

  return (
    <Card className={cn('h-full', className)} glow="purple">
      <div className="flex items-start justify-between mb-5 max-[479px]:mb-3 sm:mb-6">
        <div>
          <h2 className="text-xl max-[479px]:text-lg font-heading font-bold text-white">Seu Progresso</h2>
          <p className="text-sm max-[479px]:text-xs text-text-secondary mt-1">Continue evoluindo!</p>
        </div>
        <motion.div
          whileHover={{ rotate: 10, scale: 1.1 }}
          className="w-10 h-10 max-[479px]:w-8 max-[479px]:h-8 sm:w-12 sm:h-12 rounded-xl bg-neon-purple/20 flex items-center justify-center"
        >
          <Trophy className="w-5 h-5 max-[479px]:w-4 max-[479px]:h-4 sm:w-6 sm:h-6 text-neon-violet" />
        </motion.div>
      </div>

      {/* Emblema de Nível */}
      <div className="flex items-center gap-3 max-[479px]:gap-2 sm:gap-4 mb-5 max-[479px]:mb-4 sm:mb-6">
        <motion.div
          whileHover={{ scale: 1.05 }}
          className="relative"
        >
          <div className="w-16 h-16 max-[479px]:w-12 max-[479px]:h-12 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-neon-purple to-neon-blue flex items-center justify-center">
            <span className="text-2xl max-[479px]:text-xl sm:text-3xl font-heading font-bold text-white">{level}</span>
          </div>
          {/* Efeito de brilho */}
          <div className="absolute inset-0 w-16 h-16 max-[479px]:w-12 max-[479px]:h-12 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-neon-purple to-neon-blue blur-xl opacity-40" />
          
          {/* Decoração de estrela */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
            className="absolute -top-2 -right-2"
          >
            <Star className="w-5 h-5 max-[479px]:w-4 max-[479px]:h-4 sm:w-6 sm:h-6 text-yellow-400 fill-yellow-400" />
          </motion.div>
        </motion.div>

        <div className="flex-1">
          <h3 className="text-lg max-[479px]:text-base font-heading font-bold text-white">
            Nível {level}
          </h3>
          <p className="text-sm max-[479px]:text-xs text-text-secondary">
            {formatNumber(xpNeeded)} XP para o Nível {level + 1}
          </p>
        </div>
      </div>

      {/* Barra de Progresso XP */}
      <div className="mb-6 max-[479px]:mb-4">
        <div className="flex justify-between text-sm max-[479px]:text-xs mb-2 max-[479px]:mb-1.5">
          <span className="text-text-secondary">Experiência</span>
          <span className="text-white font-medium">
            {formatNumber(currentXp)} / {formatNumber(safeXpForNext)} XP
          </span>
        </div>
        <ProgressBar value={currentXp} max={safeXpForNext || 1} color="gradient" size="lg" />
      </div>

      {/* Grid de Estatísticas */}
      <div className="grid grid-cols-2 gap-3 max-[479px]:gap-2 sm:gap-4">
        <motion.div
          whileHover={{ scale: 1.02 }}
          className="p-3 max-[479px]:p-2.5 sm:p-4 rounded-xl bg-card-bg border border-card-border"
        >
          <div className="flex items-center gap-2 mb-2 max-[479px]:mb-1">
            <Zap className="w-4 h-4 max-[479px]:w-3.5 max-[479px]:h-3.5 text-neon-cyan" />
            <span className="text-xs text-text-secondary">XP Total</span>
          </div>
          <p className="text-xl max-[479px]:text-[22px] font-heading font-bold text-white">
            {formatNumber(totalXp)}
          </p>
        </motion.div>

        <motion.div
          whileHover={{ scale: 1.02 }}
          className="p-3 max-[479px]:p-2.5 sm:p-4 rounded-xl bg-card-bg border border-card-border"
        >
          <div className="flex items-center gap-2 mb-2 max-[479px]:mb-1">
            <Target className="w-4 h-4 max-[479px]:w-3.5 max-[479px]:h-3.5 text-orange-400" />
            <span className="text-xs text-text-secondary">Conquistas</span>
          </div>
          <p className="text-xl max-[479px]:text-[22px] font-heading font-bold text-white">
            {achievements}
          </p>
        </motion.div>
      </div>

      {/* Mensagem Motivacional */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-5 max-[479px]:mt-4 sm:mt-6 p-3 max-[479px]:p-2.5 sm:p-4 rounded-xl bg-gradient-to-r from-neon-purple/10 to-neon-blue/10 border border-neon-purple/20"
      >
        <p className="text-sm max-[479px]:text-xs text-text-secondary">
          {progress >= 80
            ? 'Quase lá. Mais algumas sessões para subir de nível.'
            : progress >= 50
            ? 'Ótimo progresso. Continue nesse ritmo.'
            : 'Cada sessão de estudo conta para sua evolução.'}
        </p>
      </motion.div>
    </Card>
  );
}
