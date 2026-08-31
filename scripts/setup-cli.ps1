#Requires -Version 5.1
# Vercel + Supabase CLI — greenfield tek hedef
$ErrorActionPreference = "Stop"
$Root = (Join-Path $PSScriptRoot ".." | Resolve-Path).Path

Write-Host "1/2 Vercel (cortexplus55/burhancortexplus-app)" -ForegroundColor Cyan
& (Join-Path $Root "cortex-plus/scripts/setup-vercel-link.ps1")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n2/2 Supabase (dgjfyewgrukglsehyntc) — interaktif login gerekir" -ForegroundColor Cyan
& (Join-Path $Root "setup-supabase.ps1")

Write-Host "`nDogrulama:" -ForegroundColor Cyan
& (Join-Path $Root "verify-cli.ps1")
