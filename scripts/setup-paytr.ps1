#Requires -Version 5.1
<#
  PayTR ortam degiskenlerini Vercel'e tanimlar.

  Neden betik: panelde tiklamak yerine tek komut. Ve daha onemlisi, uc gizli
  deger yalnizca BU terminalde yasiyor - sohbete, sohbet gecmisine, bir dosyaya
  ya da ekran goruntusune hic ugramiyor.

  Kullanim:
    1) npx vercel login        # cortexplus55 erisimi olan hesapla
    2) .\scripts\setup-paytr.ps1

  Degerler nerede: Magaza Paneli -> Destek & Kurulum -> Entegrasyon Bilgileri
  (Bu ekrani yalnizca ana kullanici ve teknik kullanici gorebilir.)
    merchant_id   -> PAYTR_MERCHANT_ID
    merchant_key  -> PAYTR_MERCHANT_KEY
    merchant_salt -> PAYTR_MERCHANT_SALT

  Bildirim URL: Destek & Kurulum -> Ayarlar -> Bildirim URL Ayarlari
    https://cortexplus.app/api/payments/paytr/callback

  DIKKAT: Bu betik TEST kipinde birakir (PAYTR_TEST_MODE=1). Canliya gecmek
  ayri ve bilincli bir adim; en altta yaziyor.
#>
$ErrorActionPreference = "Stop"
$Root = (Join-Path $PSScriptRoot ".." | Resolve-Path).Path
$App  = Join-Path $Root "cortex-plus"

Write-Host "=== PayTR kurulumu ===" -ForegroundColor Cyan

# --- 1) Dogru Vercel projesine bagli miyiz --------------------------------
Write-Host "`n1/5 Vercel projesi kontrol ediliyor..." -ForegroundColor Cyan
& (Join-Path $App "scripts/setup-vercel-link.ps1")
if ($LASTEXITCODE -ne 0) {
  Write-Host "Vercel baglantisi kurulamadi. Once: npx vercel login" -ForegroundColor Red
  exit 1
}

Set-Location $App

# --- 2) Gizli degerleri sor ------------------------------------------------
# Read-Host -AsSecureString: yazarken ekranda gorunmuyor.
function Read-Secret([string]$Label) {
  while ($true) {
    $secure = Read-Host "  $Label" -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try   { $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
    $plain = $plain.Trim()
    if ($plain) { return $plain }
    Write-Host "  Bos birakilamaz." -ForegroundColor Yellow
  }
}

Write-Host "`n2/5 PayTR degerleri (yazarken ekranda gorunmez)" -ForegroundColor Cyan
Write-Host "  PayTR panel: Destek & Kurulum -> Entegrasyon Bilgileri" -ForegroundColor DarkGray
$merchantId   = Read-Secret "merchant_id"
$merchantKey  = Read-Secret "merchant_key"
$merchantSalt = Read-Secret "merchant_salt"

if ($merchantId -notmatch '^\d+$') {
  Write-Host "UYARI: Magaza No genelde yalnizca rakamdan olusur. Girilen deger farkli gorunuyor." -ForegroundColor Yellow
  if ((Read-Host "  Yine de devam edilsin mi? (e/h)") -ne "e") { exit 1 }
}

# --- 3) Vercel'e yaz -------------------------------------------------------
# Ayni ad zaten varsa once siliniyor: 'vercel env add' var olani guncellemiyor.
function Set-VercelEnv([string]$Name, [string]$Value) {
  Write-Host "  $Name" -ForegroundColor DarkGray
  $null = npx vercel env rm $Name production --yes 2>&1
  $Value | npx vercel env add $Name production 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "  HATA: $Name yazilamadi." -ForegroundColor Red
    exit 1
  }
}

Write-Host "`n3/5 Vercel'e yaziliyor (Production)..." -ForegroundColor Cyan
Set-VercelEnv "PAYTR_MERCHANT_ID"   $merchantId
Set-VercelEnv "PAYTR_MERCHANT_KEY"  $merchantKey
Set-VercelEnv "PAYTR_MERCHANT_SALT" $merchantSalt
# Varsayilan zaten test, ama acikca yaziyoruz ki panelde gorunsun.
Set-VercelEnv "PAYTR_TEST_MODE"     "1"

$merchantId = $null; $merchantKey = $null; $merchantSalt = $null
[GC]::Collect()

# --- 4) Yeniden dagit ------------------------------------------------------
# Ortam degiskenleri yalnizca YENI dagitimda okunuyor; kaydetmek yetmiyor.
Write-Host "`n4/5 Yeniden dagitiliyor (birkac dakika surer)..." -ForegroundColor Cyan
npx vercel deploy --prod --yes
if ($LASTEXITCODE -ne 0) {
  Write-Host "Dagitim basarisiz. Vercel panelinden elle Redeploy deneyin." -ForegroundColor Red
  exit 1
}

# --- 5) Dogrula ------------------------------------------------------------
Write-Host "`n5/5 Canli sayfa kontrol ediliyor..." -ForegroundColor Cyan
Start-Sleep -Seconds 10
try {
  $html = (Invoke-WebRequest -Uri "https://cortexplus.app/fiyatlandirma" -UseBasicParsing -TimeoutSec 30).Content
  if ($html -match "Satin al" -or $html -match "Sat&#x131;n al") {
    Write-Host "OK  Buton 'Satin al' oldu - PayTR tanimli." -ForegroundColor Green
  } elseif ($html -match "Yak&#x131;nda" -or $html -match "Yakinda") {
    Write-Host "UYARI: Buton hala 'Yakinda'." -ForegroundColor Yellow
    Write-Host "  Dagitim daha bitmemis olabilir; 1-2 dakika sonra sayfayi yenileyin." -ForegroundColor Yellow
  }
} catch {
  Write-Host "Sayfa okunamadi; tarayicidan kontrol edin." -ForegroundColor Yellow
}

Write-Host "`n--- SIRADAKI ADIMLAR ---" -ForegroundColor Cyan
Write-Host "1) PayTR panel: Destek & Kurulum -> Ayarlar -> Bildirim URL Ayarlari" -ForegroundColor White
Write-Host "   https://cortexplus.app/api/payments/paytr/callback" -ForegroundColor Yellow
Write-Host "   Bu adres olmadan para cekilir ama KREDI YUKLENMEZ." -ForegroundColor Yellow
Write-Host ""
Write-Host "2) Su an TEST kipindesiniz: akis bastan sona calisir," -ForegroundColor White
Write-Host "   krediler yuklenir, ama GERCEK PARA CEKILMEZ." -ForegroundColor White
Write-Host "   Kontrol: https://cortexplus.app/admin/sistem" -ForegroundColor DarkGray
Write-Host ""
Write-Host "3) Test karti ile akisi denedikten SONRA canliya gecis:" -ForegroundColor White
Write-Host "   npx vercel env rm PAYTR_TEST_MODE production --yes" -ForegroundColor Yellow
Write-Host "   echo 0 | npx vercel env add PAYTR_TEST_MODE production" -ForegroundColor Yellow
Write-Host "   npx vercel deploy --prod --yes" -ForegroundColor Yellow
Write-Host ""
Write-Host "Ayrinti: docs/delivery/PAYTR-KURULUM.md" -ForegroundColor DarkGray
