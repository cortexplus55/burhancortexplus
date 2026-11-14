# 06 · Gözlemler (yalnız rapor; hiçbiri bu PR'da düzeltilmedi)

Main `492e206e`, 14 Kasım 2026. Canlı veri yalnız okundu.

## 1. `/ogretmen`'deki ders bağlantısı "Sayfa bulunamadı" verdi

**Neden: veri (silinmiş düğüm). Rota ve yetki sorunu değil.**

- Düğüm sayfası (`src/app/deneme-sinavlari/[prepId]/dugum/[nodeId]/page.tsx:95`) hazırlık öğrencinin değilse ya da
  düğüm o hazırlıkta yoksa `notFound()` verir. Kilitli düğüm 404 değil kilit sayfasına yönlenir (:98).
- Yeniden planlama (`replace_exam_prep_schedule`, `supabase/migrations/20260909150826_atomic_reschedule_preserve_attempts.sql:54`)
  **başlanmamış düğümleri siler ve yeni kimliklerle yeniden yazar**; yalnız başlanmış ya da bitmiş düğümler korunur.
- Kaçırılan günleri yeniden dağıtan iş (`src/lib/learning/missed-day-reschedule.ts`) hazırlık sayfası açılınca arka planda
  (`after()`) çalışıyor; ayar değişikliği, uyarlamalı plan ve deneme notlanması da aynı fonksiyonu çağırıyor.
- Ana ekran (`/ogretmen`) "sıradaki adım" bağlantısını o anki düğüm kimliğiyle çizer. Bağlantı gösterildikten sonra
  yeniden planlama çalışırsa (başka sekmede hazırlık sayfası açıldı, tarayıcı geçmişi, önbelleğe alınmış sayfa) eski kimlik
  artık yoktur → 404.
- **Canlı kanıt** (kurucu hesabı, yalnız okundu): hazırlık `a911db69` 9 Kasım'da kurulmuş, 17 düğümünün 16'sı
  13 Kasım 22:58'de yeniden yazılmış; `eb5af74d` 6 Kasım'da kurulmuş, 16 düğümünün 15'i 13 Kasım 20:26'da yeniden yazılmış.
- Öneri (Faz 3+ kararı): yeniden planlama düğüm kimliğini korusun (güncelle, silme) ya da düğüm sayfası 404 yerine
  hazırlığın sıradaki adımına yönlensin.

## 2. 404 sayfası
- Dosya: `src/app/not-found.tsx`; stil `src/styles/not-found.css`.
- Bileşenler: `CortexMark` (`src/components/brand/cortex-mark.tsx`, logo), `Icon3D name="avatar"` (`src/components/ui/icon-3d.tsx`,
  sıfırın yerindeki üç boyutlu görsel, 112 px), `Mail` (lucide).
- Sarı: "404" rakamları `color: var(--c-brand)` (`not-found.css:45`, 700 8rem) ve logo yazısındaki "Plus"
  `var(--c-brand, #fdb300)` (:35). `--c-brand` altın.
- 500: `src/app/error.tsx` (sayfa hatası) ve `src/app/global-error.tsx` (kök yerleşim). İkisi de ham renk taşıyor
  (`bg-[#050505]`, `text-[#e8a838]` altın üst etiket …) ve Sentry'ye yazıyor.

## 3. `/pay`'de kurucuya "Bütün özellikler açık" kartı
- Koşul: `src/app/pay/page.tsx:37` `const founder = account?.isAdmin === true;`. `isAdmin` `getStudentAccountContext`'ten
  (`src/lib/student/account-context.ts`), o da SQL `is_admin`'den (**admin ya da founder** rolü). Yani kart yalnız kurucuya
  değil, **yönetici rolündeki her hesaba** çıkar; `isFounder` okunmuyor.
- Aynı durum Faz 2'nin plan kimliğinde de var: `planIdentity` (`src/lib/student/plan-identity.ts:35`) `isAdmin`'e bakar,
  yönetici rolündeki bir hesap da kapsülde **KURUCU** görünür. Bugün yönetici rolünde başka hesap var mı bilinmiyor;
  Faz 3'te `getGate` kurucuyu `is_founder`'dan ayırmalı.
