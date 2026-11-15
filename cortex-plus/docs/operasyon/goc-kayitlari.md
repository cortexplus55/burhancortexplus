# Canlı göç kayıtları

Kural değişmedi: göç canlıya **yalnız Burhan'ın açık onayıyla** uygulanır. Her uygulama buraya bir satır olarak yazılır.

## 20261115120000 · sinav_haftasi_cuzdan_donemi (PR #660)

| | |
|---|---|
| Onaylayan | Burhan (sohbette, 15 Kasım 2026: "PR #660 … ONAYLIYORUM. Veritabanı göçünü şimdi uygula") |
| Uygulama | 15 Kasım 2026, gece (TR ~02:35); Supabase SQL ekranı, tek çalıştırma (`begin … commit`) + kayıt satırı |
| Uygulayan | Claude, Burhan'ın onayıyla |
| Değişen | Yalnız aynı imzayla yeniden tanımlama; tablo, sütun ve veri değişmedi |

**Değişen iki fonksiyon:**

| Fonksiyon | Önceki tanım | Değişiklik |
|---|---|---|
| `public.credit_reserve(uuid, text, text, integer)` | `20261024123000_free_daily_zero.sql` | Yenilenen cüzdan dönemi aboneliğin bitişini geçmez; aboneliğin son 24 saatinde yeni dönem hakkı yazılmaz |
| `public.finalize_paytr_payment(text, text, text, jsonb)` | `20260923180000_paytr_subscription_tier_only.sql` | Cüzdan dönemi ödeme anından sayılır, aboneliğin bitişini geçmez (önce UTC gün başından sayılıyordu) |

**Uygulamadan önce yapılan kontrol (salt okuma):**
- `credit_reserve`: canlı gövdenin özeti (md5, satır sonları eşitlenmiş) depodaki `20261024123000` gövdesiyle birebir aynıydı.
- `finalize_paytr_payment`: canlı gövde depodaki `20260923180000` gövdesinden yalnız 4 yorum satırıyla ayrılıyordu; çalışan kod
  aynıydı.

**Uygulamadan sonra doğrulama:**
- İki fonksiyon yeni hâlinde.
- Türkçe bildirim metinleri sağlam ("aboneliğin açıldı").
- Kayıt satırı yazıldı.
- Yetkiler değişmedi (`authenticated` çalıştıramaz, `service_role` çalıştırır).

**Geri alma:** `supabase/rollback/20261115_sinav_haftasi_geri_al.sql` (göç değil). İki fonksiyonu göçten önceki gövdeleriyle
yeniden tanımlar; gövdeler göç dosyalarından birebir çıkarıldı. Yalnız Burhan'ın kararıyla, SQL ekranında tek çalıştırma.
Ardından PR #660'ın kodu (`quotaView`) geri alınmazsa ekran dönemi aboneliğin bitişiyle gösterir; sunucu eski davranışa
döner. İkisi birlikte geri alınmalı.

## 20261115140000 · duel_generate_credits (PR #673)

| | |
|---|---|
| Onaylayan | Burhan (sohbette, 15 Kasım 2026: "DÜELLO GÖÇÜNÜ UYGULA") |
| Uygulama | 15 Kasım 2026, 10:44 UTC (TR 13:44); Supabase SQL ekranı, tek çalıştırma + kayıt satırı |
| Uygulayan | Claude, Burhan'ın onayıyla |
| Değişen | `credit_rules`'a tek satır: `DUEL_GENERATE`, 20 kredi, etkin. Başka satır, tablo ve sütun değişmedi |

**Doğrulama:** `DUEL_GENERATE | 20 | true`, `QUIZ_GENERATE | 10 | true` (değişmedi), kayıt satırı 1. Kod (`duel.v2` bayrağı)
kapalıyken bu satır hiç kullanılmaz.

**Geri alma:** önce bayrak (panelde Kapat ya da "Benden kaldır"). Kod da geri alınırsa
`supabase/rollback/20261115_duello_9b_geri_al.sql`: satırı silmez, kapatır.

## 20261115160000 · match_chunks_narrow_sort (PR #683)

| | |
|---|---|
| Onaylayan | Burhan (sohbette, 15 Kasım 2026: "#683 … Göçünü uygulamayı ve PR'ı birleştirmeyi ONAYLIYORUM") |
| Uygulama | 15 Kasım 2026, ~13:20 UTC (TR ~16:20); Supabase SQL ekranı, tek çalıştırma + kayıt satırı |
| Uygulayan | Claude, Burhan'ın onayıyla |
| Değişen | Yalnız `public.match_document_chunks(uuid, vector, integer, double precision, uuid)` aynı imzayla yeniden tanımlandı; tablo, sütun ve veri değişmedi |

**Doğrulama:** canlı gövde yeni sıralamayı taşıyor (`ranked` CTE'si), kayıt satırı 1, `authenticated` çalıştıramıyor (yetki
aynı: yalnız `service_role`). Geçici dosya ölçümü: `pg_stat_statements` 24 saat sonra (`temp_blks_written` bu sorgu için 0
olmalı; docs/operasyon/disk-io.md).

**Geri alma:** `20261031160000_part_search_parent.sql` dosyasının `CREATE OR REPLACE` bloğunu SQL ekranında yeniden
çalıştırmak (göç değil; yalnız Burhan'ın kararıyla).

## 20261115170000 · document_study_map (PR #686)

| | |
|---|---|
| Onaylayan | Burhan (sohbette, 15 Kasım 2026: "#686 … Göçünü uygulamayı ONAYLIYORUM") |
| Uygulama | 15 Kasım 2026, ~13:33 UTC (TR ~16:33); Supabase SQL ekranı, tek çalıştırma + kayıt satırı |
| Uygulayan | Claude, Burhan'ın onayıyla |
| Değişen | `public.documents`'a tek boş bırakılabilir sütun: `study_map jsonb` (açıklamasıyla). Var olan satırların hiçbir değeri değişmedi |

**Doğrulama:** sütun `jsonb`, kayıt satırı 1, dolu satır 0 (harita ilk ihtiyaçta arka planda yazılır). Kod sütun yokken de
çalışır; PR #686 birleşmeden önce uygulandı (sütunu okuyan kod yalnız `teacher.v2` açıkken çalışır).

**Geri alma:** `ALTER TABLE public.documents DROP COLUMN study_map;` (yalnız Burhan; harita yeniden hesaplanabilir veridir).

## İstatistik işlemleri (göç değil)

| Zaman (UTC) | İşlem | Onay | Sonuç |
|---|---|---|---|
| 15 Kasım 2026 10:44:56 | `pg_stat_statements_reset()` | Burhan: "İSTATİSTİĞİ SIFIRLA" | 4.920 kayıt silindi. Önce anlık görüntü: `temp_files` 156.714, `temp_bytes` 465.873.273.828 (sıfırlanmadı) |
| 15 Kasım 2026 ~10:45 | `alter database postgres set log_temp_files = '10MB'` | Burhan kararı 6 | **Reddedildi:** "permission denied to set parameter log_temp_files". Hiçbir şey değişmedi; geri alınacak bir şey yok |
