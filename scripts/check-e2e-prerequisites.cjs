#!/usr/bin/env node
// Run before browser tests to report missing prerequisites without exposing credentials.
const { existsSync } = require('node:fs');
const { join } = require('node:path');
try {
  require('@next/env').loadEnvConfig(process.cwd());
} catch {
  // npm ci check below reports missing dependencies.
}
let chromium;
try {
  ({ chromium } = require('@playwright/test'));
} catch {
  console.error('Dependências ausentes. Execute: npm ci');
  process.exit(1);
}

const problems = [];
const prismaClient = join(process.cwd(), 'node_modules', '.prisma', 'client', 'index.js');
if (!existsSync(prismaClient)) {
  problems.push('Prisma Client não gerado. Execute: npx prisma generate');
}
const browser = chromium.executablePath();
if (!existsSync(browser)) {
  problems.push('Chromium do Playwright ausente. Execute: npx playwright install chromium');
}
if (!process.env.DATABASE_URL) {
  problems.push('DATABASE_URL ausente. Configure um banco de teste em .env.local ou no ambiente.');
}
if (problems.length) {
  console.error('Testes de navegador ainda não podem iniciar:');
  problems.forEach((problem) => console.error(`- ${problem}`));
  process.exitCode = 1;
} else {
  console.log('Pré-requisitos locais encontrados. Ainda é necessário confirmar conexão e migrações do banco.');
}
