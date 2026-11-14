# Faz 12 · Kapanış (12A + 12B + 12C)

Yeni özellik yok; eksik durumlar, hata sayfaları, erişilebilirlik ve performans ölçümü, temizlik.

## 1. Özet
- **12A durumlar:** 404 ve hata ekranları ortak `StatusScreen` ile: gerçek logo dosyası, istenen metinler, tek brand
  eylem; sarı "404" ve üç boyutlu görsel kalktı (`not-found.css` 0 referansla silindi). `error.tsx` ve `global-error.tsx`
  "Bir şeyler ters gitti", "Yeniden dene" + zayıf "Ana sayfaya dön"; teknik ayrıntı yok, yalnız kısa hata kodu.
  `global-error` kendi `<html lang="tr">`'si ve token değerleriyle (altın yok).
- **Hareket azaltma:** 12 rotada (misafir sayfaları ve veritabanısız fikstürler) hareket azaltma açıkken boşta sonsuz
  animasyon 0 (`hareket-azaltma.spec.ts`). İlk ölçümdeki 14 "ihlal" testin hatasıydı: `test.use({ reducedMotion })`
  bu depoda uygulanmıyor; `page.emulateMedia` ile ölçüldü.
- **12B erişilebilirlik:** tam axe taraması (`scripts/axe-scan.mjs`, WCAG 2.1 A + AA, 70 ekran × 3 genişlik × misafir,
  ücretsiz, Plus, Sigma, kurucu fikstürü). İlk tarama 179 serious / critical düğüm buldu; dördü de düzeltildi:

| Bulgu | Etki | Ekran | Düzeltme |
|---|---|---|---|
| `aria-required-children` | critical | ana ekran (15), hücre laboratuvarı (3) | sınav şeridinde "Yeni sınav hazırlığı" bağlantısı sekme listesinin dışında (aynı kaydırma kabında, görünüm aynı); organel seçimi düğme grubu (`aria-pressed`) |
| `nested-interactive` | serious | hücre laboratuvarı (3) | yuva düğmeleri olan çizim `img` değil, etiketli grup |
| `aria-progressbar-name` | serious | kullanım limitleri (3) | ilerleme çubuklarına satırın adı |
| `color-contrast` | serious | 33 ekran, 152 düğüm | metin bağlantıları `--cs-primary` (2,98:1) yerine `--cx-text-brand`; sınav şeridi sayıları ve takvimin ay dışı günleri `--cx-text-tertiary`; periyodik tablo atom numarası `--cx-text-secondary` (kategori rengi kenarlıkta ve lejantta) |

Dokunulan rotalar (bayrak kapalıyken de görünen değişiklik, görsel taban bilinçli güncellendi): `/ogretmen` (şerit
sayıları), `/ilerleme`, `/ayarlar`, `/krediler`, `/pay`, profil paneli (metin bağlantıları), `/takvimim`,
`/araclar/periyodik`, `/araclar/hucre`, 404.

## 4. Ölçümler

**Performans** (yerel üretim derlemesi, telefon kipi, CPU 4×, Hızlı 4G; 5 koşu medyanı, sorunlu dört rota düzeltmeden
sonra 9 koşu; `perf/faz12-son.json`). Taban `taban-1288c25`:

| Rota | LCP | CLS | Engelleme | JS + CSS |
|---|---|---|---|---|
| ana-sayfa | 1372 → 1352 ms | 0 → 0 | 527 → 369 ms | 537 → 450 KB |
| giris | 1296 → 1268 ms | 0 → 0 | 270 → 244 ms | 504 → 519 KB |
| kayit | 1364 → 1328 ms | 0,019 → 0,019 | 274 → 247 ms | 489 → 499 KB |
| 404 | 508 → 1112 ms ↑ | 0 → 0 | 210 → 186 ms | 393 → 403 KB |
| ogretmen | 1836 → 1584 ms | 0 → 0 | 458 → 438 ms | 735 → 800 KB |
| hazirlik | 2220 → 2108 ms | 0 → 0 | 484 → 473 ms | 935 → 941 KB |
| ders | 1600 → 1608 ms | 0 → 0 | 491 → 538 ms | 946 → 952 KB |
| konu-testi | 1608 → 1600 ms | 0 → 0 | 515 → 539 ms | 946 → 952 KB |
| kutuphane | 1584 → 1464 ms | 0 → 0 | 322 → 273 ms | 507 → 528 KB |
| araclar | 1652 → 1496 ms | 0 → 0 | 324 → 238 ms | 529 → 553 KB |
| pay | 2292 → 1536 ms | 0 → 0 | 402 → 311 ms | 550 → 551 KB |

