# Katman farkları — Astra'ya karşı Cortex Plus

Durum kodları: `matched` bizde var · `missing` yok · `partial` var ama farklı ·
`extra` bizde var Astra'da yok · `BLOCKED` görülemedi.

## Kapanan (bu turda yapıldı)

| # | Katman | Fark | Durum | Kanıt |
|---|---|---|---|---|
| 1 | ücretsiz | Öğrenci hangi pakette olduğunu göremiyordu; Astra'da profilin en üstünde | **kapandı** | `astra-profile-dialog.tsx` paket rozeti + "Daha hızlı öğren"; canlı: "Temel — Ücretsiz plan · günlük hak, 12 Eylül 2026 03:00 yenilenir" |
| 2 | her ikisi | Yenilenme saati ekranda 00:00 yazıyordu, gerçekte 03:00 | **kapandı** | `period.ts` + `format.ts` saat dilimi sabitlendi; canlı: "12 Eylül 2026 03:00 tarihinde sıfırlanır"; test: `credit-period.test.ts` |
| 16 | ücretsiz | Hak bitince ekran "Yeniden deneyebilirsin" diyordu; denemek hiç işe yaramıyor | **kapandı** | `generation-failure.ts` `insufficient_credits` karşılığı + yenilenme saati + "Hakkımı gör"; `canRetryNow` artık arayüzde okunuyor, çalışmayan düğme çizilmiyor. Test: `generation-failure.test.ts` |
| 17 | premium | Rozet ücretsize özel olunca abonenin paketini görebileceği yol kalmadı | **kapandı** | Profil paneline "Kullanımım → /krediler" ve "Aboneliğim → /odemeler" eklendi; canlıda doğrulandı |
| 18 | premium | Astra profilinde paket rozeti YOK, yalnızca ücretsizde | **kapandı** | Rozet `account && !account.isPremium` koşuluna alındı; her iki Astra katmanına da girilip doğrulandı |

## Zaten eşleşenler (kod okunarak doğrulandı — yeniden yazılmadı)

| # | Fark | Durum | Kanıt |
|---|---|---|---|
| 3 | Günlük hak / aylık hak ayrımı | `matched` | `credit_reserve` SQL: ücretsiz `v_kind='daily'`, premium `'monthly'` |
| 4 | Tek toplam sayaç + yüzde + sıfırlanma tarihi | `matched` | `/krediler` — "Temel — Günlük limit / %100 kullanıldı" |
| 5 | Davet çarpanı 3 kat / 400 kat | `matched` | `referral_multiplier()`; `/krediler` davet bloğu metni birebir aynı mantık |
| 6 | "Satın al" yalnızca ücretsize | `matched` | `astra-parity-sor-shell.tsx:66` `showBuy = !account?.isPremium` |
| 7 | Kampanya bandı yalnızca ücretsize | `matched` | aynı dosya: `promo && !isPremium` |
| 8 | Premium'a özel limit uyarısı | `matched` | aynı dosya: `showPlusLimit` |
| 9 | Misafir uygulamaya giremez, pazarlama sitesi açık | `matched` | `middleware.ts`; Astra'da da `app.` alt alanı giriş duvarlı |
| 10 | Özellikler katmana göre KAPATILMAZ | `matched` | Astra ücretsiz hesabı podcast'i açtı, `/lab` tamamen açık — bizde de kapı kullanımda |

## Açık kalanlar

| # | Katman | Fark | Durum | Not |
|---|---|---|---|---|
| 11 | premium | Astra hak ekranında **"Ek paket satın al"** yalnızca abonede; ücretsizde sayacın altı boş görünüyordu | `doğrulanmadı` | Ücretsiz ekranın görüntüsü kesilmiş olabilir. Bizde `/krediler` zaten katmana göre dallanıyor (`isPremium`) ve ücretsize "Kullanımını artır" veriyor. Çalışan bir yükseltme yolunu yarım gözleme dayanarak KALDIRMADIM; ücretsiz hesapta sayacın altı yeniden bakılmalı. |
| 12 | ücretsiz | Hak bitince çıkan duvarın metni | `BLOCKED` | Astra hesabının günlük hakkı bu sabah sıfırlanmıştı (%0), duvar görülemedi |
| 13 | misafir | Astra hesapsız onboarding'e sokuyor | `matched` | Bizim `/kayit` de öyle: oturumsuz tarayıcıda "Adım 1/6 — Hangi sınıftasın?" açıldı, seçim yapıldı, hesap istemeden "Adım 2/6 — En çok hangi derste desteğe ihtiyacın var?" geldi. Astra: welcome → role → voice → intent → ad → yaş. İkisi de hesabı sona bırakıyor. |
| 14 | misafir | Astra onboarding'inde **rol seçimi** (öğrenci/öğretmen/ebeveyn) | `extra (bilerek)` | `3e666f6` veli/öğretmen arayüzünü emekli etti; AGENTS.md kaydı |
| 15 | her ikisi | Astra'da `/lab` (34 simülasyon) | `extra (bilerek)` | `13a175e` kaldırdı, 11 Eylül'de bir daha soruldu, karar aynı |

## Bizde olan, Astra'da olmayan

- `parent_payment_requests` — "veliden ödeme iste" (AGENTS.md: Astra'da yok, bizde çalışıyor)
- `/krediler` işlem başına kredi tablosu ve hareket dökümü — Astra kırılım göstermiyor
