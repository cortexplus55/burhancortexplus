# Soru çözücü — 23 Ekim 2026

Ürün sahibi: "fotoğraftan soru çözümü … yüzde 100 doğruluk … maksimum 15 sn … en anlaşılır ve basit bir dille
… Astra tarzı … bütün derslerde … kendi belgesinde olmayan bir soru da olabilir … kendi tasarım dilimizi kullan."

## Eskiden ne vardı, neden yetmiyordu

`/soru-coz` ve sohbetteki kamera aynı eski ucu (`/api/ai/solve-image`) kullanıyordu. Canlı kayıt: 6 deneme,
5'i iade, 1'i ücretlendi — gerçek bir öğrenci hiç kullanmamıştı. Kodda bulunan hatalar:

| Hata | Sonuç |
|---|---|
| Denetçinin `approved:false` cevabı yok sayılıyordu | Yanlış bulunan çözüm öğrenciye gidiyordu |
| Okunmayan fotoğraf ücretleniyordu | Öğrenci bulanık fotoğrafa hak ödüyordu |
| Adımların aritmetiği ve şık eşleşmesi kontrol edilmiyordu | "x = 8 / 2 = 5" geçiyordu |
| Fotoğraf cihazda küçültülmüyordu | 4,5 MB'lık gövde sınırında telefon fotoğrafı hiç ulaşmıyordu |
| Sohbette görsel `activeDocumentId`'de kalıyordu | Sonraki **her** mesaj görseli yeniden gönderiyor, fotoğraf fiyatından ücretleniyor, ücretsiz fotoğraf hakkını yiyordu |
| Ücretsizde "Plus'ta açık" | Astra'nın en çok kullanılan özelliği ücretsiz öğrenciye kapalıydı |

## Astra'da 10 dersten 10 soru (Plus hesabı)

10/10 doğru. Sözel sorular 3–10 sn, işlemli sorular 17–27 sn. Yaklaşım:

- **İşlemli soru:** Verilenler · İstenen · "Çözüm adımları 1/N" kartı ("Sonraki adım" ile açılır) · Yanıt / doğru şık.
- **Sözel soru:** önce cevap, sonra her şıkkın neden doğru ya da yanlış olduğu.
- Her ikisinde: "Karıştırılan nokta", "Unutma / altın ipucu", kısa bir kontrol, kapanışta bir soru.

Bizde aynı içerik, kendi tasarımımızla (Figtree, koyu palet, mavi eylem, yeşil doğru, turuncu uyarı; altın yok).

## Motor (`src/lib/solve/`)

| Adım | Ne | Neden |
|---|---|---|
| 1 | İki **bağımsız** luna çağrısı aynı anda: tam çözüm (`SOLVER_SYSTEM`) ve yalnız cevap (`QUICK_SYSTEM`), düşük düşünme | İki çözüm aynı cevabı veriyorsa yanlış olma ihtimali çok düşer; paralel olduğu için süre eklemez |
| 2 | Kod kontrolü (`solutionIssues`): cevap şıklardan biri mi, bulunan sayı işaretlenen şıkla aynı mı, her adımın eşitlik zinciri tutuyor mu (`step-arithmetic.ts`, `eval` yok) | Modelin "doğru" dediği hesabı kod yeniden yapar |
| 3 | Uyuşmazlık ya da sorun varsa uzlaştırma (luna, orta düşünme); emin değilse **"Emin değiliz"** rozeti | Yanlış cevabı kendinden emin göstermemek |
| 4 | İlk çözüm ekranda; arkada gpt-4.1 denetimi. Onaylarsa "doğrulandı", itiraz edip düzeltme farklı cevap verirse çözüm değişir ve söylenir | Ekran beklemez; denetim yalnız iyileştirir |

Rozet dürüst: "doğrulandı" yalnız denetçi **açıkça** onayladığında (`verified.confirmed`). Denetim çağrısı düşerse
ya da itiraz edip düzeltme aynı cevabı verirse rozet "İki ayrı çözüm aynı sonucu verdi"de kalır.

Okunmayan fotoğraf (`readable:false`) iade edilir: "Soruyu kadraja tam alıp, ışıkta ve düz tutarak yeniden çek."
Yazılı soru da aynı motordan (belge gerekmez, her ders).

## Hak ve ücret (ürün sahibinin kararı)

| Kim | Fotoğraf | Yazılı soru |
|---|---|---|
| Ücretsiz | Günde **3**, krediye dokunmaz (`freeImageAllowed`) | Sohbet mesajı fiyatı (3) |
| Plus / Sigma | `IMAGE_SOLUTION` (10) | Sohbet mesajı fiyatı (3) |
| Kurucu | Muaf; "Ücretsiz gibi gör" açıkken ücretsiz gibi | — |

Hızlı işlem yalnız Plus'ta ve yalnız luna çağrılarında (gpt-4.1 denetçi normal).

## Ölçüm (tam motor, 10 ders, `tests/unit/_tmp/solve-run-bench.test.ts`)

| | İlk çözüm | Denetim onayı | Doğru |
|---|---|---|---|
| Plus (hızlı işlem) | 2,9–5,1 sn | 4,3–7,2 sn | 10/10, hepsi denetçi onaylı |
| Ücretsiz (normal) | 5,6–9,5 sn | 6,8–10,7 sn | 10/10, hepsi denetçi onaylı |

Maliyet soru başına ~0,003 $ (luna iki çağrı + gpt-4.1 denetim). Fixture: `tests/fixtures/photo-solve/`
(matematik, fizik, kimya, biyoloji, Türkçe, tarih, coğrafya, İngilizce, tıp, geometri açık uçlu; sorular bizim
yazdığımız, telif yok; `scripts/render-photo-solve-fixtures.cjs` hafif eğik ve bulanık fotoğraf gibi çizer).

"Yüzde 100" vaadi verilmez: iki bağımsız çözüm + kod + denetim yanlışı çok seyrek yapar, ama ekran emin
olmadığında bunu söyler. Pazarlamada "her zaman doğru" yazılmaz.

## Nerede

| Yüzey | Davranış |
|---|---|
| `/soru-coz` | Fotoğraf çek / galeriden seç / yaz → Çöz; adım adım tahta, şıklar, kutular, "Sorunun okunuşu" |
| Sohbet kamerası ve eklenen görsel | Aynı motor, aynı kart sohbetin içinde; çözüm sohbete **metin olarak** kaydedilir (ilk çözümle, denetimi beklemeden; düzeltilirse metin de düzelir), sonraki mesajlar onu bağlam olarak okur. Fotoğraf saklanmaz, sonraki mesajlarla gitmez |
| Hazırlık sayfası üst çubuğu | Kamera simgesi → `/soru-coz?hazirlik=…`; şıklı soru "Tekrar listeme ekle" ile o hazırlığın tekrarına girer (yarın, sonra 3-7-14 gün; tekrar ekranında "Çözdüğün soru") |

Tekrar listesine eklenen soru **imzalı belirteçten** gelir (`solve-review.ts`, HMAC, 6 saat): doğru cevap
tarayıcıdan alınmaz. "Emin değiliz" çözümü ve açık uçlu soru eklenmez.

## Bekçi

`question-solver.test.ts` (iki çözüm, aritmetik, şık eşleşmesi, ekran durumu, sohbet metni, imzalı ekleme),
`plus-month.test.tsx` (fotoğraf ücretsizde günde 3), `cost-controls.test.ts`, `free-preview.test.ts`.
