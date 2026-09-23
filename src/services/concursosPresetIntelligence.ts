import type {
  ConcursoAreaFocus,
  ConcursoExperienceLevel,
  ConcursoLevel,
  ConcursoStudyPriority,
  PresetWizardAnswers,
} from '@/types';
import {
  dedupePresetSubjectsByCanonical,
  getCanonicalSubjectName,
  getCuratedPresetById,
  type CuratedPresetSubject,
} from '@/lib/presetCatalog';

type ConcursoImportSubject = Pick<
  CuratedPresetSubject,
  'name' | 'priority' | 'difficulty' | 'recommendedWeeklyHours'
>;

type AreaConfig = {
  moduleIds: string[];
  extraSubjects: ConcursoImportSubject[];
  summaryLabel: string;
};

const concursosBasePreset = getCuratedPresetById('concursos');

function clampPresetScale(value: number) {
  return Math.min(5, Math.max(1, Math.round(value)));
}

function clampHours(value: number) {
  return Math.max(0.5, Math.round(value * 2) / 2);
}

function adjustSubject(
  subject: ConcursoImportSubject,
  patch: Partial<ConcursoImportSubject>
): ConcursoImportSubject {
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
        ? clampHours(patch.recommendedWeeklyHours)
        : clampHours(subject.recommendedWeeklyHours),
  };
}

function parseConcursoEditalSubjects(raw?: string): ConcursoImportSubject[] {
  if (!raw) return [];
  const names = raw
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
  const deduped = new Map<string, string>();
  for (const name of names) {
    const canonical = getCanonicalSubjectName(name);
    if (!canonical || deduped.has(canonical)) continue;
    deduped.set(canonical, name);
  }
  return Array.from(deduped.values()).map((name) => ({
    name,
    priority: 4,
    difficulty: 3,
    recommendedWeeklyHours: 4,
  }));
}

function getAreaConfig(area: ConcursoAreaFocus | undefined): AreaConfig {
  switch (area) {
    case 'policial':
      return {
        moduleIds: ['policial-penal'],
        extraSubjects: [],
        summaryLabel: 'Área Policial / Segurança Pública',
      };
    case 'tribunais':
      return {
        moduleIds: [],
        extraSubjects: [
          { name: 'Direito Civil', priority: 4, difficulty: 4, recommendedWeeklyHours: 6 },
          { name: 'Processo Civil', priority: 4, difficulty: 4, recommendedWeeklyHours: 6 },
        ],
        summaryLabel: 'Tribunais / Jurídica',
      };
    case 'fiscal':
      return {
        moduleIds: ['fiscal-contabil', 'controle-interno'],
        extraSubjects: [
          { name: 'Matemática Financeira', priority: 4, difficulty: 4, recommendedWeeklyHours: 5 },
        ],
        summaryLabel: 'Área Fiscal / Controle',
      };
    case 'administrativa':
      return {
        moduleIds: ['gestao-administracao'],
        extraSubjects: [],
        summaryLabel: 'Área Administrativa / Gestão',
      };
    case 'bancaria':
      return {
        moduleIds: [],
        extraSubjects: [
          { name: 'Conhecimentos Bancários', priority: 4, difficulty: 3, recommendedWeeklyHours: 8 },
          { name: 'Matemática Financeira', priority: 4, difficulty: 4, recommendedWeeklyHours: 6 },
          { name: 'Atualidades do Mercado Financeiro', priority: 3, difficulty: 3, recommendedWeeklyHours: 4 },
        ],
        summaryLabel: 'Bancária',
      };
    case 'inss':
      return {
        moduleIds: [],
        extraSubjects: [
          { name: 'Direito Previdenciário', priority: 4, difficulty: 4, recommendedWeeklyHours: 8 },
          { name: 'Legislação Previdenciária', priority: 4, difficulty: 4, recommendedWeeklyHours: 6 },
          { name: 'Seguridade Social', priority: 3, difficulty: 3, recommendedWeeklyHours: 5 },
        ],
        summaryLabel: 'INSS / Previdenciária',
      };
    case 'educacao':
      return {
        moduleIds: [],
        extraSubjects: [
          { name: 'Didática', priority: 4, difficulty: 3, recommendedWeeklyHours: 7 },
          { name: 'Legislação Educacional', priority: 4, difficulty: 3, recommendedWeeklyHours: 5 },
          { name: 'Políticas Públicas de Educação', priority: 3, difficulty: 3, recommendedWeeklyHours: 4 },
        ],
        summaryLabel: 'Educação',
      };
    case 'personalizado':
    default:
      return {
        moduleIds: [],
        extraSubjects: [],
        summaryLabel: 'Personalizado',
      };
  }
}

