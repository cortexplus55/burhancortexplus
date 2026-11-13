# Cortex Plus tasarım sistemi (v1)

Kaynaklar:

- **Kural kitabı:** `.claude/skills/cortex-plus-design-system/SKILL.md`. Ölçü, oran, hareket ve bileşen anatomisi oradan gelir.
- **Değerler:** `src/styles/tokens.css` (`--cx-*`). Yüzey ve yazı sınıfları `src/styles/cx-system.css` dosyasında, Tailwind adları `tailwind.config.ts` içinde (`bg-cx-bg-1`, `rounded-cx-l`, `shadow-cx-popover` …).
- **Öncelik:** ürün sahibinin kararları > depodaki bugünkü sistem > skill.

Bileşende ham hex ya da ham px yazılmaz; token yoksa önce `tokens.css`'e eklenir.

## Depo kararları (13 Kasım 2026, skill'in önündedir)

| # | Karar | Uygulama |
|---|---|---|
| 1 | Misafir ve pazarlama sayfaları 11 Kasım paletinde kalır; o sayfalarda skill'den yalnız ölçü, köşe, boşluk ve hareket alınır | `tokens.css` sonundaki "Misafir sayfaları" blokları, `.cinematic-marketing`, `.lp` ve `.cortex-premium-auth` köklü sayfalarda eski `--c-*` değerlerini geri koyar. Pazarlama paletinin kendisi (`landing.css`, `home-cinema.css` …) zaten `--c-*` okumuyor. `audience-tabs.tsx` metinli bölümlü seçici olacak (Faz 3), rengi pazarlama paletinden |
| 2 | ~~Faz 4.1 = `/` ve `/ogretmen`; §7 "Ana ekran" kalıbı uygulanmaz~~ | Madde 8 ile değişti |
| 3 | Açık tema kalır | `--cx-*` açık değerleri koyu merdivenin tersi **[varsayım]**, kontrastlar aşağıda |
| 4 | Figtree ve JetBrains Mono kalır, Jersey 10 kalkar, Caveat kalır; Newsreader ders ekranı fazında | `--cx-font-sans` = Figtree, `--cx-font-mono` = JetBrains Mono; `--cx-font-reading` şimdilik sans |
| 5 | Okunurluk tabanı (6 Kasım): en küçük yazı 11 px, başlık satır aralığı en az 1,15, telefonda dokunma en az 44 px | `meta-xs` 9 → 11 px; `heading-*`, `display-l`, `reading-title` satır aralığı 1,15 |
| 6 | Yeni metin eklenmez | Skill'in metin isteyen yerleri her fazın raporunda listelenir; büyük harf yalnız CSS ile |
| 7 | Köprü Faz 1'de çevrildi, palet kapısıyla | `--c-*` → `--cx-*` |
| 9 | **Palet: B (sıcak siyah)**, 13 Kasım 2026 | Koyu temada zemin merdiveni ve nötr metin tonları 11 Kasım'ın sıcak siyahı; marka, vurgu, odak ve anlam renkleri skill'den. Skill §2'nin arduvaz merdiveni (A) kaldırıldı |
| 8 | Ana ekran (`/ogretmen`) beş parça; altı fazlık plan bekler, önce bu ekran | Aşağıdaki "Ana ekran" bölümü; ayrıntı SKILL.md madde 8 |

## Kabuk (13 Kasım 2026)

Ana ekranda onaylanan üst çubuk ve logo, giriş yapılmış bütün öğrenci sayfalarında aynı (`ParitySorShell`, kurallar
`src/styles/cx-shell.css`). Kapsam dışı: misafir/pazarlama, yönetim paneli, hukuki sayfalar.

| Kabuk | Üst çubuk | Alt çubuk (<768 px) | Örnek |
|---|---|---|---|
| `app` | var | var | ana ekran, sınavlar listesi, stüdyo, ayarlar |
| `focus`, `exam` | var (eski "Geri"li çubuk kalktı) | var | hazırlık sayfası, hazırlık sohbeti, müfredat |
| `session` | yok | yok | ders, test, podcast oturumu |
| `session` + `closeHref` | yok; sağ üstte 40 px cam kapat | yok | fiyat (`/pay`, `AppShell focus`) |

- Çubukta yalnız: logo, üç sekme + "Daha fazla", cam "Başla", ücretsizde "Plus'a geç", seri, avatar. Kurucu çipi, yıldız
  düğmesi ve ayarlar bağlantısı yok; yıldızlar "Daha fazla"dan (`?dialog=stars`).
- Hazırlık sayfasının simgeleri (sohbet, kamera, +) üst çubuğa taşınmıyor; sayfanın başında duruyor. Yolun sekmeleri ekranın
  üstüne yapışır.
