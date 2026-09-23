'use client';

/**
 * BlockFormModal Component
 * Modal para criar/editar blocos do planner
 */

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { cn, parseBlockDate, timeToMinutes } from '@/lib/utils';
import type { StudyBlock, StudyBlockType, Subject } from '@/types';

export interface BlockFormData {
  date: Date;
  startTime: string;
  durationMinutes: number;
  isBreak: boolean;
  subjectId: string | null;
  type?: StudyBlockType;
}

interface BlockFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: BlockFormData) => void;
  subjects: Subject[];
  date: Date;
  block?: StudyBlock | null;
  defaultStartTime?: string;
  defaultDurationMinutes?: number;
  validateBlock?: (data: BlockFormData) => string | null;
}

const DEFAULT_DURATION = 60;
const STUDY_TYPE_OPTIONS: Array<{ value: StudyBlockType; label: string; description: string }> = [
  { value: 'AULA', label: 'Aula', description: 'Conteúdo novo' },
  { value: 'EXERCICIOS', label: 'Exercícios', description: 'Lista ou prática' },
  { value: 'REVISAO', label: 'Revisão', description: 'Fixar e revisar' },
  { value: 'SIMULADO_COMPLETO', label: 'Simulado', description: 'Tempo cronometrado' },
  { value: 'ANALISE', label: 'Análise', description: 'Correção e erros' },
];

const toDateInputValue = (date: Date) => {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().split('T')[0];
};