function applyConcursoLevel(subject: ConcursoImportSubject, level: ConcursoLevel | undefined) {
  if (!level) return subject;
  const canonical = getCanonicalSubjectName(subject.name);

  if (level === 'medio') {
    const isComplex =
      canonical.includes('contabilidade') ||
      canonical.includes('processual') ||
      canonical.includes('tributario') ||
      canonical.includes('previdenciario') ||
      canonical.includes('auditoria');
    return adjustSubject(subject, {
      difficulty: subject.difficulty - 1,
      recommendedWeeklyHours: isComplex ? subject.recommendedWeeklyHours - 0.5 : subject.recommendedWeeklyHours,
    });
  }

  if (level === 'superior') {
    const isJuridicoOuContabil =
      canonical.includes('direito') || canonical.includes('contabilidade') || canonical.includes('auditoria');
    return adjustSubject(subject, {
      difficulty: subject.difficulty + 1,
      priority: isJuridicoOuContabil ? subject.priority + 1 : subject.priority,
      recommendedWeeklyHours: isJuridicoOuContabil ? subject.recommendedWeeklyHours + 1 : subject.recommendedWeeklyHours,
    });
  }

  if (level === 'ambos') {
    return adjustSubject(subject, {
      recommendedWeeklyHours: subject.recommendedWeeklyHours + 0.5,
    });
  }

  return subject;
}

function applyConcursoExperience(
  subject: ConcursoImportSubject,
  experience: ConcursoExperienceLevel | undefined,
  areaSpecificCanonicalSet: Set<string>
) {
  if (!experience) return subject;
  const canonical = getCanonicalSubjectName(subject.name);
  const isBaseFoundation =
    canonical === 'lingua portuguesa' ||
    canonical === 'raciocinio logico matematica' ||
    canonical === 'informatica' ||
    canonical === 'direito constitucional' ||
    canonical === 'direito administrativo';
  const isAreaSpecific = areaSpecificCanonicalSet.has(canonical);

  if (experience === 'nunca') {
    return adjustSubject(subject, {
      priority: isBaseFoundation ? subject.priority + 1 : subject.priority,
      difficulty: isAreaSpecific ? subject.difficulty - 1 : subject.difficulty,
      recommendedWeeklyHours: isBaseFoundation ? subject.recommendedWeeklyHours + 1 : subject.recommendedWeeklyHours,
    });
  }

  if (experience === 'pouco') {
    return adjustSubject(subject, {
      priority: isBaseFoundation ? subject.priority + 1 : subject.priority,
      recommendedWeeklyHours: isBaseFoundation ? subject.recommendedWeeklyHours + 0.5 : subject.recommendedWeeklyHours,
    });
  }

  if (experience === 'intermediaria') {
    return subject;
  }

  // avancado
  return adjustSubject(subject, {
    priority: isAreaSpecific ? subject.priority + 1 : subject.priority,
    difficulty: isAreaSpecific ? subject.difficulty + 1 : subject.difficulty,
    recommendedWeeklyHours: isAreaSpecific ? subject.recommendedWeeklyHours + 1 : subject.recommendedWeeklyHours,
  });
}

