# 10 · Hak sistemi (`lib/entitlements`)

Faz 3A, 14 Kasım 2026. Arayüz değişikliği yok. Sunucu gerçektir, tablo hedeftir (OTONOM §9): `getGate` bugünkü
sunucunun kararını birebir verir; ANA-PROMPT tablosundan ayrıldığı her yer aşağıda ve `KNOWN_DEVIATION` testlerinde.

## Dosyalar

| Dosya | Ne |
|---|---|
| `src/lib/entitlements/types.ts` | `Plan`, `Action`, `GateReason`, `Gate`, `EntitlementSnapshot`, `GateContext` |
| `src/lib/entitlements/config.ts` | Sayılar bugünkü yerlerinden: `FREE_DAILY_LIMITS`, `PAID_PLANS`, `ACTION_CODE`, `actionCost`, `plusOnly`, `DUEL_ACCESS`, `EXAM_WEEK_OFFER_THRESHOLD_DAYS = 14`, `PLUS_QUOTA_WARN_PERCENT = 90` |
| `src/lib/entitlements/gate.ts` | `resolvePlan`, `snapshotFromAccount`, `getGate` (saf), `gateFromRefusal` |
| `src/lib/entitlements/server.ts` | `entitlementSnapshot`, `assertGate`, `refusalCodeForGate` (yalnız sunucu) |
| `src/lib/entitlements/track.ts` | `track(name, payload)`: depodaki PostHog yolu (yalnız çerez izniyle yüklü) |

Fiyatlar (₺) kodda değil, `plans.price_try`'da; `loadPlusPrices` okur (3B'de Sigma da eklenecek).

## Karar sırası (sunucuyla aynı)

`reserveCredits` (`src/lib/credits/service.ts`) + SQL `credit_reserve_metered` / `credit_reserve`:

1. Kurucu (`is_admin`, önizleme kapalı) → her şey açık, sayaç yok.
2. Abone (Plus, Sınav Haftası, Sigma) → dönem hakkı (tembel yenileme `quotaView`) + cüzdan bakiyesi bedeli karşılıyorsa açık.
3. Ücretsiz (önizlemedeki kurucu dahil, cüzdanı hediye sayılmaz):
   ders kapısı (bakiye = hediye) → harcama sigortası → okunamayan fotoğraf → Plus'a özel iş → günlük sayaç → bakiye.

## Karar tablosu (bugünkü sunucu)

| Eylem | Ücretsiz | Plus | Sınav Haftası | Sigma | Kurucu |
|---|---|---|---|---|---|
| `lesson.create` | ilk ders bitmediyse `open` + `free_first_lesson_available`; bittiyse `locked` + `free_first_lesson_used` + Plus (bakiye 30 kredi karşılıyorsa `limited` `quota_ok` `lifetime`); düğüm bağlamında ilk dersin döngüsü `open`, başka konu `free_topic_limit` | `limited` `month`; ≥ %90 `plus_quota_90`; karşılanamıyorsa `locked` `plus_quota_100` + Sigma | `limited` `week`; uyarı yok; karşılanamıyorsa `locked` `quota_reset_wait` (teklifsiz) | `limited`; karşılanamıyorsa `quota_reset_wait` (teklifsiz) | `open` |
| `teacher.message` | `limited` `day` (3); 0 kalınca `locked` `daily_messages_used` + Plus + `resetAt` (İstanbul gece yarısı) | aynı havuz, aynı eşikler | aynı | aynı, teklifsiz | `open` |
| `photo.solve` | `limited` `day` (1); bitince `daily_photo_used` | havuzdan (4 kredi) | aynı | aynı | `open` |
| `podcast.create`, `video.create`, `oral.start`, `written.start` | `locked` `feature_requires_plus` + Plus | havuzdan | havuzdan | havuzdan | `open` |
| `cram.export` | `locked` `feature_requires_plus` | `open` (kredisiz) | `open` | `open` | `open` |
| `duel.start` | `DUEL_ACCESS`: bakiye ≥ 10 ise `limited`, değilse `feature_requires_plus` | havuzdan (10) | havuzdan | havuzdan | `open` |

