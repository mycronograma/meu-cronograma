'use client';

/**
 * WelcomeModal Component
 * Modal de boas-vindas para novos usuários
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  BookOpen,
  Calendar,
  BarChart3,
  Trophy,
  ArrowRight,
  CheckCircle2,
  Rocket,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui';

interface WelcomeModalProps {
  isOpen: boolean;
  onComplete: () => void;
  userName?: string;
}

const steps = [
  {
    id: 1,
    icon: Sparkles,
    title: 'Bem-vindo ao Nexora! 🚀',
    description:
      'Sua jornada de estudos inteligentes começa agora. Vamos transformar a forma como você aprende com o poder da IA.',
    color: 'neon-blue',
  },
  {
    id: 2,
    icon: BookOpen,
    title: 'Adicione suas Disciplinas',
    description:
      'Comece cadastrando as matérias que você precisa estudar. Defina prioridades e níveis de dificuldade para cada uma.',
    color: 'neon-purple',
  },
  {
    id: 3,
    icon: Calendar,
    title: 'Agenda Inteligente',
    description:
      'Nossa IA vai criar automaticamente um cronograma otimizado baseado nas suas preferências e disponibilidade.',
    color: 'neon-cyan',
  },
  {
    id: 4,
    icon: BarChart3,
    title: 'Acompanhe seu Progresso',
    description:
      'Visualize estatísticas detalhadas, identifique padrões e melhore continuamente sua performance.',
    color: 'orange-500',
  },
  {
    id: 5,
    icon: Trophy,
    title: 'Conquiste e Evolua',
    description:
      'Ganhe XP, suba de nível e desbloqueie conquistas. Estudar nunca foi tão motivante!',
    color: 'neon-pink',
  },
];

export default function WelcomeModal({
  isOpen,
  onComplete,
  userName = 'Estudante',
}: WelcomeModalProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  const step = steps[currentStep];
  const Icon = step.icon;
  const isLastStep = currentStep === steps.length - 1;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="app-modal-overlay"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="app-modal-panel max-w-lg"
          >
            <div className="glass-card p-4 sm:p-8 relative overflow-hidden">
              {/* Background decoration */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-neon-blue/20 to-neon-purple/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

              {/* Progress dots */}
              <div className="flex justify-center gap-2 mb-8">
                {steps.map((_, index) => (
                  <motion.div
                    key={index}
                    className={cn(
                      'w-2 h-2 rounded-full transition-all duration-300',
                      index === currentStep
                        ? 'w-8 bg-neon-blue'
                        : index < currentStep
                        ? 'bg-neon-cyan'
                        : 'bg-card-border'
                    )}
                  />
                ))}
              </div>

              {/* Content */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStep}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="text-center relative z-10"
                >
                  {/* Icon */}
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2, type: 'spring' }}
                    className={cn(
                      'w-20 h-20 rounded-2xl mx-auto mb-6 flex items-center justify-center',
                      `bg-${step.color}/20`
                    )}
                    style={{
                      backgroundColor:
                        step.color === 'neon-blue'
                          ? 'rgba(0, 180, 255, 0.2)'
                          : step.color === 'neon-purple'
                          ? 'rgba(127, 0, 255, 0.2)'
                          : step.color === 'neon-cyan'
                          ? 'rgba(0, 255, 200, 0.2)'
                          : step.color === 'orange-500'
                          ? 'rgba(255, 170, 0, 0.2)'
                          : 'rgba(255, 0, 170, 0.2)',
                    }}
                  >
                    <Icon
                      className="w-10 h-10"
                      style={{
                        color:
                          step.color === 'neon-blue'
                            ? '#00B4FF'
                            : step.color === 'neon-purple'
                            ? '#7F00FF'
                            : step.color === 'neon-cyan'
                            ? '#00FFC8'
                            : step.color === 'orange-500'
                            ? '#FFAA00'
                            : '#FF00AA',
                      }}
                    />
                  </motion.div>

                  {/* Title */}
                  <h2 className="text-2xl font-heading font-bold text-white mb-4">
                    {currentStep === 0
                      ? `Bem-vindo ao Nexora, ${userName}! 🚀`
                      : step.title}
                  </h2>

                  {/* Description */}
                  <p className="text-text-secondary leading-relaxed mb-8">
                    {step.description}
                  </p>
                </motion.div>
              </AnimatePresence>

              {/* Actions */}
              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 relative z-10">
                {currentStep > 0 ? (
                  <Button
                    variant="ghost"
                    onClick={() => setCurrentStep(currentStep - 1)}
                    className="w-full sm:w-auto"
                  >
                    Voltar
                  </Button>
                ) : (
                  <Button variant="ghost" onClick={handleSkip} className="w-full sm:w-auto">
                    Pular tour
                  </Button>
                )}

                <Button
                  variant="primary"
                  onClick={handleNext}
                  className="w-full sm:w-auto"
                  rightIcon={
                    isLastStep ? (
                      <Rocket className="w-4 h-4" />
                    ) : (
                      <ArrowRight className="w-4 h-4" />
                    )
                  }
                >
                  {isLastStep ? 'Começar!' : 'Próximo'}
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
