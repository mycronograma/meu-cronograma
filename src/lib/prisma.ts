/**
 * Prisma Client Singleton
 * Prevents multiple instances in development with hot reloading.
 *
 * O client é criado de forma preguiçosa (lazy) de propósito: importar este módulo
 * nunca deve derrubar a aplicação. Antes, um `new PrismaClient()` no topo do arquivo
 * fazia com que qualquer página que só encostasse em `@/lib/prisma` (mesmo em modo
 * demo local, sem banco) respondesse 500 quando o client não estava gerado ou o
 * banco estava indisponível.
 */

import type { PrismaClient as PrismaClientType } from '@prisma/client';

const normalizeDatabaseUrl = () => {
  const raw = process.env.DATABASE_URL ?? '';
  if (!raw) return;
  if (!raw.includes('cockroachlabs.cloud')) return;
  if (!raw.includes('sslmode=verify-full')) return;
  if (raw.includes('sslrootcert=')) return;

  // Cockroach Cloud requires TLS. If no CA is provided, fall back to sslmode=require.
  process.env.DATABASE_URL = raw.replace('sslmode=verify-full', 'sslmode=require');
};

normalizeDatabaseUrl();

// Extend global type to include prisma
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClientType | undefined;
}

let prismaClient: PrismaClientType | null = null;
let prismaInitError: unknown = null;

const createPrismaClient = (): PrismaClientType => {
  if (prismaClient) return prismaClient;
  if (prismaInitError) throw prismaInitError;

  try {
    // Import tardio: se o Prisma Client não foi gerado (ex.: `prisma generate`
    // falhou no install), o erro só aparece quando o banco é realmente usado.
    const { PrismaClient } = require('@prisma/client') as typeof import('@prisma/client');

    prismaClient =
      global.prisma ||
      new PrismaClient({
        log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
      });

    if (process.env.NODE_ENV !== 'production') {
      global.prisma = prismaClient;
    }
  } catch (error) {
    prismaInitError = error;
    console.error(
      '[prisma] Client indisponível. Rode `npm run prisma:generate` para habilitar os recursos de banco.',
      error
    );
    throw error;
  }

  return prismaClient;
};

/**
 * Acesso ao Prisma. A instância real é criada no primeiro uso de qualquer
 * propriedade (ex.: `prisma.user.findUnique`).
 */
export const prisma: PrismaClientType = new Proxy({} as PrismaClientType, {
  get(_target, property) {
    const client = createPrismaClient();
    const value = Reflect.get(client as object, property);
    return typeof value === 'function' ? value.bind(client) : value;
  },
  has(_target, property) {
    return Reflect.has(createPrismaClient() as object, property);
  },
  ownKeys() {
    return Reflect.ownKeys(createPrismaClient() as object);
  },
  getOwnPropertyDescriptor(_target, property) {
    return Reflect.getOwnPropertyDescriptor(createPrismaClient() as object, property);
  },
});

export default prisma;
