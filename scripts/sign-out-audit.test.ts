/**
 * Auditoria da limpeza de progresso ao sair da conta.
 *
 * Regra: toda chave de localStorage que pertence ao usuário (progresso de estudo,
 * gamificação, preferências, estado de sync) precisa ser apagada quando ele sai,
 * senão a próxima conta que entrar no mesmo navegador herda os dados da anterior.
 *
 * A verificação é estática (lê os arquivos-fonte), para não depender de DOM,
 * React ou do Prisma em runtime.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(process.cwd(), 'src');

/** Chaves do dispositivo/sessão que não pertencem ao usuário e podem sobrar. */
const NON_USER_KEYS = new Set([
  'nexora_theme',
  'nexora_demo_session',
  'nexora_demo_user',
  'nexora_sync_status',
]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function read(relPath: string): string {
  return readFileSync(join(process.cwd(), relPath), 'utf8');
}

/** Extrai as strings de um array literal simples (`['a', 'b']`). */
function extractStringArray(source: string, constName: string): string[] {
  const match = source.match(new RegExp(`${constName}\\s*=\\s*\\[([\\s\\S]*?)\\]`));
  if (!match) return [];
  const values = match[1].match(/'[^']+'/g) ?? [];
  return values.map((value) => value.slice(1, -1));
}

const files = walk(ROOT);
const failures: string[] = [];

function check(condition: boolean, message: string) {
  if (!condition) failures.push(message);
}

// ---------------------------------------------------------------- chaves usadas
const usedKeys = new Map<string, string[]>();
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const relPath = relative(process.cwd(), file);
  const pattern = /useLocalStorage(?:<[^'()\n]*?>)?\(\s*'([^']+)'/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    if (!match[1].startsWith('nexora_')) continue;
    const list = usedKeys.get(match[1]) ?? [];
    list.push(relPath);
    usedKeys.set(match[1], list);
  }

  // Chaves usadas via constante (ex.: const STORAGE_KEY = 'nexora_onboarding').
  const constPattern = /=\s*'([^']*nexora_[a-z_]+)'/g;
  while ((match = constPattern.exec(source)) !== null) {
    const list = usedKeys.get(match[1]) ?? [];
    list.push(relPath);
    usedKeys.set(match[1], list);
  }
}

const userKeys = [...usedKeys.keys()].filter((key) => !NON_USER_KEYS.has(key)).sort();

// ------------------------------------------------------- chaves limpadas no logout
const clientSyncSource = read('src/lib/clientSync.ts');
const rowKeys = extractStringArray(clientSyncSource, 'ROW_STORE_KEYS');
const snapshotKeys = extractStringArray(clientSyncSource, 'SNAPSHOT_STORE_KEYS');

const helperSource = read('src/lib/signOutAndClearProgress.ts');
const extraKeys = extractStringArray(helperSource, 'SIGN_OUT_EXTRA_STORE_KEYS');

const clearedKeys = new Set<string>([...rowKeys, ...snapshotKeys, ...extraKeys]);

check(rowKeys.length > 0, 'ROW_STORE_KEYS não encontrado em src/lib/clientSync.ts');
check(snapshotKeys.length > 0, 'SNAPSHOT_STORE_KEYS não encontrado em src/lib/clientSync.ts');
check(
  helperSource.includes('SERVER_PROGRESS_STORE_KEYS'),
  'signOutAndClearProgress não limpa SERVER_PROGRESS_STORE_KEYS',
);
check(
  helperSource.includes('resetSyncState'),
  'signOutAndClearProgress não reseta o cursor do sync (resetSyncState)',
);
check(
  extraKeys.includes('nexora_sync_state'),
  'nexora_sync_state precisa estar em SIGN_OUT_EXTRA_STORE_KEYS',
);

// ------------------------------------------------- toda chave de usuário é limpa
for (const key of userKeys) {
  check(
    clearedKeys.has(key),
    `Chave de usuário "${key}" não é limpa ao sair (usada em ${usedKeys.get(key)!.join(', ')})`,
  );
}

// -------------------------------------------- nenhum signOut cru no caminho comum
const signOutCallSites: string[] = [];
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const relPath = relative(process.cwd(), file);
  const pattern = /(?<!signOutAndClearProgress)\bsignOut\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    signOutCallSites.push(`${relPath}:${source.slice(0, match.index).split('\n').length}`);
  }
}
// A exclusão de conta usa signOut direto porque já limpou o store antes.
// O próprio helper de logout também chama signOut (é o ponto do logout).
const rawSignOutAllowed = ['src/app/(app)/settings/page.tsx', 'src/lib/signOutAndClearProgress.ts'];
for (const callSite of signOutCallSites) {
  const file = callSite.split(':')[0];
  check(
    rawSignOutAllowed.includes(file),
    `signOut sem limpeza de progresso em ${callSite} (use signOutAndClearProgress)`,
  );
}

// ---------------------------------------------------------------------- resultado
console.log('=== Auditoria de limpeza ao sair da conta ===');
console.log(`Chaves de localStorage usadas no app: ${usedKeys.size}`);
console.log(`  - de usuário (precisam ser limpas): ${userKeys.length}`);
console.log(`  - de dispositivo/sessão (podem sobrar): ${NON_USER_KEYS.size}`);
console.log(`Chaves limpas no logout: ${clearedKeys.size}`);
console.log(`  - ROW_STORE_KEYS: ${rowKeys.length}`);
console.log(`  - SNAPSHOT_STORE_KEYS: ${snapshotKeys.length}`);
console.log(`  - extras (sign-out): ${extraKeys.length}`);
console.log(`signOut cru fora da exclusão de conta: ${signOutCallSites.length}`);

if (failures.length > 0) {
  console.error('\nProblemas encontrados:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  console.error('\nsign-out audit tests failed');
  process.exit(1);
}

console.log('\nToda chave de usuário é apagada ao sair da conta.');
console.log('sign-out audit tests passed');
