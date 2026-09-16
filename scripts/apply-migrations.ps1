#Requires -Version 5.1
<#
  Bekleyen gec dosyalarini canli Supabase projesine uygular.

  Neden ayri bir betik: setup-supabase.ps1 giris yapip listeliyor ama
  UYGULAMIYOR. Son adim eksikti ve uc gec dosyasi bu yuzden bekliyordu.

  Bu betik canli veritabanina yaziyor. O yuzden once NE OLACAGINI gosteriyor
  ve acik onay istiyor.

  Kullanim:
    1) .\scripts\setup-supabase.ps1     # giris + link (bir kez)
    2) .\scripts\apply-migrations.ps1
#>
$ErrorActionPreference = "Stop"
$ProjectRef = "dgjfyewgrukglsehyntc"
$Root = (Join-Path $PSScriptRoot ".." | Resolve-Path).Path
$App  = Join-Path $Root "cortex-plus"

Write-Host "=== Gec dosyalarini uygula ($ProjectRef) ===" -ForegroundColor Cyan

# --- Dogru dalda miyiz -----------------------------------------------------
# Yeni gec dosyalari yalnizca calisma dalinda; main'de yoklar.
Set-Location $Root
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Write-Host "`nGit dali: $branch" -ForegroundColor DarkGray

$expected = @(
  "20260914120000_seed_ai_model_prices.sql",
  "20260914130000_weekly_plan.sql",
  "20260915090000_credit_packs.sql",
  "20260915100000_weekly_credit_window.sql"
)
$missing = @()
foreach ($f in $expected) {
  if (-not (Test-Path (Join-Path $App "supabase/migrations/$f"))) { $missing += $f }
}
if ($missing.Count) {
  Write-Host "HATA: su gec dosyalari yerelde yok:" -ForegroundColor Red
  $missing | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
  Write-Host "`nCalisma dalina gecin:" -ForegroundColor Yellow
  Write-Host "  git fetch origin claude/son-durum-ozeti-866xme" -ForegroundColor Yellow
  Write-Host "  git checkout claude/son-durum-ozeti-866xme" -ForegroundColor Yellow
  exit 1
}
Write-Host "OK  Dort gec dosyasi yerelde duruyor." -ForegroundColor Green

Set-Location $App

# --- Ne uygulanacak --------------------------------------------------------
Write-Host "`nUzak veritabanindaki durum:" -ForegroundColor Cyan
npx supabase migration list
if ($LASTEXITCODE -ne 0) {
  Write-Host "`nListe alinamadi. Once: .\scripts\setup-supabase.ps1" -ForegroundColor Red
  exit 1
}

Write-Host "`nYukarida 'Local' sutununda olup 'Remote' sutununda OLMAYAN" -ForegroundColor Yellow
Write-Host "satirlar uygulanacak." -ForegroundColor Yellow
Write-Host ""
Write-Host "Bu islem CANLI veritabanini degistirir." -ForegroundColor Red
$answer = Read-Host "Devam edilsin mi? (evet yazin)"
if ($answer -ne "evet") {
  Write-Host "Iptal edildi. Hicbir sey degismedi." -ForegroundColor DarkGray
  exit 0
}

# --- Uygula ----------------------------------------------------------------
Write-Host "`nUygulaniyor..." -ForegroundColor Cyan
npx supabase db push
if ($LASTEXITCODE -ne 0) {
  Write-Host "`nUygulama basarisiz. Hicbir gec dosyasi yarim kalmaz -" -ForegroundColor Red
  Write-Host "her dosya kendi islemi icinde calisir. Hatayi okuyup tekrar deneyin." -ForegroundColor Red
  exit 1
}

# --- Dogrula ---------------------------------------------------------------
Write-Host "`nDogrulama: kredi paketleri satista mi?" -ForegroundColor Cyan
Start-Sleep -Seconds 3
try {
  $html = (Invoke-WebRequest -Uri "https://cortexplus.app/fiyatlandirma" -UseBasicParsing -TimeoutSec 30).Content
  if ($html -match "Ek Kredi") {
    Write-Host "OK  Kredi paketleri fiyat sayfasinda gorunuyor." -ForegroundColor Green
  } else {
    Write-Host "Paketler henuz gorunmuyor." -ForegroundColor Yellow
    Write-Host "  Sayfa onbellekten geliyor olabilir; Vercel'de Redeploy deneyin." -ForegroundColor Yellow
  }
} catch {
  Write-Host "Sayfa okunamadi; tarayicidan kontrol edin." -ForegroundColor Yellow
}

Write-Host "`nUygulanan dort dosya:" -ForegroundColor Cyan
Write-Host "  model fiyatlari      - maliyet takibi acilir" -ForegroundColor DarkGray
Write-Host "  haftalik plan        - 349 TL'lik paket satista gorunur" -ForegroundColor DarkGray
Write-Host "  kredi paketleri      - Ek Kredi 50/150/400 satista gorunur" -ForegroundColor DarkGray
Write-Host "  haftalik kota penceresi - haftalik abonede kredi penceresi 7 gun olur" -ForegroundColor DarkGray
