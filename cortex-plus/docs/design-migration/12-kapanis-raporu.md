# 12 · Kapanış raporu (tasarım geçişi)

14 Kasım 2026. OTONOM-PROMPT §11'e göre. Ayrıntılar faz raporlarında (`raporlar/`), ilerleme `ILERLEME.md`'de.

## 1. Durum: KISMEN

- **Birleşen:** 13 PR (Faz 0, 3A, 3B, 4A, 4B, 5, 6A, 6B, 7, 8, 9, 11, 12), hepsi production'da; her birleşmeden
  sonra production duman testi 11/11.
- **Bayraklar:** yeni görünümün kodu canlıda, bütün `ui.v2.*` bayrakları **kapalı**. Canlıda bayrak yalnız yönetim
  panelinin Özellik Anahtarları sayfasından açılıyor; sayfa kurucu PIN'i istiyor ve PIN Claude'da yok (OTONOM §3:
  sır aramak yasak). Açma adımları §6'da, sıra OTONOM §5'te. Panel bu fazda yeni anahtarları gösterecek hâle getirildi
  (önce `ui.v2.*` satırı veritabanında olmadığı için panelde hiç görünmüyordu).
- **Park:** 9B düello sunucusu, 9C bağlama, Faz 10 paylaşım ve `/d/KOD` (gerekçe `09-duello-tasarim.md`); büyüme
  yerleşimleri 1–6 ve 8 (şablon tahtada yok); düello bayrakları açılmaz.

## 2. PR tablosu

| PR | Dal | Birleşme SHA | Zaman (İstanbul) | Production |
|---|---|---|---|---|
| #647 Faz 0 | `design/faz0-envanter` | a8bd6967 | 14.11 17:39 | duman 11/11 |
| #648 3A hak sistemi | `design/hak-sistemi` | bb675c6a | 14.11 18:36 | duman 11/11 |
| #649 3B kapı ve yükseltme penceresi | `design/hak-arayuzu` | b5a0042d | 14.11 19:49 | duman 11/11 |
| #650 4A heyecan kiti | `design/heyecan-kiti` | 507e8bb0 | 14.11 20:06 | duman 11/11 |
| #651 4B ders | `design/ders-ekrani` | 3e06bab7 | 14.11 20:26 | duman 11/11 |
| #652 5 tekrar | `design/tekrar-test` | 4bebc92a | 14.11 20:44 | duman 11/11 |
| #653 6A sohbet | `design/ogretmen-sohbet` | fe33cc21 | 14.11 21:03 | duman 11/11 |
| #654 6B fotoğraf | `design/ogretmen-foto` | b9e26948 | 14.11 21:25 | duman 11/11 |
| #655 7 giriş, kurulum, /pay | `design/faz7` | 08df6fdc | 14.11 21:49 | duman 11/11 |
| #656 8 stüdyo | `design/faz8` | 8c1bf91d | 14.11 22:12 | duman 11/11 |
| #657 9 düello (görünüm, nötr bot, kapı) | `design/faz9` | 13ddb3d0 | 14.11 22:27 | duman 11/11 |
| #658 11 ayarlar, kütüphane, araçlar, büyüme | `design/faz11` | 50889a28 | 14.11 22:59 | duman 11/11 |
| #659 12 durumlar, erişilebilirlik, ölçüm, kapanış | `design/faz12` | bu raporu taşıyan birleşme commit'i (`git log --grep "#659" --merges`) | 14.11 | birleşmeden sonra duman testi (sonuç kapanış özetinde) |

## 3. Bayrak tablosu

| Bayrak | Durum | Kapalıysa neden |
|---|---|---|
| `ui.v2.tekrar`, `ui.v2.ogretmen`, `ui.v2.ayarlar`, `ui.v2.kutuphane`, `ui.v2.araclar2`, `ui.v2.studyo`, `ui.v2.giris`, `ui.v2.kurulum`, `ui.v2.ders`, `ui.v2.buyume` | kapalı | Açma yetkisi Burhan'da (panel PIN'i); yerelde bayraklar açıkken axe 0 serious, e2e yeşil |
| `ui.v2.pay` | kapalı | Ayrıca önizlemede PayTR çerçevesinin açıldığı gözle doğrulanmalı (OTONOM §5) |
| `ui.v2.duello`, `duel.enabled`, `ui.v2.paylas` | kapalı | OTONOM §5–§6: düello göçü ve 9C gerçek veritabanı e2e yok (park) |

