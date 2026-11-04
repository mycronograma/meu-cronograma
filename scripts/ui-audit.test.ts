/**
 * Auditoria automática de interface (contraste, movimento, foco e rótulos).
 *
 * Transforma em teste o que normalmente é revisão manual de design:
 *  - os tokens de texto passam no contraste mínimo do WCAG AA (4,5:1);
 *  - existe tratamento para `prefers-reduced-motion`;
 *  - o foco de teclado é visível;
 *  - botões que só têm ícone têm nome acessível (`aria-label`/`title`).
 *
 * Rodar com: npm run test:ui
 */

import assert from 'node:assert';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

// ---------------------------------------------------------------------------
// Contraste (WCAG 2.1)
// ---------------------------------------------------------------------------
const srgbToLinear = (channel: number) =>
  channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);

const relativeLuminance = (hex: string) => {
  const clean = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((index) => parseInt(clean.slice(index, index + 2), 16) / 255);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
};

const contrastRatio = (a: string, b: string) => {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
};

/** Fundos em que o texto do app aparece. */
const BACKGROUNDS = ['#05080F', '#0A1020', '#0f172a'];
const MIN_BODY_CONTRAST = 4.5;

const css = read('src/app/globals.css');
const tailwind = read('tailwind.config.ts');

const readCssVariable = (name: string) => {
  const match = new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(css);
  assert.ok(match, `token --${name} não encontrado em globals.css`);
  return (match as RegExpExecArray)[1];
};

const textTokens: Array<[string, string]> = [
  ['--text-primary', readCssVariable('text-primary')],
  ['--text-secondary', readCssVariable('text-secondary')],
  ['--text-muted', readCssVariable('text-muted')],
  ['--neon-blue', readCssVariable('neon-blue')],
  ['--neon-cyan', readCssVariable('neon-cyan')],
  ['--neon-violet', readCssVariable('neon-violet')],
];

console.log('\nContraste dos tokens de texto (mínimo 4.5:1):');
for (const [name, color] of textTokens) {
  const ratios = BACKGROUNDS.map((background) => contrastRatio(color, background));
  console.log(
    `  ${name.padEnd(18)} ${color}  ${ratios.map((ratio) => ratio.toFixed(2)).join(' / ')}`
  );
  for (const ratio of ratios) {
    assert.ok(
      ratio >= MIN_BODY_CONTRAST,
      `${name} (${color}) tem contraste ${ratio.toFixed(2)}:1 — abaixo do mínimo de ${MIN_BODY_CONTRAST}:1`
    );
  }
}

// Os tokens do Tailwind precisam acompanhar o CSS (senão as classes divergem).
const tailwindMuted = /'text-muted':\s*'(#[0-9A-Fa-f]{6})'/.exec(tailwind)?.[1];
assert.strictEqual(
  tailwindMuted?.toLowerCase(),
  readCssVariable('text-muted').toLowerCase(),
  'tailwind.config.ts e globals.css precisam ter o mesmo --text-muted'
);

const tailwindViolet = /'neon-violet':\s*'(#[0-9A-Fa-f]{6})'/.exec(tailwind)?.[1];
assert.strictEqual(
  tailwindViolet?.toLowerCase(),
  readCssVariable('neon-violet').toLowerCase(),
  'tailwind.config.ts e globals.css precisam ter o mesmo neon-violet'
);

// O roxo de marca reprova como texto — por isso existe o tom legível.
assert.ok(
  contrastRatio('#7F00FF', BACKGROUNDS[0]) < MIN_BODY_CONTRAST,
  'neon-purple deve continuar reservado para preenchimento/gradiente'
);

