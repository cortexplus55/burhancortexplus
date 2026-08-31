#Requires -Version 5.1
$ErrorActionPreference = "Stop"
$Root = (Join-Path $PSScriptRoot ".." | Resolve-Path).Path
$App = Join-Path $Root "cortex-plus"

Write-Host "=== Cortex Plus CLI dogrulama ===" -ForegroundColor Cyan

Set-Location $Root
$remote = (git remote get-url origin 2>$null)
if ($remote -notmatch "cortexplus55/burhancortexplus") {
  Write-Host "FAIL git origin: $remote" -ForegroundColor Red
  exit 1
}
Write-Host "OK  git origin: cortexplus55/burhancortexplus" -ForegroundColor Green

$ErrorActionPreference = "Continue"
$gh = gh auth status 2>&1 | Out-String
$ErrorActionPreference = "Stop"
if ($gh -notmatch "account cortexplus55") {
  Write-Host "WARN gh aktif hesap cortexplus55 degil (gh auth switch)" -ForegroundColor Yellow
} else {
  Write-Host "OK  gh: cortexplus55" -ForegroundColor Green
}

# The link lives at the repository root; the Vercel project carries
# "cortex-plus" as its Root Directory.
$projFile = Join-Path $Root ".vercel/project.json"
if (-not (Test-Path $projFile)) {
  Write-Host "FAIL .vercel/project.json yok - setup-vercel-link.ps1" -ForegroundColor Red
  exit 1
}
$v = Get-Content $projFile -Raw | ConvertFrom-Json
if ($v.projectName -ne "burhancortexplus-app" -or $v.orgId -ne "team_7fZJmWjbQtKXSDwCZCA4s7Ym") {
  Write-Host "FAIL Vercel link: $($v.projectName) / $($v.orgId)" -ForegroundColor Red
  exit 1
}
# A second link inside the app folder shadows the root one for CLI calls made
# from there, and that is how four projects ended up building the same push.
if (Test-Path (Join-Path $App ".vercel")) {
  Write-Host "FAIL cortex-plus/.vercel var - kaldirin (setup-vercel-link.ps1)" -ForegroundColor Red
  exit 1
}
Write-Host "OK  Vercel: cortexplus55/burhancortexplus-app" -ForegroundColor Green

Set-Location $App

$refFile = Join-Path $App "supabase/.temp/project-ref"
if (Test-Path $refFile) {
  $ref = (Get-Content $refFile -Raw).Trim()
  if ($ref -eq "dgjfyewgrukglsehyntc") {
    Write-Host "OK  Supabase ref file: $ref" -ForegroundColor Green
  } else {
    Write-Host "FAIL Supabase ref: $ref" -ForegroundColor Red
    exit 1
  }
} else {
  Write-Host "WARN supabase/.temp/project-ref yok - supabase link calistir" -ForegroundColor Yellow
}

$ErrorActionPreference = "Continue"
$list = npx supabase projects list 2>&1 | Out-String
$ErrorActionPreference = "Stop"
if ($list -match "dgjfyewgrukglsehyntc") {
  Write-Host "OK  Supabase CLI projeyi goruyor" -ForegroundColor Green
} else {
  Write-Host "WARN Supabase CLI dgjfyewgrukglsehyntc gormuyor - supabase login (dogru hesap)" -ForegroundColor Yellow
}

Write-Host "Bitti." -ForegroundColor Cyan
