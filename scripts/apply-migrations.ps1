#Requires -Version 5.1
<#
  Bekleyen gec dosyalarini canli Supabase projesine uygular.

  --- NEDEN BU BETIK VAR ---
  setup-supabase.ps1 giris yapip listeliyor ama UYGULAMIYOR. Son adim eksikti
  ve uc gec dosyasi bu yuzden bekliyordu.

  --- "db push kullanmayin" CELISKISI ---
  Dort teslim dokumani (deploy-checklist, CLI-CONNECT, supabase-setup,
  verify-schema.mjs) `supabase db push` KULLANMAYIN diyor. Gerekcesi gercek:
  repo gec gecmisi ile uzak veritabaninin gecmisi bir donem ayristi.

  Bu betik yine de `db push` kullaniyor, cunku gecmis hizalandiktan sonra
  Eylul 2026 gec dosyalari onunla uygulandi ve calisti. Yani yasak MUTLAK
  degil, TARIHSEL: hizalanmamis bir projede tehlikeli.

  Guvenli sira: once asagidaki `migration list` ciktisina bakin. Local ve
  Remote sutunlari beklediginiz gibiyse devam edin. Beklemediginiz bir fark
  varsa DURUN ve dosyalari Supabase SQL editorunden elle uygulayin.

  Kullanim:
    1) .\scripts\setup-supabase.ps1     # giris + link (bir kez)
    2) .\scripts\apply-migrations.ps1
    3) cd cortex-plus; node scripts/acilis-kapisi.mjs --db   # dogrulama
#>
$ErrorActionPreference = "Stop"
$ProjectRef = "dgjfyewgrukglsehyntc"
$Root = (Join-Path $PSScriptRoot ".." | Resolve-Path).Path
$App  = Join-Path $Root "cortex-plus"

Write-Host "=== Gec dosyalarini uygula ($ProjectRef) ===" -ForegroundColor Cyan

# --- Hangi daldayiz ---------------------------------------------------------
Set-Location $Root
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Write-Host "`nGit dali: $branch" -ForegroundColor DarkGray

<#
  Eskiden burada SABIT bir dosya listesi vardi ve her yeni gec dosyasinda
  bayatliyordu: 19 Eylul 2026'da liste hala 14-15 Eylul'un dort dosyasini
  ariyor, sonraki bes dosyayi hic bilmiyor ve artik var olmayan bir dal adina
  yonlendiriyordu. Kendini guncel tutmayan bir kontrol, kontrol degil.

  Artik dosyalar diskten sayiliyor; listeyi tutan tek kaynak klasorun kendisi.
#>
$MigrationDir = Join-Path $App "supabase/migrations"
if (-not (Test-Path $MigrationDir)) {
  Write-Host "HATA: $MigrationDir bulunamadi." -ForegroundColor Red
  exit 1
}
$files = @(Get-ChildItem $MigrationDir -Filter *.sql | Sort-Object Name)
if ($files.Count -eq 0) {
  Write-Host "HATA: hic gec dosyasi yok. Dogru dalda misiniz?" -ForegroundColor Red
  Write-Host "  git fetch origin main; git checkout main" -ForegroundColor Yellow
  exit 1
}
Write-Host "OK  $($files.Count) gec dosyasi yerelde duruyor." -ForegroundColor Green
Write-Host "    En yenisi: $($files[-1].Name)" -ForegroundColor DarkGray

Set-Location $App

# --- Ne uygulanacak ---------------------------------------------------------
Write-Host "`nUzak veritabanindaki durum:" -ForegroundColor Cyan
npx supabase migration list
if ($LASTEXITCODE -ne 0) {
  Write-Host "`nListe alinamadi. Once: .\scripts\setup-supabase.ps1" -ForegroundColor Red
  exit 1
}

Write-Host "`n'Local' sutununda olup 'Remote' sutununda OLMAYAN satirlar" -ForegroundColor Yellow
Write-Host "uygulanacak." -ForegroundColor Yellow
Write-Host ""
Write-Host "DURUN VE BAKIN: beklemediginiz bir fark varsa buradan cikin ve" -ForegroundColor Yellow
Write-Host "dosyalari Supabase SQL editorunden elle uygulayin. Gerekcesi" -ForegroundColor Yellow
Write-Host "docs/delivery/deploy-checklist.md icinde." -ForegroundColor Yellow
Write-Host ""
Write-Host "Bu islem CANLI veritabanini degistirir." -ForegroundColor Red
$answer = Read-Host "Devam edilsin mi? (evet yazin)"
if ($answer -ne "evet") {
  Write-Host "Iptal edildi. Hicbir sey degismedi." -ForegroundColor DarkGray
  exit 0
}

# --- Uygula -----------------------------------------------------------------
Write-Host "`nUygulaniyor..." -ForegroundColor Cyan
npx supabase db push
if ($LASTEXITCODE -ne 0) {
  Write-Host "`nUygulama basarisiz. Hicbir gec dosyasi yarim kalmaz -" -ForegroundColor Red
  Write-Host "her dosya kendi islemi icinde calisir. Hatayi okuyup tekrar deneyin." -ForegroundColor Red
  exit 1
}

<#
  --- DOGRULAMA ---
  Eskiden burada fiyat sayfasinda "Ek Kredi" araniyordu. O kontrol 18 Eylul
  2026'dan beri HER ZAMAN basarisiz olur: kredi paketleri artik vitrinde
  yalnizca aboneye gorunuyor, yani herkese acik sayfada bulunmamalari normal.
  Yanlis alarm veren bir dogrulama, dogrulama degil.

  Yerine gecen betik her gec dosyasinin kanit nesnesini tek tek soruyor.
#>
Write-Host "`nDogrulama:" -ForegroundColor Cyan
node scripts/acilis-kapisi.mjs --db
if ($LASTEXITCODE -ne 0) {
  Write-Host "`nBazi kontroller gecemedi. Yukaridaki satirlari okuyun." -ForegroundColor Yellow
  exit 1
}

Write-Host "`nBitti. Sema kodla uyumlu." -ForegroundColor Green
Write-Host "Panelden de gorebilirsiniz: /admin/sistem -> 'Canli sema' tablosu" -ForegroundColor DarkGray
