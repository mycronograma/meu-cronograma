/**
 * Curated preset catalog for presets that are not handled by the ENEM official catalog.
 * Keeps pedagogical structure, naming normalization and deduplication in one place.
 */

export interface CuratedPresetSubject {
  name: string;
  priority: number; // 1-5 (preset scale)
  difficulty: number; // 1-5 (preset scale)
  recommendedWeeklyHours: number;
  group?: string;
}

export interface CuratedPresetModule {
  id: string;
  name: string;
  description: string;
  subjects: CuratedPresetSubject[];
}

export interface CuratedPreset {
  id: string;
  name: string;
  description: string;
  subjects: CuratedPresetSubject[];
  specificModules?: CuratedPresetModule[];
}

const CURATED_PRESETS: CuratedPreset[] = [
  {
    id: 'medicina',
    name: 'Medicina',
    description:
      'Preparação para vestibular de Medicina com foco forte em Natureza, Redação e Matemática',
    subjects: [
      { name: 'Biologia', priority: 5, difficulty: 5, recommendedWeeklyHours: 12, group: 'Natureza' },
      { name: 'Química', priority: 5, difficulty: 5, recommendedWeeklyHours: 11, group: 'Natureza' },
      { name: 'Física', priority: 5, difficulty: 4, recommendedWeeklyHours: 10, group: 'Natureza' },
      { name: 'Matemática', priority: 5, difficulty: 4, recommendedWeeklyHours: 9, group: 'Exatas' },
      { name: 'Redação', priority: 5, difficulty: 4, recommendedWeeklyHours: 10, group: 'Linguagens' },
      { name: 'Língua Portuguesa', priority: 3, difficulty: 3, recommendedWeeklyHours: 3, group: 'Linguagens' },
      { name: 'Interpretação de Texto', priority: 3, difficulty: 3, recommendedWeeklyHours: 1.5, group: 'Linguagens' },
      { name: 'Literatura', priority: 3, difficulty: 3, recommendedWeeklyHours: 2, group: 'Linguagens' },
      { name: 'Língua Estrangeira', priority: 3, difficulty: 2, recommendedWeeklyHours: 2, group: 'Linguagens' },
      { name: 'História', priority: 2, difficulty: 2, recommendedWeeklyHours: 2, group: 'Humanas' },
      { name: 'Geografia', priority: 2, difficulty: 2, recommendedWeeklyHours: 2, group: 'Humanas' },
      { name: 'Filosofia', priority: 2, difficulty: 2, recommendedWeeklyHours: 1.5, group: 'Humanas' },
      { name: 'Sociologia', priority: 2, difficulty: 2, recommendedWeeklyHours: 1.5, group: 'Humanas' },
    ],
  },
  {
    id: 'vestibulares_tradicionais',
    name: 'Vestibulares Tradicionais',
    description: 'Foco em 2ª fase, obras literárias e treino discursivo.',
    subjects: [
      { name: 'Leitura Obrigatória (Obras Literárias)', priority: 5, difficulty: 4, recommendedWeeklyHours: 4, group: 'Linguagens' },
      { name: 'Treino Discursivo (2ª Fase)', priority: 5, difficulty: 5, recommendedWeeklyHours: 6, group: 'Geral' },
      { name: 'Redação', priority: 5, difficulty: 4, recommendedWeeklyHours: 6, group: 'Linguagens' },
      { name: 'Matemática', priority: 4, difficulty: 4, recommendedWeeklyHours: 6, group: 'Exatas' },
      { name: 'Biologia', priority: 4, difficulty: 4, recommendedWeeklyHours: 5, group: 'Natureza' },
      { name: 'Física', priority: 4, difficulty: 4, recommendedWeeklyHours: 5, group: 'Natureza' },
      { name: 'Química', priority: 4, difficulty: 4, recommendedWeeklyHours: 5, group: 'Natureza' },
      { name: 'História', priority: 4, difficulty: 4, recommendedWeeklyHours: 5, group: 'Humanas' },
      { name: 'Geografia', priority: 4, difficulty: 4, recommendedWeeklyHours: 5, group: 'Humanas' },
    ],
  },
  {
    id: 'concursos',
    name: 'Concursos Públicos',
    description:
      'Base comum de concursos brasileiros com núcleos jurídico, linguístico e lógico, com módulos específicos opcionais',
    subjects: [
      { name: 'Língua Portuguesa', priority: 5, difficulty: 3, recommendedWeeklyHours: 12, group: 'Base comum' },
      {
        name: 'Direito Constitucional',
        priority: 5,
        difficulty: 4,
        recommendedWeeklyHours: 10,
        group: 'Base comum',
      },
      {
        name: 'Direito Administrativo',
        priority: 5,
        difficulty: 4,
        recommendedWeeklyHours: 10,
        group: 'Base comum',
      },
      {
        name: 'Raciocínio Lógico-Matemático',
        priority: 5,
        difficulty: 4,
        recommendedWeeklyHours: 9,
        group: 'Base comum',
      },
      { name: 'Informática', priority: 3, difficulty: 2, recommendedWeeklyHours: 6, group: 'Base comum' },
      { name: 'Atualidades', priority: 3, difficulty: 2, recommendedWeeklyHours: 4, group: 'Base comum' },
      {
        name: 'Administração Pública',
        priority: 3,
        difficulty: 3,
        recommendedWeeklyHours: 6,
        group: 'Base comum',
      },
      {
        name: 'Legislação (conforme edital)',
        priority: 3,
        difficulty: 3,
        recommendedWeeklyHours: 5,
        group: 'Base comum',
      },
    ],
    specificModules: [
      {
        id: 'policial-penal',
        name: 'Módulo específico: Área Policial / Penal',
        description: 'Ative conforme edital para carreiras policiais e segurança pública',
        subjects: [
          { name: 'Direito Penal', priority: 4, difficulty: 4, recommendedWeeklyHours: 8, group: 'Módulo específico' },
          {
            name: 'Direito Processual Penal',
            priority: 4,
            difficulty: 4,
            recommendedWeeklyHours: 7,
            group: 'Módulo específico',
          },
          {
            name: 'Legislação Penal Especial',
            priority: 3,
            difficulty: 4,
            recommendedWeeklyHours: 5,
            group: 'Módulo específico',
          },
        ],
      },
      {
        id: 'fiscal-contabil',
        name: 'Módulo específico: Área Fiscal / Contábil',
        description: 'Trilha conceitual para concursos fiscais e controle',
        subjects: [
          { name: 'Contabilidade Geral', priority: 4, difficulty: 4, recommendedWeeklyHours: 8, group: 'Módulo específico' },
          { name: 'Contabilidade Pública', priority: 4, difficulty: 4, recommendedWeeklyHours: 6, group: 'Módulo específico' },
          { name: 'Direito Tributário', priority: 4, difficulty: 4, recommendedWeeklyHours: 6, group: 'Módulo específico' },
        ],
      },
      {
        id: 'gestao-administracao',
        name: 'Módulo específico: Gestão / Administração',
        description: 'Complemento para carreiras administrativas e gestão pública',
        subjects: [
          { name: 'Administração Geral', priority: 3, difficulty: 3, recommendedWeeklyHours: 6, group: 'Módulo específico' },
          {
            name: 'Administração Financeira e Orçamentária',
            priority: 4,
            difficulty: 4,
            recommendedWeeklyHours: 6,
            group: 'Módulo específico',
          },
          { name: 'Gestão de Pessoas', priority: 3, difficulty: 3, recommendedWeeklyHours: 4, group: 'Módulo específico' },
        ],
      },
      {
        id: 'controle-interno',
        name: 'Módulo específico: Controle / Auditoria',
        description: 'Módulo opcional para trilhas de auditoria, controle e compliance',
        subjects: [
          { name: 'Auditoria', priority: 4, difficulty: 4, recommendedWeeklyHours: 6, group: 'Módulo específico' },
          { name: 'Controle Interno', priority: 3, difficulty: 3, recommendedWeeklyHours: 5, group: 'Módulo específico' },
          {
            name: 'Responsabilidade Fiscal e Transparência',
            priority: 3,
            difficulty: 3,
            recommendedWeeklyHours: 4,
            group: 'Módulo específico',
          },
        ],
      },
    ],
  },
];