- Sınav listesindeki geri sayım şeridi çubuğun parçası değil, altında durur.
- Telefon alt çubuğu [varsayım]: `bg-1` hap tepsi, 4 sekme, öğe ≥48 px, güvenli alan payı.

## Ana ekran (`/ogretmen`, 13 Kasım 2026)

Hazırlığı olan öğrencinin boş ana ekranı beş parçadır; sohbet başlayınca bugünkü sohbet görünümü sürer, hiç hazırlığı olmayan hesapta boş durum (ilk adım kartları) bugünkü hâlindedir.

| Parça | Ölçü | Dosya |
|---|---|---|
| Üst çubuk (≥768 px) | 96 yükseklik, 24 dolgu, `1fr auto 1fr`, merkezler y = 48; üç sekme + "Daha fazla"; cam "Başla", seri, avatar; ücretsizde "Plus'a geç" XS altın hap | `sor-shell.tsx` (`home`), `home-cockpit.css` |
| Logo | `logo-mark-trim.png` 24 px + "Cortex Plus" Figtree 600 20 px `--cx-text-reading`, arası 8 | aynı |
| Sınav şeridi | 73 geniş, kutu 65×80, en çok 4 görünür, 28 px oklar (tıklama 44), seçili cam hap kayar, geride nokta 4 px | `home-cockpit.tsx` (`ExamStrip`) |
| Konu halkası | en çok `min(510px, 100vh − 150px)`; ≤12 konu yay yay, fazlası kesintisiz; seçili yay `bg-4` + yapışık 1.5 px beyaz çerçeve; kaydırıcı "i / N" metnin sağında, grubun en sağ ucunda; 52 px "Devam et". ≥1100 px'te şerit solda 24 px, halka + metin grubu sayfanın yatay merkezinde | `TopicRing`, `TopicSlider` |
| Metin bloğu | en çok 458; meta-l → 6 → heading-l → 40 → mono bağlantı → 40 → 44 px cam "Ayrıntılar" | `CockpitText` |
| İnce yazma çubuğu | 344×60, alttan 28; öğretmen (brand), ok (tepsi 4×2, öğe 105×84, köşe 32), alan (geniş kutuyu açar), mikrofon (dikte: geniş kutuyu açıp sesi yazıya çevirir; mikrofon simgesi her yerde dikte, sesli öğretmen ses dalgası simgesiyle yalnız geniş kutuda) | `chat-panel.tsx` (`homeCockpit`, `homeTools`), `HomeToolsTray` |

Veri: `loadHomeCockpit` (`src/lib/learning/home-cockpit.ts`) devam kartıyla aynı kaynaktan okur (hazırlık, yol adımları, konular; üç sorgu). "Geride" = yolda günü geçmiş ama bitmemiş adım (`pathIsBehind`, yolun kendi tarih kuralıyla). Sıra ve açılış seçimi `home-cockpit-model.ts`'te.

Telefon (<768 px) **[varsayım]**: logo sol üstte, seri ve "Daha fazla" sağda; şerit yatay, açılışta seçili sınavdan başlar (geçmiş sola kaydırınca); halka üstte, metin altında; ince çubuk alt sekme çubuğunun üstünde. Tablette (768–1099 px) sekme ve "Daha fazla" yazısı gizli (simge kalır), metin halkanın altında.

Ekrana özel ölçüler `tokens.css`'te (`--cx-topbar-h`, `--cx-strip-*`, `--cx-ring-*`, `--cx-slim-*`, `--cx-tray-item-*`, `--cx-cockpit-text-w`, `--cx-logo-h`, `--cx-dot`, `--cx-space-6`, `--cx-radius-inner`).

## Token özeti

### Zemin merdiveni

| Token | Koyu (B, sıcak siyah) | Açık **[varsayım]** | Kullanım |
|---|---|---|---|
| `--cx-bg-0` | `#0B0907` | `#FFFFFF` | sayfa |
| `--cx-bg-1` | `#15110D` | `#F1F4F9` | kart, gezinme tepsisi |
| `--cx-bg-2` | `#1E1813` | `#E6EBF2` | kart içi grup, giriş alanı, zayıf düğme |
| `--cx-bg-3` | `#29211A` | `#D9E0EA` | tepsideki etkin hap, yükseltilmiş rozet |
| `--cx-bg-4` | `#3D3229` | `#B7C2D1` | güçlü kenarlık |
| `--cx-dim` | siyah %80 | siyah %40 | pencere arkası |

