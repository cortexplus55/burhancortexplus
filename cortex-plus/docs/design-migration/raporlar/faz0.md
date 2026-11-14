# Faz 0 · Envanter, test hesapları, görsel taban, denetim, performans tabanı

## 1. Özet
- Envanter belgeleri 00–07 hazır.
- 8 sessiz test hesabı açıldı, Kurucu fikstürle ölçülüyor.
- 203 görüntülük görsel taban yerelde; git'te yalnız manifest var.
- Denetim betiği ve çıtası hazır (203 ekran; iki koşuda aynı sayılar).
- Üç sürümün performans tabanı alındı (9 koşu); eski tabana göre üç aşım Faz 1–2'den (12B'de).
- Üretim kodunda tek değişiklik: `Button`'a eklenen `data-variant` niteliği. Paket dosyaları değişmedi.

## 2. PR
Bu PR (açıklama = bu rapor). Önizleme: Vercel önizleme yorumu.

## 3. Değişen dosyalar
- `src/components/ui/button.tsx`: +18; görsel çıktı aynı, denetim için `data-variant`.
- `scripts/`:
  - `seed-e2e-users.mjs`, `e2e-login.mjs`;
  - `design/*`: envanter üreticileri, `measure-screens.mjs`;
  - `design-audit.mjs`;
  - `visual-baseline.mjs`, `visual-reproduce.mjs`;
  - `perf-measure.mjs`, `perf-compare.mjs` (ANA-PROMPT §3.6 eşikleri), `perf-baseline.mjs`;
  - `smoke-prod.mjs`.
- `tests/visual/`: `visual.config.ts`, `screens.visual.ts`, `global-setup.ts`, `route-matrix.json`, `baseline-manifest.json`.
- `docs/design-migration/`:
  - 00–07, `ANA-PROMPT.md`, `OTONOM-PROMPT.md`, `ILERLEME.md`;
  - `raporlar/faz0.md`, `raporlar/faz3-inceleme.md`;
  - `audit-baseline.json`, `audit/2026-11-14.json`, `perf/*.json`, `data/*`.
- `package.json`: yalnız betik satırları.
- `.gitignore`: `tests/.auth/`, `tests/visual/__screenshots__/`.

`git diff --stat origin/main...HEAD`:
- 47 dosya.
- Üretim klasörlerinden yalnız `src/components/ui/button.tsx | 18 +`.
- `package-lock.json` değişmedi.

## 4. Ölçümler

**1.3: 12 ekran, gerçek oturum (`e2e-plus`).** Her hücrede: taşma · küçük hedef · marka · konsol hatası.

| Ekran | 768 px (hedef < 40) | 375 px (hedef < 44) |
|---|---|---|
| /deneme-sinavlari | 0 · 1 · 1 · 0 | 0 · 2 · 1 · 0 |
| /araclar | 0 · 0 · 0 · 0 | 0 · 4 · 0 · 0 |
| /dokumanlar | 0 · 0 · 1 · 0 | 0 · 0 · 1 · 0 |
| /yanlislarim | 0 · 0 · 1 · 0 | 0 · 0 · 1 · 0 |
| /siniflar | 0 · 0 · 1 · 0 | 0 · 2 · 1 · 0 |
| /ilerleme | 0 · 0 · 1 · 0 | 0 · 0 · 1 · 0 |
| /takvimim | 0 · 0 · 0 · 0 | 0 · 0 · 0 · 0 |
| /krediler | 0 · 1 · 2 · 0 | 0 · 1 · 2 · 0 |
| /davet | 0 · 0 · 1 · 0 | 0 · 0 · 1 · 0 |
| /sohbetler | 0 · 0 · 2 · 0 | 0 · 0 · 2 · 0 |
| /profil | 0 · 0 · 0 · 0 | 0 · 1 · 0 · 0 |
| /ayarlar | 0 · 0 · 1 · 0 | 0 · 6 · 1 · 0 |

24/24 ekran 200 döndü ve kabuk var. En küçük yazı 11 px. Ayrıntı: `06 §11`, `data/onizleme-12-ekran.json`.

