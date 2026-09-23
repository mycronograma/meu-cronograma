import type { StudyBlock, StudyBlockType } from '@/types';

const BLOCK_TYPE_LABELS: Record<StudyBlockType, string> = {
  AULA: 'Aula',
  EXERCICIOS: 'Exercícios',
  REVISAO: 'Revisão',
  SIMULADO_AREA: 'Simulado (Área)',
  SIMULADO_COMPLETO: 'Simulado (Completo)',
  ANALISE: 'Correção',
};

export function getStudyBlockTypeLabel(
  type?: StudyBlockType,
  sessionType?: StudyBlock['sessionType']
): string | null {
  if (type) return BLOCK_TYPE_LABELS[type];
  if (sessionType === 'teoria') return 'Aula';
  if (sessionType === 'pratica') return 'Exercícios';
  if (sessionType === 'revisao') return 'Revisão';
  if (sessionType === 'simulado') return 'Simulado';
  return null;
}

export function getStudyBlockDisplayTitle(block: StudyBlock): string {
  if (block.isBreak) return 'Intervalo';
  const subjectName = block.subject?.name || 'Bloco de Estudo';
  const sessionLabel = getStudyBlockTypeLabel(block.type, block.sessionType);
  if (!sessionLabel) return subjectName;
  return `${subjectName} - ${sessionLabel}`;
}