- Altın: 14 Kasım'dan (#646) beri kartın rozeti (`FounderBadge`) Sigma görünümünde; kartın zemini mavi eylem tonundan
  (`--c-action`, `parity-shell.css` `.cp-pay-founder`), altın değil. Canlıda rozet zemini `#3a1519` ölçüldü.

## 4. `/` ile `/ogretmen`
**Yönlendirme.** `/` misafir için pazarlama ana sayfası (`src/app/page.tsx`, `revalidate = 300`). Oturum açık kullanıcı `/`,
`/giris` ya da `/kayit`'e gelince ara katman rolünün ana sayfasına yönlendirir (`src/lib/supabase/middleware.ts:260`;
öğrenci için `/ogretmen`, `homePathForRole`). Aynı sayfa değil.

## 5. Hazırlık sayfası ve ana ekran yeni tasarımda mı
- **Ana ekran** (`/ogretmen`, depo kararı 8: sınav şeridi, konu halkası, metin bloğu, ince yazma çubuğu, yeni üst çubuk):
  main'de ve canlıda yeni tasarımda. Hazırlığı olmayan hesabın boş durumu (ilk adım kartları) bilerek eski hâliyle duruyor.
- **Hazırlık sayfası** (depo kararı 10, 3C): `11665812` ve `c2a54607` main'de; bilgi kartı, yol düğümleri (`cx-node`),
  sabit "Sıradaki" kartı (`cx-next-*`) ve tamamlanan adımın kapanma anı yeni tasarımda. Bileşen hâlâ çoğunlukla eski sınıf
  adlarını taşıyor (108 `cp-*` sınıfı, 5 `cx-*`); görünüm `src/styles/prep-home-cx.css` ile çevriliyor.
