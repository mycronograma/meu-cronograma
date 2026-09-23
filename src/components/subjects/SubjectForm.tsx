'use client';

/**
 * SubjectForm Component
 * Formulário para criar/editar disciplinas
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Palette } from 'lucide-react';
import { cn, subjectColors } from '@/lib/utils';
import { Button, Card } from '@/components/ui';
import type { Subject } from '@/types';

interface SubjectFormProps {
  subject?: Subject;
  onSubmit: (data: Partial<Subject>) => void;
  onCancel: () => void;
  targetMode?: 'months' | 'totalHours';
  targetMonths?: number;
  targetTotalHours?: number;
  totalWeightExcludingCurrent?: number;
  recommendedWeeklyHours?: number;
}

export default function SubjectForm({
  subject,
  onSubmit,
  onCancel,
  targetMode,
  targetMonths,
  targetTotalHours,
  totalWeightExcludingCurrent = 0,
  recommendedWeeklyHours = 2,
}: SubjectFormProps) {
  const [name, setName] = useState(subject?.name || '');
  const [color, setColor] = useState(subject?.color || subjectColors[0]);
  const [priority, setPriority] = useState(subject?.priority || 5);
  const [difficulty, setDifficulty] = useState(subject?.difficulty || 5);
  const [targetHours, setTargetHours] = useState(subject?.targetHours || 50);
  const [error, setError] = useState<string | null>(null);

  const recalculateTargetHours = (newPriority: number, newDifficulty: number) => {
    if (targetMode === 'totalHours' && targetTotalHours) {
      const subjectWeight = newPriority * newDifficulty;
      const newTotalWeight = totalWeightExcludingCurrent + subjectWeight;
      const weightFraction = subjectWeight / (newTotalWeight || 1);
      setTargetHours(Math.max(1, Math.round(weightFraction * targetTotalHours)));
    } else if (targetMode === 'months' && targetMonths) {
      const weeks = targetMonths * 4.33;
      const baseWeekly = recommendedWeeklyHours;
      // Escala tanto por prioridade quanto por dificuldade (base 5 é neutro)
      const scaledWeekly = baseWeekly * (newPriority / 5) * (newDifficulty / 5);
      setTargetHours(Math.max(1, Math.round(scaledWeekly * weeks)));
    }
  };

  const handlePriorityChange = (newPriority: number) => {
    setPriority(newPriority);
    recalculateTargetHours(newPriority, difficulty);
  };

  const handleDifficultyChange = (newDifficulty: number) => {
    setDifficulty(newDifficulty);
    recalculateTargetHours(priority, newDifficulty);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const safeTargetHours = Number(targetHours);

    if (trimmedName.length < 2) {
      setError('Informe um nome com pelo menos 2 caracteres.');
      return;
    }

    if (trimmedName.length > 80) {
      setError('Use um nome menor para a disciplina.');
      return;
    }

    if (!Number.isFinite(safeTargetHours) || safeTargetHours < 1 || safeTargetHours > 10000) {
      setError('A meta de horas precisa estar entre 1 e 10000.');
      return;
    }

    onSubmit({
      name: trimmedName,
      color,
      priority,
      difficulty,
      targetHours: safeTargetHours,
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="app-modal-overlay"
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="app-modal-panel max-w-md"
      >
        <Card className="relative" padding="md">
          {/* Botão fechar */}
          <button
            onClick={onCancel}
            className="absolute top-4 right-4 p-2 rounded-lg hover:bg-white/5 text-text-muted hover:text-white transition-colors"
            aria-label="Fechar formulario de disciplina"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Cabeçalho */}
          <h2 className="text-xl font-heading font-bold text-white mb-6">
            {subject ? 'Editar Disciplina' : 'Nova Disciplina'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Nome */}
            <div>
              <label htmlFor="subject-name" className="block text-sm font-medium text-text-secondary mb-2">
                Nome da Disciplina
              </label>
              <input
                id="subject-name"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Ex: Matemática"
                className="input-field"
                maxLength={80}
                required
              />
            </div>

            {/* Cor */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Cor
              </label>
              <div className="flex gap-2 flex-wrap">
                {subjectColors.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={cn(
                      'w-8 h-8 rounded-lg transition-all',
                      color === c && 'ring-2 ring-white ring-offset-2 ring-offset-background'
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            {/* Prioridade */}
            <div>
              <label htmlFor="subject-priority" className="block text-sm font-medium text-text-secondary mb-2">
                Prioridade: {priority}
              </label>
              <input
                id="subject-priority"
                type="range"
                min="1"
                max="10"
                value={priority}
                onChange={(e) => handlePriorityChange(Number(e.target.value))}
                className="w-full accent-neon-blue"
              />
              <div className="flex justify-between text-xs text-text-muted mt-1">
                <span>Baixa</span>
                <span>Alta</span>
              </div>
            </div>

            {/* Dificuldade */}
            <div>
              <label htmlFor="subject-difficulty" className="block text-sm font-medium text-text-secondary mb-2">
                Dificuldade: {difficulty}
              </label>
              <input
                id="subject-difficulty"
                type="range"
                min="1"
                max="10"
                value={difficulty}
                onChange={(e) => handleDifficultyChange(Number(e.target.value))}
                className="w-full accent-neon-purple"
              />
              <div className="flex justify-between text-xs text-text-muted mt-1">
                <span>Fácil</span>
                <span>Difícil</span>
              </div>
            </div>

            {/* Meta de Horas */}
            <div>
              <label htmlFor="subject-target-hours" className="block text-sm font-medium text-text-secondary mb-2">
                Meta Total (horas)
              </label>
              <input
                id="subject-target-hours"
                type="number"
                min="1"
                max="1000"
                value={targetHours}
                onChange={(e) => {
                  setTargetHours(Number(e.target.value));
                  if (error) setError(null);
                }}
                className="input-field"
                required
              />
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            {/* Ações */}
            <div className="flex flex-col gap-3 pt-4 sm:flex-row">
              <Button
                type="button"
                variant="secondary"
                onClick={onCancel}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button type="submit" variant="primary" className="flex-1">
                {subject ? 'Salvar Alterações' : 'Adicionar Disciplina'}
              </Button>
            </div>
          </form>
        </Card>
      </motion.div>
    </motion.div>
  );
}
