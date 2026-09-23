import type { Subject } from '@/types';
import { generateId, subjectColors } from '@/lib/utils';

export type EnemOfficialArea = 'linguagens' | 'matematica' | 'natureza' | 'humanas';
export type EnemProgressionLevel = 'basico' | 'intermediario' | 'avancado';

export interface EnemDisciplineDefinition {
  name: string;
  area: EnemOfficialArea;
  icon: string;
  priority: number; // 1-10
  difficulty: number; // 1-10
  targetHours: number; // weekly suggested
  pesoNoExame: number; // 1-5
  enemWeight?: number; // 0-1
  nivel: EnemProgressionLevel;
  topics: string[];
}

export interface EnemPresetSubjectDefinition {
  name: string;
  priority: number; // 1-5 (preset scale)
  difficulty: number; // 1-5 (preset scale)
  recommendedWeeklyHours: number;
  group: string;
}

export interface EnemAreaDefinition {
  key: EnemOfficialArea;
  label: string;
  disciplines: EnemDisciplineDefinition[];
}

const ENEM_STRUCTURE: EnemAreaDefinition[] = [
  {
    key: 'linguagens',
    label: 'Linguagens, Códigos e suas Tecnologias',
    disciplines: [
      {
        name: 'Português (Interpretação)',
        area: 'linguagens',
        icon: 'book-open',
        priority: 10,
        difficulty: 6,
        targetHours: 6,
        pesoNoExame: 5,
        nivel: 'intermediario',
        topics: [
          'Gêneros textuais',
          'Interpretação inferencial',
          'Coesão e coerência',
          'Semântica e efeitos de sentido',
          'Variação linguística',
          'Gramática aplicada ao texto',
        ],
      },
      {
        name: 'Literatura',
        area: 'linguagens',
        icon: 'book',
        priority: 6,
        difficulty: 5,
        targetHours: 3,
        pesoNoExame: 3,
        nivel: 'intermediario',
        topics: [
          'Escolas literárias',
          'Modernismo brasileiro',
          'Leitura de poemas',
          'Figuras de linguagem',
          'Intertextualidade',
          'Análise de narrativas',
        ],
      },
      {
        name: 'Redação',
        area: 'linguagens',
        icon: 'pen-tool',
        priority: 10,
        difficulty: 7,
        targetHours: 5,
        pesoNoExame: 5,
        nivel: 'intermediario',
        topics: [
          'Competências ENEM',
          'Tese e repertorio sociocultural',
          'Projeto de texto',
          'Argumentação',
          'Coesão textual',
          'Proposta de intervenção',
        ],
      },
      {
        name: 'Inglês/Espanhol',
        area: 'linguagens',
        icon: 'languages',
        priority: 5,
        difficulty: 4,
        targetHours: 2,
        pesoNoExame: 2,
        nivel: 'basico',
        topics: [
          'Leitura instrumental',
          'Vocabulário em contexto',
          'Falsos cognatos',
          'Interpretação de textos verbais e não verbais',
          'Estratégias de skimming e scanning',
        ],
      },
      {
        name: 'Artes',
        area: 'linguagens',
        icon: 'palette',
        priority: 4,
        difficulty: 3,
        targetHours: 2,
        pesoNoExame: 2,
        nivel: 'basico',
        topics: [
          'História da arte',
          'Movimentos artísticos',
          'Linguagens artisticas',
          'Patrimônio cultural',
          'Arte contemporanea',
        ],
      },
      {
        name: 'Tecnologias da Comunicação',
        area: 'linguagens',
        icon: 'messages-square',
        priority: 4,
        difficulty: 3,
        targetHours: 2,
        pesoNoExame: 2,
        nivel: 'basico',
        topics: [
          'Mídias digitais e comunicação',
          'Letramento digital',
          'Cultura de rede',
          'Ética e cidadania digital',
          'Impactos sociais da tecnologia',
        ],
      },
    ],
  },
  {
    key: 'matematica',
    label: 'Matemática e suas Tecnologias',
    disciplines: [
      {
        name: 'Matemática',
        area: 'matematica',
        icon: 'calculator',
        priority: 10,
        difficulty: 8,
        targetHours: 8,
        pesoNoExame: 5,
        nivel: 'intermediario',
        topics: [
          'Razão e proporção',
          'Porcentagem e juros',
          'Funções (1o e 2o grau)',
          'Geometria plana e espacial',
          'Estatística',
          'Probabilidade',
          'Análise combinatória',
          'Trigonometria',
          'Grandezas e medidas',
        ],
      },
    ],
  },
  {
    key: 'natureza',
    label: 'Ciências da Natureza e suas Tecnologias',
    disciplines: [
      {
        name: 'Física',
        area: 'natureza',
        icon: 'atom',
        priority: 8,
        difficulty: 8,
        targetHours: 4,
        pesoNoExame: 4,
        nivel: 'avancado',
        topics: [
          'Cinemática',
          'Dinâmica e leis de Newton',
          'Trabalho e energia',
          'Termologia',
          'Ondulatória',
          'Eletricidade',
          'Óptica',
        ],
      },
      {
        name: 'Química',
        area: 'natureza',
        icon: 'flask',
        priority: 8,
        difficulty: 8,
        targetHours: 4,
        pesoNoExame: 4,
        nivel: 'avancado',
        topics: [
          'Estequiometria',
          'Soluções',
          'Funções inorgânicas',
          'Eletroquimica',
          'Termoquimica',
          'Equilíbrio químico',
          'Química orgânica',
        ],
      },
      {
        name: 'Biologia',
        area: 'natureza',
        icon: 'leaf',
        priority: 8,
        difficulty: 6,
        targetHours: 4,
        pesoNoExame: 4,
        nivel: 'intermediario',
        topics: [
          'Ecologia',
          'Genética',
          'Citologia',
          'Evolução',
          'Fisiologia humana',
          'Biotecnologia',
          'Botanica e zoologia',
        ],
      },
    ],
  },
  {
    key: 'humanas',
    label: 'Ciências Humanas e suas Tecnologias',
    disciplines: [
      {
        name: 'História',
        area: 'humanas',
        icon: 'landmark',
        priority: 6,
        difficulty: 4,
        targetHours: 3,
        pesoNoExame: 3,
        nivel: 'intermediario',
        topics: [
          'Brasil Colonia e Imperio',
          'República brasileira',
          'História contemporânea',
          'Guerras mundiais',
          'Ditadura militar',
          'Movimentos sociais',
        ],
      },
      {
        name: 'Geografia',
        area: 'humanas',
        icon: 'globe',
        priority: 6,
        difficulty: 4,
        targetHours: 3,
        pesoNoExame: 3,
        nivel: 'intermediario',
        topics: [
          'Cartografia',
          'Geopolítica',
          'Urbanização',
          'Climatologia',
          'Recursos naturais',
          'Globalização',
        ],
      },
      {
        name: 'Filosofia',
        area: 'humanas',
        icon: 'brain',
        priority: 4,
        difficulty: 4,
        targetHours: 2,
        pesoNoExame: 2,
        nivel: 'basico',
        topics: [
          'Ética',
          'Política',
          'Epistemologia',
          'Filosofia antiga e moderna',
          'Pensadores clássicos',
        ],
      },
      {
        name: 'Sociologia',
        area: 'humanas',
        icon: 'users',
        priority: 4,
        difficulty: 3,
        targetHours: 2,
        pesoNoExame: 2,
        nivel: 'basico',
        topics: [
          'Cidadania',
          'Cultura e ideologia',
          'Trabalho e sociedade',
          'Movimentos sociais',
          'Desigualdade social',
        ],
      },
    ],
  },
];

