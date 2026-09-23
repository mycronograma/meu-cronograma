'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, ArrowRight, Sparkles, Clock, Zap, BookOpen } from 'lucide-react';
import { Card, Button, ProgressBar } from '@/components/ui';
import type { OnboardingAnswers, OnboardingResult, StudyGoal } from '@/types';
import { setClientStoreEntries } from '@/hooks/useLocalStorage';

type OnboardingStepKey = keyof OnboardingAnswers;
type OnboardingOptionValue = OnboardingAnswers[OnboardingStepKey];

type OnboardingOption =
  | OnboardingOptionValue
  | {
      label: string;
      value: OnboardingOptionValue;
    };

type OnboardingStep = {
  id: string;
  title: string;
  key: OnboardingStepKey;
  options: OnboardingOption[];
  extra?: {
    title: string;
    key: OnboardingStepKey;
    options: Array<{ label: string; value: OnboardingOptionValue }>;
  };
};

const stepVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
};

const steps: ReadonlyArray<OnboardingStep> = [
  {
    id: 'goal',
    title: 'Qual é seu principal objetivo?',
    key: 'study_goal',
    options: ['ENEM', 'Medicina', 'Concurso', 'Escola', 'Outro'] as StudyGoal[],
  },
  {
    id: 'routine',
    title: 'Como é sua rotina?',
    key: 'routine_type',
    options: [
      { label: 'Manhã', value: 'manha' },
      { label: 'Tarde', value: 'tarde' },
      { label: 'Noite', value: 'noite' },
      { label: 'Integral', value: 'integral' },
    ],
    extra: {
      title: 'Horas livres por dia',
      key: 'daily_hours',
      options: [
        { label: 'Menos de 1h', value: '<1' },
        { label: '1–2h', value: '1-2' },
        { label: '2–4h', value: '2-4' },
        { label: '4h+', value: '4+' },
      ],
    },
  },
  {
    id: 'energy',
    title: 'Energia & ritmo',
    key: 'best_time',
    options: [
      { label: 'Manhã', value: 'manha' },
      { label: 'Tarde', value: 'tarde' },
      { label: 'Noite', value: 'noite' },
      { label: 'Madrugada', value: 'madrugada' },
    ],
    extra: {
      title: 'Após esse horário você fica cansado?',
      key: 'fatigue_profile',
      options: [
        { label: 'Sim', value: 'sim' },
        { label: 'Não', value: 'nao' },
      ],
    },
  },
  {
    id: 'style',
    title: 'Como você aprende melhor?',
    key: 'learning_style',
    options: [
      { label: 'Vídeo', value: 'video' },
      { label: 'Leitura', value: 'leitura' },
      { label: 'Exercícios', value: 'exercicios' },
      { label: 'Misto', value: 'misto' },
    ],
  },
  {
    id: 'commitment',
    title: 'Quantos dias por semana quer estudar?',
    key: 'study_days',
    options: [3, 4, 5, 6, 7],
  },
] as const;

const initialAnswers: OnboardingAnswers = {
  study_goal: 'ENEM',
  routine_type: 'manha',
  daily_hours: '2-4',
  best_time: 'manha',
  fatigue_profile: 'nao',
  learning_style: 'misto',
  study_days: 5,
};

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<OnboardingAnswers>(initialAnswers);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = steps[step];
  const currentExtra = current.extra;
  const progress = Math.round(((step + 1) / steps.length) * 100);

  const updateAnswer = (
    key: OnboardingStepKey,
    value: OnboardingAnswers[OnboardingStepKey]
  ) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  };

  const canAdvance = true; // respostas possuem valor inicial, então sempre liberado

  const handleNext = () => {
    if (!canAdvance) return;
    if (step < steps.length - 1) {
      setStep((s) => s + 1);
      return;
    }
    handleFinish();
  };

  const handleFinish = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });

      if (!res.ok) {
        throw new Error('Falha ao salvar onboarding');
      }

      const data = (await res.json()) as OnboardingResult;
      const onboardingState = {
        hasCompletedWelcome: true,
        hasCompletedTutorial: true,
        hasAddedFirstSubject: true,
        tutorialStep: 0,
      };
      const storePayload = {
        nexora_subjects: data.subjects,
        nexora_planner_blocks: data.schedule.blocks,
        nexora_study_prefs: data.studyPrefs,
        nexora_onboarding: onboardingState,
      };

      // Atualiza client store em memória para a navegação atual
      setClientStoreEntries(storePayload);

      // Persiste no servidor para sincronização entre navegadores/dispositivos
      try {
        await fetch('/api/progress', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: storePayload }),
        });
      } catch (syncError) {
        console.warn('Falha ao sincronizar progresso inicial no servidor:', syncError);
      }

      router.push('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro inesperado');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-slate-950 text-white flex flex-col items-center px-4 py-10">
      <div className="max-w-3xl w-full">
        <div className="mb-8 flex items-center gap-3">
          <Sparkles className="text-cyan-400" />
          <div>
            <p className="text-sm text-slate-400">Onboarding inteligente</p>
            <h1 className="text-2xl font-semibold">Vamos configurar seu plano ideal</h1>
          </div>
        </div>

        <ProgressBar value={progress} label={`${progress}%`} />

        <div className="mt-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={current.id}
              variants={stepVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.2 }}
            >
              <Card className="bg-slate-900/70 border-slate-800 shadow-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Clock className="text-cyan-400" />
                  <h2 className="text-xl font-semibold">{current.title}</h2>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {current.options.map((option) => {
                    const value = typeof option === 'object' ? option.value : option;
                    const label =
                      typeof option === 'object' ? option.label : String(option);
                    const selected = answers[current.key] === value;
                    return (
                      <button
                        key={value}
                        className={`rounded-xl border px-4 py-3 text-left transition ${
                          selected
                            ? 'border-cyan-500 bg-cyan-500/10 text-white'
                            : 'border-slate-800 hover:border-cyan-600 text-slate-200'
                        }`}
                        onClick={() => updateAnswer(current.key, value)}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                {currentExtra ? (
                  <div className="mt-6">
                    <p className="text-sm text-slate-400 mb-2">{currentExtra.title}</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {currentExtra.options.map((opt) => {
                        const selected = answers[currentExtra.key] === opt.value;
                        return (
                          <button
                            key={opt.value}
                            className={`rounded-xl border px-3 py-2 text-left transition ${
                              selected
                                ? 'border-cyan-500 bg-cyan-500/10 text-white'
                                : 'border-slate-800 hover:border-cyan-600 text-slate-200'
                            }`}
                            onClick={() => updateAnswer(currentExtra.key, opt.value)}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {error ? <p className="text-red-400 mt-4">{error}</p> : null}

                <div className="mt-6 flex justify-between items-center">
                  <div className="text-sm text-slate-400">
                    Etapa {step + 1} de {steps.length}
                  </div>
                  <Button onClick={handleNext} disabled={loading || !canAdvance}>
                    {step === steps.length - 1 ? (
                      <>
                        Concluir <CheckCircle className="w-4 h-4 ml-2" />
                      </>
                    ) : (
                      <>
                        Próxima <ArrowRight className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </Button>
                </div>
              </Card>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mt-6 text-sm text-slate-400 flex items-center gap-2">
          <Zap className="w-4 h-4 text-yellow-400" />
          Respostas adaptam automaticamente o horário, duração dos blocos e foco das matérias.
        </div>

        <div className="mt-2 text-xs text-slate-500 flex items-center gap-2">
          <BookOpen className="w-4 h-4" />
          Mobile-first, animações suaves e linguagem motivacional para um começo rápido.
        </div>
      </div>
    </div>
  );
}
