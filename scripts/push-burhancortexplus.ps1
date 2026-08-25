# Push Cortex Plus monorepo to https://github.com/cortexplus55/burhancortexplus
# Requires: gh auth login as cortexplus55 (NOT burhan55600-pixel)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

$login = gh api user --jq .login 2>$null
if ($login -ne "cortexplus55") {
  Write-Host "Aktif GitHub hesabi: $login"
  Write-Host "Once: gh auth login  -> cortexplus55 hesabi"
  exit 1
}

git remote set-url origin https://github.com/cortexplus55/burhancortexplus.git
git push -u origin main
Write-Host "Tamam: https://github.com/cortexplus55/burhancortexplus"
