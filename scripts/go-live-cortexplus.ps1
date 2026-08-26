#Requires -Version 5.1
<#
.SYNOPSIS
  cortexplus.app go-live ön kontrol: GitHub, Vercel, DNS, env listesi.
#>
$ErrorActionPreference = "Continue"
$Root = Split-Path $PSScriptRoot -Parent
$App = Join-Path $Root "cortex-plus"
$SupabaseRef = "dgjfyewgrukglsehyntc"
$Domain = "cortexplus.app"

Write-Host "`n=== Cortex Plus go-live: $Domain ===" -ForegroundColor Cyan

Write-Host "`n[GitHub]" -ForegroundColor Yellow
try {
  $ghUser = gh api user --jq .login 2>$null
  Write-Host "  Aktif hesap: $ghUser"
  if ($ghUser -ne "cortexplus55") {
    Write-Host "  UYARI: Push icin cortexplus55 ile gh auth login" -ForegroundColor DarkYellow
  }
  Push-Location $Root
  $branch = git rev-parse --abbrev-ref HEAD
  $ahead = git rev-list --count origin/main..HEAD 2>$null
  $dirty = git status --porcelain
  Write-Host "  Branch: $branch | ahead of origin/main: $ahead | dirty: $(if ($dirty) { 'yes' } else { 'no' })"
  Pop-Location
} catch {
  Write-Host "  gh yok veya giris yapilmamis" -ForegroundColor Red
}

Write-Host "`n[Vercel CLI]" -ForegroundColor Yellow
Push-Location $App
try {
  $who = npx vercel whoami 2>$null
  Write-Host "  Oturum: $who"
  if (Test-Path .vercel/project.json) {
    Write-Host "  Link: $(Get-Content .vercel/project.json -Raw)"
  }
  Write-Host "  Production env anahtarlari:"
  $envList = npx vercel env ls production 2>$null | Out-String
  $required = @(
    "NEXT_PUBLIC_APP_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
    "OPENAI_API_KEY",
    "RESEND_API_KEY"
  )
  foreach ($key in $required) {
    if ($envList -match [regex]::Escape($key)) {
      Write-Host "    [ok] $key" -ForegroundColor Green
    } else {
      Write-Host "    [EKSIK] $key" -ForegroundColor Red
    }
  }
} catch {
  Write-Host "  vercel CLI hatasi" -ForegroundColor Red
}
Pop-Location

Write-Host "`n[DNS $Domain]" -ForegroundColor Yellow
try {
  $a = Resolve-DnsName -Name $Domain -Type A -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($a) { Write-Host "  A: $($a.IPAddress)" }
  Write-Host "  Hedef (Vercel): 76.76.21.21 veya CNAME cname.vercel-dns.com"
} catch {
  Write-Host "  DNS cozulemedi (ag/timeouts olabilir)" -ForegroundColor DarkYellow
}

Write-Host "`n[Supabase Auth - Dashboard kontrol]" -ForegroundColor Yellow
Write-Host "  Site URL: https://$Domain"
Write-Host "  Google redirect: https://$SupabaseRef.supabase.co/auth/v1/callback"
Write-Host "  Rehber: docs/delivery/google-workspace-cortexplus.app.md"

Write-Host "`n[Registrar DNS ozeti - Vercel + Workspace]" -ForegroundColor Yellow
Write-Host "  @ A -> 76.76.21.21 (Vercel)"
Write-Host "  www CNAME -> cname.vercel-dns.com"
Write-Host "  @ MX -> Google Workspace (Admin panelinden)"
Write-Host "  Resend -> TXT/CNAME (resend.com panelinden)"

Write-Host ""
Write-Host "Tamam. Detay: docs/delivery/GO-LIVE-cortexplus.app.md" -ForegroundColor Green
Write-Host ""