const DISCIPLINE_INDEX = new Map(
  ENEM_STRUCTURE.flatMap((area) =>
    area.disciplines.map((discipline) => [normalizeEnemText(discipline.name), discipline] as const)
  )
);

const GENERIC_ENEM_SUBJECT_AREAS: Record<string, EnemOfficialArea> = {
  linguagens: 'linguagens',
  'portugues / linguagens': 'linguagens',
  'portugues/linguagens': 'linguagens',
  humanas: 'humanas',
  natureza: 'natureza',
  'ciencias da natureza': 'natureza',
  ciencias: 'natureza',
  matematica: 'matematica',
};

export function normalizeEnemText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getEnemAreas() {
  return ENEM_STRUCTURE;
}

export function getEnemDisciplines() {
  return ENEM_STRUCTURE.flatMap((area) => area.disciplines);
}

export function getEnemDisciplineByName(name: string) {
  return DISCIPLINE_INDEX.get(normalizeEnemText(name));
}

export function getEnemAreaLabel(area: EnemOfficialArea) {
  return ENEM_STRUCTURE.find((entry) => entry.key === area)?.label ?? area;
}

export function getEnemPresetSubjects(): EnemPresetSubjectDefinition[] {
  return getEnemDisciplines().map((discipline) => ({
    name: discipline.name,
    priority: Math.min(5, Math.max(1, Math.round(discipline.priority / 2))),
    difficulty: Math.min(5, Math.max(1, Math.round(discipline.difficulty / 2))),
    recommendedWeeklyHours: discipline.targetHours,
    group:
      discipline.area === 'matematica'
        ? 'Matemática'
        : discipline.area === 'natureza'
        ? 'Natureza'
        : discipline.area === 'humanas'
        ? 'Humanas'
        : 'Linguagens',
  }));
}

