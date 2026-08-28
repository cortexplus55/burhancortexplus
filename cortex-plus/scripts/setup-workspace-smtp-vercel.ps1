# Vercel — Workspace SMTP ortam değişkenleri
# Takım: cortexplus55 · Proje: burhancortexplus-app · Root: cortex-plus
# Şifreyi chat'e yapıştırmayın; yalnızca bu oturumda stdin ile verin.

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

if (-not $env:SMTP_PASS) {
  Write-Host "SMTP_PASS ortam degiskeni bos. Ornek:" -ForegroundColor Yellow
  Write-Host '  $env:SMTP_PASS = "xxxx xxxx xxxx xxxx"  # Google uygulama sifresi (bosluksuz da olur)' -ForegroundColor Gray
  Write-Host "  .\scripts\setup-workspace-smtp-vercel.ps1" -ForegroundColor Gray
  exit 1
}

$scope = if ($env:VERCEL_TEAM) { $env:VERCEL_TEAM } else { "cortexplus55" }
# Production env cortexplus.app uzerinde burhancortexplus-app projesinde
$project = if ($env:VERCEL_PROJECT) { $env:VERCEL_PROJECT } else { "burhancortexplus-app" }

Write-Host "Vercel team: $scope · project: $project" -ForegroundColor Cyan

function Set-VercelEnv {
  param(
    [string]$Name,
    [string]$Value,
    [string[]]$Targets = @("production", "preview")
  )
  foreach ($target in $Targets) {
    Write-Host "  $Name -> $target"
    $Value | npx vercel env add $Name $target --scope $scope --project $project --force 2>&1 | Out-Null
  }
}

Set-VercelEnv "SMTP_HOST" "smtp.gmail.com"
Set-VercelEnv "SMTP_PORT" "587"
Set-VercelEnv "SMTP_USER" "cortexplus@cortexplus.app"
Set-VercelEnv "SMTP_PASS" $env:SMTP_PASS
Set-VercelEnv "EMAIL_FROM" "Cortex Plus <cortexplus@cortexplus.app>"

Write-Host "`nRESEND_API_KEY kaldiriliyor (varsa)..." -ForegroundColor Yellow
foreach ($target in @("production", "preview", "development")) {
  npx vercel env rm RESEND_API_KEY $target --scope $scope --project $project --yes 2>&1 | Out-Null
}

Write-Host "`nTamam. Vercel Dashboard'dan redeploy yapin veya: npx vercel --prod --scope $scope" -ForegroundColor Green
Write-Host "Sonra Supabase SMTP + Confirm email: docs/delivery/WORKSPACE-EMAIL.md" -ForegroundColor Green
