/**
 * API Route: /api/health
 * Diagnóstico para monitoramento (uptime, deploy, banco).
 * Não exige sessão e não devolve dados de usuário.
 */

import { NextResponse } from 'next/server';
import { isLocalDemoAuthEnabled } from '@/lib/localDemoAuth';
import { hasEmailAuth, hasGoogleAuth, hasWebPush } from '@/lib/env';

export const dynamic = 'force-dynamic';

export async function GET() {
  const startedAt = Date.now();
  let database: 'ok' | 'unavailable' | 'not_configured' = 'not_configured';
  let databaseLatencyMs: number | null = null;

  if (process.env.DATABASE_URL) {
    try {
      const { prisma } = await import('@/lib/prisma');
      await prisma.$queryRaw`SELECT 1`;
      database = 'ok';
      databaseLatencyMs = Date.now() - startedAt;
    } catch (error) {
      console.error('[health] banco indisponível:', error);
      database = 'unavailable';
    }
  }

  const isHealthy = database !== 'unavailable';

  return NextResponse.json(
    {
      success: isHealthy,
      status: isHealthy ? 'ok' : 'degraded',
      checks: {
        database,
        databaseLatencyMs,
        auth: {
          google: hasGoogleAuth,
          email: hasEmailAuth,
        },
        push: hasWebPush,
        localDemoMode: isLocalDemoAuthEnabled,
      },
      version: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.npm_package_version ?? 'dev',
      timestamp: new Date().toISOString(),
    },
    { status: isHealthy ? 200 : 503 }
  );
}
