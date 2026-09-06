#Requires -Version 5.1
# Cortex Plus — Vercel CLI → cortexplus55/burhancortexplus-app
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$ExpectedTeam = "cortexplus55"
$ExpectedProject = "burhancortexplus-app"
$ExpectedOrgId = "team_7fZJmWjbQtKXSDwCZCA4s7Ym"
$ExpectedProjectId = "prj_fBxyWhMERs4pZUq9sJMaVa9Gt29A"

Write-Host "Vercel link: $ExpectedTeam / $ExpectedProject" -ForegroundColor Cyan

$teams = npx vercel teams ls 2>&1 | Out-String
if ($LASTEXITCODE -ne 0 -or $teams -notmatch "(?m)\bcortexplus55\b") {
  Write-Host "HATA: CLI'de '$ExpectedTeam' takimi yok. Once:" -ForegroundColor Red
  Write-Host "  npx vercel login   # cortexplus55 erisimi olan hesap" -ForegroundColor Yellow
  exit 1
}

if (Test-Path .vercel/project.json) {
  $current = Get-Content .vercel/project.json -Raw | ConvertFrom-Json
  if ($current.projectName -eq $ExpectedProject -and $current.orgId -eq $ExpectedOrgId -and $current.projectId -eq $ExpectedProjectId) {
    Write-Host "Zaten dogru projeye bagli: $($current.projectName)" -ForegroundColor Green
    exit 0
  }
  Write-Host "Eski link: $($current.projectName) — yeniden baglaniyor..." -ForegroundColor Yellow
  # Vercel link updates project.json; preserve cached files and local settings.
}

npx vercel link --yes --scope $ExpectedTeam --project $ExpectedProject
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$linked = Get-Content .vercel/project.json -Raw | ConvertFrom-Json
if ($linked.orgId -ne $ExpectedOrgId -or $linked.projectId -ne $ExpectedProjectId -or $linked.projectName -ne $ExpectedProject) {
  throw "Vercel link beklenen production projesiyle eslesmiyor. Islem durduruldu."
}
Write-Host "Tamam: cortexplus55/burhancortexplus-app" -ForegroundColor Green