## 4. Ölçümler

- **Testler:** birim 742 dosya / 7.128 test geçti, 1 atlandı (taban 728 / 6.869); uçtan uca (chromium projesi) 289 (yerel üretim derlemesine karşı 286 geçti, 1 atlandı; 2 düşen mevcut CSP rapor gürültüsünden, CI'da geçiyor: §5) test (taban 220).
- **Erişilebilirlik (axe, WCAG 2.1 A + AA):** 210 ekran (70 ekran × 1280 / 768 / 375; misafir, ücretsiz, Plus, Sigma,
  kurucu fikstürü). İlk tarama 179 serious / critical düğüm; düzeltmeden sonra **0**, bayraklar açıkken de **0**
  (`audit/axe-faz12-kapali.json`, `audit/axe-faz12-acik.json`). Önizlemede (bütün bayraklar açık, gerçek ortam) 195 ekran,
  **0** (`audit/axe-onizleme-faz12.json`); önizlemede duman testi 11/11 ve 9 ekranın 3 genişlikte görüntüsü elle
  incelendi: taşma 0, her sayfada doğru bayrak kapsamı.
- **Hareket azaltma:** 12 rotada boşta sonsuz animasyon 0.
- **Görsel fark:** bayrak kapalıyken her faz sonunda görsel taban (203 görüntü) sıfır fark; Faz 12'nin bilinçli
  değişiklikleri (kontrast düzeltmeleri, 404) için taban güncellendi: 203/203 tolerans içinde, yeni taban manifesti `BASELINE_SHA de54e951`.
- **Performans** (yerel üretim derlemesi, telefon kipi, CPU 4×, Hızlı 4G, 5 koşu medyanı; eşikler ANA-PROMPT §3.6):

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

  Taban `taban-1288c25` (asıl eski); `taban-b25a922`'ye karşı da yalnız 404 LCP aşıyor. Tek aşım 404 LCP: sayfanın
  kendi içeriği 320 ms'de çiziliyor (eski 508 ms); ölçüdeki değer ilk ziyaretteki çerez bandının metni (büyük "404"
  çizimi kalkınca en büyük öğe bant oldu). **Kabul edilen sapma, karar Burhan'da.** Giriş / kayıt engelleme aşımı
  (dinamik çizim) ve hazırlık CLS'si (0,063) bu fazda düzeltildi (`raporlar/faz12.md` §4).
- **Tasarım denetimi** (203 ekran, bayraklar kapalı): kontrast 152 → 0, küçük hedef 1014 → 1012; çoklu brand 38, küçük
  yazı 360 eski görünümün sayıları (bayraklar açılıp eski yollar silinince düşer).

- **Production duman testi:** her birleşmeden sonra 11/11 (ana sayfa, giriş, kayıt, /pay, `/d/ZZZZZZZZ` 404, robots,
  404, kullanım limitleri, ayarlar, profil, stüdyo; e2e hesabıyla).

## 5. Bilinen sapmalar ve "Sonraki karar"