Ek retler (`GateReason`'a eklendi, OTONOM §9 karar 5): `spend_cap` (teklif yok), `free_topic_limit`, `free_prep_limit`,
`free_included_limit` (teklifsiz, gece yarısı), `free_photo_abuse_limit`.

## Sunucu: 402 + `{ gate }`

Rotalar hakkı bugün zaten zorluyor; ikinci bir ön kontrol yalnız birinciyle ayrışabilirdi. Bu yüzden `assertGate`
rotalara eklenmedi. Her 402 gövdesine `gate` eklendi (`errorResponse`, `gateFromRefusal`); `error` ve `code` aynen.
`assertGate` hak kararını önceden isteyen yeni bir uç için hazır.

402 dönen yerler (hepsi artık `gate` taşır, `insufficient_credits` hariç: planı bilmeden kapı yazılmaz):

- `errorResponse(402, …)` üzerinden:
  - `/api/ai/chat`, `/api/learning/exam-prep/voice`, `/api/learning/podcast/audio`, `/api/learning/speech`;
  - `/api/learning/exam-prep/{podcast,video,duel,challenge}`;
  - `/api/learning/{quiz,flashcards,true-false,study-plan}/generate`, `/api/learning/podcast/generate`,
    `/api/learning/oral/transcribe`;
  - yol adımı (`node/start.ts`, `lesson-adopt.ts`, `prefetched.ts`).
- Kendi gövdesiyle: `node/start.ts` `free_topic_limit`, `/exam-prep/create` ve `/exam-prep/invite/join` `free_prep_limit`.
- Değişmeyen 402'ler (belge sayfa hakkı, okul): `/api/documents/{preflight,process}`, `/api/school`. Hak sisteminin
  eylemi değiller.

Sayaçlar: ayırma işten önce artar, hata yolunda iade edilir (`credit_refund`). Kabul edildi (OTONOM §9 karar 6);
arayüz sayacı kendisi artırıp azaltmaz.

## Tablo–sunucu farkları

Ayrıntı ve kanıt: `bilinen-sunucu-sapmalari.md`. Testler: `tests/unit/hak-sistemi-karakterizasyon.test.ts`
("KNOWN_DEVIATION").

| # | Tablo | Sunucu (kapı bunu verir) |
|---|---|---|
| 1 | Plus %100 → `locked` + Sigma | Ek paket ya da hediye bedeli karşılıyorsa açık; kapı `limited` `plus_quota_90` |
| 2 | Sınav Haftası `resetAt` = paket bitişi | Cüzdan dönemi (UTC gün başı + 7). Aradaki saatlerde sunucu yeni 2.700 hak yazar |
| 3 | Ücretsiz "ilk ders kullanıldı" tek durum | Karar düğüm başına. Düğümsüz `lesson.create` ilk ders bitmeden `open` döner; Stüdyo / "Farklı anlat" sunucuda yine 402 |
| 4 | Kurucu ayrı | `is_admin` (admin + founder) muaf; kapıda ikisi de Kurucu |
| 5 | Okuma hatası yok | Sayaç okunamazsa sayısız `limited`; ilk ders okunamazsa `open`; kararı SQL verir |
| 6 | Tabloda olmayan retler | `spend_cap`, `free_topic_limit`, `free_prep_limit`, `free_included_limit`, `free_photo_abuse_limit` |
| 7 | `photo.solve` tek yol | Sohbetteki fotoğraf `AI_CHAT_STANDARD` + fotoğraf sayacı (3 kredi); çözücü `IMAGE_SOLUTION` (4). Kapı çözücünün bedelini kullanır |
| 8 | "Kalan ders" ve "kalan mesaj" ayrı | Ücretli hesapta tek kredi havuzu; ikisi aynı `remaining` |
| 9 | Sınav Haftası'nda kota sheet'i yok | Kapı Sınav Haftası'nda `plus_quota_*` vermez; bugünkü `PlusLimitBanner` / `CreditLimitToast` 3B'ye kadar durur |