- **Geçmeyen kısımlar:** hazırlık içindeki **İlerleme sekmesi** (`cp-prep-tabs`, `exam-prep-progress.tsx`) ve hazırlığın
  alt sayfaları (`/konu`, `/tekrar`, `/tekrarlar`, `/podcast`, `/video`, `/sinav-sabahi`, `/deneme/*`, `/degerlendirme`,
  `/zor-sorular`, `/sonuc`) yalnız kabuk ve Faz 1'in genel kurallarıyla (`cx-pages.css`) yeni; kendi ekranları eski düzende.
  Ders ekranı (`/dugum/:nodeId`) bilerek eski (ders ekranı tahtası Prompt 2'de).

## 6. Üst çubuktaki "Başla"
**Diyalog açmıyor.** `src/components/parity/sor-shell.tsx:205` (`startTeacher`): `HOME_START_EVENT` olayını gönderir
(`src/lib/ui/home-events.ts`). Ana ekrandaysa `ChatPanel` (`src/components/chat/chat-panel.tsx:1323`) olayı yakalar ve
öğretmenin ilk sözünü (`startGreeting`; selam + "Bugün ne çalışmak istersin?") sohbette açar, yazma kutusuna odaklanır.
Başka sayfadaysa `/ogretmen?basla=1`'e gider, orada aynı şey olur (`sor-shell.tsx:212–218`).
İçerik ağacı: `ChatPanel` → boş hâl (`showEmptyStarter`) → ilk söz balonu (`local`, modele gitmez, kaydedilmez) → yazma
kutusu. Skill'deki "Başla diyaloğu" (iki üst üste panel) depoda **yok**.

## 7. Dokunma hedefi: depo kararı 5 (ürün sahibinin kararı, 14 Kasım 2026: telefonda 44 px)
Kaydın tam metni (`.claude/skills/cortex-plus-design-system/SKILL.md`, "Depo kararları", madde 5):

> 5. **Okunurluk tabanı (6 Kasım 2026) skill'in önündedir:** en küçük yazı 11 px (skill'in 9 px `meta-xs`'i 11 px olur), başlık satır aralığı en az 1,15 (skill'in 1,02'si 1,15 olur), telefonda dokunma hedefi en az 44 px.

Ürün sahibinin kararı (14 Kasım 2026): telefonda (<768 px) dokunma hedefi **44 px**, üstünde **40 px**. Denetim betiği
(2.7) bu eşiklerle ölçer. ORTAK KURALLAR'daki "mobilde en az 48 px" bu depo için 44 olarak okunur.

## 8. CI'da geliştirme sunucusunun bellek eşiğine dayanması (kök neden)
- Belirti: e2e işinde paketin sonlarına denk gelen rotalar (`/admin/*`, `/kullanim-kosullari`, `/fiyatlandirma` …)
  `ERR_CONNECTION_REFUSED` / `ECONNRESET` alıyordu (13–14 Kasım 2026, dört koşuda; 218/220 ya da 219/220).
- Günlükte: `[WebServer] ⚠ Server is approaching the used memory threshold, restarting...`.
- Kök neden: Next geliştirme sunucusu her istekten sonra yığını ölçer, **yığın sınırının %80'ini** geçince kendini
  yeniden başlatır (`node_modules/next/dist/server/lib/start-server.js`, `used_heap_size > 0.8 * heap_size_limit` →
  `process.exit(RESTART_EXIT_CODE)`). Varsayılan yığın sınırı makine belleğinin yarısı (`next-dev.js`: `totalmem * 0.5`;
  GitHub'ın herkese açık depo koşucusunda 16 GB → 8 GB). 220 testlik paket bir geliştirme sunucusunda 100'den fazla rotayı
  derliyor ve yığın 6,4 GB'ı geçiyordu; yeniden başlama anında gelen istekler düşüyordu.
- İlk denemem (6 GB) sınırı **düşürdü** (Next'in kendi 8 GB'ından az), sorun sürdü. Düzeltme (#646): `playwright.config.ts`
  CI'da `NODE_OPTIONS=--max-old-space-size=12288` (eşik 9,8 GB). Sonraki koşu 220/220.
- Ayrıca `/admin` testleri sırayla (`mode: "serial"`) koşuyor: misafir isteği ara katmanda 404 almıyor, yönetim düzeni
  derleniyor (panelin varlığı söylenmesin diye bilerek).
- Risk: paket büyüdükçe eşik yine aşılabilir. Kalıcı seçenek e2e'yi üretim derlemesine (`next build` + `next start`)
  taşımak; daha büyük bir değişiklik, karar senin.

## 9. Canlı duman testi #643'ten beri kırmızıydı ve fark edilmedi
- `Canlı duman testi` (`.github/workflows/canli-duman.yml`) her üretim yayınından sonra test hesabıyla canlıya girip
  öğrenci sayfalarını gezer. Main'deki koşular: 12 Kasım `1288c254` **yeşil** → 13 Kasım 19:34 `b25a9229` (#643)
  **kırmızı** → `f7e01605` (#644) kırmızı → `a68e33dd` (#645) kırmızı → 14 Kasım 00:43 `492e206e` (#646) **yeşil**.
- Neden: test hatası. `/pay`'deki kapat düğmesinin (`a.cx-shell-close`) 44 px dokunma alanı (`::before`) görünür 40 px
  düğmeden bilerek 2 px taşar ve `scrollWidth`'e girer; test bunu "üst çubuk yana taşıyor" sanıyordu. Üründe taşma yoktu.
  Düzeltme #646'da (aşağıda, rapor).
- **Neden fark edilmedi:** main'de dal koruması yok (`gh api …/branches/main/protection` → "Branch not protected");
  canlı duman testi yayından sonra koştuğu için hiçbir birleştirmeyi durdurmaz ve kırmızısı kimseye bildirilmiyor.
- Öneri (karar ve ayar senin; depo ayarı olduğu için ben değiştirmedim):
  1. Main için dal koruması: `build`, `test`, `e2e` zorunlu kontrol.
  2. Canlı duman testi kırmızıya dönünce bildirim: iş akışının sonuna `if: failure()` adımı (GitHub issue açar ya da
     e-posta gönderir) ya da GitHub'ın iş akışı bildirimlerini açmak.

## 10. Faz 2'de birleşen CSS'te ham hex
ORTAK KURALLAR "ham hex yazma" diyor; Faz 2 (#645) ve #646'da şunlar kaldı (Faz 0 üretim koduna dokunmadığı için düzeltilmedi):
- `src/styles/cx-shell.css`: logo katmanları (:50 `#e879f933`, :67 `#fff0 / #ffffffd9`, :73–79 akış renkleri, :117 `#fff`,
  :120 `#e879f9 → #fb923c`; hepsi logo tahtasının değerleri), Kütüphane satır ayraçları (:707 `#ffffff0a`, :776 `#0000000d`).
- `src/styles/cx-profile.css`: Sigma şeridinin çerçevesi (:419 `#fb718540`; `--cx-plan-sigma-line` ile aynı ailede ama ayrı
  saydamlık), satır ayracı (:502 `#ffffff0a`).
- Öneri: logo değerleri için `--cx-logo-*`, ayraç için `--cx-divider` token'ı; ilk dokunulan fazda.

## 11. Prompt 1'in 1.3 ölçümü: 12 ekran, gerçek oturumla (14 Kasım 2026)

Faz 1'de giriş gerektirdiği için ölçülemeyen 12 ekran, `e2e-plus` hesabının gerçek oturumuyla açıldı. Sunucu: yerel 3005,
canlı veritabanı, main `492e206e` + bu dal. Genişlikler 768×1024 ve 375×812 (telefon kipi, dokunmatik). Betik:
`npm run design:measure`; ham sonuç `data/onizleme-12-ekran.json`.

| Ölçü | Sonuç (24 ölçüm) |
|---|---|
| Durum kodu | 24/24 `200`, yönlendirme yok |
| Kabuk (üst çubuk ya da alt menü) | 24/24 var |
| Yatay taşma | 0 (hepsinde) |
| En küçük yazı | 11 px (mono etiketler, ör. "0/3 davet hediyesi") |
| Konsol hatası | 0 |
| Ekranda birden çok marka düğmesi | **2 ekran:** `/krediler` ("Bağlantıyı kopyala" + "Ek paket al"), `/sohbetler` boş durumu (başlıkta ve kartta iki "Yeni sohbet"). Marka düğmesi olmayan: `/araclar`, `/takvimim`, `/profil` |
| Eşik altı dokunma hedefi (768'de 40, 375'te 44) | 768: "⏳ Sınavına 45 Gün Kaldı" şeridi 32 px (`/deneme-sinavlari`), "Ek paket al" 39 px (`/krediler`). 375: aynı ikisi + 40 px'lik öğeler: "Sınav hazırlıklarım" başlık bağlantısı, Stüdyo kısayol hapları (4), `/siniflar` iki giriş kutusu, `/profil` "Ek paket", Ayarlar satır düğmeleri (Profili düzenle, Açık/Koyu/Sistem, E-posta adresini değiştir, Çerez tercihleri) |

Ölçüm notları:
- **İlk ziyaretteki "Seri" penceresi** (`gamification.tsx`) temiz her tarayıcıda sayfanın üstüne çıkıyor. İlk koşuda ölçüme
  karıştı: her sayfada bir marka düğmesi ve 20 px'lik "İlerlemeni gör" çıktı. Giriş betiği artık öğrencinin "Devam et"inin
  yazdığı anahtarı (`cortex-gamification-v1`) oturum dosyasına yazıyor. Görsel taban (2.6) aynı dosyaları kullanacak.
- Sol alttaki "N" Next'in geliştirme simgesi; yalnız yerel sunucuda var ve gölge DOM'da olduğu için ölçüme girmiyor. Görsel
  tabanda gizlenmeli (2.6).
- 40 px'lik öğeler masaüstü kuralını (40) karşılıyor, telefon kuralını (44) karşılamıyor. Hepsi Faz 0'da yalnız kayıt; 2.7'deki
  denetim betiğinin "ratchet" tabanına bugünkü sayılarıyla girecek.

## 12. Hazırlık sayfasının ilk ziyareti "Seviye tespiti" adımını kaldırıyor (yalnız rapor; düzeltilmedi)

**Görülen:** görsel tabanda hazırlık sayfası ilk ziyarette yolun başında bayraklı "Seviye tespiti" adımıyla çizildi,
ikinci ziyarette adım yoktu (`e2e-sigma`, `e2e-free-fresh`, `e2e-free-exhausted`; 14 Kasım 2026, üretim derlemesi). Hesap
o arada hiçbir etkinlik açmamıştı.

**Zincir (kodla doğrulandı):**
1. Hazırlık sayfası açılınca istemci sıradaki düğümü önceden yükler: `src/components/parity/exam-prep-home.tsx:438`
   (`router.prefetch(examPrepNodeHref(prepId, primaryNodeId))`) ve `:443` (ders önizlemesi farklı düğümdeyse o düğüm).
2. Next 15.5.29'da `router.prefetch` tür verilmeden çağrılınca **FULL** önceden yükleme yapar
   (`node_modules/next/dist/client/components/app-router-instance.js:292`, eski önbellek yolu varsayılan). Bu, düğüm
   sayfasının sunucu bileşenini gerçekten çalıştırır.
3. Düğüm sayfası tanı bekleyen hazırlıkta `intro_deferred_at`'i yazar:
   `src/app/deneme-sinavlari/[prepId]/dugum/[nodeId]/page.tsx:183-191`. Yorum niyeti açık söylüyor: "öğrenci bir etkinliği
   açtıysa ölçüm ertelenir".
4. Hazırlık sayfası `intro_deferred_at` doluysa adımı göstermez: `src/lib/learning/path-level.ts:9-17`
   (`shouldShowLevelNode`).

**Değerlendirme:** büyük olasılıkla **istenmeyen yan etki**. Yorum, öğrencinin bir etkinliği açmasını şart koşuyor;
oysa erteleme, öğrenci yalnız hazırlık sayfasına baktığında önceden yüklemeyle oluyor. `next dev` önceden yüklemediği için
geliştirme sunucusunda görünmüyor; yalnız üretimde. Sonuç: yeni kurulan hazırlıkta "Seviye tespiti" adımını öğrenci büyük
olasılıkla hiç görmüyor (sayfayı ilk açtığı an ertelenmiş oluyor). Ürün kararı gerektirir (yan etkisiz önceden yükleme
ya da ertelemeyi gerçek açılışa taşımak).

**Teste etkisi:** tohum betiği hazırlığı doğrudan ertelenmiş hâlde yazar (`intro_deferred_at` dolu; 05-test-hesaplari.md),
görsel taban ilk ve sonraki ziyarette aynı. Bu davranış düzelirse taban bilinçli güncellenir.

## 13. `/pay` kapat düğmesi testi: düzeltme gevşetme değil (kanıt)

**Test:** `tests/e2e/authenticated.spec.ts:111-133` (canlı duman testinin taşma denetimi; #646). `/pay`'de üst çubuk yok;
denetlenen öğe fiyat ekranının kapat düğmesi `a.cx-shell-close` (`:111`).

**Neden kırmızıydı:**
- Düğme 40 px görünür (`--cx-icon-btn-l`), dokunma alanı `::before` ile 44 px (`src/styles/cx-shell.css:355-360`,
  `inset: calc((40 - 44) / 2)` = -2 px).
- Bu alan düğmenin kutusundan her yana bilerek 2 px taşar ve düğmenin `scrollWidth`'ine girer. Eski ölçü
  `scrollWidth - clientWidth` bu yüzden 4 px verdi; testte 1 px'ten büyük fark "taşma" sayıldı.
- Düğme ekranın içinde. Sayfa taşmıyordu.

**Ne değişti** (yalnız bu öğe için ölçünün tanımı):
- Eklenen yardımcı `offscreen(el)` (`:121`) öğenin ekranın sağından ya da solundan taşan piksel sayısını ölçer:
  `max(0, ceil(rect.right - clientWidth), ceil(-rect.left))`.
- `header` değeri yalnız `a.cx-shell-close` için bu ölçüyle hesaplanır (`:128`); öbür bütün rotalarda üst çubuk için eski
  `scrollWidth - clientWidth` aynen.

**Değişmeyen:**
- Sayfa düzeyindeki denetim `page = documentElement.scrollWidth - clientWidth ≤ 1` (`:132`) her rotada, `/pay` dahil.
  Düğme gerçekten ekran dışına taşsaydı belge genişler ve bu denetim düşerdi.
- Eşik (`≤ 1`), rota listesi ve beklenen öğenin var olma denetimi (`:112`, `:131`) aynı.

**Sonuç:** kural gevşemedi. Yalnız tasarım gereği (44 px dokunma alanı, 06 §7) olan iç taşma "ekrandan taşma" diye
sayılmıyor. Ekran dışına taşan bir kapat düğmesi iki denetimden de geçemez.