- **Sunucu sapmaları** (`bilinen-sunucu-sapmalari.md`, `KNOWN_DEVIATION` testleri): Sınav Haftası cüzdan dönemi
  boşluğu (olası kota sızıntısı; sunucuya dokunulmadı, Sınav Haftası'nda %90 / %100 penceresi açılmıyor); Plus %100 +
  ek paket bakiyesi açık; ücretsiz ilk ders kesin değilse açık, kilit 402 ile.
- **Düello:** bot turunun zaman çizgisi oyunun başında tek yanıtta geliyor (şık yok, doğru cevap sızmıyor); arayüz bayrak
  açıkken nötr gösteriyor, sunucunun soru soru vermesi 9B'nin işi.
- **Giriş / kayıt** bayrak okumak için dinamik oldu (önce durağan).
- **Sonraki karar:** podcast ilerleme çubuğunun ARIA slider'a çevrilmesi ve "Şimdiki satıra dön"; sözlüde `TimerRing`;
  /pay'de radyo grubu; Belgelerim eylem menüsü; ayarlarda `role="switch"`; telefonda davet şeridi yeri; düello paylaşım
  kodunun Crockford base32'ye geçişi; puanlamada "doğru sayısı önce"; sınav sabahı altbilgisi (yazdırma karşılaştırması);
  kök düzendeki `consent-evidence.ts` modül yüklenirken zod şeması kuruyor, zod 4'ün `Function("")` yoklaması rapor
  kipindeki CSP'den her sayfada `/api/csp-report` isteği doğuruyor (engelleme yok, gürültü; çözüm şemayı ilk kullanımda
  kurmak ya da zod'u `jitless` yapmak); CI e2e'si yeniden deneme yapmıyor ve geliştirme sunucusunda koşuyor: iki test
  (deneme taslağının yenilemeden sonra yerinde olması, profil panelinin kullanım satırı) ilk derlemede 5 sn'yi aşıp
  düşebiliyordu, koşulu bekleyecek şekilde sağlamlaştırıldı; CI'a `retries` eklemek ayrı karar.

## 6. Burhan-only açık işler

1. **Bayrakları açmak** (OTONOM §5 sırası, düşük riskten yükseğe): `cortexplus.app/admin/feature-flags` → kurucu PIN'i →
   sırayla "Yeni görünüm · Konu testi, doğru / yanlış ve kartlar" (`ui.v2.tekrar`), "Öğretmen sohbeti"
   (`ui.v2.ogretmen`), "Ayarlar ve davet" (`ui.v2.ayarlar`), "Kütüphane ekranları" (`ui.v2.kutuphane`),
   "Laboratuvarlar ve hesap araçları" (`ui.v2.araclar2`), "Çalışma Stüdyosu" (`ui.v2.studyo`), "Giriş, kayıt ve şifre
   sıfırlama" (`ui.v2.giris`), "Hazırlık kurulumu" (`ui.v2.kurulum`), "Ders ekranı" (`ui.v2.ders`), "Ana ekran davet
   şeridi" (`ui.v2.buyume`), en son "Abonelik sayfası" (`ui.v2.pay`). Her açılıştan sonra 10 dakika:
   `node scripts/smoke-prod.mjs --auth`; sorun olursa aynı satırdan kapat (anında eski görünüm).
2. **`ui.v2.pay` öncesi:** önizlemede kendi hesabınla /pay → "Plus'a yükselt" → PayTR çerçevesi açılıyor mu (ödemeyi
   tamamlamadan kapat); telefonda çerçeve yana taşıyor mu.
3. **Gerçek ödeme denemesi** (önizlemede, bir kez): paket seçimi, çerçeve, dönüş, "Ödemen alındı, Plus paketin
   tanımlanıyor" bekleme ekranı, plan rozeti.
4. **Gerçek cihaz:** iOS ve Android'de öğretmen sohbeti klavyesi, fotoğraf seçimi, girişte alan yakınlaşmaması.
5. **Düello:** yeni üretim istemi kararı (tür karışımı, kademeli zorluk); onaydan sonra 9B göçü SQL ekranında.
6. **CI:** GitHub sırrı `E2E_USERS_JSON`; canlı duman testini zorunlu kontrol yapmak (depo ayarı).
7. **Ürün kararları:** hazırlık sayfasının ilk ziyaretinde "Seviye tespiti"nin ertelenmesi (06 §12); Sınav Haftası
   dönem boşluğu.

## 7. Geri alma kılavuzu

- **Bir bayrak:** `/admin/feature-flags` → ilgili "Yeni görünüm · …" satırını kapat; etki anında (30 sn önbellek),
  eski görünüm aynen döner (bayrak kapalıyken DOM eskisiyle aynı).
- **Kod:** son güvenli commit, her birleşme commit'i production'da duman testinden geçti. Bayrağa bağlı olmayan
  değişiklikler: /pay `?plan=` işareti (Faz 7), 404 ve hata ekranları, erişilebilirlik ve kontrast düzeltmeleri (Faz 12).
  Bunlar için `git revert <birleşme sha> -m 1` + push (Vercel otomatik yayınlar). Faz 12 öncesi güvenli nokta: 50889a28 (#658).

## 8. 7 gün sonra tek komut

Bayraklar canlıda açıldıktan ve 7 gün sorunsuz kaldıktan sonra (OTONOM §7): **"TEMİZLİĞİ BAŞLAT"** yaz. Eski stil
yolları ve `ui.v2.*` bayrakları yalnız o zaman, kanıtla (0 referans) ve sıfır görsel farkla silinir.
