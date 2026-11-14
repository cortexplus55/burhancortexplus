# Faz 0 · Envanter, test hesapları, görsel taban, denetim, performans tabanı

## 1. Özet
- Envanter belgeleri 00–07 hazır.
- 8 sessiz test hesabı açıldı, Kurucu fikstürle ölçülüyor.
- 203 görüntülük görsel taban yerelde; git'te yalnız manifest var.
- Denetim betiği ve çıtası hazır (203 ekran; iki koşuda aynı sayılar).
- Üç sürümün performans tabanı alındı.
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
  - `perf-measure.mjs`, `perf-compare.mjs`, `perf-baseline.mjs`;
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

**2.9 performans:** aşağıda; 9 koşulu sonuçla doldurulacak.

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
- **Performans gürültüsü:** 5 koşuyla aynı sürümün iki ölçümü 11 rotanın 4'ünde %10'dan fazla ayrıştı (engelleme süresi
  ve bir LCP). 9 koşuyla yeniden ölçülüyor.
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
