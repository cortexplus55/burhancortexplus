#Requires -Version 5.1
# Cortex Plus — Vercel CLI → cortexplus55/burhancortexplus-app
#
# The link belongs at the repository root, not in cortex-plus/: the Vercel
# project already carries "cortex-plus" as its Root Directory. Linking from
# inside the app folder is what produced a second, competing .vercel link.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "../..")

$ExpectedTeam = "cortexplus55"
$ExpectedProject = "burhancortexplus-app"
$ExpectedOrgId = "team_7fZJmWjbQtKXSDwCZCA4s7Ym"
$ExpectedProjectId = "prj_fBxyWhMERs4pZUq9sJMaVa9Gt29A"

Write-Host "Vercel link: $ExpectedTeam / $ExpectedProject" -ForegroundColor Cyan

# A leftover link inside the app folder shadows the root one for any CLI call
# made from there, so clear it before linking.
$StaleLink = Join-Path (Get-Location) "cortex-plus/.vercel"
if (Test-Path $StaleLink) {
  Write-Host "Eski cortex-plus/.vercel kaldiriliyor..." -ForegroundColor Yellow
  Remove-Item -Recurse -Force $StaleLink
}

$teams = npx vercel teams ls 2>&1 | Out-String
if ($teams -notmatch $ExpectedTeam) {
  Write-Host "HATA: CLI'de '$ExpectedTeam' takimi yok. Once:" -ForegroundColor Red
  Write-Host "  npx vercel login   # cortexplus55 erisimi olan hesap" -ForegroundColor Yellow
  exit 1
}

if (Test-Path .vercel/project.json) {
  $current = Get-Content .vercel/project.json -Raw | ConvertFrom-Json
  if ($current.projectName -eq $ExpectedProject -and $current.orgId -eq $ExpectedOrgId) {
    Write-Host "Zaten dogru projeye bagli: $($current.projectName)" -ForegroundColor Green
    exit 0
  }
  Write-Host "Eski link: $($current.projectName) — yeniden baglaniyor..." -ForegroundColor Yellow
  Remove-Item -Recurse -Force .vercel
}

npx vercel link --yes --scope $ExpectedTeam --project $ExpectedProject
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$linked = Get-Content .vercel/project.json -Raw | ConvertFrom-Json
if ($linked.orgId -ne $ExpectedOrgId -or $linked.projectId -ne $ExpectedProjectId) {
  Write-Host "UYARI: project.json ID'ler beklenenden farkli. CLI-CONNECT.md guncelle." -ForegroundColor Yellow
  Write-Host "  orgId=$($linked.orgId) projectId=$($linked.projectId)"
}
Write-Host "Tamam: cortexplus55/burhancortexplus-app" -ForegroundColor Green
