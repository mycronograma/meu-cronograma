/**
 * API Route: POST /api/presets/[id]/import
 * Imports a preset's subjects to a user's subject list
 *
 * Uses session user, maps preset scale (1-5) to subject scale (1-10)
 * and deduplicates by canonical subject name.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { subjectColors } from '@/lib/utils';
import { getEnemDisciplineByName, getEnemPresetSubjects } from '@/lib/enemCatalog';
import {
  dedupePresetSubjectsByCanonical,
  getCanonicalSubjectName,
  getCuratedPresetByName,
} from '@/lib/presetCatalog';
import { buildConcursosPresetSubjectsFromAnswers } from '@/services/concursosPresetIntelligence';
import type { EnemAreaPriorities, PresetWizardAnswers } from '@/types';

type ImportPresetSubject = {
  name: string;
  priority: number;
  difficulty: number;
  recommendedWeeklyHours: number;
};

type PresetWeeklyLoad = 'leve' | 'normal' | 'intensivo';

const PRESET_WEEKLY_LOAD_MULTIPLIERS: Record<PresetWeeklyLoad, number> = {
  leve: 0.55,
  normal: 0.75,
  intensivo: 1,
};

function clampPresetScale(value: number) {
  return Math.min(5, Math.max(1, Math.round(value)));
}

function clampWeeklyHours(value: number) {
  return Math.max(0.5, Math.round(value * 2) / 2);
}

function resolvePresetWeeklyLoad(value: unknown): PresetWeeklyLoad {
  return value === 'normal' || value === 'intensivo' ? value : 'leve';
}

function applyPresetWeeklyLoad(hours: number, weeklyLoad: PresetWeeklyLoad) {
  if (hours <= 0) return 0;
  return clampWeeklyHours(hours * PRESET_WEEKLY_LOAD_MULTIPLIERS[weeklyLoad]);
}

function adjustImportSubject(
  subject: ImportPresetSubject,
  patch: Partial<ImportPresetSubject>
): ImportPresetSubject {
  return {
    ...subject,
    ...patch,
    priority:
      typeof patch.priority === 'number'
        ? clampPresetScale(patch.priority)
        : clampPresetScale(subject.priority),
    difficulty:
      typeof patch.difficulty === 'number'
        ? clampPresetScale(patch.difficulty)
        : clampPresetScale(subject.difficulty),
    recommendedWeeklyHours:
      typeof patch.recommendedWeeklyHours === 'number'
        ? clampWeeklyHours(patch.recommendedWeeklyHours)
        : clampWeeklyHours(subject.recommendedWeeklyHours),
  };
}

function mapPriority(presetPriority: number): number {
  return Math.min(10, Math.max(1, presetPriority * 2));
}

function mapDifficulty(presetDifficulty: number): number {
  return Math.min(10, Math.max(1, presetDifficulty * 2));
}

function getSubjectIcon(name: string): string {
  const canonical = getCanonicalSubjectName(name);

  if (canonical.includes('matematica')) return 'calculator';
  if (canonical.includes('lingua portuguesa') || canonical.includes('interpretacao') || canonical.includes('literatura')) {
    return 'book-open';
  }
  if (canonical.includes('lingua estrangeira')) return 'languages';
  if (canonical.includes('redacao')) return 'pen-tool';
  if (canonical.includes('biologia')) return 'leaf';
  if (canonical.includes('quimica')) return 'flask';
  if (canonical.includes('fisica')) return 'atom';
  if (canonical.includes('historia')) return 'landmark';
  if (canonical.includes('geografia')) return 'globe';
  if (canonical.includes('filosofia')) return 'brain';
  if (canonical.includes('sociologia')) return 'users';
  if (canonical.includes('direito')) return 'scale';
  if (canonical.includes('raciocinio logico')) return 'brain-circuit';
  if (canonical.includes('informatica')) return 'laptop';
  if (canonical.includes('atualidades')) return 'newspaper';
  if (canonical.includes('administracao')) return 'briefcase';
  if (canonical === 'legislacao') return 'scroll-text';
  if (canonical.includes('contabilidade')) return 'calculator';
  if (canonical.includes('auditoria')) return 'clipboard-list';
  if (canonical.includes('controle')) return 'shield-check';

  return 'book';
}

function getPriorityFactor(level: EnemAreaPriorities[keyof EnemAreaPriorities] | undefined) {
  if (level === 'alta') return 1.25;
  if (level === 'baixa') return 0.8;
  return 1;
}

function applyEnemWizardAdjustments(
  subjects: ImportPresetSubject[],
  answers?: PresetWizardAnswers
) {
  if (!answers) return subjects;
  const priorities = answers.enemAreaPriorities;
  if (!priorities) return subjects;

  return subjects.map((subject) => {
    const discipline = getEnemDisciplineByName(subject.name);
    if (!discipline) return subject;
    const factor = getPriorityFactor(priorities[discipline.area]);
    const priorityDelta = factor > 1 ? 1 : factor < 1 ? -1 : 0;
    return adjustImportSubject(subject, {
      recommendedWeeklyHours: subject.recommendedWeeklyHours * factor,
      priority: subject.priority + priorityDelta,
    });
  });
}

function applyMedicinaWizardAdjustments(
  subjects: ImportPresetSubject[],
  answers?: PresetWizardAnswers
) {
  if (!answers) return subjects;

  const weights = answers.medicinaCoreWeights;
  const targetExams = new Set(answers.medicinaTargetExams || []);
  if (!weights && targetExams.size === 0) return subjects;

  const hasEnem = targetExams.has('enem');
  const hasLeituraHeavy = targetExams.has('fuvest') || targetExams.has('unicamp') || targetExams.has('unesp');

  return subjects.map((subject) => {
    const canonical = getCanonicalSubjectName(subject.name);
    let factor = 1;

    if (weights) {
      if (canonical === 'biologia') factor *= (weights.biologia || 3) / 3;
      if (canonical === 'quimica') factor *= (weights.quimica || 3) / 3;
      if (canonical === 'fisica') factor *= (weights.fisica || 3) / 3;
      if (canonical === 'matematica') factor *= (weights.matematica || 3) / 3;
      if (canonical === 'redacao') factor *= (weights.redacao || 3) / 3;
    }

    if (hasEnem) {
      if (
        canonical === 'redacao' ||
        canonical === 'lingua portuguesa' ||
        canonical === 'interpretacao de texto'
      ) {
        factor *= 1.1;
      }
      if (canonical === 'historia' || canonical === 'geografia' || canonical === 'filosofia' || canonical === 'sociologia') {
        factor *= 1.05;
      }
    }

    if (hasLeituraHeavy) {
      if (
        canonical === 'lingua portuguesa' ||
        canonical === 'interpretacao de texto' ||
        canonical === 'literatura' ||
        canonical === 'redacao'
      ) {
        factor *= 1.12;
      }
    }

    const priorityDelta = factor >= 1.15 ? 1 : factor <= 0.9 ? -1 : 0;
    return adjustImportSubject(subject, {
      recommendedWeeklyHours: subject.recommendedWeeklyHours * factor,
      priority: subject.priority + priorityDelta,
    });
  });
}

function toImportSubjects(
  dbPresetSubjects: ImportPresetSubject[],
  dbPresetName: string,
  wizardAnswers?: PresetWizardAnswers
): ImportPresetSubject[] {
  if (dbPresetName.toLowerCase() === 'enem') {
    const base = dedupePresetSubjectsByCanonical(getEnemPresetSubjects()).map((subject) => ({
      name: subject.name,
      priority: subject.priority,
      difficulty: subject.difficulty,
      recommendedWeeklyHours: subject.recommendedWeeklyHours,
    }));
    return applyEnemWizardAdjustments(base, wizardAnswers);
  }

  if (dbPresetName.toLowerCase().includes('concurso')) {
    return buildConcursosPresetSubjectsFromAnswers(wizardAnswers);
  }

  const curated = getCuratedPresetByName(dbPresetName);
  if (curated) {
    const base = dedupePresetSubjectsByCanonical(curated.subjects).map((subject) => ({
      name: subject.name,
      priority: subject.priority,
      difficulty: subject.difficulty,
      recommendedWeeklyHours: subject.recommendedWeeklyHours,
    }));
    if (curated.id === 'medicina') {
      return applyMedicinaWizardAdjustments(base, wizardAnswers);
    }
    return base;
  }

  return dedupePresetSubjectsByCanonical(dbPresetSubjects).map((subject) => ({
    name: subject.name,
    priority: subject.priority,
    difficulty: subject.difficulty,
    recommendedWeeklyHours: subject.recommendedWeeklyHours,
  }));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    let body: { wizardAnswers?: PresetWizardAnswers; weeklyLoad?: PresetWeeklyLoad } = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const weeklyLoad = resolvePresetWeeklyLoad(body.weeklyLoad);

    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const preset = await prisma.studyPreset.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        subjects: true,
      },
    });

    if (!preset) {
      return NextResponse.json({ success: false, error: 'Preset not found' }, { status: 404 });
    }

    const presetSubjects = toImportSubjects(preset.subjects, preset.name, body.wizardAnswers);

    const existingSubjects = await prisma.subject.findMany({
      where: { userId },
      select: { id: true, name: true },
    });

    const existingSubjectsByCanonical = new Map(
      existingSubjects.map((subject) => [getCanonicalSubjectName(subject.name), subject])
    );

    const importedSubjects = await Promise.all(
      presetSubjects.map((presetSubject, index) => {
        const canonicalName = getCanonicalSubjectName(presetSubject.name);
        const existing = existingSubjectsByCanonical.get(canonicalName);

        if (existing) {
          return prisma.subject.update({
            where: { id: existing.id },
            data: {
              name: presetSubject.name,
              priority: mapPriority(presetSubject.priority),
              difficulty: mapDifficulty(presetSubject.difficulty),
              targetHours: applyPresetWeeklyLoad(presetSubject.recommendedWeeklyHours, weeklyLoad),
            },
          });
        }

        return prisma.subject.create({
          data: {
            userId,
            name: presetSubject.name,
            color: subjectColors[index % subjectColors.length],
            icon: getSubjectIcon(presetSubject.name),
            priority: mapPriority(presetSubject.priority),
            difficulty: mapDifficulty(presetSubject.difficulty),
            targetHours: applyPresetWeeklyLoad(presetSubject.recommendedWeeklyHours, weeklyLoad),
            completedHours: 0,
            totalHours: 0,
            sessionsCount: 0,
            averageScore: 0,
            isActive: true,
          },
        });
      })
    );

    return NextResponse.json({
      success: true,
      data: {
        preset: { id: preset.id, name: preset.name },
        importedCount: importedSubjects.length,
        subjects: importedSubjects,
      },
    });
  } catch (error) {
    console.error('Error importing preset:', error);
    return NextResponse.json({ success: false, error: 'Failed to import preset' }, { status: 500 });
  }
}
