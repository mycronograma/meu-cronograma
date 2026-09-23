import { getEnemPresetSubjects } from '@/lib/enemCatalog';
import { getCanonicalSubjectName, getCuratedPresetById } from '@/lib/presetCatalog';
import { buildConcursosPresetSubjectsFromAnswers } from '@/services/concursosPresetIntelligence';
import { generateWeeklySchedule } from '@/services/studyAlgorithm';
import type { ScheduleConfig, Subject } from '@/types';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function createSubjectFromPreset(
  subject: { name: string; priority: number; difficulty: number; recommendedWeeklyHours: number },
  index: number
): Subject {
  return {
    id: `preset-${index}-${getCanonicalSubjectName(subject.name)}`,
    userId: 'preset-smoke-user',
    name: subject.name,
    color: '#00B4FF',
    icon: 'book',
    priority: Math.min(10, Math.max(1, subject.priority * 2)),
    difficulty: Math.min(10, Math.max(1, subject.difficulty * 2)),
    targetHours: subject.recommendedWeeklyHours,
    completedHours: 0,
    totalHours: 0,
    sessionsCount: 0,
    averageScore: 0,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function buildScheduleConfig(subjects: Subject[]): ScheduleConfig {
  return {
    userId: 'preset-smoke-user',
    subjects,
    preferredStart: '08:00',
    preferredEnd: '20:00',
    maxBlockMinutes: 120,
    breakMinutes: 15,
    excludeDays: [0],
  };
}

function sumHoursByNames(
  subjects: Array<{ name: string; recommendedWeeklyHours: number }>,
  names: string[]
): number {
  const set = new Set(names.map((name) => getCanonicalSubjectName(name)));
  return subjects
    .filter((subject) => set.has(getCanonicalSubjectName(subject.name)))
    .reduce((sum, subject) => sum + subject.recommendedWeeklyHours, 0);
}

function ensureNoDuplicateSubjects(subjects: Array<{ name: string }>, label: string) {
  const seen = new Set<string>();
  for (const subject of subjects) {
    const canonical = getCanonicalSubjectName(subject.name);
    assert(Boolean(canonical), `${label}: canonical subject name should not be empty (${subject.name})`);
    assert(!seen.has(canonical), `${label}: duplicate canonical subject "${canonical}"`);
    seen.add(canonical);
  }
}

function getSubjectByName<T extends { name: string; priority: number }>(subjects: T[], name: string): T {
  const canonical = getCanonicalSubjectName(name);
  const subject = subjects.find((item) => getCanonicalSubjectName(item.name) === canonical);
  assert(Boolean(subject), `Subject "${name}" not found`);
  return subject!;
}

const enem = {
  id: 'enem',
  name: 'ENEM',
  subjects: getEnemPresetSubjects(),
};
const medicina = getCuratedPresetById('medicina');
const concursos = getCuratedPresetById('concursos');

assert(Boolean(medicina), 'Medicina preset must exist');
assert(Boolean(concursos), 'Concursos preset must exist');

const presets = [enem, medicina!, concursos!];
for (const preset of presets) {
  ensureNoDuplicateSubjects(preset.subjects, preset.name);
}

// Medicina required structure
const medicinaRequiredSubjects = [
  'Biologia',
  'Quimica',
  'Fisica',
  'Matematica',
  'Redacao',
  'Lingua Portuguesa',
  'Interpretacao de Texto',
  'Literatura',
  'Lingua Estrangeira (Ingles/Espanhol)',
  'Historia',
  'Geografia',
  'Filosofia',
  'Sociologia',
];
for (const name of medicinaRequiredSubjects) {
  assert(
    medicina!.subjects.some((subject) => getCanonicalSubjectName(subject.name) === getCanonicalSubjectName(name)),
    `Medicina preset is missing "${name}"`
  );
}

const medicinaNatureza = sumHoursByNames(medicina!.subjects, ['Biologia', 'Quimica', 'Fisica']);
const medicinaRedacao = sumHoursByNames(medicina!.subjects, ['Redacao']);
const medicinaMatematica = sumHoursByNames(medicina!.subjects, ['Matematica']);
const medicinaLinguagensSemRedacao = sumHoursByNames(medicina!.subjects, [
  'Lingua Portuguesa',
  'Interpretacao de Texto',
  'Literatura',
  'Lingua Estrangeira (Ingles/Espanhol)',
]);
const medicinaHumanas = sumHoursByNames(medicina!.subjects, ['Historia', 'Geografia', 'Filosofia', 'Sociologia']);

assert(medicinaNatureza > medicinaRedacao, 'Medicina weight rule: Natureza > Redacao');
assert(medicinaRedacao > medicinaMatematica, 'Medicina weight rule: Redacao > Matematica');
assert(medicinaMatematica > medicinaLinguagensSemRedacao, 'Medicina weight rule: Matematica > Linguagens');
assert(medicinaLinguagensSemRedacao > medicinaHumanas, 'Medicina weight rule: Linguagens > Humanas');

for (const name of ['Biologia', 'Quimica', 'Fisica', 'Redacao', 'Matematica']) {
  const subject = getSubjectByName(medicina!.subjects, name);
  assert(subject.priority >= 4, `Medicina priority tier: "${name}" should be alta prioridade`);
}
for (const name of ['Lingua Portuguesa', 'Interpretacao de Texto', 'Literatura', 'Lingua Estrangeira (Ingles/Espanhol)']) {
  const subject = getSubjectByName(medicina!.subjects, name);
  assert(subject.priority === 3, `Medicina priority tier: "${name}" should be media prioridade`);
}
for (const name of ['Historia', 'Geografia', 'Filosofia', 'Sociologia']) {
  const subject = getSubjectByName(medicina!.subjects, name);
  assert(subject.priority <= 2, `Medicina priority tier: "${name}" should be menor prioridade`);
}

// Concursos base + modules
const concursosCoreRequired = [
  'Lingua Portuguesa',
  'Direito Constitucional',
  'Direito Administrativo',
  'Raciocinio Logico-Matematico',
  'Informatica',
  'Atualidades',
  'Administracao Publica',
  'Legislacao (conforme edital)',
];
for (const name of concursosCoreRequired) {
  assert(
    concursos!.subjects.some((subject) => getCanonicalSubjectName(subject.name) === getCanonicalSubjectName(name)),
    `Concursos preset is missing base subject "${name}"`
  );
}

for (const name of [
  'Lingua Portuguesa',
  'Direito Constitucional',
  'Direito Administrativo',
  'Raciocinio Logico-Matematico',
]) {
  const subject = getSubjectByName(concursos!.subjects, name);
  assert(subject.priority >= 5, `Concursos priority tier: "${name}" should be alta prioridade`);
}
for (const name of ['Informatica', 'Atualidades', 'Administracao Publica', 'Legislacao (conforme edital)']) {
  const subject = getSubjectByName(concursos!.subjects, name);
  assert(subject.priority === 3, `Concursos priority tier: "${name}" should be media prioridade`);
}

assert((concursos!.specificModules?.length || 0) >= 3, 'Concursos should expose specific modules');
ensureNoDuplicateSubjects(
  [...concursos!.subjects, ...(concursos!.specificModules?.flatMap((module) => module.subjects) || [])],
  'Concursos base + modules'
);
const moduleSubjectNames =
  concursos!.specificModules?.flatMap((module) => module.subjects.map((subject) => subject.name)) || [];
for (const name of ['Direito Penal', 'Processo Penal', 'Contabilidade Geral', 'Administracao Geral']) {
  assert(
    moduleSubjectNames.some((subjectName) => getCanonicalSubjectName(subjectName) === getCanonicalSubjectName(name)),
    `Concursos modules should include example "${name}"`
  );
}

// Concursos intelligent questionnaire generation (backend resolver)
const concursosPolicial = buildConcursosPresetSubjectsFromAnswers({
  concursoArea: 'policial',
  concursoLevel: 'superior',
  concursoExperience: 'nunca',
  concursoPriorityMode: 'equilibrado',
});
ensureNoDuplicateSubjects(concursosPolicial, 'Concursos policial (dynamic)');
for (const name of ['Direito Penal', 'Processo Penal', 'Legislacao Penal Especial']) {
  assert(
    concursosPolicial.some((subject) => getCanonicalSubjectName(subject.name) === getCanonicalSubjectName(name)),
    `Concursos policial dynamic generation should include "${name}"`
  );
}

const concursosFiscal = buildConcursosPresetSubjectsFromAnswers({
  concursoArea: 'fiscal',
  concursoLevel: 'superior',
  concursoExperience: 'intermediaria',
  concursoPriorityMode: 'equilibrado',
});
for (const name of ['Direito Tributario', 'Contabilidade Geral', 'Contabilidade Publica', 'Matematica Financeira', 'Auditoria']) {
  assert(
    concursosFiscal.some((subject) => getCanonicalSubjectName(subject.name) === getCanonicalSubjectName(name)),
    `Concursos fiscal dynamic generation should include "${name}"`
  );
}

const concursosTribunais = buildConcursosPresetSubjectsFromAnswers({
  concursoArea: 'tribunais',
  concursoLevel: 'superior',
  concursoExperience: 'pouco',
  concursoPriorityMode: 'teoria',
});
for (const name of ['Direito Civil', 'Processo Civil', 'Direito Constitucional', 'Direito Administrativo']) {
  assert(
    concursosTribunais.some((subject) => getCanonicalSubjectName(subject.name) === getCanonicalSubjectName(name)),
    `Concursos tribunais dynamic generation should include "${name}"`
  );
}

let medicinaNaturezaScheduleMinutes = 0;
let medicinaHumanasScheduleMinutes = 0;

for (const preset of presets) {
  const subjects = preset.subjects.map(createSubjectFromPreset);
  const schedule = generateWeeklySchedule(buildScheduleConfig(subjects));
  const studyBlocks = schedule.blocks.filter((block) => !block.isBreak);

  assert(studyBlocks.length > 0, `${preset.name}: automatic schedule should generate blocks`);
  assert(
    studyBlocks.every((block) => block.durationMinutes >= 30),
    `${preset.name}: automatic schedule should avoid blocks < 30 min`
  );

  if (preset.id === 'medicina') {
    const naturezaSet = new Set(['Biologia', 'Quimica', 'Fisica'].map((name) => getCanonicalSubjectName(name)));
    const humanasSet = new Set(['Historia', 'Geografia', 'Filosofia', 'Sociologia'].map((name) => getCanonicalSubjectName(name)));

    for (const block of studyBlocks) {
      const canonical = getCanonicalSubjectName(block.subject?.name || '');
      if (naturezaSet.has(canonical)) medicinaNaturezaScheduleMinutes += block.durationMinutes;
      if (humanasSet.has(canonical)) medicinaHumanasScheduleMinutes += block.durationMinutes;
    }
  }
}

assert(
  medicinaNaturezaScheduleMinutes > medicinaHumanasScheduleMinutes,
  'Medicina automatic schedule should allocate more time to Natureza than Humanas'
);

console.log('smoke-presets: ok', {
  presetsValidated: presets.length,
  medicinaSubjects: medicina!.subjects.length,
  concursosCoreSubjects: concursos!.subjects.length,
  concursosModules: concursos!.specificModules?.length || 0,
  medicinaNaturezaScheduleMinutes,
  medicinaHumanasScheduleMinutes,
});
