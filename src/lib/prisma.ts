/**
 * Prisma Client Singleton
 * Prevents multiple instances in development with hot reloading
 */

import { PrismaClient } from '@prisma/client';

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
  var prisma: PrismaClient | undefined;
}

// Create Prisma client with logging in development
export const prisma = global.prisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development' 
    ? ['query', 'error', 'warn'] 
    : ['error'],
});

// Prevent multiple instances in development
if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

export default prisma;
