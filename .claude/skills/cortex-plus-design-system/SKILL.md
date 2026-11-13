---
name: "cortex-plus-design-system"
description: "Cortex Plus (cortexplus.app) arayüzü yazarken, yeniden tasarlarken veya incelerken kullan: token'lar, tipografi, yüzeyler, bileşen ölçüleri, hareket ve ekran kalıpları."
---

# Cortex Plus Tasarım Sistemi (v1)

## Depo kararları (skill'in önündedir)

13 Kasım 2026'da ürün sahibi Faz 0 raporundan sonra verdi. Skill'in geri kalanıyla çeliştiği her yerde bu yedi madde geçerlidir.

1. **Misafir ve pazarlama sayfaları 11 Kasım paletinde kalır** (sıcak siyah `#0b0907`, kâğıt beyazı eylem, logonun şeridi; mavi ve çivit yok). O paleti sabitleyen bekçi testlere dokunulmaz. Bu sayfalarda skill'den yalnız ölçü, köşe, boşluk ve hareket değerleri uygulanır; renk 11 Kasım paletinden gelir. `audience-tabs.tsx` biçim olarak metinli bölümlü seçicidir (§6 b), rengi pazarlama paletindendir.
2. ~~**Faz 4.1 = `/` (misafir) ve `/ogretmen`.** §7 "Ana ekran" kalıbı uygulanmaz.~~ **Madde 8 ile değişti** (13 Kasım 2026, ikinci karar).
3. **Açık tema kalır.** `--cx-*` açık değerleri koyu merdivenin tersidir: beyaz + dört koyulaşan basamak, modal arkası %40. Her metin/zemin çiftinin kontrastı hesaplanır ve **[varsayım]** diye belgelenir.
4. **Fontlar:** Figtree (sans, `--cx-font-sans`) ve JetBrains Mono (`--cx-font-mono`) kalır; Jersey 10 kalkar; Caveat ("Ezber kodu", "hedef puan") kalır. Newsreader ders ekranı fazında eklenir, önce/sonra görüntüsüyle gösterilir.
5. **Okunurluk tabanı (6 Kasım 2026) skill'in önündedir:** en küçük yazı 11 px (skill'in 9 px `meta-xs`'i 11 px olur), başlık satır aralığı en az 1,15 (skill'in 1,02'si 1,15 olur), telefonda dokunma hedefi en az 44 px.
6. **Yeni metin eklenmez.** Skill'in metin gerektiren yerleri (örn. "tek seferlik ödeme" notu, "Seni neler bekliyor" başlığı, cümlenin rozete çevrilmesi, "↵" dışında yeni ipucu yazıları) atlanır ve her fazın raporunda listelenir. Büyük harfli mono yalnız CSS (`text-transform`) ile yapılır.
7. **Köprü Faz 1'de çevrilir, palet kapısıyla:** `--c-*` değerleri `--cx-*`'tan gelir. Faz 2'den önce `/ogretmen` ve ders ekranı 375 ve 1280 px'te iki zemin merdiveniyle gösterilir: (A) §2'deki arduvaz merdiven, (B) 11 Kasım'ın sıcak siyah merdiveni + marka/vurgu/anlam renkleri skill'den. Ürün sahibi seçmeden Faz 2 başlamaz.

