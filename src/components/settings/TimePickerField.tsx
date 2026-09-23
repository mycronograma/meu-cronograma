'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Clock, X } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { cn } from '@/lib/utils';

const pad2 = (value: number) => String(value).padStart(2, '0');

const parseTime = (value: string) => {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return { hour: 9, minute: 0 };
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return {
    hour: Number.isFinite(hour) ? Math.min(23, Math.max(0, hour)) : 9,
    minute: Number.isFinite(minute) ? Math.min(59, Math.max(0, minute)) : 0,
  };
};

const formatTime = (hour: number, minute: number) => `${pad2(hour)}:${pad2(minute)}`;

export interface TimePickerFieldProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  minuteStep?: number;
  disabled?: boolean;
  className?: string;
}

export default function TimePickerField({
  label,
  value,
  onChange,
  minuteStep = 5,
  disabled = false,
  className,
}: TimePickerFieldProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [draftHour, setDraftHour] = useState(() => parseTime(value).hour);
  const [draftMinute, setDraftMinute] = useState(() => parseTime(value).minute);
  const hourSelectRef = useRef<HTMLSelectElement | null>(null);

  const resolvedMinuteStep = useMemo(() => {
    const next = Math.floor(minuteStep);
    if (!Number.isFinite(next)) return 5;
    return Math.max(1, Math.min(30, next));
  }, [minuteStep]);

  const minuteOptions = useMemo(() => {
    const options: number[] = [];
    for (let minute = 0; minute < 60; minute += resolvedMinuteStep) {
      options.push(minute);
    }

    // Ensure the current value is selectable even if it's not aligned with step.
    if (!options.includes(draftMinute)) {
      options.push(draftMinute);
      options.sort((a, b) => a - b);
    }

    return options;
  }, [draftMinute, resolvedMinuteStep]);

  useEffect(() => {
    if (isOpen) return;
    const parsed = parseTime(value);
    setDraftHour(parsed.hour);
    setDraftMinute(parsed.minute);
  }, [isOpen, value]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const timeout = setTimeout(() => hourSelectRef.current?.focus(), 50);
    return () => clearTimeout(timeout);
  }, [isOpen]);

  const displayValue = value?.trim() ? value : formatTime(draftHour, draftMinute);

  const close = () => setIsOpen(false);

  const confirm = () => {
    const nextValue = formatTime(draftHour, draftMinute);
    setIsOpen(false);
    if (nextValue !== value) onChange(nextValue);
  };

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(true)}
        className={cn(
          'input-field py-2.5 flex items-center justify-between gap-3 text-left touch-manipulation active:scale-[0.99]',
          disabled && 'opacity-60 cursor-not-allowed',
          className
        )}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <span className="text-sm">{displayValue}</span>
        <Clock className="w-4 h-4 text-text-muted shrink-0" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="app-modal-overlay"
            onClick={close}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="app-modal-panel max-w-md"
              role="dialog"
              aria-modal="true"
              aria-label={label}
            >
              <Card className="relative" padding="md">
                <button
                  type="button"
                  onClick={close}
                  className="absolute top-4 right-4 p-2 rounded-lg hover:bg-white/5 text-text-muted hover:text-white transition-colors"
                  aria-label="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>

                <h2 className="text-lg font-heading font-bold text-white mb-1">{label}</h2>
                <p className="text-xs text-text-muted mb-5">Selecione um horário</p>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="min-w-0">
                    <label className="block text-sm font-medium text-text-secondary mb-2">Hora</label>
                    <select
                      ref={hourSelectRef}
                      value={draftHour}
                      onChange={(e) => setDraftHour(Number(e.target.value))}
                      className="input-field py-2.5"
                    >
                      {Array.from({ length: 24 }, (_, hour) => (
                        <option key={hour} value={hour}>
                          {pad2(hour)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="min-w-0">
                    <label className="block text-sm font-medium text-text-secondary mb-2">Min</label>
                    <select
                      value={draftMinute}
                      onChange={(e) => setDraftMinute(Number(e.target.value))}
                      className="input-field py-2.5"
                    >
                      {minuteOptions.map((minute) => (
                        <option key={minute} value={minute}>
                          {pad2(minute)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Button variant="ghost" onClick={close} className="w-full">
                    Cancelar
                  </Button>
                  <Button variant="primary" onClick={confirm} className="w-full">
                    Aplicar
                  </Button>
                </div>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
