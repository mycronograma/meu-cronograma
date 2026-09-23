$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $ProjectRoot

if (-not (Test-Path ".env")) {
  Write-Host "Missing .env. Run npm run local:setup first." -ForegroundColor Red
  exit 1
}

if (-not (Test-Path "node_modules")) {
  Write-Host "Missing node_modules. Run npm run local:setup first." -ForegroundColor Red
  exit 1
}

if (Get-Command docker -ErrorAction SilentlyContinue) {
  docker compose -f docker-compose.local.yml up -d
}

npm run dev