8. **Ana ekran (`/ogretmen`) beş parça** (13 Kasım 2026, ikinci karar; 8 Kasım'ın "ana ekran yalnız öğretmenle sohbet" kararının ve madde 2'nin yerine). Altı fazlık plan Faz 1'den sonra bekler; önce bu ekran bitirilir. Hazırlığı olan öğrencinin boş ana ekranı:
   - **Üst çubuk** (≥768 px): 96 yükseklik, 24 dolgu, ızgara `1fr auto 1fr`, zemin şeffaf, kenarlık ve gölge yok; üç grubun dikey merkezi y = 48. Sol logo; orta üç sekme (Ana Sayfa, Sınavlar, Çalışma Stüdyosu) + ayrı "Daha fazla"; sağ cam "Başla", seri sayacı, avatar. Ücretsiz hesapta seri sayacının solunda mevcut "Plus'a geç" XS altın hap (`highlight-weak` zemin, `text-highlight` yazı). Plan rozeti, yıldızlar, kurucu çipi ve ayarlar bağlantısı çubukta yok (yıldızlar "Daha fazla"da, plan profil panelinde). **Kabuk (13 Kasım 2026):** bu üst çubuk ve telefonun alt çubuğu (`bg-1` hap tepsi, 4 sekme, öğe ≥48 px) giriş yapılmış bütün öğrenci sayfalarında aynı; eski "Geri"li odak çubuğu kalktı (gezinme sekmelerden). Tam ekran odak görünümlerinde (ders, test, oturum, fiyat) çubuk, logo ve alt çubuk yok; fiyatta sağ üstte 40 px cam kapat. Başka sayfadaki "Başla" ana ekrana gidip öğretmenin ilk sözünü açar. Kurallar `cx-shell.css`'te.
   - **Logo**: depodaki `public/logo-mark-trim.png` (şeffaf zemin doğrulandı), 24 px yükseklik, oran korunur, soldan 24 px; yanında "Cortex Plus" Figtree 600 20 px, −0,02em, satır yüksekliği 1, `--cx-text-reading`, işaretle arası 8 px. Zemin, kutu, rozet yok. Odak görünümlerinde (ders, test, fiyat) logo yok.
   - **Sınav şeridi** (sol, 73 px, `bg-1`, köşe 24, dolgu 4, aralık 2): hazırlıklar sınav tarihine göre artan (geçmiş en üstte), tarihsizler sonda (rakam yerine takvim simgesi, alt etiket yok, `aria-label` hazırlığın adı). Kutu 65×80: kalan gün (title-l) + büyük harfli mono "gün sonra"; sınav bugünse yalnız 0. En çok 4 kutu, fazlası dikey kayar (scroll-snap, çubuk gizli), üstte ve altta 28 px oklar (tıklama alanı 44). Seçili kutu beyaz yazı + kayan cam hap (framer-motion `layoutId`), öbürleri `text-disabled`. Açılışta en yakın gelecek sınav seçili ve görünür; telefonda yatay şerit o sınavdan başlar, geçmiş sınavlar sola kaydırınca görünür. Geniş ekranda (≥1100 px) şerit sol kenara 24 px sabit, halka + metin grubu sayfanın yatay merkezinde (13 Kasım 2026). Hedefin gerisinde (yolda günü geçmiş ama bitmemiş adım; yolun kendi tarih kuralı `applyDisplayDates`) sağ üstte 4 px `--cx-danger` nokta. Üzerine gelince ve klavye odağında hazırlığın adı balonda. Son kutu "+" mevcut kurulum akışını açar. `role="tablist"`/`tab`, ok tuşları. Seçim sayfa değiştirmez; halka ve metin 160 ms solarak yenilenir. Hiç hazırlık yoksa boş durum bugünkü hâliyle kalır (ilk adım kartları), yalnız üst çubuk yeni.
   - **Konu halkası** (orta, en çok `min(510px, 100vh − 150px)`): yaylar hazırlığın konuları; biten `--cx-gradient-signature`, kalan `bg-2`, seçili yay bir kademe açık (`bg-4`; bitmişse renkli kalır) ve kendisine yapışık 1.5 px beyaz çerçeveli; halkanın dışında ayrı çizgi yok (13 Kasım 2026). Yaya basınca konu seçilir. 12'den fazla konuda yaylar tek tek çizilmez: halka kesintisiz ilerleme, seçim yalnız kaydırıcıyla, seçili konunun payı aynı çerçeveyle işaretli. İnce dikey kaydırıcı (`role="slider"`, "i / N") metin bloğunun sağında, grubun en sağ ucunda. Ortada `num-l` yüzde (yolun tamamlaması), `meta-s` "Tamamlandı", 52 px `brand` "Devam et" (şimdilik hazırlık sayfasını açar; çalışma yolu sayfası ayrı commit).
   - **Metin bloğu** (sağ, en çok 458 px): `meta-l` hazırlığın adı → 6 px → `heading-l` seçili konu (en çok 2 satır) → 40 px → büyük harfli mono sıradaki adım bağlantısı + ok → 40 px → 44 px cam "Ayrıntılar".
   - **İnce yazma çubuğu** (altta ortada, sabit, 344×60, alttan 28 px): 40 px `brand` öğretmen düğmesi (alan boşken geniş yazma kutusunu açar, doluyken gönderir, simgesi oka döner), 40 px ok (araç tepsisi), alan (dokununca/odaklanınca geniş kutu açılır; görsel, dosya, kamera, çizim, simgeler, anlatım stili, ders seçimi orada), 40 px mikrofon ("Mikrofon", dikte: geniş kutuyu açar ve konuşmayı kutuya yazar). **Mikrofon simgesi her yerde dikte demektir**; "Cortex Plus ile konuş" (sesli öğretmen) ses dalgası simgesiyle yalnız geniş kutuda durur (13 Kasım 2026, ürün sahibinin kararı). Tepsi: köşe 32, 4×2, öğe 105×84, simge üstte + `label-13`: Kartlar, Doğru / Yanlış, Konu Testi, Podcast, 1 Dk Çizimli Video, Sözlü Sınav, Yazılı Deneme, Sınav Sabahı Kağıdı (adlar depodaki gibi; video ve sınav sabahı seçili hazırlığı açar). Bu araçlar ana ekranda başka yerde görünmez. Sohbet başlayınca bugünkü görünüm sürer.
   - **Renk disiplini**: `brand` yalnız halkadaki "Devam et" ve öğretmen düğmesinde; altın yalnız seri sayacında (ücretsizde ayrıca "Plus'a geç" ve tepsideki kilit rozetleri). Plus hesabına ana ekranda kilit, yükseltme ya da plan rozeti yok.
   - **Telefon** (<768 px) **[varsayım]**: üst çubuk yerine alt sekme çubuğu; logo sol üstte 24 px; şerit yatay; halka üstte, metin altında; ince çubuk alt sekmenin hemen üstünde.