Koyu nötr metin tonları da aynı sıcaklıktadır: primary `#F7F1E8`, reading `#EDE4D6`, secondary `#B9ADA0`, tertiary `#A09384`, disabled `#7A6E62`.

### Renk rolleri

| Rol | Token | Ne zaman |
|---|---|---|
| Tek ana eylem | `.cx-brand` (`--cx-gradient-brand`), düz renk `--cx-brand-strong` | Ekranda bir tane |
| İkincil eylem | `.cx-glass` | Simge düğmeleri, etkin gezinme hapı, sohbet formu |
| Üçüncül eylem | `.cx-weak` | "Farklı anlat", "İki şık arasında kaldım" (asla `brand`) |
| Bağlantı, marka rozeti metni | `--cx-text-brand` | |
| Plus, seri, yıldız | `--cx-highlight`, `--cx-text-highlight`, `--cx-highlight-weak` | Yalnız bunlar |
| Doğru / uyarı / yanlış | `--cx-success`, `--cx-warning`, `--cx-danger` (+ `-weak`) | |
| Odak halkası | `--cx-focus` | Markadan bilerek farklı (koyu: camgöbeği) |

### Köprü (eski adlar)

| Eski | Yeni |
|---|---|
| `--c-bg`, `--c-surface-1/2/3` | `--cx-bg-0/1/2/3` |
| `--c-border`, `--c-border-strong` | `--cx-border`, `--cx-border-2` |
| `--c-text`, `--c-text-muted`, `--c-text-subtle` | `--cx-text-primary`, `--cx-text-secondary`, `--cx-text-tertiary` |
| `--c-action` (eylem mavisi) | `--cx-brand-strong` |
| `--c-brand` (altın) | `--cx-highlight` |
| `--c-ai`, `--c-info` | `--cx-text-brand` |
| `--c-success/danger/warning` (+ `-soft`) | `--cx-success/danger/warning` (+ `-weak`) |
| `--c-focus` | `--cx-focus` |
| `--glass-bg`, `--glass-inset` | `--cx-glass-background`, `--cx-glass-bevel` |

Eski yerel `--cx-*` adları 13 Kasım'da yeniden adlandırıldı: `advantage.css` → `--adv-*`, `cortex-premium.css` ve giriş/kayıt sayfaları → `--cpx-*`.

### Yazı rolleri

`.cx-t-<rol>` sınıfı ya da `font: var(--cx-t-<rol>)`. Başlıklar `text-wrap: balance`; `meta-*` büyük harfli eşaralıklı (kökte `lang="tr"`: "iyi" → "İYİ"); `num-*` sabit genişlikli rakam ve imza gradyanı.

| Rol | Değer |
|---|---|
| display-l | 700 · 56 / 1,15 · −0,03em |
| heading-xl / l / s | 600 · 40 / 36 / 28 · 1,15 · −0,02em |
| title-xl / l / m / s | 600 · 22 / 20 / 18 / 16 · 1,25 · −0,02em |
| body-16 / 14 / 12 | 400 · 1,4 |
| label-15 / 13 / 11 | 500 · 1,25 · +0,01em |
| button-l / s | 600 · 16 / 13 · 1 |
| meta-xl / l / m / s / xs | 500 mono · 20 / 15 / 13 / 11 / 11 |
| num-xl / l / m | 700 · 75 / 44 / 26 · 1 |
| reading-title | 500 · 36 / 1,15 (okuma yazısı ders fazında) |
| reading-lead | 400 · 20 / 1,4 |

### Ölçü, köşe, hareket

- **Boşluk** (`--cx-space-N`, N = px): 2, 4, 8, 12, 14, 16, 18, 20, 24, 32, 40, 48. Sayfa yan boşluğu `--cx-gutter`: telefonda 16, 768 px'ten itibaren 24.
- **Köşe:** `--cx-radius-s/m/l/xl` 10 / 16 / 24 / 32, sohbet kutusu 36, hap `--cx-radius-max`. İç içe kural: dış köşe = iç köşe + dolgu.
- **Kontrol yüksekliği:** L 52, M 44, S 40, XS 36, Mini 32; simge düğmesi 40 / 36 / 28. Telefonda dokunma alanı en az 44 (`--cx-tap-min`), alt sekme 48 (`--cx-tap-mobile`).
- **İçerik genişliği:** okuma 768, sohbet 800, liste 816, fiyat 904, kabuk 1280, pencere 480.
- **Hareket:** renk 160 ms, ölçek 220 ms (`--cx-scale-hover` 1,03), başlık tonu 320 ms, panel 380 ms, şık sonucu 520 ms, basış 75 / 430 ms.
- **Hareket azaltma:** `prefers-reduced-motion: reduce` altında ölçek ve kayma değişkenleri 1 ve 0 olur, iskelet animasyonu durur; renk ve opaklık geçişi kalır.

