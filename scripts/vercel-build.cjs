#!/usr/bin/env node

const { spawnSync } = require('node:child_process');

const npxCmd = 'npx';

function runNpx(args, { allowFailure = false } = {}) {
  const commandLine = [npxCmd, ...args.map((value) => `"${value.replace(/"/g, '\\"')}"`)].join(' ');
  const result = spawnSync(commandLine, {
    stdio: 'inherit',
    env: process.env,
    shell: true,
  });

  if (result.error) {
    console.error(`[vercel-build] Failed to execute "${npxCmd} ${args.join(' ')}"`, result.error);
    if (!allowFailure) {
      process.exit(1);
    }
    return false;
  }

  if (result.status !== 0 && !allowFailure) {
    process.exit(result.status ?? 1);
  }

  return result.status === 0;
}

function normalizeCockroachUrl(url) {
  if (!url || !url.includes('cockroachlabs.cloud')) return url;
  if (!url.includes('sslmode=verify-full')) return url;
  if (url.includes('sslrootcert=')) return url;
  return url.replace('sslmode=verify-full', 'sslmode=require');
}

console.log('[vercel-build] Running prisma generate...');
runNpx(['prisma', 'generate']);

if (process.env.DATABASE_URL) {
  const rawDatabaseUrl = process.env.DATABASE_URL;
  const isCockroach = rawDatabaseUrl.includes('cockroachlabs.cloud');
  if (isCockroach) {
    const normalizedUrl = normalizeCockroachUrl(rawDatabaseUrl);
    if (normalizedUrl !== rawDatabaseUrl) {
      process.env.DATABASE_URL = normalizedUrl;
      console.log('[vercel-build] Normalized CockroachDB sslmode to require.');
    }
  }
  console.log('[vercel-build] Running prisma migrate deploy...');
  const migrateOk = runNpx(['prisma', 'migrate', 'deploy'], {
    allowFailure: process.env.VERCEL_ENV !== 'production',
  });
  if (!migrateOk) {
    console.warn('[vercel-build] prisma migrate deploy failed.');
    if (process.env.VERCEL_ENV === 'production') {
      process.exit(1);
    }
  }
} else {
  console.warn('[vercel-build] DATABASE_URL not set. Skipping prisma migrate deploy.');
}

console.log('[vercel-build] Running next build...');
runNpx(['next', 'build']);
