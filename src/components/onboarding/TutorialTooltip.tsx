'use client';

/**
 * TutorialTooltip Component
 * Tour guiado com foco em UX mobile e fallback quando alvo nao existe.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, ChevronLeft, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui';

type TutorialPlacement = 'top' | 'bottom' | 'left' | 'right';
type TutorialPosition = TutorialPlacement | 'auto';
type TutorialTarget = string | string[];

const MOBILE_BREAKPOINT = 1024;
const DESKTOP_VIEWPORT_PADDING = 12;
const DESKTOP_TOOLTIP_HEIGHT = 232;
const DESKTOP_TOOLTIP_WIDTH = 360;
const TARGET_GAP = 12;

export interface TutorialStep {
  id: string;
  title: string;
  description: string;
  target?: TutorialTarget;
  mobileTarget?: TutorialTarget;
  position?: TutorialPosition;
  ctaLabel?: string;
  ctaHref?: string;
}

interface TutorialTooltipProps {
  steps: TutorialStep[];
  isActive: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

interface TooltipLayout {
  top: number;
  left: number;
  placement: TutorialPlacement;
}

const normalizeTarget = (target?: TutorialTarget): string[] => {
  if (!target) return [];
  return Array.isArray(target) ? target.filter(Boolean) : [target];
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const isVisibleElement = (element: Element): element is HTMLElement => {
  if (!(element instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
};

const findVisibleTarget = (selectors: string[]) => {
  for (const selector of selectors) {
    const candidates = Array.from(document.querySelectorAll(selector));
    const visible = candidates.find((candidate) => isVisibleElement(candidate));
    if (visible) return visible;
  }
  return null;
};

const getCandidatePosition = (
  placement: TutorialPlacement,
  rect: DOMRect,
  tooltipWidth: number,
  tooltipHeight: number
) => {
  switch (placement) {
    case 'top':
      return {
        top: rect.top - tooltipHeight - TARGET_GAP,
        left: rect.left + rect.width / 2 - tooltipWidth / 2,
      };
    case 'bottom':
      return {
        top: rect.bottom + TARGET_GAP,
        left: rect.left + rect.width / 2 - tooltipWidth / 2,
      };
    case 'left':
      return {
        top: rect.top + rect.height / 2 - tooltipHeight / 2,
        left: rect.left - tooltipWidth - TARGET_GAP,
      };
    default:
      return {
        top: rect.top + rect.height / 2 - tooltipHeight / 2,
        left: rect.right + TARGET_GAP,
      };
  }
};

const resolvePlacementOrder = (preferred?: TutorialPosition) => {
  const base: TutorialPlacement[] = ['bottom', 'top', 'right', 'left'];
  if (!preferred || preferred === 'auto') return base;
  return [preferred, ...base.filter((placement) => placement !== preferred)];
};

const getCenteredLayout = (viewportWidth: number, viewportHeight: number): TooltipLayout => {
  const tooltipWidth = Math.min(
    DESKTOP_TOOLTIP_WIDTH,
    viewportWidth - DESKTOP_VIEWPORT_PADDING * 2
  );
  const left = clamp(
    (viewportWidth - tooltipWidth) / 2,
    DESKTOP_VIEWPORT_PADDING,
    viewportWidth - tooltipWidth - DESKTOP_VIEWPORT_PADDING
  );
  const top = clamp(
    viewportHeight * 0.18,
    DESKTOP_VIEWPORT_PADDING,
    viewportHeight - DESKTOP_TOOLTIP_HEIGHT - DESKTOP_VIEWPORT_PADDING
  );

  return { top, left, placement: 'bottom' };
};

const getDesktopLayout = (
  rect: DOMRect,
  viewportWidth: number,
  viewportHeight: number,
  preferred?: TutorialPosition
): TooltipLayout => {
  const tooltipWidth = Math.min(
    DESKTOP_TOOLTIP_WIDTH,
    viewportWidth - DESKTOP_VIEWPORT_PADDING * 2
  );
  const tooltipHeight = DESKTOP_TOOLTIP_HEIGHT;
  const placements = resolvePlacementOrder(preferred);

  let bestLayout: TooltipLayout | null = null;
  let bestPenalty = Number.POSITIVE_INFINITY;

  for (const placement of placements) {
    const raw = getCandidatePosition(placement, rect, tooltipWidth, tooltipHeight);
    const clampedLeft = clamp(
      raw.left,
      DESKTOP_VIEWPORT_PADDING,
      viewportWidth - tooltipWidth - DESKTOP_VIEWPORT_PADDING
    );
    const clampedTop = clamp(
      raw.top,
      DESKTOP_VIEWPORT_PADDING,
      viewportHeight - tooltipHeight - DESKTOP_VIEWPORT_PADDING
    );

    const overflowPenalty = Math.abs(raw.left - clampedLeft) + Math.abs(raw.top - clampedTop);
    if (overflowPenalty < bestPenalty) {
      bestPenalty = overflowPenalty;
      bestLayout = { top: clampedTop, left: clampedLeft, placement };
    }
  }

  return bestLayout ?? getCenteredLayout(viewportWidth, viewportHeight);
};

export default function TutorialTooltip({
  steps,
  isActive,
  onComplete,
  onSkip,
}: TutorialTooltipProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [layout, setLayout] = useState<TooltipLayout>({ top: 16, left: 16, placement: 'bottom' });
  const [isMobile, setIsMobile] = useState(false);
  const [hasTarget, setHasTarget] = useState(false);
  const targetRef = useRef<HTMLElement | null>(null);

  const step = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;

  useEffect(() => {
    if (!isActive) {
      setCurrentStep(0);
    }
  }, [isActive]);

  useEffect(() => {
    if (!isActive || !step) return;

    const applyLayout = () => {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const mobile = viewportWidth < MOBILE_BREAKPOINT;
      setIsMobile(mobile);

      if (mobile) {
        setLayout({
          top: 16,
          left: 16,
          placement: 'bottom',
        });
        return;
      }

      const target = targetRef.current;
      if (!target) {
        setLayout(getCenteredLayout(viewportWidth, viewportHeight));
        return;
      }

      const rect = target.getBoundingClientRect();
      setLayout(getDesktopLayout(rect, viewportWidth, viewportHeight, step.position));
    };

    const mobile = window.innerWidth < MOBILE_BREAKPOINT;
    const targetSelectors = mobile
      ? [...normalizeTarget(step.mobileTarget), ...normalizeTarget(step.target)]
      : [...normalizeTarget(step.target), ...normalizeTarget(step.mobileTarget)];
    const targetElement = findVisibleTarget(targetSelectors);

    targetRef.current = targetElement;
    setHasTarget(Boolean(targetElement));

    let rafId: number | null = null;
    let timeoutId: number | null = null;

    if (targetElement) {
      targetElement.classList.add('tutorial-highlight');
      targetElement.scrollIntoView({
        behavior: 'smooth',
        block: mobile ? 'center' : 'nearest',
        inline: 'nearest',
      });

      timeoutId = window.setTimeout(() => {
        applyLayout();
      }, mobile ? 260 : 140);
    } else {
      applyLayout();
    }

    const handleViewportChange = () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(() => {
        applyLayout();
      });
    };

    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('orientationchange', handleViewportChange);

    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('orientationchange', handleViewportChange);
      if (timeoutId) window.clearTimeout(timeoutId);
      if (rafId) window.cancelAnimationFrame(rafId);
      targetElement?.classList.remove('tutorial-highlight');
    };
  }, [currentStep, isActive, step]);

  useEffect(() => {
    if (!isActive || !step) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onSkip();
      }
      if (event.key === 'ArrowLeft' && currentStep > 0) {
        setCurrentStep((prev) => prev - 1);
      }
      if (event.key === 'ArrowRight') {
        if (isLastStep) {
          onComplete();
        } else {
          setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentStep, isActive, isLastStep, onComplete, onSkip, step, steps.length]);

  const handleNext = () => {
    if (isLastStep) {
      onComplete();
      return;
    }
    setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1));
  };

  const handlePrev = () => {
    if (currentStep === 0) return;
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  const handleCta = () => {
    if (!step?.ctaHref) return;
    const currentPath = window.location.pathname;
    router.push(step.ctaHref);
    window.setTimeout(() => {
      if (window.location.pathname === currentPath) {
        window.location.assign(step.ctaHref!);
      }
    }, 500);
  };

  if (!isActive || !step || steps.length === 0) return null;

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-black/55 pointer-events-none"
      />

      <AnimatePresence mode="wait">
        <motion.div
          key={step.id}
          initial={{ opacity: 0, scale: 0.94, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 8 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          style={
            isMobile
              ? { zIndex: 50 }
              : {
                  position: 'fixed',
                  top: layout.top,
                  left: layout.left,
                  zIndex: 50,
                }
          }
          className={cn(
            isMobile
              ? 'app-mobile-safe-overlay'
              : 'w-[min(calc(100vw-1.5rem),22.5rem)]'
          )}
        >
          <div
            className={cn(
              'relative glass-card p-4 sm:p-5 shadow-xl shadow-neon-blue/15 pointer-events-auto',
              isMobile && 'app-mobile-safe-surface'
            )}
          >
            <button
              onClick={onSkip}
              className="absolute right-3 top-3 rounded-lg p-1 text-text-muted transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Fechar tutorial"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="mb-3 flex items-center gap-2 pr-8">
              <Sparkles className="h-4 w-4 text-neon-cyan" />
              <p className="text-xs font-medium uppercase tracking-wide text-neon-cyan">
                Tour guiado
              </p>
            </div>

            <div className="mb-4 flex items-center gap-1">
              {steps.map((item, index) => (
                <div
                  key={item.id}
                  className={cn(
                    'h-1.5 rounded-full transition-all',
                    index === currentStep
                      ? 'w-6 bg-neon-blue'
                      : index < currentStep
                        ? 'w-3 bg-neon-cyan'
                        : 'w-3 bg-card-border'
                  )}
                />
              ))}
            </div>

            <h4 className="mb-2 text-base sm:text-lg font-heading font-bold text-white">
              {step.title}
            </h4>
            <p className="mb-4 text-sm leading-relaxed text-text-secondary">{step.description}</p>

            <div className="mb-4 flex items-center justify-between">
              <span className="text-xs text-text-muted">
                Passo {currentStep + 1} de {steps.length}
              </span>
              {!hasTarget && (
                <span className="text-[11px] text-text-muted">Sem alvo visivel neste layout</span>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {currentStep > 0 ? (
                  <Button variant="ghost" size="sm" onClick={handlePrev}>
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    Voltar
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" onClick={onSkip}>
                    Pular
                  </Button>
                )}

                {step.ctaLabel && step.ctaHref && (
                  <Button variant="secondary" size="sm" onClick={handleCta}>
                    {step.ctaLabel}
                  </Button>
                )}
              </div>

              <Button variant="primary" size="sm" onClick={handleNext}>
                {isLastStep ? 'Concluir' : 'Próximo'}
                {!isLastStep && <ChevronRight className="ml-1 h-4 w-4" />}
              </Button>
            </div>
          </div>

          {!isMobile && hasTarget && (
            <div
              className={cn(
                'pointer-events-none absolute h-3 w-3 rotate-45 border-card-border bg-card-bg',
                layout.placement === 'top' &&
                  'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 border-b border-r',
                layout.placement === 'bottom' &&
                  'left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 border-l border-t',
                layout.placement === 'left' &&
                  'right-0 top-1/2 -translate-y-1/2 translate-x-1/2 border-r border-t',
                layout.placement === 'right' &&
                  'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 border-b border-l'
              )}
            />
          )}
        </motion.div>
      </AnimatePresence>

      <style jsx global>{`
        .tutorial-highlight {
          position: relative;
          z-index: 45 !important;
          border-radius: 12px;
          box-shadow:
            0 0 0 3px rgba(0, 180, 255, 0.4),
            0 0 20px rgba(0, 180, 255, 0.3);
          animation: tutorialPulse 1.8s ease-in-out infinite;
        }

        @keyframes tutorialPulse {
          0%,
          100% {
            box-shadow:
              0 0 0 3px rgba(0, 180, 255, 0.38),
              0 0 20px rgba(0, 180, 255, 0.26);
          }
          50% {
            box-shadow:
              0 0 0 4px rgba(0, 180, 255, 0.52),
              0 0 28px rgba(0, 180, 255, 0.35);
          }
        }
      `}</style>
    </>
  );
}

export const dashboardTutorialSteps: TutorialStep[] = [
  {
    id: 'nav',
    target: '[data-tutorial="nav-dashboard"]',
    title: 'Menu principal',
    description:
      'Aqui você alterna rápido entre Painel, Agenda, Disciplinas, Análises e Configurações.',
    position: 'right',
  },
  {
    id: 'stats',
    target: '[data-tutorial="stats"]',
    title: 'Resumo da semana',
    description:
      'Veja horas estudadas, foco, sequência e tarefas concluídas para acompanhar seu ritmo.',
    position: 'bottom',
  },
  {
    id: 'chart',
    target: '[data-tutorial="chart"]',
    title: 'Gráfico de progresso',
    description:
      'Compare horas realizadas com a meta diária e identifique rapidamente os dias fortes e fracos.',
    position: 'bottom',
  },
  {
    id: 'plan',
    target: '[data-tutorial="plan"]',
    title: 'Plano do dia',
    description:
      'Inicie, conclua ou adie blocos por aqui. Este é o ponto principal da sua execução diária.',
    position: 'left',
  },
  {
    id: 'level',
    target: '[data-tutorial="level"]',
    title: 'Nível e evolução',
    description:
      'Cada sessão concluída gera XP. Mantenha constância para subir de nível e liberar conquistas.',
    position: 'left',
  },
];

export const dashboardEmptyTutorialSteps: TutorialStep[] = [
  {
    id: 'empty-header',
    target: '[data-tutorial="dashboard-header"]',
    title: 'Bem-vindo ao Painel',
    description:
      'Este é o seu centro de controle. Quando houver dados, aqui você acompanha metas, foco e resultados.',
    position: 'bottom',
  },
  {
    id: 'empty-add-subject',
    target: '[data-tutorial="empty-add-subject"]',
    title: 'Primeiro passo',
    description:
      'Toque em "Adicionar Disciplina" para cadastrar matérias e liberar o planejamento inteligente.',
    position: 'top',
    ctaLabel: 'Abrir Disciplinas',
    ctaHref: '/subjects',
  },
  {
    id: 'empty-nav-subjects',
    target: '[data-tutorial="nav-subjects"]',
    title: 'Atalho para Disciplinas',
    description:
      'Este item leva direto para a tela de cadastro e organização das matérias.',
    position: 'top',
  },
  {
    id: 'empty-nav-planner',
    target: '[data-tutorial="nav-planner"]',
    title: 'Agenda semanal',
    description:
      'Depois de cadastrar disciplinas, use Agenda para montar e ajustar os blocos de estudo.',
    position: 'top',
  },
  {
    id: 'empty-nav-settings',
    target: '[data-tutorial="nav-settings"]',
    title: 'Configurações',
    description:
      'Personalize horas por dia, pausas, horários e notificações para deixar o plano no seu ritmo.',
    position: 'top',
  },
];
