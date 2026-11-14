# 04 · Limit ve fiyat yapılandırması

Değerlerin depoda **nerede ve hangi sayıyla** tutulduğu. Hiçbiri değiştirilmedi. Kod satırları main `492e206e`
(14 Kasım 2026); fiyatlar canlı veritabanının `plans` tablosundan yalnız okunarak alındı (aynı gün).

Önemli: **fiyatlar kodda değil, veritabanında** (`plans.price_try`, kuruş). Kod `loadPlusPrices`
(`src/lib/billing/plan-prices.ts:14`) ile okur. Tahtalardaki ₺599 / ₺349 / ₺1.999 bugünkü değerlerle aynı.

| Değer | Bugünkü sayı | Nerede | Not |
|---|---|---|---|
| Günlük öğretmen mesajı (Ücretsiz) | **3** | `src/lib/billing/free-meters.ts:25` (`FREE_LIMITS.chat`, `FREE_CHAT_PER_DAY` :26); SQL `free_meter_limit('chat')` (`supabase/migrations/20261111180000_free_lesson_trial.sql:26`) | Kod ve SQL aynı sayıyı tutar; ikisi birlikte değişir. |
| Günlük fotoğraftan soru (Ücretsiz) | **1** | `free-meters.ts:25` (`FREE_LIMITS.photo`, `FREE_PHOTO_PER_DAY` :27); SQL `free_meter_limit('photo')` | Okunamayan fotoğraf iade; günde 3 okunamayandan sonra durur (`photo-abuse-guard.ts`). |
| Ücretsiz ders sayacı | **0** (ders Plus'ta) | `free-meters.ts:25` (`FREE_LIMITS.lesson`); SQL `free_meter_limit('lesson')` | 11 Kasım 2026 akşamından beri "ücretsiz hesap = tek ders". |
| İlk dersin süresiz açık kuralı | ilk hazırlığın **1. konusu**, ders döngüsü (anlatım, konu testi, D/Y, kartlar, soru-cevap) | `src/lib/billing/first-lesson-cycle.ts`, `free-topic-rule.ts` (`firstLessonCycleNode`), `free-topic-gate.ts:84` | Sayaç: "derse dahil" (`included`) günde **40** (`FREE_LIMITS.included`, kötüye kullanım sınırı). "İlk hazırlık" = hesabın daha önce ücretsiz yol adımı ayırmadığı anda kurulan hazırlık. |
| Ücretsiz hazırlık sayısı | **1** | `src/lib/billing/free-tier-copy.ts:9` (`FREE_PREP_LIMIT`), `free-prep-limit.ts:21` | |
| Ücretsiz belge sınırı | toplam **25** sayfa | `src/lib/billing/free-tier-copy.ts:15` (`FREE_PAGE_TOTAL`); `src/lib/billing/entitlements.ts:61` (`PHOTO_PAGE_LIMITS`: ücretsiz 25 toplam, Plus 300, Sigma 1.000 fotoğraf/taranmış sayfa) | |
| Plus aylık hak | **7.200** kredi ≈ **240 ders** ya da **2.400 mesaj** | `src/lib/credits/price-table.ts:97` (`PLAN_ALLOWANCES.plusMonthly`); canlı `plans.monthly_allowance` (plus-aylik) = 7200 | Ders 30 kredi (`STUDY_PLAN_GENERATE`, :40), mesaj 3 (`AI_CHAT_STANDARD`, :27); `allowanceInWork` :114. |
| Sınav Haftası | **7 gün**, **2.700** kredi ≈ **90 ders** ya da **900 mesaj** | `price-table.ts` (`PLAN_ALLOWANCES.plusWeekly`); canlı `plans`: slug `plus-haftalik`, `period_days` 7, `billing_period` weekly, `monthly_allowance` 2700 | Kimlikte "Plus" (tier plus); kalan gün aboneliğin `current_period_end`'inden (`plan-identity.ts:27`). |
| Sigma aylık hak | **60.000** kredi ≈ **2.000 ders** ya da **20.000 mesaj** | `price-table.ts` (`PLAN_ALLOWANCES.sigmaMonthly`); canlı `plans` (sigma-aylik) `monthly_allowance` 60000 | |
| Plan fiyatları (canlı, etkin) | Plus aylık **₺599** (59900 kuruş) · Sınav Haftası **₺349** (34900) · Sigma aylık **₺1.999** (199900) | veritabanı `plans.price_try`; kod `plan-prices.ts:14` (yalnız plus-aylik ve plus-haftalik okur) | Etkin olmayan satırlar: plus-yillik ₺2.990, sigma-yillik ₺9.990, eski baslangic/plus/pro. |
| Ek paketler | S **₺129** (1.000 kredi) · M **₺329** (2.500) · L **₺749** (5.750) | `price-table.ts` (`ADDON_PACKS`); canlı `plans` (ek-kredi-50/150/400) aynı | |
| `AUTO_RENEW_SUPPORTED` | **false** | `src/lib/payments/paytr-capability.ts:34` | Bekçi test sözleşme metninin "otomatik olarak yenilenmez" demesini tutar. |
| Düello: bugünkü plan davranışı | Hazırlıkta **düello kurmak** ders sayacına düşer → **ücretsizde Plus**; paylaşılan bir düelloyu **oynamak** ve **bot düellosu** herkese açık (misafir dahil) | `src/app/api/learning/exam-prep/duel/route.ts:62` (kurma), `src/app/api/duels/[code]/run/route.ts`, `…/bot/route.ts` (oynama) | **Günlük düello hakkı yok**; yalnız hız sınırı (oturumlu öğrenci kendi sayacıyla 10/dk, misafir IP'den 60/dk; `guards.ts` `duelLimit`). Bot düellosu kayıt ve yıldız yazmaz. |
| Kota yenilenme günü | Ücretsiz sayaçlar: **İstanbul gece yarısı** (her gün) · Ücretli kota: **dönem sonu** (abonelik başlangıcından +30 gün, haftalıkta +7) | Ücretsiz: `free-meters.ts:81` (`freePeriodKey` = İstanbul günü), `:86` (`freeMeterResetsAt`); ücretli: `src/lib/credits/period.ts:66` (`quotaView`, cüzdanın `period_ends_at`'i), `src/lib/payments/subscription.ts:46` (`planPeriodDays`) | Erken yenilemede kalan süre yanmaz (`subscription.ts`). Dönem bittiyse yenileme bir sonraki işlemde yazılır (`period.ts:90` `pendingRefill`). |

## Bulunamayan
Yok. Bütün değerler depoda ya da `plans` tablosunda bulundu.