// ---------------------------------------------------------------------------
// Movimento, foco e ponteiro
// ---------------------------------------------------------------------------
console.log('\nRegras de interface:');
const rules: Array<[string, boolean]> = [
  ['prefers-reduced-motion', css.includes('prefers-reduced-motion: reduce')],
  ['foco visível (:focus-visible)', /:focus-visible\s*{/.test(css)],
  ['hover desativado em telas sem mouse', css.includes('@media (hover: none)')],
  ['cursor de clique', css.includes('cursor: pointer')],
  ['tap highlight removido', css.includes('-webkit-tap-highlight-color')],
];

for (const [label, present] of rules) {
  console.log(`  ${present ? 'ok' : 'FALTA'}  ${label}`);
  assert.ok(present, `globals.css precisa tratar "${label}"`);
}

// Animações infinitas ficam atrás da preferência de movimento.
const emptyState = read('src/components/onboarding/EmptyState.tsx');
assert.ok(
  emptyState.includes('useMotionPrefs') && emptyState.includes('shouldAnimate'),
  'EmptyState precisa respeitar preferências de movimento'
);
assert.ok(
  /shouldAnimate\s*&&\s*\(/.test(emptyState),
  'a animação contínua do EmptyState (animate-ping) precisa ser condicional'
);

const button = read('src/components/ui/Button.tsx');
const card = read('src/components/ui/Card.tsx');
for (const [name, source] of [
  ['Button', button],
  ['Card', card],
] as const) {
  assert.ok(source.includes('useMotionPrefs'), `${name} precisa respeitar preferências de movimento`);
  assert.ok(source.includes('hoverEffects'), `${name} precisa checar se o aparelho tem mouse`);
}

assert.ok(
  button.includes('focus-visible:ring'),
  'Button precisa de anel de foco visível para navegação por teclado'
);
assert.ok(button.includes('cursor-pointer'), 'Button precisa parecer clicável');

// ---------------------------------------------------------------------------
// Nome acessível em botões só com ícone
// ---------------------------------------------------------------------------
const tsxFiles: string[] = [];
const walk = (directory: string) => {
  for (const entry of readdirSync(join(root, directory))) {
    const path = join(directory, entry);
    const info = statSync(join(root, path));
    if (info.isDirectory()) walk(path);
    else if (path.endsWith('.tsx')) tsxFiles.push(path);
  }
};
walk('src');

/**
 * Mapeia elementos `<Button>`/`<button>` do arquivo.
 *
 * O parser é simples de propósito, mas entende chaves: atributos como
 * `onClick={() => salvar()}` têm `>` dentro das chaves e quebravam a checagem
 * anterior (foi assim que botões só com ícone passaram batido).
 */
const findButtons = (source: string) => {
  const found: Array<{ attributes: string; inner: string; index: number }> = [];
  const tagPattern = /<(Button|button)\b/g;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(source)) !== null) {
    let cursor = match.index + match[0].length;
    let depth = 0;
    let attributesEnd = -1;

    for (; cursor < source.length; cursor += 1) {
      const char = source[cursor];
      if (char === '{') depth += 1;
      else if (char === '}') depth = Math.max(0, depth - 1);
      else if (char === '>' && depth === 0) {
        attributesEnd = cursor;
        break;
      }
    }
    if (attributesEnd === -1) continue;

    const closingTag = `</${match[1]}>`;
    const closingIndex = source.indexOf(closingTag, attributesEnd);
    if (closingIndex === -1) continue;

    found.push({
      attributes: source.slice(match.index, attributesEnd + 1),
      inner: source.slice(attributesEnd + 1, closingIndex),
      index: match.index,
    });
    tagPattern.lastIndex = closingIndex + closingTag.length;
  }

  return found;
};

/** Extrai grupos `{...}` respeitando aninhamento. */
const extractBraces = (inner: string) => {
  const groups: string[] = [];
  let depth = 0;
  let start = -1;

  for (let index = 0; index < inner.length; index += 1) {
    const char = inner[index];
    if (char === '{') {
      if (depth === 0) start = index;
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        groups.push(inner.slice(start + 1, index));
        start = -1;
      }
    }
  }

  return groups;
};

/**
 * O elemento tem texto visível? Conta tags com texto, literais dentro das chaves
 * e expressões que claramente renderizam texto (`{label}`, `{formatDuration(x)}`).
 * Condições puras (`{pronto && <Icone />}`) não contam como rótulo.
 */
const hasVisibleLabel = (inner: string) => {
  const withoutBraceGroups = inner.replace(/\{[\s\S]*\}/g, ' ');
  const tagText = withoutBraceGroups.replace(/<[^>]*>/g, ' ');
  // Aceita até rótulo de 1 caractere (`{h}h` -> "500h"): o que importa é o
  // botão não ficar mudo para leitores de tela.
  if (/[A-Za-zÀ-ÿ0-9]/.test(tagText)) return true;

  for (const group of extractBraces(inner)) {
    if (/[A-Za-zÀ-ÿ]{2,}/.test(group.replace(/<[^>]*>/g, ' ').replace(/['"][^'"]*['"]/g, ' '))) {
      // Chamada de função ou acesso a propriedade: `{label}`, `{group.title}`,
      // `{formatDuration(h * 60)}`. Condições (`{pronto && <Icone />}`) sobram
      // sem identificador depois de remover as tags.
      return true;
    }
  }

  return false;
};

const unnamed: string[] = [];

for (const file of tsxFiles) {
  const source = read(file);

  for (const element of findButtons(source)) {
    const accessibleName =
      /aria-label|aria-labelledby|\btitle=|sr-only/.test(element.attributes) ||
      /aria-label|aria-labelledby|\btitle=/.test(element.inner);

    if (hasVisibleLabel(element.inner) || accessibleName) continue;

    const line = source.slice(0, element.index).split('\n').length;
    unnamed.push(`${relative(root, file)}:${line}`);
  }
}

const iconLabels = tsxFiles.filter((file) => read(file).includes('aria-hidden'));

console.log(
  `\nBotões só com ícone: ${unnamed.length} sem nome acessível (de ${tsxFiles.length} arquivos analisados)`
);
for (const item of unnamed) console.log(`  - ${item}`);
console.log(`Ícones decorativos marcados com aria-hidden em ${iconLabels.length} arquivos`);

assert.deepStrictEqual(
  unnamed,
  [],
  `Botões só com ícone precisam de aria-label:\n  ${unnamed.join('\n  ')}`
);

console.log('\nui audit tests passed');
