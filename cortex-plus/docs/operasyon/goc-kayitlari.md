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
| Uygulama | 15 Kasım 2026, ~13:15 UTC (TR ~16:15); Supabase SQL ekranı, tek çalıştırma + kayıt satırı |
| Uygulayan | Claude, Burhan'ın onayıyla |
| Değişen | Yalnız `public.match_document_chunks(uuid, vector, integer, double precision, uuid)` aynı imzayla yeniden tanımlandı; tablo, sütun ve veri değişmedi |

**Doğrulama:** canlı gövde yeni sıralamayı taşıyor (`ranked` CTE'si), kayıt satırı 1, `authenticated` çalıştıramıyor (yetki
aynı: yalnız `service_role`). Geçici dosya ölçümü: `pg_stat_statements` 24 saat sonra (`temp_blks_written` bu sorgu için 0
olmalı; docs/operasyon/disk-io.md).

**Geri alma:** `20261031160000_part_search_parent.sql` dosyasının `CREATE OR REPLACE` bloğunu SQL ekranında yeniden
çalıştırmak (göç değil; yalnız Burhan'ın kararıyla).

## 20261119150000 · cevap_anahtari_okuma_kapat (PR #707)

| | |
|---|---|
| Onaylayan | Burhan (sohbette, 20 Kasım 2026: "SADECE PR #707 CANLIYA GİRDİKTEN SONRA, `20261119150000` cevap anahtarı RLS migration'ını canlı Supabase veritabanına uygula") |
| Uygulama | 20 Kasım 2026, TR ~01:40; #707 birleşme commit'i `24a7e86c` Vercel'de "success" ve üretim duman testi 7/7 geçtikten sonra. Supabase SQL ekranı, tek çalıştırma + kayıt satırı |
| Uygulayan | Claude, Burhan'ın onayıyla |
| Değişen | Yalnız izin: yedi tabloda `anon` ve `authenticated` için tablo düzeyi SELECT kalktı, `authenticated` anahtar taşımayan sütunları okur. Satır, sütun, politika ve veri değişmedi |

**Doğrulama:** `has_column_privilege` ile: `practice_exam_questions` (correct_answer, correct_answers, explanation, model_answer,
rubric), `quiz_questions` (correct_answer, explanation), `exam_prep_node_attempts.payload`, `exam_prep_intro_attempts.payload`,
`exam_prep_lessons` (content_json, content_md), `exam_prep_podcasts.listening_check`, `prep_duels.questions` için authenticated
ve anon **false**; anahtar olmayan sütunlar (soru metni, durum, başlık, bölümler) authenticated için **true**. Kayıt satırı 1.
Göçten önce ve sonra kurucu hesabıyla aynı dört sayfa (bitmiş ders, düğüm sonucu, deneme sonucu, deneme incelemesi) 200 ve
birebir aynı içerikle açıldı; inceleme doğru yanıtları ve çözüm açıklamalarını gösteriyor. Sınavlar, hazırlık, sınav sabahı,
İlerleme, Yanlışlarım, öğretmen ve Çalışma Stüdyosu 200.

**Geri alma:** `supabase/rollback/20261119_cevap_anahtari_okuma_geri_al.sql` (göç değil; açığı yeniden açar, yalnız Burhan'ın kararıyla).

## İstatistik işlemleri (göç değil)

| Zaman (UTC) | İşlem | Onay | Sonuç |
|---|---|---|---|
| 15 Kasım 2026 10:44:56 | `pg_stat_statements_reset()` | Burhan: "İSTATİSTİĞİ SIFIRLA" | 4.920 kayıt silindi. Önce anlık görüntü: `temp_files` 156.714, `temp_bytes` 465.873.273.828 (sıfırlanmadı) |
| 15 Kasım 2026 ~10:45 | `alter database postgres set log_temp_files = '10MB'` | Burhan kararı 6 | **Reddedildi:** "permission denied to set parameter log_temp_files". Hiçbir şey değişmedi; geri alınacak bir şey yok |