export function getCuratedPresets(): CuratedPreset[] {
  return CURATED_PRESETS.map((preset) => ({
    ...preset,
    subjects: preset.subjects.map((subject) => ({ ...subject })),
    specificModules: preset.specificModules?.map((module) => ({
      ...module,
      subjects: module.subjects.map((subject) => ({ ...subject })),
    })),
  }));
}

export function getCuratedPresetById(id: string): CuratedPreset | undefined {
  return getCuratedPresets().find((preset) => preset.id === id);
}

export function getCuratedPresetByName(name: string): CuratedPreset | undefined {
  const normalizedName = normalizeComparableText(name);
  return getCuratedPresets().find(
    (preset) =>
      normalizeComparableText(preset.id) === normalizedName ||
      normalizeComparableText(preset.name) === normalizedName
  );
}

export function toDbPresetSubjects(subjects: CuratedPresetSubject[]) {
  return dedupePresetSubjectsByCanonical(subjects).map((subject) => ({
    name: subject.name,
    priority: subject.priority,
    difficulty: subject.difficulty,
    recommendedWeeklyHours: subject.recommendedWeeklyHours,
  }));
}

export function stripDiacritics(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function normalizeComparableText(value: string): string {
  return stripDiacritics(String(value || ''))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function getCanonicalSubjectName(name: string): string {
  const normalized = normalizeComparableText(name);
  if (!normalized) return '';

  const aliasMatchers: Array<{ pattern: RegExp; canonical: string }> = [
    { pattern: /\blingua portuguesa\b/, canonical: 'lingua portuguesa' },
    { pattern: /\bportugues\b/, canonical: 'lingua portuguesa' },
    { pattern: /\bredacao\b/, canonical: 'redacao' },
    { pattern: /\bmatematica\b/, canonical: 'matematica' },
    { pattern: /\bfisica\b/, canonical: 'fisica' },
    { pattern: /\bquimica\b/, canonical: 'quimica' },
    { pattern: /\bbiologia\b/, canonical: 'biologia' },
    { pattern: /\bhistoria\b/, canonical: 'historia' },
    { pattern: /\bgeografia\b/, canonical: 'geografia' },
    { pattern: /\bfilosofia\b/, canonical: 'filosofia' },
    { pattern: /\bsociologia\b/, canonical: 'sociologia' },
    { pattern: /\bliteratura\b/, canonical: 'literatura' },
    { pattern: /\binterpretacao de texto\b/, canonical: 'interpretacao de texto' },
    { pattern: /\blingua estrangeira\b/, canonical: 'lingua estrangeira' },
    { pattern: /\bingles\b/, canonical: 'lingua estrangeira' },
    { pattern: /\bespanhol\b/, canonical: 'lingua estrangeira' },
    { pattern: /\bdireito constitucional\b/, canonical: 'direito constitucional' },
    { pattern: /\bdireito administrativo\b/, canonical: 'direito administrativo' },
    { pattern: /\bdireito penal\b/, canonical: 'direito penal' },
    { pattern: /\bdireito processual penal\b/, canonical: 'direito processual penal' },
    { pattern: /\bprocesso penal\b/, canonical: 'direito processual penal' },
    { pattern: /\bdireito civil\b/, canonical: 'direito civil' },
    { pattern: /\bdireito processual civil\b/, canonical: 'direito processual civil' },
    { pattern: /\bprocesso civil\b/, canonical: 'direito processual civil' },
    { pattern: /\bdireito tributario\b/, canonical: 'direito tributario' },
    { pattern: /\bdireito previdenciario\b/, canonical: 'direito previdenciario' },
    { pattern: /\braciocinio logico matematico\b/, canonical: 'raciocinio logico matematica' },
    { pattern: /\braciocinio logico\b/, canonical: 'raciocinio logico matematica' },
    { pattern: /\brlm\b/, canonical: 'raciocinio logico matematica' },
    { pattern: /\bmatematica financeira\b/, canonical: 'matematica financeira' },
    { pattern: /\binformatica\b/, canonical: 'informatica' },
    { pattern: /\batualidades\b/, canonical: 'atualidades' },
    { pattern: /\badministracao publica\b/, canonical: 'administracao publica' },
    { pattern: /\badministracao geral\b/, canonical: 'administracao geral' },
    { pattern: /^legislacao(?: conforme edital| especifica)?$/, canonical: 'legislacao' },
    { pattern: /\blegislacao educacional\b/, canonical: 'legislacao educacional' },
    { pattern: /\blegislacao previdenciaria\b/, canonical: 'legislacao previdenciaria' },
    { pattern: /\bseguridade social\b/, canonical: 'seguridade social' },
    { pattern: /\bdidatica\b/, canonical: 'didatica' },
    { pattern: /\bpoliticas publicas de educacao\b/, canonical: 'politicas publicas de educacao' },
    { pattern: /\bconhecimentos bancarios\b/, canonical: 'conhecimentos bancarios' },
    { pattern: /\batualidades do mercado financeiro\b/, canonical: 'atualidades mercado financeiro' },
    { pattern: /\bcontabilidade geral\b/, canonical: 'contabilidade geral' },
    { pattern: /\bcontabilidade publica\b/, canonical: 'contabilidade publica' },
    { pattern: /\bauditoria\b/, canonical: 'auditoria' },
    { pattern: /\bcontrole interno\b/, canonical: 'controle interno' },
  ];

  for (const alias of aliasMatchers) {
    if (alias.pattern.test(normalized)) {
      return alias.canonical;
    }
  }

  return normalized;
}

export function dedupePresetSubjectsByCanonical<T extends { name: string }>(subjects: T[]): T[] {
  const deduped = new Map<string, T>();

  for (const subject of subjects) {
    const canonical = getCanonicalSubjectName(subject.name);
    if (!canonical || deduped.has(canonical)) continue;
    deduped.set(canonical, subject);
  }

  return Array.from(deduped.values());
}