İlk ölçümde dört aşım vardı; üçü düzeltildi:
- **giriş ve kayıt engelleme süresi (+%54, +%39):** Faz 7'de bayrak okumak için sayfalar dinamik olmuştu; sunucuda tam
  çizilen form tarayıcıda daha uzun hidrasyon istiyordu. Sayfalar yeniden durağan (`revalidate = 60`, bayrak çerezsiz
  okunur: `uiV2Static`); yeni görünüm yerelde `/e2e/giris?ui=v2` fikstüründe sınanır.
- **hazırlık CLS 0,063:** üst çubuk yuvası yeni kabukta olmadığı hâlde araç çubuğu sunucuda "taşınacak" diye gizleniyor,
  hidrasyondan sonra yerinde belirip yol kartını ~60 px itiyordu. Artık sunucuda da görünür; CLS 0.
- **404 LCP (kabul edilen sapma, karar Burhan'da):** sayfanın kendi içeriği 320 ms'de çiziliyor (eski 404: 508 ms).
  Ölçüdeki 1112 ms ilk ziyarette çıkan çerez bandının metni: büyük "404" çizimi kalkınca sayfadaki en büyük öğe bant
  oldu. Çerezi kabul etmiş ziyaretçide LCP 320 ms.

**Tasarım denetimi** (`design:audit`, 203 ekran, bayraklar kapalı): kontrast 152 → 0, küçük hedef 1014 → 1012, öbür
kurallar aynı; çıta güncellendi. Kalan küçük hedeflerin 741'i periyodik tablo hücresi (bayrak açıkken 40 px),
çoklu brand 38 ve küçük yazı 360 eski görünümün sayıları: bayraklar açılıp 7 gün sonra eski yollar silinince sıfırlanır.

**Görsel taban:** bayraklar kapalıyken 203/203; kontrast düzeltmeleri karşılaştırma toleransında kaldı; yeni taban
alındı (manifest `BASELINE_SHA de54e951`).

**Uçtan uca:** 289 test (chromium). Yerel üretim derlemesine karşı 286 geçti, 1 atlandı, 2 düştü: `donusum.spec.ts`
"misafirin kendi dosyası" (375 ve 360 px). Neden mevcut: kök düzendeki `consent-evidence.ts` modül yüklenirken zod
şeması kuruyor; zod 4 `Function("")` ile yoklama yapıyor ve rapor kipindeki CSP `/api/csp-report`'a rapor
gönderiyor; test bunu "sunucuya giden istek" sayıyor. CI geliştirme sunucusunda koşuyor (CSP `unsafe-eval` içeriyor),
orada geçiyor. Canlıda engelleme yok, her sayfada bir rapor isteği gürültüsü: "Sonraki karar".

## 6. Promptan ayrılan yerler
- Durum matrisi (her rota × boş / yükleniyor / hata / çevrimdışı) baştan taranmadı; ortak `EmptyState` bugün de var,
  `ErrorState` olarak `StatusScreen` eklendi. Çevrimdışı: PWA / service worker yok, yeni eklenmedi.
- 12 kritik akışın klavye denemesi: bu turda eklenen e2e'ler (giriş Enter, yükseltme penceresi Tab döngüsü ve Esc,
  stüdyo kartı, büyüme şeridi kapatma) ve var olan klavye e2e'leri; düello kurulumu ve Paylaş sayfası park.
- Bayrak temizliği (eski yolların silinmesi) OTONOM §7 gereği bayraklar canlıda 7 gün açık kaldıktan sonra.
