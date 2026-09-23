'use client';

/**
 * QuickSessionModal Component
 * Modal para iniciar uma sessão de estudo rápida
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Play,
  Pause,
  Square,
  Clock,
  BookOpen,
  Sparkles,
  CheckCircle2,
  Coffee,
} from 'lucide-react';
import { cn, formatDuration } from '@/lib/utils';
import { Button, Card, ProgressBar } from '@/components/ui';
import { useLocalStorage } from '@/hooks';
import { estimateMissionXp, toBrazilDateKey, type TrainerXpEvent } from '@/services/studyTrainer';
import type { AnalyticsStore } from '@/types';

interface Subject {
  id: string;
  name: string;
  color: string;
}

interface QuickSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  subjects: Subject[];
}

type SessionState = 'setup' | 'running' | 'paused' | 'break' | 'completed';
const emptyAnalytics: AnalyticsStore = { daily: {} };

export default function QuickSessionModal({
  isOpen,
  onClose,
  subjects,
}: QuickSessionModalProps) {
  const [sessionState, setSessionState] = useState<SessionState>('setup');
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [duration, setDuration] = useState(25); // minutos
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  const [focusScore, setFocusScore] = useState(85);
  const [, setAnalytics] = useLocalStorage<AnalyticsStore>('nexora_analytics', emptyAnalytics);
  const [, setXpEvents] = useLocalStorage<TrainerXpEvent[]>('nexora_xp_events', []);
  const [awardedSessionKey, setAwardedSessionKey] = useState('');
  const sessionEndAtRef = useRef<number | null>(null);
  const sessionKeyRef = useRef('');

  // Timer effect
  useEffect(() => {
    if (sessionState !== 'running') return;

    if (!sessionEndAtRef.current) {
      sessionEndAtRef.current = Date.now() + (Math.max(0, timeRemaining) * 1000);
    }

    const tick = () => {
      if (!sessionEndAtRef.current) return;
      const liveRemaining = Math.max(0, Math.ceil((sessionEndAtRef.current - Date.now()) / 1000));
      setTimeRemaining(liveRemaining);
      if (liveRemaining <= 0) {
        sessionEndAtRef.current = null;
        setSessionState('completed');
      }
    };

    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [sessionState, timeRemaining]);

  useEffect(() => {
    if (!isOpen) {
      setShowExitConfirm(false);
    }
  }, [isOpen]);

  // Formatar tempo
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Calcular progresso
  const progress = totalTime > 0 ? ((totalTime - timeRemaining) / totalTime) * 100 : 0;

  // Iniciar sessão
  const startSession = () => {
    if (!selectedSubject) return;
    const totalSeconds = duration * 60;
    sessionKeyRef.current = `quick:${selectedSubject.id}:${Date.now()}`;
    setTotalTime(totalSeconds);
    setTimeRemaining(totalSeconds);
    sessionEndAtRef.current = Date.now() + (totalSeconds * 1000);
    setSessionState('running');
  };

  // Pausar/Continuar
  const togglePause = () => {
    if (sessionState === 'running') {
      if (sessionEndAtRef.current) {
        const liveRemaining = Math.max(0, Math.ceil((sessionEndAtRef.current - Date.now()) / 1000));
        setTimeRemaining(liveRemaining);
      }
      sessionEndAtRef.current = null;
      setSessionState('paused');
      return;
    }

    if (sessionState === 'paused') {
      sessionEndAtRef.current = Date.now() + (Math.max(0, timeRemaining) * 1000);
      setSessionState('running');
    }
  };

  // Parar sessão
  const stopSession = () => {
    sessionEndAtRef.current = null;
    setSessionState('completed');
  };

  // Resetar
  const resetSession = () => {
    sessionEndAtRef.current = null;
    setShowExitConfirm(false);
    setSessionState('setup');
    setSelectedSubject(null);
    setDuration(25);
    setTimeRemaining(0);
    setTotalTime(0);
    setAwardedSessionKey('');
    sessionKeyRef.current = '';
  };

  // Fechar modal
  const handleClose = () => {
    if (sessionState === 'running' || sessionState === 'paused') {
      setShowExitConfirm(true);
      return;
    }

    resetSession();
    onClose();
  };

  const confirmExitAndClose = () => {
    resetSession();
    onClose();
  };

  const studiedMinutes = Math.floor((totalTime - timeRemaining) / 60);
  const xpEarned = studiedMinutes > 0 ? estimateMissionXp(studiedMinutes) : 0;

  // Calcular XP recebido
  const calculateXP = () => xpEarned;

  useEffect(() => {
    if (sessionState !== 'completed') return;
    if (!selectedSubject) return;
    if (!sessionKeyRef.current || awardedSessionKey === sessionKeyRef.current) return;
    if (studiedMinutes <= 0) return;

    const now = new Date();
    const dateKey = toBrazilDateKey(now);
    const eventKey = sessionKeyRef.current;

    setAnalytics((prev) => {
      const current = prev.daily?.[dateKey] || { hours: 0, sessions: 0 };
      return {
        ...prev,
        daily: {
          ...(prev.daily || {}),
          [dateKey]: {
            ...current,
            hours: Number((current.hours + studiedMinutes / 60).toFixed(2)),
            sessions: current.sessions + 1,
          },
        },
      };
    });

    setXpEvents((prev) => {
      if (prev.some((event) => event.eventKey === eventKey)) return prev;
      const event: TrainerXpEvent = {
        id: `xp_${eventKey.replace(/[^a-zA-Z0-9_-]/g, '-')}`,
        eventKey,
        source: 'task',
        sourceId: selectedSubject.id,
        amount: xpEarned,
        reason: `Sessao rapida: ${selectedSubject.name}`,
        awardedAt: now.toISOString(),
        dateKey,
        metadata: {
          minutesSpent: studiedMinutes,
          subjectId: selectedSubject.id,
          quickSession: true,
          focusScore,
        },
      };
      return [...prev, event];
    });

    setAwardedSessionKey(eventKey);
  }, [
    awardedSessionKey,
    focusScore,
    selectedSubject,
    sessionState,
    setAnalytics,
    setXpEvents,
    studiedMinutes,
    xpEarned,
  ]);

  const durationOptions = [15, 25, 45, 60, 90, 120];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="app-modal-overlay"
          onClick={handleClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="app-modal-panel max-w-[360px] sm:max-w-xl lg:max-w-2xl"
          >
            <Card className="relative overflow-hidden" padding="none">
              <AnimatePresence>
                {showExitConfirm && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/90 p-4"
                  >
                    <motion.div
                      initial={{ scale: 0.96, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.96, opacity: 0 }}
                      className="w-full max-w-sm rounded-2xl border border-card-border bg-card-bg p-5"
                    >
                      <h3 className="text-lg font-heading font-semibold text-white">Sair da sessão?</h3>
                      <p className="mt-2 text-sm text-text-secondary">
                        A sessão atual será perdida. Deseja continuar?
                      </p>
                      <div className="mt-4 flex justify-end gap-2">
                        <Button variant="secondary" onClick={() => setShowExitConfirm(false)}>
                          Continuar estudando
                        </Button>
                        <Button variant="danger" onClick={confirmExitAndClose}>
                          Sair
                        </Button>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Header gradient */}
              <div
                className="h-2"
                style={{
                  background: selectedSubject
                    ? selectedSubject.color
                    : 'linear-gradient(90deg, #00B4FF, #7F00FF)',
                }}
              />

              {/* Close button */}
              <button
                onClick={handleClose}
                className="absolute top-4 right-4 p-2 rounded-lg hover:bg-white/10 text-text-muted hover:text-white transition-colors z-10"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="p-4 sm:p-8">
                {/* Setup State */}
                {sessionState === 'setup' && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <div className="text-center mb-8">
                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-neon-blue/20 to-neon-purple/20 flex items-center justify-center mx-auto mb-4">
                        <Sparkles className="w-8 h-8 text-neon-blue" />
                      </div>
                      <h2 className="text-2xl font-heading font-bold text-white mb-2">
                        Sessão Rápida
                      </h2>
                      <p className="text-text-secondary">
                        Configure e comece a estudar agora
                      </p>
                    </div>

                    {/* Seleção de Disciplina */}
                    <div className="mb-6">
                      <label className="block text-sm font-medium text-text-secondary mb-3">
                        Escolha a disciplina
                      </label>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {subjects.map((subject) => (
                          <button
                            key={subject.id}
                            onClick={() => setSelectedSubject(subject)}
                            className={cn(
                              'p-3 rounded-xl border text-left transition-all',
                              selectedSubject?.id === subject.id
                                ? 'border-neon-blue bg-neon-blue/10'
                                : 'border-card-border bg-card-bg hover:border-neon-blue/50'
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: subject.color }}
                              />
                              <span className="text-sm text-white truncate">
                                {subject.name}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Seleção de Duração */}
                    <div className="mb-8">
                      <label className="block text-sm font-medium text-text-secondary mb-3">
                        Duração da sessão
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {durationOptions.map((mins) => (
                          <button
                            key={mins}
                            onClick={() => setDuration(mins)}
                            className={cn(
                              'px-4 py-2 rounded-xl text-sm font-medium transition-all',
                              duration === mins
                                ? 'bg-neon-purple text-white'
                                : 'bg-card-bg border border-card-border text-text-secondary hover:border-neon-purple/50'
                            )}
                          >
                            {formatDuration(mins)}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Botão Iniciar */}
                    <Button
                      variant="primary"
                      className="w-full"
                      onClick={startSession}
                      disabled={!selectedSubject}
                      leftIcon={<Play className="w-4 h-4" />}
                    >
                      Iniciar Sessão
                    </Button>
                  </motion.div>
                )}

                {/* Running/Paused State */}
                {(sessionState === 'running' || sessionState === 'paused') && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center"
                  >
                    {/* Disciplina */}
                    <div className="flex items-center justify-center gap-2 mb-6">
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: selectedSubject?.color }}
                      />
                      <span className="text-lg text-white font-medium">
                        {selectedSubject?.name}
                      </span>
                    </div>

                    {/* Timer */}
                    <div className="relative mb-8">
                      {/* Circle progress */}
                      <svg className="w-40 h-40 sm:w-48 sm:h-48 mx-auto" viewBox="0 0 200 200">
                        {/* Background circle */}
                        <circle
                          cx="100"
                          cy="100"
                          r="90"
                          fill="none"
                          stroke="rgba(0, 180, 255, 0.1)"
                          strokeWidth="8"
                        />
                        {/* Progress circle */}
                        <circle
                          cx="100"
                          cy="100"
                          r="90"
                          fill="none"
                          stroke="url(#timerGradient)"
                          strokeWidth="8"
                          strokeLinecap="round"
                          strokeDasharray={`${progress * 5.65} 565`}
                          transform="rotate(-90 100 100)"
                        />
                        <defs>
                          <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#00B4FF" />
                            <stop offset="100%" stopColor="#7F00FF" />
                          </linearGradient>
                        </defs>
                      </svg>

                      {/* Time display */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-4xl sm:text-5xl font-heading font-bold text-white">
                          {formatTime(timeRemaining)}
                        </span>
                        <span className="text-sm text-text-secondary mt-2">
                          {sessionState === 'paused' ? 'Pausado' : 'restantes'}
                        </span>
                      </div>
                    </div>

                    {/* Status */}
                    {sessionState === 'paused' && (
                      <div className="mb-6 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
                        <p className="text-sm text-yellow-400">
                          ⏸️ Sessão pausada
                        </p>
                      </div>
                    )}

                    {/* Controls */}
                    <div className="flex w-full flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center sm:gap-4">
                      <Button
                        variant="secondary"
                        onClick={stopSession}
                        leftIcon={<Square className="w-4 h-4" />}
                      >
                        Parar
                      </Button>
                      <Button
                        variant="primary"
                        onClick={togglePause}
                        leftIcon={
                          sessionState === 'paused' ? (
                            <Play className="w-4 h-4" />
                          ) : (
                            <Pause className="w-4 h-4" />
                          )
                        }
                      >
                        {sessionState === 'paused' ? 'Continuar' : 'Pausar'}
                      </Button>
                    </div>
                  </motion.div>
                )}

                {/* Completed State */}
                {sessionState === 'completed' && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center"
                  >
                    <div className="w-20 h-20 rounded-full bg-neon-cyan/20 flex items-center justify-center mx-auto mb-6">
                      <CheckCircle2 className="w-10 h-10 text-neon-cyan" />
                    </div>

                    <h2 className="text-2xl font-heading font-bold text-white mb-2">
                      Sessão concluída
                    </h2>
                    <p className="text-text-secondary mb-8">
                      Ótimo trabalho! Continue assim.
                    </p>

                    {/* Stats */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-8">
                      <div className="p-4 rounded-xl bg-card-bg border border-card-border">
                        <Clock className="w-5 h-5 text-neon-blue mx-auto mb-2" />
                        <p className="text-xl font-bold text-white">
                          {formatDuration(Math.floor((totalTime - timeRemaining) / 60))}
                        </p>
                        <p className="text-xs text-text-muted">Estudado</p>
                      </div>
                      <div className="p-4 rounded-xl bg-card-bg border border-card-border">
                        <Sparkles className="w-5 h-5 text-neon-purple mx-auto mb-2" />
                        <p className="text-xl font-bold text-white">
                          +{calculateXP()}
                        </p>
                        <p className="text-xs text-text-muted">XP recebido</p>
                      </div>
                      <div className="p-4 rounded-xl bg-card-bg border border-card-border">
                        <BookOpen className="w-5 h-5 text-neon-cyan mx-auto mb-2" />
                        <p className="text-xl font-bold text-white">
                          {focusScore}%
                        </p>
                        <p className="text-xs text-text-muted">Foco</p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
                      <Button
                        variant="secondary"
                        className="flex-1"
                        onClick={handleClose}
                      >
                        Fechar
                      </Button>
                      <Button
                        variant="primary"
                        className="flex-1"
                        onClick={resetSession}
                        leftIcon={<Play className="w-4 h-4" />}
                      >
                        Nova Sessão
                      </Button>
                    </div>
                  </motion.div>
                )}
              </div>
            </Card>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
