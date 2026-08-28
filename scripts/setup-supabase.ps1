#Requires -Version 5.1
$ErrorActionPreference = "Stop"
$ProjectRef = "dgjfyewgrukglsehyntc"
$AppRoot = Join-Path $PSScriptRoot "..\cortex-plus" | Resolve-Path

Write-Host "Cortex Plus Supabase setup" -ForegroundColor Cyan
Write-Host "App: $AppRoot"
Write-Host "Project ref: $ProjectRef (tek hedef — baska ref kullanma)"
Write-Host ""

Set-Location $AppRoot

if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
  throw "Node/npx bulunamadi. Node LTS kurun."
}

Write-Host "1/4 supabase login (Dashboard ile AYNI hesap — tarayici acilir)" -ForegroundColor Yellow
Write-Host "     Alternatif: Dashboard -> Account -> Access Tokens -> legacy token ->" -ForegroundColor Gray
Write-Host "     npx supabase login --token `"<PAT>`" --name `"Cortex Plus CLI`"" -ForegroundColor Gray
npx supabase login
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "2/4 supabase init (mevcut config.toml korunur)" -ForegroundColor Yellow
if (-not (Test-Path "supabase/config.toml")) {
  npx supabase init
} else {
  Write-Host "     supabase/config.toml zaten var — init atlandi." -ForegroundColor Gray
}

Write-Host "3/4 supabase link --project-ref $ProjectRef" -ForegroundColor Yellow
npx supabase link --project-ref $ProjectRef
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "4/4 migration list" -ForegroundColor Yellow
npx supabase migration list

Write-Host ""
Write-Host "Tamam. MCP: .cursor/mcp.json?project_ref=$ProjectRef" -ForegroundColor Green
Write-Host "Referans: docs/delivery/CLI-CONNECT.md"