9. **Palet: B, sıcak siyah** (13 Kasım 2026, ürün sahibinin kararı; madde 7'deki palet kapısı kapandı). Koyu temada zemin merdiveni `#0b0907`, `#15110d`, `#1e1813`, `#29211a`, `#3d3229` (kenarlık `#29211a` / `#3d3229`, cam tabanı `#1a1511`) ve nötr metin tonları `#f7f1e8`, `#ede4d6`, `#b9ada0`, `#a09384`, `#7a6e62`. Marka, vurgu, odak ve anlam renkleri §2'deki gibi. §2'deki arduvaz merdiven (`#090A0F` … `#334155`) ve ona bağlı metin tonları bu depoda kullanılmaz; §2 ile bu madde ayrışırsa bu madde geçerlidir. Açık tema madde 3'teki gibi.
10. **Hazırlık sayfası (3C)** (13 Kasım 2026, ürün sahibinin kararı; yalnız görünüm, veri, metin ve akış aynı). Kabuk (üst çubuk, sağ üstteki sayfa simgeleri) kalır; §7'deki "üst gezinme ve logo yok" bu depoda geçersiz. Sol bilgi kartı 400 px, `bg-1`, köşe 24, dolgu 28, kenarlıksız: `meta` ders adı, `heading-xl` başlık, hazırlık satırı, ikonlu iki sekme (tepsi `bg-0` köşe 24, etkin öğe cam köşe 20), yuvarlak cam eylemler. Sağda aşama/hafta akordeonu: satırlar kenarlıksız, kapalı `bg-1`, açık grup `bg-2`, köşe 24. Düğüm düz 40 px daire, aralarında 2 px dikey çizgi (`bg-3`): tamamlanan `gradient-signature` + ✓, sıradaki `brand` + 4 px `brand-weak` halka, kilitli `bg-2` + kilit (3B kaide ve zikzak yok). Altta sabit kart: rozetler (sıradaki + tür), `title-l` adım adı, tam genişlik `brand` "Devam et"; sayfadaki tek marka düğmesi, öbür eylemler cam ya da `weak`. Telefonda bilgi kartı üstte, yol altında, sabit kart alt sekme çubuğunun hemen üstünde (sabit konum), en çok 104 px: rozetler gizli, adım adı `title-s` tek satır, altta 44 px cam "⋯" (ikincil eylemler açılır menüde) ve kalan genişliği dolduran 44 px `brand` "Devam et"; masaüstü kartı aynı.

Ek kurallar: eski `--cx-*` değişkenleri (`advantage.css`, `cortex-premium.css`, `tokens.css` köprüleri) yeniden adlandırılır, görünüm değişmez. Kapsam dışı: yönetim paneli, e-posta şablonları, hukuki sayfalar. Eski `/tasarim` sayfası ve `components/ui/` bileşenleri şimdilik kalır. Bekçi testler yeni kurala göre güncellenebilir (her fazda hangisi ve neden yazılır); davranış ve mantık testlerine dokunulmaz. Bileşen silmeden ya da bağımlılık eklemeden önce ürün sahibine sorulur.

Bu sistem, 13 Kasım 2026'da bir referans eğitim ürününün (koyu tema, masaüstü 1150 px görünüm) hesaplanmış stillerinden ölçülen **yapı, ölçü, ritim ve etkileşim** değerlerini Cortex Plus'ın **kendi renk, font ve logo kimliğine** uyarlar.

İki kesin kural:

- Ölçü, oran, hareket ve bileşen anatomisi bu dosyadan gelir.
- Renk, logo, ikon, illüstrasyon ve metin Cortex Plus'ındır. Başka bir ürünün logosunu, görselini, metnini veya imza süsünü (piksel font, yıldız alanı dokusu vb.) kopyalama.

Değerlerin kaynağı her bölümde belirtilir: **[ölçüm]** referanstan ölçüldü, **[uyarlama]** Cortex Plus için seçildi, **[varsayım]** görülemedi, mantıkla türetildi.

## 1. Yedi tasarım ilkesi

1. **Tek zemin, ışıkla derinlik.** Kartların kenarlığı yoktur. Katmanlar birbirinden bir basamak daha açık zemin rengiyle ayrılır. Kenarlık yalnızca açılır menü, yan panel ve kanıt kartında kullanılır.
2. **Tıklanan her şey haptır.** Buton, sekme, rozet, şık: tam yuvarlak (pill). Kaplar 24 veya 32 px köşelidir.
3. **Üç sesli tipografi.** İçerik sans, üst veri (ders adı, tarih, etiket) büyük harfli mono, sayılar büyük gösterim rakamı.
4. **Ekranda tek vurgu.** Marka gradyanı yalnızca o ekranın tek ana eylemindedir. Diğer tüm butonlar cam (glass) veya zayıf (weak) dolgudur.
5. **İki tonlu başlık.** Başlığın bir satırı ikincil gri, diğeri beyaz. Vurgu kalınlıkla değil tonla yapılır.
6. **Cümle yerine rozet.** Durum bilgisi ("BUGÜN", "HEDEFİN %75 GERİSİNDE", "SIRADAKİ") küçük mono rozetlerle verilir.
7. **Hareket küçük ve hızlıdır.** Renk 160 ms, ölçek 220 ms, büyüme en fazla %3. Hiçbir şey zıplamaz, kaymaz, parlamaz; yalnızca ana eylem hafifçe büyür.

## 2. Token'lar

Tüm değerler CSS değişkenidir. Bileşenlerde ham hex veya ham px yazma; token yoksa önce buraya ekle.

```css
:root {
  /* Zemin basamakları [uyarlama: referansın 5 basamaklı nötr merdiveni, Cortex obsidyen/arduvaz tonuna çevrildi] */
  --cx-bg-0: #090A0F;  /* sayfa */
  --cx-bg-1: #0F172A;  /* kart, gezinme tepsisi */
  --cx-bg-2: #172033;  /* kart içi grup, giriş alanı, zayıf buton */
  --cx-bg-3: #1E293B;  /* tepsi içindeki aktif hap, yükseltilmiş rozet */
  --cx-bg-4: #334155;  /* güçlü kenarlık, en üst basamak */
  --cx-border: #1E293B;
  --cx-border-2: #334155;
  --cx-dim: rgba(0, 0, 0, .8);          /* modal arkası */

  /* Metin [kontrast bg-1 üzerinde hesaplandı] */
  --cx-text-primary: #FFFFFF;           /* 17:1+ */
  --cx-text-reading: #E2E8F0;           /* uzun ders metni */
  --cx-text-secondary: #94A3B8;         /* 6.96:1 */
  --cx-text-tertiary: #7C8AA0;          /* 5.1:1, küçük etiket */
  --cx-text-disabled: #64748B;          /* 3.75:1, yalnızca pasif/süs */
  --cx-text-brand: #A5B4FC;             /* 8.96:1, bağlantı ve marka rozeti metni */
  --cx-text-on-brand: #FFFFFF;
  --cx-text-inverted: #090A0F;

  /* Marka */
  --cx-brand: #6366F1;
  --cx-brand-strong: #4F46E5;           /* beyaz metin 6.29:1 */
  --cx-violet: #8B5CF6;
  --cx-cyan: #06B6D4;
  --cx-brand-weak: #1E1B4B;
  --cx-brand-weak-plus: #312E81;
  --cx-focus: #22D3EE;                  /* odak halkası, markadan bilerek farklı */

  /* Plus / seri / başarı altını */
  --cx-highlight: #F59E0B;
  --cx-text-highlight: #FBBF24;
  --cx-highlight-weak: #3A2A0A;
  --cx-text-on-highlight: #090A0F;

  /* Anlam renkleri */
  --cx-success: #34D399;  --cx-success-weak: #0B2A22;
  --cx-warning: #FB923C;  --cx-warning-weak: #3A2210;
  --cx-danger:  #F87171;  --cx-danger-weak:  #3A1518;

  /* Gradyanlar */
  --cx-gradient-brand: radial-gradient(55% 90% at 100% 50%, #ffffff1f, #fff0 70%), linear-gradient(90deg, #4F46E5, #6366F1);
  --cx-gradient-signature: linear-gradient(120deg, #6366F1 0%, #8B5CF6 50%, #06B6D4 100%);
  --cx-gradient-brand-text: linear-gradient(90deg, #818CF8, #A5B4FC 40%, #C7D2FE 70%, #FFFFFF);
  --cx-gradient-glow: radial-gradient(70% 55% at 50% 0%, color-mix(in srgb, #6366F1 16%, transparent), transparent 70%);

  /* Cam yüzey [ölçüm: katman tarifi; uyarlama: taban rengi] */
  --cx-glass-background: radial-gradient(90% 55% at 50% 0%, #ffffff0f, #fff0 70%), linear-gradient(180deg, #ffffff0d, #ffffff04), #131C2F;
  --cx-glass-rim: linear-gradient(180deg, #ffffff4d 0%, #ffffff29 10%, #ffffff0d 30%, #ffffff05 55%, #ffffff08 78%, #ffffff1a 100%);
  --cx-glass-bevel: inset 0 1px 1px #ffffff0d;
  --cx-skeleton: linear-gradient(100deg, #fff0 35%, #ffffff12 50%, #fff0 65%), var(--cx-bg-2);

  /* Gölgeler [ölçüm] */
  --cx-shadow-popover: 0 8px 32px rgba(0, 0, 0, .32);
  --cx-shadow-sheet: inset 0 0 0 1px var(--cx-border), 0 -12px 40px rgba(0, 0, 0, .5);
  --cx-shadow-banner: inset 0 0 0 1px var(--cx-border), 0 8px 24px rgba(0, 0, 0, .45);
  --cx-shadow-stack: 18px 0 40px -14px rgba(0, 0, 0, .85);

  /* Köşe [ölçüm] */
  --cx-radius-s: 10px;
  --cx-radius-m: 16px;
  --cx-radius-l: 24px;
  --cx-radius-xl: 32px;
  --cx-radius-max: 6000px;

  /* Hareket eğrileri [ölçüm] */
  --cx-ease-out: cubic-bezier(.2, .8, .2, 1);
  --cx-ease-glide: cubic-bezier(.22, .9, .28, 1);
  --cx-ease-settle: cubic-bezier(.22, 1, .36, 1);
  --cx-ease-spring: cubic-bezier(.3, 1.34, .6, 1);
  --cx-ease-bounce: cubic-bezier(.34, 1.56, .64, 1);

  /* Fontlar [uyarlama] */
  --cx-font-sans: "Plus Jakarta Sans", system-ui, sans-serif;
  --cx-font-mono: "IBM Plex Mono", ui-monospace, monospace;
  --cx-font-reading: "Newsreader", Georgia, serif;
}
```

Font notu: depoda zaten bilinçli seçilmiş bir sans font varsa onu koru ve `--cx-font-sans`'a bağla. Seçilen her font Türkçe karakterleri (İ ı Ş ş Ğ ğ Ö Ü Ç) içermelidir.

Köşe iç içe kuralı **[ölçüm]**: dış köşe = iç köşe + dolgu. Örnekler: sekme tepsisi 24 = iç hap 20 + 4; sohbet kutusu dış 36 = iç 32 + 4; plan kartı dış 17 = iç 16 + 1.

Boşluk: 4 px taban. Kullanılan basamaklar 2, 4, 8, 12, 14, 16, 18, 20, 24, 32, 40, 48. Sayfa yan boşluğu masaüstü 24, mobil 16.

## 3. Tipografi ölçeği [ölçüm]

| Rol | Ağırlık | Boyut / satır | Harf aralığı | Kullanım |
|---|---|---|---|---|
| display-l | 700 | 56 / 1.0 | -0.03em | Pazarlama kahraman başlığı |
| heading-xl | 600 | 40 / 1.02 | -0.02em | Sayfa başlığı ("Sınavlar") |
| heading-l | 600 | 36 / 1.02 | -0.02em | Ana ekran konu başlığı |
| heading-s | 600 | 28 / 1.02 | -0.02em | Kart ve diyalog başlığı |
| title-xl | 600 | 22 / 1.25 | -0.02em | |
| title-l | 600 | 20 / 1.25 | -0.02em | Bölüm başlığı |
| title-m | 600 | 18 / 1.25 | -0.02em | Satır kartı başlığı, istatistik değeri |
| title-s | 600 | 16 / 1.25 | -0.02em | |
| body-16 / 14 / 12 | 400 | 16, 14, 12 / 1.4 | 0 | Gövde metni |
| label-15 / 13 / 11 | 400 veya 600 | 15, 13, 11 / 1.25 | +0.01em | Arayüz etiketi, şık metni |
| button-l | 600 | 16 / 1 | 0 | 52 px buton |
| button-s | 600 | 13 / 1 | 0 | 44, 40, 36 px buton |
| meta-xl / l / m / s / xs | 500 mono, BÜYÜK HARF | 20, 15, 13, 11, 9 / 1.25 | +0.01em | Ders adı, tarih, rozet, alt etiket |
| num-xl | 700 | 75 / 1 | -0.02em | Dev istatistik ("2×") |
| num-l | 700 | 44 / 0.9 | -0.02em | Hazırlık yüzdesi, selamlama |
| num-m | 700 | 26 / 1 | 0 | Satır kartı yüzdesi |
| reading-title | 500 serif | 36 / 41 | 0 | Ders okuma başlığı |
| reading-lead | 400 | 20 / 28 | 0 | Ders giriş paragrafı |

Kurallar:

- `num-*` rakamları `font-variant-numeric: tabular-nums` ve `--cx-gradient-signature` ile gradyan metin olarak yazılır. Bu Cortex Plus'ın imzasıdır **[uyarlama]**; referanstaki piksel fontu kullanma.
- Başlıklarda `text-wrap: balance`.
- Büyük harfli mono etiketler için kökte `<html lang="tr">` zorunludur; aksi halde `text-transform: uppercase` "i" harfini "İ" yerine "I" yapar.
- Gövde metninde kalın yalnızca 600'dür; 700 sadece `display` ve `num` rollerinde.

## 4. Yüzey tarifleri

```css
/* Cam: ikincil butonlar, ikon butonları, aktif gezinme hapı, sohbet formu */
.cx-glass { position: relative; background: var(--cx-glass-background); box-shadow: var(--cx-glass-bevel); color: var(--cx-text-primary); }
.cx-glass::after { content: ""; position: absolute; inset: 0; border-radius: inherit; padding: 1px; background: var(--cx-glass-rim); pointer-events: none;
  mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0); }

/* Marka: ekranın tek ana eylemi */
.cx-brand { background: var(--cx-gradient-brand); color: var(--cx-text-on-brand); }

/* Zayıf: üçüncül eylem. Dolgu, bulunduğu yüzeyin bir üst basamağıdır */
.cx-weak { background: var(--cx-weak-fill, var(--cx-bg-2)); color: var(--cx-text-secondary); }
.cx-weak:hover, .cx-weak:active, .cx-weak:focus-visible { color: var(--cx-text-primary); }

/* Yüzey basamağı: çocukların zayıf dolgusunu otomatik bir üst basamağa taşır */
.cx-surface-0 { --cx-weak-fill: var(--cx-bg-1); }
.cx-surface-1 { --cx-weak-fill: var(--cx-bg-2); }
.cx-surface-2 { --cx-weak-fill: var(--cx-bg-3); }

/* Açılır menü */
.cx-popover { background: var(--cx-bg-2); border: 1px solid var(--cx-border); border-radius: var(--cx-radius-l); box-shadow: var(--cx-shadow-popover);
  transition: opacity .16s ease, scale .16s var(--cx-ease-glide); }
.cx-popover[data-starting-style], .cx-popover[data-ending-style] { opacity: 0; scale: .96; }

/* İskelet yükleme */
.cx-skeleton { background: var(--cx-skeleton); background-size: 200% 100%, auto; color: transparent; animation: cx-shine 1.4s linear infinite; }
@keyframes cx-shine { from { background-position: 150% 0, 0 0; } to { background-position: -50% 0, 0 0; } }
```

Kaydırılan içeriğin sabit üst/alt çubuğun altına girdiği yerde keskin çizgi yerine 64 px'lik `bg-0 → şeffaf` geçiş kullan **[ölçüm]**.

## 5. Hareket ve etkileşim durumları [ölçüm]

| Durum | Değer |
|---|---|
| Buton hover / active / focus-visible | `scale: 1.03`, 220 ms `--cx-ease-out` |
| Renk ve zemin değişimi | 160 ms ease |
| Gezinme sekmesi rengi | 220 ms; aktif cam hap sekmeler arasında kayar (paylaşımlı yerleşim animasyonu) |
| Kart hover | Kart büyümez; içindeki görsel `scale: 1.12`, ok ikonu 2 px kayar |
| Dokunmatik basış | Basılı tutunca büyür: küçük öğe 1.20–1.25, orta 1.125, büyük kart 1.08; giriş 75 ms, çıkış 430 ms yaylı |
| Açılır menü | opacity + scale .96 → 1, 160 ms |
| İçerik girişi | opacity 0 → 1 ve 8 px aşağıdan yukarı |
| Panel boyut değişimi | genişlik/yükseklik 380 ms `cubic-bezier(.2,.9,.3,1.1)` |
| Tam ekran katman (fiyat, ders) | alttan kayarak + solarak girer |
| Başlık metni ton geçişi | 320 ms |
| Şık sonucu | zemin/renk 160 ms, opaklık 520 ms |
| Bildirim (toast) | üstten iner; üst boşluk masaüstü 88, mobil 64 + güvenli alan |
| Odak | `outline: 1px solid var(--cx-focus); outline-offset: 3px` |
| Pasif | zemin `bg-2`, metin `text-disabled`, gölge ve cam kenarı yok |

`prefers-reduced-motion: reduce` altında ölçek ve kayma kapatılır, yalnızca renk ve opaklık geçişi kalır.

## 6. Bileşen ölçüleri [ölçüm]

**Buton.** Hepsi tam yuvarlak, ikon ile metin arası 6–8 px.

| Boy | Yükseklik | Yatay dolgu | Yazı |
|---|---|---|---|
| L | 52 | 24 | button-l |
| M | 44 | 18 | button-s |
| S | 40 | 18 | button-s |
| XS | 36 | 14 | button-s |
| Mini | 32 | 12 | button-s |
| İkon | 40, 36, 28 (kare) | 0 | — |

Türler: `brand` (tek ana eylem), `glass` (ikincil), `weak` (üçüncül), `inverse` (beyaz zemin, koyu metin; yalnızca giriş kutusunun içindeki gönder eylemi), `link` (`text-brand`, zeminsiz).

**Üst gezinme (≥768 px).** Yükseklik 96 (24 dolgu), ızgara `1fr auto 1fr`. Solda logo. Ortada tepsi: `bg-1`, hap, dolgu 4, aralık 2; öğe 40 yüksek, yatay dolgu 14, ikon + etiket aralığı 8, `label-13` 600. Aktif öğe beyaz metin ve altında cam hap, pasif `text-secondary`. "Daha fazla" ayrı bir hap (48 yüksek). Sağda: cam "Başla +" butonu (S), seri sayacı (cam hap, mono rakam, `text-highlight`), yıldız ve profil (40 px yuvarlak).

**Mobil gezinme (<768 px) [varsayım].** Referans bu genişlikte üst çubuğu gizliyor; mobil görünüm ölçülemedi. Alt sekme çubuğu kullan: `bg-1`, hap tepsi, 4 sekme, öğe en az 48 px, `env(safe-area-inset-bottom)` eklenir.

**Sekme / bölümlü seçici.** İki biçim: (a) ikonlu: tepsi `bg-0`, köşe 24, dolgu 4, aralık 2; öğe 56 yüksek, köşe 20, ikon üstte, `label-11`; aktif öğe cam. (b) metinli: tepsi `bg-1`, 40 yüksek, dolgu 4; öğe 32 yüksek, yatay 14, `button-s`; aktif öğe `bg-3`; sayaç `text-disabled`.

**Rozet.** Küçük: 20 yüksek, yatay 8, `meta-xs`. Orta: 24 yüksek, yatay 10, `meta-s`. Tonlar: nötr (`bg-2` + `text-secondary`), marka (`brand-weak` + `text-brand`), uyarı (`warning-weak` + `warning`), altın (`highlight-weak` + `text-highlight`), başarı, tehlike.

**Hazırlık kartı (dosya sekmeli).** `bg-1`, köşe `0 32px 32px 32px`, sol üstte kartla aynı renkte 52 px yüksek sekme çıkıntısı; sekmede `meta-s` ile "% · DERS". Dolgu 44 / 32 / 48. İçerik: `heading-s` başlık, rozet satırı, sıradaki konu (`label-13`), 44 px `brand` buton. Liste genişliği 768.

**Satır kartı.** Aynı köşe biçimi, dolgu 22 / 14, aralık 24; solda mono ders adı + `title-m` başlık, sağda `num-m` yüzde ve `meta-xs` alt etiket, 36 px buton.

**İstatistik kartı.** `bg-1`, köşe 24, dolgu 18 / 20; `meta-xs` etiket, `title-m` değer, 8 × 56 px hap çubuklu mini grafik (`bg-2`, dolu olan `gradient-signature`).

**Özellik karosu.** `bg-1`, köşe 32, dolgu 24; 81 px ikon kutusu (`bg-2`, köşe 24), `label-15` 600 başlık, `body-12` açıklama.

**Liste satırı (ayarlar, menü).** Grup kabı `bg-2`, köşe 24. Satır 60 yüksek, dolgu 16 / 20, ikon–metin aralığı 14, `label-15`, sağda ok; hover'da zemin 160 ms.

**Diyalog.** Ortalanmış, 480 geniş, `bg-1`, köşe 32, arka plan `--cx-dim`. Başlık ortada `title-s`, sağ üstte 40 px cam kapat butonu. Escape ve dışarı tıklama kapatır.

**Yan panel (profil).** 480 geniş, ekranın sağ-altına 8 px boşlukla yapışık, `--cx-shadow-sheet`, `.cx-surface-1`. İçerik sırası: ad, `meta-s` okul satırı, iki istatistik butonu (220 × 95, köşe 24, `heading-s` değer + `meta-s` etiket), iki kısayol karosu, yükseltme şeridi, gruplu liste, görünüm seçici.

**Giriş kutusu (öğretmene sor).** Dış kap `bg-1`, köşe 36, dolgu 4. Üstte 34 px bağlam şeridi (`meta-s`, seçili konu + açılır ok). Altında form: cam, köşe 32, dolgu 20, aralık 16, en az 124 yüksek; metin `label-15`. Solda 40 px yuvarlak "+" (`bg-3`), sağda 40 px mikrofon (zeminsiz) ve `inverse` gönder hapı (40 yüksek, yatay 24, `button-l`). Altında öneri hapları: 44 yüksek, köşe 24, `bg-1`; ilki `brand-weak` + `text-brand`.

**Şık (cevap seçeneği).** Hap, en az 56 yüksek, dolgu `8 20 8 8`, aralık 12, şıklar arası 10. Solda 40 px yuvarlak harf rozeti (`bg-2`, mono 12). Metin `label-15`.

| Durum | Zemin | Harf rozeti | Metin |
|---|---|---|---|
| Boşta | `bg-1` | `bg-2`, `text-disabled` harf | `text-secondary` |
| Hover / seçili | `bg-2` | `bg-3` | `text-primary` |
| Doğru | `success-weak` | `success` dolgu, koyu ✓ | `text-primary` 600 |
| Yanlış | `danger-weak` | `danger` dolgu, koyu ✕ | `text-primary` 600 |
| Kaçırılan doğru | `bg-0` | `bg-2`, `success` renkli ✓ | `text-secondary` |

Cevaptan sonra tüm şıklar kilitlenir ve ekran okuyucu için görünmez "Doğru / Yanlış / Kaçırıldı" metni eklenir. Lise, YKS ve akademik sekmelerde 5 şık (A–E), ortaokul/LGS'de 4 şık (A–D).

**İlerleme çubuğu.** 6 px yüksek, hap, iz `bg-1`, dolgu `gradient-signature`.

## 7. Ekran kalıpları

İçerik genişlikleri **[ölçüm]**: okuma 768, sohbet 800, liste 816 (768 + 24 + 24), fiyat 904 (dış kap 1280). Kırılma noktaları: 640, 768, 1024, 1280, 1536.

**Ana ekran.** Tek görev odaklı, kaydırmasız. Solda dikey sınav tarihi şeridi (73 geniş, öğe 65 × 80, seçili öğe cam). Ortada dairesel hazırlık göstergesi: `num-l` yüzde, `meta-s` "HAZIRLIK DÜZEYİ", 52 px yuvarlak `brand` devam butonu. Sağda `meta-l` ders adı, `heading-l` konu, mono büyük harfli alt konu bağlantısı, 44 px cam "Ayrıntılar". Altta ortada giriş çubuğu. Cortex Plus'ta `?hedef=` sekmeleri (lise, yks-lgs, universite, akademik) metinli bölümlü seçiciyle üst gezinmenin altında durur.

**Liste sayfası.** `heading-xl` başlık, sağında 40 px cam ikon butonları ve cam "Yeni" butonu. Altında yatay kaydırılan hazırlık kartları, "Haftalık özet" (iki istatistik kartı), metinli sekmeler, güne göre gruplanmış satır kartları (`title-m` gün başlığı, `meta-s` "GELECEK HAFTA" ayırıcı).

**Hazırlık detayı.** Solda 400 geniş bilgi kartı (`bg-1`, köşe 24, dolgu 28): `meta` ders adı, `heading-xl` başlık, ikonlu sekmeler, dört yuvarlak cam eylem. Sağda çalışma yolu: düğümler ve altta "SIRADAKİ" kartı (rozetler, `title-l` başlık, `brand` "Devam et").

**Ders ekranı (LessonV3).** Tam ekran `bg-0`, gezinme yok. Üst çubuk 56: solda tür adı ve "1 / 7" (`label-13`, `text-secondary`), ortada 472 px ilerleme çubuğu, sağda cam kapat. İçerik sütunu 768, dikey aralık 24. Adım yapısı:

- Giriş: tür rozeti + "3 dk okuma · 7 adım", `reading-title`, `reading-lead`, numaralı "Seni neler bekliyor" kartı (köşe 16, 1 px kenarlık; 20 px numara rozeti, `title-s` + `body-14`).
- Anlatım: gövde `body-16` / 24 satır, `text-reading`; formüller KaTeX ile gövdenin 1.36 katı.
- Bilgi kutusu: renk tonunun %8'i zemin + 1 px aynı ton kenarlık, köşe 16, dolgu 12, emoji + `title-s`.
- Hızlı sınav kartı: `bg-0`, köşe 16, 1 px kenarlık, şıklar yukarıdaki gibi.
- Altta sabit eylem: tam genişlik `brand` hap (48–52 yüksek) ve sağında "↵" klavye ipucu. Cevaptan sonra solda `weak` "Açıkla", sağda `brand` "Devam et".

Cortex Plus kartlarının ton eşlemesi **[uyarlama]**: `📐 FormulaCard` marka (indigo), `⚠️ ExamTrapCard` uyarı (turuncu), `🧠 MemoryHookCard` camgöbeği, `📌 Belgedeki Şema — Sayfa N` nötr kart + `meta-s` sayfa etiketi, `"Genel bilgi"` nötr rozet. `🔄 Farklı anlat` ve `🤔 İki Şık Arasında Kaldım` her zaman `weak` haptır; asla `brand` olmaz.

**Öğretmen / sohbet.** Boş durumda `num-l` selamlama, altında giriş kutusu ve öneri hapları. Anlatım stili (Sokratik, Adım Adım, Doğrudan Çöz) bağlam şeridinde metinli bölümlü seçicidir. "Devam et" adımı `weak` hap olarak son balonun altında durur.

**Başla diyaloğu.** İki üst üste binen panel (`bg-1`, köşe 32, dolgu 40): öndeki 648 geniş ve `--cx-shadow-stack` gölgeli, arkadaki yandan görünür; tıklanınca 380 ms'de yer değiştirir. Her panelde `meta-m` üst etiket, iki tonlu `heading-s`, ikonlu üçlü seçici ve giriş kutusu.

**Fiyat ekranı.** Tam ekran `bg-0`, üst boşluk 96, sağ üstte cam kapat. Ortada iki tonlu başlık (vurgulu kısım gradyan metin). İki sütun 442 + 442, aralık 20. Sol: plan seçenekleri alt alta, aralık 8; her biri 1 px çerçeveli kart (dış köşe 17, iç köşe 16, iç dolgu 14 / 16, `bg-1`); seçili olanın çerçevesi `gradient-signature`, diğerlerinin `bg-3`; solda ad (16 / 500) ve `body-12` fatura notu, sağda fiyat (15 / 500), üstte altın tasarruf rozeti. Sağ: özellik listesi kartı (`bg-1`, köşe 24, dolgu 20, satır 16 / 22) ve tam genişlik L buton. Altında `weak` "Neden ücretsiz değil?" hapı ve kanıt kartı (köşe 24, dolgu 36 / 48 / 32, 1 px kenarlık, `num-xl` rakam, `body-16`, marka rozetleri). Cortex Plus planları: Ücretsiz, Sınav Haftası ₺349 / 7 gün, Plus ₺599 / ay, Sigma ₺1.999 / ay. Otomatik yenileme olmadığı için "tek seferlik ödeme" notu fatura satırında yazar. Kanıt kartına yalnızca doğrulanabilir, kaynağı gösterilen veri konur.

**Kilitli özellik.** `🔒 Plus` altın küçük rozet + öğe %60 opaklık; tıklanınca fiyat ekranı açılır.

## 8. Erişilebilirlik ve Türkçe

- Gövde metni en az 4.5:1. `text-disabled` yalnızca pasif öğe ve süs için.
- Beyaz metin `#6366F1` (4.47:1) ve `#8B5CF6` (4.23:1) üzerinde 16 px altı yazılmaz; buton zemini `brand-strong` ile başlar.
- Dokunma hedefi en az 40 px, mobilde 48 px.
- Her ikon butonunda `aria-label`; durum yalnızca renkle değil ikon ve gizli metinle de verilir.
- Tüm etkileşim klavyeyle yapılır; ana eylem Enter ile tetiklenir ve "↵" ipucu gösterilir.
- Sayılar Türkçe biçimde: `₺1.999`, `%75`, `4,8`.

## 9. Uygulama sırası

1. Token'ları tek dosyada tanımla ve Tailwind/tema yapılandırmasına bağla.
2. İlkel bileşenler: Button, IconButton, Badge, Segmented, Card, ListRow, Dialog, Sheet, Popover, Toast, Skeleton, Progress, AnswerOption, Composer, Callout.
3. Kabuk: üst gezinme, mobil alt çubuk.
4. Ekranlar: ana ekran → ders → test → öğretmen/sohbet → fiyat → profil.
5. Her adımda 375, 768 ve 1280 px ekran görüntüsüyle kontrol et.

## 10. Yapma

- Logoyu yeniden çizme veya üretme; depodaki gerçek Cortex Plus logo dosyasını kullan.
- Karta kenarlık ya da gölge ekleme; basamak rengiyle ayır.
- Bir ekrana ikinci bir `brand` buton koyma.
- Neon parlama, cam bulanıklığı (backdrop-blur), kayan gradyan zemin ekleme. Derinlik yalnızca §4'teki tariflerden gelir.
- Köşeli (0–8 px) buton veya giriş alanı kullanma.
- İş mantığına, ödeme akışına, metinlere dokunma; bu sistem yalnızca görünüm ve etkileşim katmanıdır.