# Bilinen sunucu sapmaları (tablo ↔ bugünkü sunucu)

ANA-PROMPT 3A karar tablosu hedeftir; sunucu gerçektir (OTONOM §9). Aşağıdaki farklarda sunucu DEĞİŞTİRİLMEDİ,
`getGate` sunucuyu izler, fark testle sabittir. Kanıt satırları main `492e206e`.

| # | Fark | Kanıt | Kapının davranışı | Test | Karar |
|---|---|---|---|---|---|
| 1 | Plus %100 + ek paket / hediye: sunucu `balance + free_allowance_remaining ≥ bedel` ise açar | `supabase/migrations/20261024123000_free_daily_zero.sql:186-197` | `limited` + `plus_quota_90`; Sigma teklifi yalnız sunucu reddedince | karakterizasyon "Plus %100 + ek paket" | OTONOM §9.1 |
| 2 | Sınav Haftası: abonelik `ödeme + 7 gün`, cüzdan `UTC gün başı + 7 gün` biter; arada sunucu yeni 2.700 hak yazar | `20260923180000_paytr_subscription_tier_only.sql:141-142,159,202-204`; `free_daily_zero.sql:138-162` | `resetAt` = cüzdan dönemi; aradaki saatlerde açık | `KNOWN_DEVIATION Sınav Haftası resetAt` | OTONOM §9.2; **Burhan kararı** (sunucuya dokunulmadı) |
| 3 | Ücretsiz ilk ders düğüm başına (`first-lesson-cycle.ts:57-79`, `start.ts:67-79,342-344`) | — | Bağlamsız `lesson.create` ilk ders bitmeden `open`; kilit sunucu 402'sinde | `KNOWN_DEVIATION ilk ders` | OTONOM §9.3 |
| 4 | `is_admin` admin ve founder'ı birlikte muaf tutar | `20261106150000_founder_role.sql:38-49` | İkisi de Kurucu görünümü | `hak-sistemi.test.ts` "resolvePlan" | OTONOM §9.4 |
| 5 | Okuma hatasında ekran ile SQL farklı yöne düşer | `free-usage-server.ts:28-31`, `node-free-meter.ts:23-24,31`, `free-lesson-gate.ts:55-72` | Bilinmeyen sayaç sayısız `limited`; bilinmeyen ilk ders `open` | `hak-sistemi.test.ts` | Sunucu kazanır (402 `gate`) |
| 6 | Tabloda olmayan retler | `service.ts:155-167`; `start.ts`; `create/route.ts:213` | Eklenen nedenler; `spend_cap`'te teklif yok | `hak-sistemi.test.ts` "harcama sigortası", "402 gövdesinde gate" | OTONOM §9.5 |
| 7 | Fotoğraf iki yoldan (3 / 4 kredi) | `chat/route.ts:322-323`, `solve-run.ts:112` | Kapı çözücünün bedelini (4) kullanır | `KNOWN_DEVIATION fotoğraf iki yoldan` | — |
| 8 | Ders ve mesaj tek havuz | `price-table.ts:114-119` | Aynı `remaining` / `limit` | `KNOWN_DEVIATION ders ve mesaj tek havuz` | — |
| 9 | Sınav Haftası'nda bugün şerit ve toast var; tahtada sheet yok | `sor-shell.tsx:415-417`, `plus-limit-banner.tsx:22-28`, `credit-gate.tsx:68-75` | Kapı Sınav Haftası'nda `plus_quota_*` vermez | `hak-sistemi.test.ts` "Sınav Haftası" | 3B'de korunur |

Ayrıca (karar değil, iz): öldürülen podcast, sözlü, video, çizimli video ve sesli tur ayırmaları cron'da otomatik iade
edilmez (`service.ts:273-285`); ücretsiz sayaç gece yarısını geçen başarısız işte geri dönmez
(`free_tier_counts.sql:256`). Sayaç "önce artır, hata olursa iade" kabul edildi (OTONOM §9.6).