const fromDateInputValue = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export default function BlockFormModal({
  isOpen,
  onClose,
  onSave,
  subjects,
  date,
  block,
  defaultStartTime = '09:00',
  defaultDurationMinutes = DEFAULT_DURATION,
  validateBlock,
}: BlockFormModalProps) {
  const [dateValue, setDateValue] = useState(toDateInputValue(date));
  const [startTime, setStartTime] = useState('09:00');
  const [durationMinutes, setDurationMinutes] = useState(DEFAULT_DURATION);
  const [isBreak, setIsBreak] = useState(false);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [blockType, setBlockType] = useState<StudyBlockType>('AULA');
  const [error, setError] = useState<string | null>(null);

  const subjectOptions = useMemo(() => {
    if (subjects.length > 0) return subjects;
    return [
      {
        id: 'default',
        userId: 'user1',
        name: 'Sessão Livre',
        color: '#00B4FF',
        icon: 'book',
        priority: 5,
        difficulty: 5,
        targetHours: 0,
        completedHours: 0,
        totalHours: 0,
        sessionsCount: 0,
        averageScore: 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
  }, [subjects]);

  useEffect(() => {
    if (!isOpen) return;

    setDateValue(toDateInputValue(block?.date ? parseBlockDate(block.date) : date));
    setStartTime(block?.startTime || defaultStartTime);
    setDurationMinutes(block?.durationMinutes || defaultDurationMinutes);
    setIsBreak(Boolean(block?.isBreak));
    setSubjectId(block?.subjectId || subjectOptions[0]?.id || null);
    setBlockType(block?.type || 'AULA');
    setError(null);
  }, [
    isOpen,
    block,
    date,
    subjectOptions,
    defaultStartTime,
    defaultDurationMinutes,
  ]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!/^\d{2}:\d{2}$/.test(startTime)) {
      setError('Informe um horario de inicio valido.');
      return;
    }

    const [hours, minutes] = startTime.split(':').map(Number);
    if (
      !Number.isFinite(hours) ||
      !Number.isFinite(minutes) ||
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59
    ) {
      setError('Informe um horario de inicio valido.');
      return;
    }

    if (!durationMinutes || durationMinutes < 15 || durationMinutes > 240) {
      setError('A duracao precisa ficar entre 15 e 240 minutos.');
      return;
    }

    const startMinutes = timeToMinutes(startTime);
    if (startMinutes + durationMinutes > 24 * 60) {
      setError('Este bloco passa da meia-noite. Reduza a duracao ou escolha um horario mais cedo.');
      return;
    }

    if (!isBreak && !subjectId) {
      setError('Selecione uma disciplina.');
      return;
    }

    const payload: BlockFormData = {
      date: fromDateInputValue(dateValue),
      startTime,
      durationMinutes,
      isBreak,
      subjectId: isBreak ? null : subjectId,
      type: isBreak ? undefined : blockType,
    };

    const validationError = validateBlock?.(payload);
    if (validationError) {
      setError(validationError);
      return;
    }

    onSave(payload);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="app-modal-overlay"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="app-modal-panel max-w-md"
        >
          <Card className="relative" padding="md">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-lg hover:bg-white/5 text-text-muted hover:text-white transition-colors"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-xl font-heading font-bold text-white mb-6">
              {block ? 'Editar estudo' : 'Novo estudo'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="study-block-date" className="block text-sm font-medium text-text-secondary mb-2">
                  Data
                </label>
                <input
                  id="study-block-date"
                  type="date"
                  value={dateValue}
                  onChange={(e) => setDateValue(e.target.value)}
                  className="input-field"
                  required
                />
              </div>

              <div>
                <label htmlFor="study-block-start" className="block text-sm font-medium text-text-secondary mb-2">
                  Horário de início
                </label>
                <input
                  id="study-block-start"
                  type="time"
                  value={startTime}
                  onChange={(e) => {
                    setStartTime(e.target.value);
                    if (error) setError(null);
                  }}
                  className="input-field"
                  required
                />
              </div>

              <div>
                <label htmlFor="study-block-duration" className="block text-sm font-medium text-text-secondary mb-2">
                  Duração (min)
                </label>
                <input
                  id="study-block-duration"
                  type="number"
                  min="15"
                  max="240"
                  step="5"
                  value={durationMinutes}
                  onChange={(e) => {
                    setDurationMinutes(Number(e.target.value));
                    if (error) setError(null);
                  }}
                  className="input-field"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Tipo
                </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                    onClick={() => setIsBreak(false)}
                    className={cn(
                      'flex-1 px-3 py-2 rounded-lg border text-sm transition-colors',
                      !isBreak
                        ? 'border-neon-blue/60 text-white bg-neon-blue/10'
                        : 'border-card-border text-text-secondary hover:border-neon-blue/40'
                    )}
                  >
                    Estudo
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsBreak(true)}
                    className={cn(
                      'flex-1 px-3 py-2 rounded-lg border text-sm transition-colors',
                      isBreak
                        ? 'border-neon-blue/60 text-white bg-neon-blue/10'
                        : 'border-card-border text-text-secondary hover:border-neon-blue/40'
                    )}
                  >
                    Intervalo
                  </button>
                </div>
              </div>

              {!isBreak && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">
                      O que vai fazer?
                    </label>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {STUDY_TYPE_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setBlockType(option.value)}
                          className={cn(
                            'rounded-lg border px-3 py-2 text-left transition-colors',
                            blockType === option.value
                              ? 'border-neon-blue/60 bg-neon-blue/10 text-white'
                              : 'border-card-border text-text-secondary hover:border-neon-blue/40'
                          )}
                        >
                          <span className="block text-sm font-medium">{option.label}</span>
                          <span className="block text-xs text-text-muted">{option.description}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="study-block-subject" className="block text-sm font-medium text-text-secondary mb-2">
                      Disciplina
                    </label>
                    <select
                      id="study-block-subject"
                      value={subjectId || ''}
                      onChange={(e) => setSubjectId(e.target.value)}
                      className="input-field"
                      required
                    >
                      {subjectOptions.map((subject) => (
                        <option key={subject.id} value={subject.id}>
                          {subject.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {error && (
                <p className="text-sm text-red-400">{error}</p>
              )}

              <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
                  Cancelar
                </Button>
                <Button type="submit" variant="primary" className="flex-1">
                  {block ? 'Salvar' : 'Adicionar'}
                </Button>
              </div>
            </form>
          </Card>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
