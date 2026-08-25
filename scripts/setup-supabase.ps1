#Requires -Version 5.1
$ErrorActionPreference = "Stop"
$ProjectRef = "gwqonggqzvavljguiryx"
$AppRoot = Join-Path $PSScriptRoot "..\cortex-plus" | Resolve-Path

Write-Host "Cortex Plus Supabase setup" -ForegroundColor Cyan
Write-Host "App: $AppRoot"
Write-Host "Project ref: $ProjectRef"
Write-Host ""

Set-Location $AppRoot

if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
  throw "Node/npx bulunamadi. Node LTS kurun."
}

Write-Host "1/3 supabase login (Dashboard ile AYNI hesap)" -ForegroundColor Yellow
npx supabase login

Write-Host "2/3 supabase link" -ForegroundColor Yellow
npx supabase link --project-ref $ProjectRef

Write-Host "3/3 migration list" -ForegroundColor Yellow
npx supabase migration list

Write-Host ""
Write-Host "Tamam. Cursor MCP: .cursor/mcp.json (supabase, project_ref=$ProjectRef)" -ForegroundColor Green
Write-Host "Ilk calistirma: cd cortex-plus; npm install; copy .env.example .env.local (degerleri doldur)"