### Yüzey sınıfları (`cx-system.css`)

`.cx-glass`, `.cx-brand`, `.cx-weak`, `.cx-surface-0/1/2` (çocukların zayıf dolgusunu bir basamak yukarı taşır), `.cx-popover` (`data-starting-style` ve `data-ending-style` ile açılıp kapanır), `.cx-skeleton`, `.cx-fade-top/bottom` (sabit çubuk altında 64 px geçiş), `.cx-focusable` (1 px halka, 3 px boşluk).

## Kontrast (WCAG)

Gövde metni en az 4,5:1. `text-disabled` yalnız pasif öğe ve süs içindir. ⚠ = 4,5 altı.

### Koyu (B, sıcak siyah)

| Metin | bg-0 | bg-1 | bg-2 | bg-3 |
|---|---|---|---|---|
| primary `#F7F1E8` | 17,70 | 16,73 | 15,65 | 14,10 |
| reading `#EDE4D6` | 15,78 | 14,91 | 13,95 | 12,56 |
| secondary `#B9ADA0` | 9,04 | 8,54 | 7,99 | 7,20 |
| tertiary `#A09384` | 6,63 | 6,26 | 5,86 | 5,28 |
| disabled `#7A6E62` | 4,01 ⚠ | 3,79 ⚠ | 3,54 ⚠ | 3,19 ⚠ |
| text-brand `#A5B4FC` | 9,97 | 9,42 | 8,81 | 7,94 |
| text-highlight `#FBBF24` | 11,91 | 11,25 | 10,52 | 9,48 |
| success `#34D399` | 10,34 | 9,77 | 9,14 | 8,23 |
| warning `#FB923C` | 8,78 | 8,30 | 7,76 | 6,99 |
| danger `#F87171` | 7,19 | 6,79 | 6,35 | 5,72 |

Çiftler: text-brand / brand-weak 8,02 · text-highlight / highlight-weak 8,30 · success / weak 7,98 · warning / weak 6,55 · danger / weak 5,84 · beyaz / brand-strong 6,29 · koyu / highlight 9,26 · odak / bg-0 11,00.

### Açık **[varsayım]**

| Metin | bg-0 | bg-1 | bg-2 | bg-3 |
|---|---|---|---|---|
| primary `#0B1220` | 18,72 | 16,98 | 15,63 | 14,09 |
| reading `#1E293B` | 14,63 | 13,27 | 12,21 | 11,01 |
| secondary `#475569` | 7,58 | 6,87 | 6,33 | 5,70 |
| tertiary `#4F5B6D` | 6,89 | 6,25 | 5,75 | 5,18 |
| disabled `#737E90` | 4,10 ⚠ | 3,72 ⚠ | 3,43 ⚠ | 3,09 ⚠ |
| text-brand `#4338CA` | 7,90 | 7,17 | 6,60 | 5,95 |
| text-highlight `#92400E` | 7,09 | 6,43 | 5,92 | 5,33 |
| success `#047857` | 5,48 | 4,97 | 4,58 | 4,13 ⚠ |
| warning `#B4410A` | 5,67 | 5,15 | 4,74 | 4,27 ⚠ |
| danger `#B91C1C` | 6,47 | 5,87 | 5,40 | 4,87 |

Çiftler: text-brand / brand-weak 6,41 · text-highlight / highlight-weak 6,37 · success / weak 4,84 · warning / weak 4,95 · danger / weak 5,30 · beyaz / brand-strong 6,29 · koyu / highlight 9,21 · odak `#0E7490` / bg-0 5,36.

Açık temada anlam renkleri `bg-3` üzerinde metin olarak kullanılmaz; orada `-weak` zemini kullanılır.

## Kapsam

Kapsam dışı: yönetim paneli (`/admin`, kendi `--adm-*` tokenları), e-posta şablonları, hukuki sayfalar (misafir paletinde kalır). Eski `/tasarim` sayfası ve `components/ui/` bileşenleri şimdilik duruyor.

## Ham değer sayımı (bileşen tarafı, `tokens.css` hariç)

| | 13 Kasım (Faz 0) | Faz 1 sonu |
|---|---|---|
| CSS ham hex | 1.711 | 1.711 |
| CSS ham px (0, 1, 2 px hariç) | 2.470 | 2.470 |
| TS/TSX ham hex | 335 | 335 |
| TSX Tailwind `[Npx]` | 80 | 80 |

Faz 1 yalnız katmanı ekledi; sayılar ekranlar dönüştükçe (Faz 4) düşer.