function getDisciplineEnemWeight(discipline: EnemDisciplineDefinition): number {
  if (typeof discipline.enemWeight === 'number') {
    return Math.min(1, Math.max(0.1, discipline.enemWeight));
  }
  const normalized = normalizeEnemText(discipline.name);
  if (normalized.includes('matematica')) return 1.0;
  if (normalized.includes('portugues')) return 0.95;
  if (normalized.includes('redacao')) return 0.9;
  if (discipline.area === 'natureza') return 0.75;
  if (discipline.area === 'humanas') return 0.7;
  return 0.5;
}

function buildSubjectFromDiscipline(
  discipline: EnemDisciplineDefinition,
  userId: string,
  index: number
): Subject {
  return {
    id: generateId(),
    userId,
    name: discipline.name,
    color: subjectColors[index % subjectColors.length],
    icon: discipline.icon,
    area: discipline.area,
    nivel: discipline.nivel,
    pesoNoExame: discipline.pesoNoExame,
    enemWeight: getDisciplineEnemWeight(discipline),
    prerequisitos: discipline.topics,
    topicos: discipline.topics,
    tipo: 'enem-disciplina',
    priority: discipline.priority,
    difficulty: discipline.difficulty,
    targetHours: discipline.targetHours,
    completedHours: 0,
    totalHours: 0,
    sessionsCount: 0,
    averageScore: 0,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export function createEnemSubjectBank(userId: string): Subject[] {
  return getEnemDisciplines().map((discipline, index) =>
    buildSubjectFromDiscipline(discipline, userId, index)
  );
}

export function enrichSubjectWithEnemMetadata(subject: Subject): Subject {
  const discipline = getEnemDisciplineByName(subject.name);
  if (!discipline) return subject;

  const icon = !subject.icon || subject.icon === 'book' ? discipline.icon : subject.icon;

  return {
    ...subject,
    name: discipline.name,
    icon,
    area: discipline.area,
    nivel: subject.nivel || discipline.nivel,
    pesoNoExame: subject.pesoNoExame ?? discipline.pesoNoExame,
    enemWeight: subject.enemWeight ?? getDisciplineEnemWeight(discipline),
    prerequisitos:
      Array.isArray(subject.prerequisitos) && subject.prerequisitos.length > 0
        ? subject.prerequisitos
        : discipline.topics,
    topicos:
      Array.isArray(subject.topicos) && subject.topicos.length > 0
        ? subject.topicos
        : discipline.topics,
    tipo: subject.tipo || 'enem-disciplina',
  };
}

export function isEnemGoal(goal?: string) {
  if (!goal) return false;
  return normalizeEnemText(goal) === 'enem';
}

export function isGenericEnemSubject(name: string) {
  if (getEnemDisciplineByName(name)) return false;
  return Boolean(GENERIC_ENEM_SUBJECT_AREAS[normalizeEnemText(name)]);
}

function getGenericAreaForSubject(name: string): EnemOfficialArea | null {
  return GENERIC_ENEM_SUBJECT_AREAS[normalizeEnemText(name)] ?? null;
}

function hasGenericEnemAggregates(subjects: Subject[]) {
  return subjects.some((subject) => {
    const area = getGenericAreaForSubject(subject.name);
    if (!area) return false;
    return !getEnemDisciplineByName(subject.name);
  });
}

function distributeAggregateHoursByArea(
  subjects: Subject[]
): Map<EnemOfficialArea, { targetHours: number; completedHours: number }> {
  const totals = new Map<EnemOfficialArea, { targetHours: number; completedHours: number }>();

  for (const subject of subjects) {
    const genericArea = getGenericAreaForSubject(subject.name);
    if (!genericArea) continue;
    if (getEnemDisciplineByName(subject.name)) continue;

    const current = totals.get(genericArea) ?? { targetHours: 0, completedHours: 0 };
    current.targetHours += subject.targetHours || 0;
    current.completedHours += subject.completedHours || 0;
    totals.set(genericArea, current);
  }

  return totals;
}

export function upgradeSubjectsToOfficialEnemStructure(subjects: Subject[]): Subject[] {
  if (subjects.length === 0) return subjects;

  const exactMatches = new Map<string, Subject>();
  for (const subject of subjects) {
    const discipline = getEnemDisciplineByName(subject.name);
    if (!discipline) continue;
    exactMatches.set(normalizeEnemText(discipline.name), enrichSubjectWithEnemMetadata(subject));
  }

  if (!hasGenericEnemAggregates(subjects)) {
    return subjects.map((subject) => enrichSubjectWithEnemMetadata(subject));
  }

  const userId = subjects[0]?.userId || 'user1';
  const aggregatesByArea = distributeAggregateHoursByArea(subjects);
  const officialDisciplines = getEnemDisciplines();

  const officialSubjects = officialDisciplines.map((discipline, index) => {
    const normalizedName = normalizeEnemText(discipline.name);
    const existing = exactMatches.get(normalizedName);
    if (existing) {
      return enrichSubjectWithEnemMetadata(existing);
    }

    const generated = buildSubjectFromDiscipline(discipline, userId, index);
    const areaTotals = aggregatesByArea.get(discipline.area);
    if (!areaTotals || areaTotals.targetHours <= 0) {
      return generated;
    }

    const areaDisciplines = officialDisciplines.filter((item) => item.area === discipline.area);
    const areaTarget = areaDisciplines.reduce((sum, item) => sum + item.targetHours, 0) || 1;
    const ratio = discipline.targetHours / areaTarget;

    return {
      ...generated,
      targetHours: Number((areaTotals.targetHours * ratio).toFixed(1)),
      completedHours: Number((areaTotals.completedHours * ratio).toFixed(1)),
    };
  });

  const nonEnemSubjects = subjects.filter((subject) => {
    if (getEnemDisciplineByName(subject.name)) return false;
    return !isGenericEnemSubject(subject.name);
  });

  return [...officialSubjects, ...nonEnemSubjects];
}