function applyConcursoPriorityMode(
  subject: ConcursoImportSubject,
  priorityMode: ConcursoStudyPriority | undefined
) {
  if (!priorityMode || priorityMode === 'equilibrado') return subject;

  const canonical = getCanonicalSubjectName(subject.name);
  const isTeoriaHeavy =
    canonical.includes('direito') ||
    canonical.includes('legislacao') ||
    canonical.includes('didatica') ||
    canonical.includes('politicas publicas');
  const isExerciseHeavy =
    canonical === 'raciocinio logico matematica' ||
    canonical === 'matematica financeira' ||
    canonical.includes('contabilidade') ||
    canonical === 'informatica' ||
    canonical === 'lingua portuguesa';

  if (priorityMode === 'teoria') {
    return adjustSubject(subject, {
      recommendedWeeklyHours: isTeoriaHeavy
        ? subject.recommendedWeeklyHours + 1
        : isExerciseHeavy
        ? subject.recommendedWeeklyHours - 0.5
        : subject.recommendedWeeklyHours + 0.5,
      difficulty: isTeoriaHeavy ? subject.difficulty + 1 : subject.difficulty,
    });
  }

  return adjustSubject(subject, {
    recommendedWeeklyHours: isExerciseHeavy
      ? subject.recommendedWeeklyHours + 1
      : canonical === 'atualidades' || canonical === 'legislacao'
      ? subject.recommendedWeeklyHours - 0.5
      : subject.recommendedWeeklyHours,
    priority: isExerciseHeavy ? subject.priority + 1 : subject.priority,
  });
}

export function buildConcursosPresetSubjectsFromAnswers(
  answers?: Pick<
    PresetWizardAnswers,
    | 'concursoArea'
    | 'concursoLevel'
    | 'concursoExperience'
    | 'concursoPriorityMode'
    | 'concursoSubjectsRaw'
  >
): ConcursoImportSubject[] {
  if (!concursosBasePreset) {
    throw new Error('Curated Concursos preset not found');
  }

  const areaConfig = getAreaConfig(answers?.concursoArea);
  const moduleSubjects = (concursosBasePreset.specificModules || [])
    .filter((module) => areaConfig.moduleIds.includes(module.id))
    .flatMap((module) => module.subjects)
    .map((subject) => ({
      name: subject.name,
      priority: subject.priority,
      difficulty: subject.difficulty,
      recommendedWeeklyHours: subject.recommendedWeeklyHours,
    }));

  const baseSubjects = concursosBasePreset.subjects.map((subject) => ({
    name: subject.name,
    priority: subject.priority,
    difficulty: subject.difficulty,
    recommendedWeeklyHours: subject.recommendedWeeklyHours,
  }));
  const editalSubjects = parseConcursoEditalSubjects(answers?.concursoSubjectsRaw);
  const editalCanonicalSet = new Set(
    editalSubjects.map((subject) => getCanonicalSubjectName(subject.name))
  );

  const areaSpecificSet = new Set(
    [...moduleSubjects, ...areaConfig.extraSubjects, ...editalSubjects].map((subject) =>
      getCanonicalSubjectName(subject.name)
    )
  );

  const adapted = dedupePresetSubjectsByCanonical<ConcursoImportSubject>([
    ...baseSubjects,
    ...moduleSubjects,
    ...areaConfig.extraSubjects,
    ...editalSubjects,
  ])
    .map((subject) => {
      const canonical = getCanonicalSubjectName(subject.name);
      if (!editalCanonicalSet.has(canonical)) return subject;
      return adjustSubject(subject, {
        priority: subject.priority + 1,
        recommendedWeeklyHours: subject.recommendedWeeklyHours + 1,
      });
    })
    .map((subject) => applyConcursoLevel(subject, answers?.concursoLevel))
    .map((subject) => applyConcursoExperience(subject, answers?.concursoExperience, areaSpecificSet))
    .map((subject) => applyConcursoPriorityMode(subject, answers?.concursoPriorityMode))
    .map((subject) => adjustSubject(subject, {}));

  return adapted.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    if (b.recommendedWeeklyHours !== a.recommendedWeeklyHours) {
      return b.recommendedWeeklyHours - a.recommendedWeeklyHours;
    }
    return a.name.localeCompare(b.name);
  });
}

export function getConcursosQuestionnaireAreaLabel(area: ConcursoAreaFocus | undefined) {
  return getAreaConfig(area).summaryLabel;
}