**2.7 denetim (çıta = `audit-baseline.json`):**
- 203 ekran: 42 rota × 3 genişlik `e2e-plus` ile, plan farkı olan 6 rota ve profil paneli × 3 plan, kurucu fikstürü.
- Ölçülemeyen ekran yok.

| Kural | İhlal |
|---|---|
| Yatay taşma | 0 |
| Küçük hedef (< 40; 768 altında < 44) | 1.036 (830'u periyodik tablo) |
| Küçük yazı (< 11 px) | 360 |
| Birden çok marka düğmesi | 38 ekran (ogretmen, sohbetler, pay, siniflar, krediler, profil paneli) |
| Etiketsiz ikon düğmesi | 0 |
| Kontrast (axe) | 152 düğüm |

En çok ihlal eden 10:
- e2e-plus araclar-periyodik 830
- e2e-free-fresh pay 46
- e2e-free-exhausted pay 46
- e2e-plus studio-quiz 36
- e2e-plus pay 28
- e2e-sigma pay 28
- e2e-plus studio-podcast 27
- kurucu ogretmen 26
- e2e-plus studio-flashcard 24
- e2e-plus studio-yazili 24

İkinci koşu her kuralda birebir aynı sayıyı verdi; çıta kararlı.

**2.6 görsel taban:**
- 203 görüntü, 27,15 MB, `BASELINE_SHA 151da31f`. Yalnız yerelde; git'te `baseline-manifest.json`.
- Normal karşılaştırma 203/203 geçti.
- Yeniden üretim tarifi temiz worktree'de uygulandı:
  - algısal karşılaştırma: 203/203 geçti;
  - bayt karşılaştırması: 157/203 aynı. Neden 00'da: halka ve konik geçişlerdeki kenar yumuşatması.
- Tarifin ilk uygulamasında 6 gerçek kararsızlık nedeni bulunup düzeltildi (00, "Yolda bulunan").

**2.9 performans** (telefon 375 × 812, CPU 4×, hızlı 4G, ısınma + 9 koşu medyanı; `perf/*.json`):

- Gürültü: aynı sürümün iki ölçümü (`faz0-492e206` ve `-tekrar`) 11 rotanın 10'unda her ölçüde %10 içinde. 5 koşuda 4
  rota aşıyordu, koşu sayısı 9'a çıkarıldı. Kalan tek aşım ana sayfanın engelleme süresi (338 / 496 ms): sayfanın
  sinematik açılışı koşudan koşuya farklı uzun görev üretiyor. Ana sayfaya dokunan PR'da bu ölçü iki koşunun büyüğüyle
  karşılaştırılır.
- Eşikler ANA-PROMPT §3.6 (`perf:compare` aynı eşiklerle): LCP +%15, CLS +0,02 (tavan 0,1), engelleme +%20,
  JS + CSS +%10.

`1288c254` (eski) → güncel main (`492e206e`):

| Rota | LCP | CLS | Engelleme | JS | CSS | JS + CSS |
|---|---|---|---|---|---|---|
| ana-sayfa | 1372 ms → 1380 ms | 0.000 → 0.000 | 527 ms → 338 ms | 472 KB → 477 KB | 65 KB → 70 KB | 537 KB → 546 KB |
| giris | 1296 ms → 1300 ms | 0.000 → 0.000 | 270 ms → 265 ms | 439 KB → 445 KB | 65 KB → 70 KB | 504 KB → 515 KB |
| kayit | 1364 ms → 1372 ms | 0.019 → 0.019 | 274 ms → 277 ms | 424 KB → 428 KB | 65 KB → 70 KB | 489 KB → 498 KB |
| 404 | 508 ms → 592 ms ↑ | 0.000 → 0.000 | 210 ms → 216 ms | 335 KB → 339 KB | 59 KB → 63 KB | 393 KB → 402 KB |
| ogretmen | 1836 ms → 1632 ms | 0.000 → 0.000 | 458 ms → 466 ms | 628 KB → 691 KB | 107 KB → 119 KB | 735 KB → 810 KB ↑ |
| hazirlik | 2220 ms → 2120 ms | 0.000 → 0.063 ↑ | 484 ms → 459 ms | 818 KB → 826 KB | 116 KB → 129 KB | 935 KB → 956 KB |
| ders | 1600 ms → 1656 ms | 0.000 → 0.000 | 491 ms → 529 ms | 818 KB → 826 KB | 128 KB → 137 KB | 946 KB → 963 KB |
| konu-testi | 1608 ms → 1676 ms | 0.000 → 0.000 | 515 ms → 506 ms | 818 KB → 826 KB | 128 KB → 137 KB | 946 KB → 963 KB |
| kutuphane | 1584 ms → 1696 ms | 0.000 → 0.000 | 322 ms → 287 ms | 427 KB → 429 KB | 80 KB → 89 KB | 507 KB → 518 KB |
| araclar | 1652 ms → 1560 ms | 0.000 → 0.000 | 324 ms → 253 ms | 446 KB → 450 KB | 83 KB → 92 KB | 529 KB → 542 KB |
| pay | 2292 ms → 1552 ms | 0.000 → 0.000 | 402 ms → 394 ms | 460 KB → 464 KB | 90 KB → 99 KB | 550 KB → 563 KB |

`b25a9229` (#644 öncesi) → güncel main: eşiği aşan ölçü yok.

| Rota | LCP | CLS | Engelleme | JS | CSS | JS + CSS |
|---|---|---|---|---|---|---|
| ana-sayfa | 1388 ms → 1380 ms | 0.000 → 0.000 | 499 ms → 338 ms | 474 KB → 477 KB | 69 KB → 70 KB | 544 KB → 546 KB |
| giris | 1312 ms → 1300 ms | 0.000 → 0.000 | 274 ms → 265 ms | 441 KB → 445 KB | 70 KB → 70 KB | 511 KB → 515 KB |
| kayit | 1348 ms → 1372 ms | 0.019 → 0.019 | 269 ms → 277 ms | 426 KB → 428 KB | 70 KB → 70 KB | 495 KB → 498 KB |
| 404 | 568 ms → 592 ms | 0.000 → 0.000 | 204 ms → 216 ms | 337 KB → 339 KB | 63 KB → 63 KB | 400 KB → 402 KB |
| ogretmen | 1620 ms → 1632 ms | 0.000 → 0.000 | 454 ms → 466 ms | 690 KB → 691 KB | 115 KB → 119 KB | 805 KB → 810 KB |
| hazirlik | 2168 ms → 2120 ms | 0.063 → 0.063 | 490 ms → 459 ms | 826 KB → 826 KB | 125 KB → 129 KB | 952 KB → 956 KB |
| ders | 1624 ms → 1656 ms | 0.000 → 0.000 | 531 ms → 529 ms | 826 KB → 826 KB | 133 KB → 137 KB | 959 KB → 963 KB |
| konu-testi | 2036 ms → 1676 ms | 0.000 → 0.000 | 497 ms → 506 ms | 826 KB → 826 KB | 133 KB → 137 KB | 959 KB → 963 KB |
| kutuphane | 1604 ms → 1696 ms | 0.000 → 0.000 | 332 ms → 287 ms | 427 KB → 429 KB | 85 KB → 89 KB | 512 KB → 518 KB |
| araclar | 2064 ms → 1560 ms | 0.000 → 0.000 | 307 ms → 253 ms | 448 KB → 450 KB | 88 KB → 92 KB | 536 KB → 542 KB |
| pay | 1592 ms → 1552 ms | 0.000 → 0.000 | 384 ms → 394 ms | 462 KB → 464 KB | 98 KB → 99 KB | 560 KB → 563 KB |

Eski tabana göre üç aşım, üçü de Faz 1–2'den (#643–#646), Faz 0 değişikliği değil (`b25a9229` ile aynı):
- **Hazırlık sayfası CLS 0 → 0,063** (`b25a9229`'da da 0,063). Tavanın (0,1) altında, +0,02 eşiğinin üstünde.
- **`/ogretmen` JS + CSS 735 → 810 KB (+%10,2)**: ana ekran göstergesi (Faz 2).
- **404 LCP 508 → 592 ms**: mutlak 84 ms; `b25a9229`'da da 568 ms.
Üçü 12B'nin (erişilebilirlik ve performans) iş listesinde.

## 5. Test sonuçları
- Tip denetimi: 0 hata.
- Lint: 0 hata; 1 uyarı eskiden beri var.
- Birim: **728/728 dosya, 6.869 test** (referans 728 / 6.869).
- e2e: CI'da (220 referans).
- Görsel: 203/203.
- Denetim: çıta kararlı.
- Production duman testi: 7/7 geçti (`scripts/smoke-prod.mjs`).

## 6. Promptan ayrılan yerler
- **"9 test kullanıcısı":** 8 gerçek hesap + Kurucu fikstürü (ürün sahibinin A kararı). Gerçek bir kurucu rolü, test
  parolası sızarsa yönetim paneli ve kredi sınırsız üretim demekti.
- **Taban görüntüleri git'te değil** (ürün sahibinin 4 numaralı seçimi). Manifest ve tarif 00'da.
- **Telefonda dokunma hedefi 44 px** (ürün sahibinin kararı; prompt 48 diyordu).
- **Birden çok marka sayımı** yalnız `data-variant="brand"` ile değil; buna `.cx-brand` ve hesaplanan marka geçişi ya da
  zemini de eklendi. Sebep: birincil düğmelerin çoğu `Button` bileşenini kullanmıyor, yalnız nitelik sayılsaydı ihlaller
  görünmezdi.
- **Görsel testte iki istemci isteği** (`/api/streak`, okul arama) ağ katmanında sabit yanıtlıdır. Sebep: hız sınırı
  koşudan koşuya farklı yanıt döndürüyordu. Değerler test hesaplarının gerçek değerleri; okullar uydurma "E2E" adlı.

## 7. Yapılandırma değerleri
Değiştirilmedi.

## 8. Desen yok / Sonraki karar
- `/krediler`, `/sohbetler` ve 4 ekran daha: birden çok marka düğmesi (ilgili fazlarda).
- 06 §12: hazırlık sayfasının önceden yüklemesi "Seviye tespiti"ni kendiliğinden erteliyor (ürün kararı).

## 9. Yapılamayanlar ve riskler
- **Bayt düzeyinde deterministik üretim yok;** algısal üretim deterministik. Karşılaştırma algısal eşikle yapılıyor.
- **Performans gürültüsü:** 9 koşuda yalnız ana sayfanın engelleme süresi %10'un üstünde oynuyor (yukarıda).
- **Eski tabana göre üç aşım** (hazırlık CLS, `/ogretmen` bayt, 404 LCP) Faz 1–2'den; 12B'de ele alınacak.
- **Ek bulgular** (`/e2e/kurucu` ve model anahtarı):
  - `src/app/e2e/kurucu/page.tsx:12`: `E2E_FIXTURE !== "1"` ise `notFound()`. Production'da `/e2e/kurucu` ve `?ekran=pay`
    404 döndü.
  - Fikstür yalnız sabit props'la çizilir (`fixture.tsx:1,7,12`): Supabase, `fetch`, çerez ve API yok. Yetki sunucuda
    SQL `is_admin` ile verildiği için hiçbir şey açmaz.
  - Test sunucularında `OPENAI_API_KEY` boş: `visual.config.ts` webServer, `perf-baseline.mjs` `SERVER_ENV`. Kanıtı:
    `no_api_key` günlükleri ve test hesaplarında `ai_usage_events` 0. Kimseye anahtar verilmedi.

## 10. Burhan'ın yapacakları
- CI'da hesaplı e2e için GitHub sırrı `E2E_USERS_JSON` (05).
- Canlı duman testini zorunlu kontrol yapmak (06 §9).
