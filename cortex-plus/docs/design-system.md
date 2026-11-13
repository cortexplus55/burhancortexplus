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
| 7 | Köprü Faz 1'de çevrildi, palet kapısıyla | `--c-*` → `--cx-*`; kapı açıkken B merdiveni `<html data-cx-zemin="sicak">` ile görülür |
| 8 | Ana ekran (`/ogretmen`) beş parça; altı fazlık plan bekler, önce bu ekran | Aşağıdaki "Ana ekran" bölümü; ayrıntı SKILL.md madde 8 |

## Ana ekran (`/ogretmen`, 13 Kasım 2026)

Hazırlığı olan öğrencinin boş ana ekranı beş parçadır; sohbet başlayınca bugünkü sohbet görünümü sürer, hiç hazırlığı olmayan hesapta boş durum (ilk adım kartları) bugünkü hâlindedir.

| Parça | Ölçü | Dosya |
|---|---|---|
| Üst çubuk (≥768 px) | 96 yükseklik, 24 dolgu, `1fr auto 1fr`, merkezler y = 48; üç sekme + "Daha fazla"; cam "Başla", seri, avatar; ücretsizde "Plus'a geç" XS altın hap | `sor-shell.tsx` (`home`), `home-cockpit.css` |
| Logo | `logo-mark-trim.png` 24 px + "Cortex Plus" Figtree 600 20 px `--cx-text-reading`, arası 8 | aynı |
| Sınav şeridi | 73 geniş, kutu 65×80, en çok 4 görünür, 28 px oklar (tıklama 44), seçili cam hap kayar, geride nokta 4 px | `home-cockpit.tsx` (`ExamStrip`) |
| Konu halkası | en çok `min(510px, 100vh − 150px)`; ≤12 konu yay yay, fazlası kesintisiz + işaret; kaydırıcı "i / N"; 52 px "Devam et" | `TopicRing`, `TopicSlider` |
| Metin bloğu | en çok 458; meta-l → 6 → heading-l → 40 → mono bağlantı → 40 → 44 px cam "Ayrıntılar" | `CockpitText` |
| İnce yazma çubuğu | 344×60, alttan 28; öğretmen (brand), ok (tepsi 4×2, öğe 105×84, köşe 32), alan (geniş kutuyu açar), mikrofon (sesli öğretmen) | `chat-panel.tsx` (`homeCockpit`, `homeTools`), `HomeToolsTray` |

Veri: `loadHomeCockpit` (`src/lib/learning/home-cockpit.ts`) devam kartıyla aynı kaynaktan okur (hazırlık, yol adımları, konular; üç sorgu). "Geride" = yolda günü geçmiş ama bitmemiş adım (`pathIsBehind`, yolun kendi tarih kuralıyla). Sıra ve açılış seçimi `home-cockpit-model.ts`'te.

Telefon (<768 px) **[varsayım]**: logo sol üstte, seri ve "Daha fazla" sağda; şerit yatay; halka üstte, metin altında; ince çubuk alt sekme çubuğunun üstünde. Tablette (768–1099 px) sekme ve "Daha fazla" yazısı gizli (simge kalır), metin halkanın altında.

Ekrana özel ölçüler `tokens.css`'te (`--cx-topbar-h`, `--cx-strip-*`, `--cx-ring-*`, `--cx-slim-*`, `--cx-tray-item-*`, `--cx-cockpit-text-w`, `--cx-logo-h`, `--cx-dot`, `--cx-space-6`, `--cx-radius-inner`).

## Token özeti

### Zemin merdiveni

| Token | Koyu (A) | Açık **[varsayım]** | Kullanım |
|---|---|---|---|
| `--cx-bg-0` | `#090A0F` | `#FFFFFF` | sayfa |
| `--cx-bg-1` | `#0F172A` | `#F1F4F9` | kart, gezinme tepsisi |
| `--cx-bg-2` | `#172033` | `#E6EBF2` | kart içi grup, giriş alanı, zayıf düğme |
| `--cx-bg-3` | `#1E293B` | `#D9E0EA` | tepsideki etkin hap, yükseltilmiş rozet |
| `--cx-bg-4` | `#334155` | `#B7C2D1` | güçlü kenarlık |
| `--cx-dim` | siyah %80 | siyah %40 | pencere arkası |

Palet kapısındaki B merdiveni (yalnız koyu): `#0B0907`, `#15110D`, `#1E1813`, `#29211A`, `#3D3229`. Nötr metin tonları da aynı sıcaklıktadır (11 Kasım'ın metin ve soluk metin renkleri). Seçim yapılınca bu satır silinir.

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

### Koyu (A)

| Metin | bg-0 | bg-1 | bg-2 | bg-3 |
|---|---|---|---|---|
| primary `#FFFFFF` | 19,78 | 17,85 | 16,27 | 14,63 |
| reading `#E2E8F0` | 16,04 | 14,48 | 13,20 | 11,87 |
| secondary `#94A3B8` | 7,71 | 6,96 | 6,34 | 5,71 |
| tertiary `#7C8AA0` | 5,65 | 5,10 | 4,65 | 4,18 ⚠ |
| disabled `#64748B` | 4,16 ⚠ | 3,75 ⚠ | 3,42 ⚠ | 3,07 ⚠ |
| text-brand `#A5B4FC` | 9,92 | 8,96 | 8,16 | 7,34 |
| text-highlight `#FBBF24` | 11,85 | 10,69 | 9,75 | 8,76 |
| success `#34D399` | 10,29 | 9,29 | 8,46 | 7,61 |
| warning `#FB923C` | 8,74 | 7,89 | 7,19 | 6,46 |
| danger `#F87171` | 7,15 | 6,45 | 5,88 | 5,29 |

Çiftler: text-brand / brand-weak 8,02 · text-highlight / highlight-weak 8,30 · success / weak 7,98 · warning / weak 6,55 · danger / weak 5,84 · beyaz / brand-strong 6,29 · koyu / highlight 9,21 · odak / bg-0 10,94.

### Koyu (B, palet kapısı)

| Metin | bg-0 | bg-1 | bg-2 | bg-3 |
|---|---|---|---|---|
| primary `#F7F1E8` | 17,70 | 16,73 | 15,65 | 14,10 |
| reading `#EDE4D6` | 15,78 | 14,91 | 13,95 | 12,56 |
| secondary `#B9ADA0` | 9,04 | 8,54 | 7,99 | 7,20 |
| tertiary `#A09384` | 6,63 | 6,26 | 5,86 | 5,28 |
| disabled `#7A6E62` | 4,01 ⚠ | 3,79 ⚠ | 3,54 ⚠ | 3,19 ⚠ |

Marka ve anlam renkleri A ile aynı; B zemininde hepsi 5,7 ve üstü.

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
