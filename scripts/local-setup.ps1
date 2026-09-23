$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $ProjectRoot

function Require-Command {
  param(
    [string]$Name,
    [string]$InstallHint
  )

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    Write-Host ""
    Write-Host "Missing command: $Name" -ForegroundColor Red
    Write-Host $InstallHint -ForegroundColor Yellow
    exit 1
  }
}

Require-Command "node" "Install Node.js LTS: winget install OpenJS.NodeJS.LTS"
Require-Command "npm" "Install Node.js LTS: winget install OpenJS.NodeJS.LTS"
Require-Command "docker" "Install Docker Desktop: winget install Docker.DockerDesktop"

if (-not (Test-Path ".env")) {
  Copy-Item ".env.local.example" ".env"
  Write-Host "Created .env from .env.local.example" -ForegroundColor Green
}

$envContent = Get-Content ".env" -Raw
if ($envContent -notmatch "localhost:26257|127\.0\.0\.1:26257") {
  Write-Host ""
  Write-Host "Your .env does not look local. Refusing to run local setup against a remote database." -ForegroundColor Red
  Write-Host "Use DATABASE_URL=postgresql://root@localhost:26257/nexora?sslmode=disable for local development." -ForegroundColor Yellow
  exit 1
}

Write-Host "Starting local CockroachDB..." -ForegroundColor Cyan
docker compose -f docker-compose.local.yml up -d

Write-Host "Waiting for CockroachDB to accept connections..." -ForegroundColor Cyan
$ready = $false
for ($i = 1; $i -le 40; $i++) {
  docker exec nexora-cockroach ./cockroach sql --insecure --execute "SELECT 1" *> $null
  if ($LASTEXITCODE -eq 0) {
    $ready = $true
    break
  }
  Start-Sleep -Seconds 2
}

if (-not $ready) {
  Write-Host "CockroachDB did not become ready in time. Check Docker Desktop and container logs." -ForegroundColor Red
  exit 1
}

docker exec nexora-cockroach ./cockroach sql --insecure --execute "CREATE DATABASE IF NOT EXISTS nexora;" | Write-Host

if (-not (Test-Path "node_modules")) {
  Write-Host "Installing dependencies..." -ForegroundColor Cyan
  npm ci
}

Write-Host "Generating Prisma Client..." -ForegroundColor Cyan
npm run prisma:generate

Write-Host "Applying migrations..." -ForegroundColor Cyan
npm run prisma:migrate:deploy

Write-Host "Seeding local database..." -ForegroundColor Cyan
npm run db:seed

Write-Host ""
Write-Host "Local setup complete." -ForegroundColor Green
Write-Host "Run: npm run local:dev"
Write-Host "Open: http://localhost:3000"
Write-Host ""
Write-Host "Demo login after seed:"
Write-Host "Email: alex.chen@nexora.dev"
Write-Host "Password: Nexora@123"
