# 13.0 denetimine ek (PROMPT-V2 §10 PR-0) · Öğrenci Dosyası tabloları ve geçici dosya yazan sorgular

15 Kasım 2026, TR ~14:40. Kaynak: canlı veritabanı (`dgjfyewgrukglsehyntc`), yalnız katalog ve istatistik okuması
(`pg_class`, `pg_index`, `pg_stat_database`, `pg_stat_statements`). Kullanıcı verisi ve sorgu metni okunmadı.

## 1. Öğrenci Dosyası'nın okuyacağı tablolar (hepsi bugün var; yeni tablo gerekmiyor)

| Dosya satırı (PROMPT-V2 §3) | Tablo | Tahmini satır | Boyut | İndeks (ilk sütun) |
|---|---|---|---|---|
| Yanlışlarım | `mistake_entries` | 111 | 0,2 MB | `user_id` ✓ |
| Soru-Cevap / Konu Testi / D-Y sonuçları | `exam_prep_node_attempts` | 90 | 2,4 MB | `user_id` ✓, `exam_prep_id`, `node_id` |
| Tek tek cevaplar (süre, doğru/yanlış) | `item_responses` | 106 | 0,2 MB | `user_id` ✓, `prep_id` |
| Kazanım hâkimiyeti | `outcome_mastery` | 73 | 0,1 MB | `user_id` ✓ |
| Konu hâkimiyeti | `exam_prep_topic_mastery` | 2 | 0,1 MB | `user_id` ✓, `exam_prep_id` |
| Açık yanılgılar | `exam_prep_misconceptions` | 23 | 0,3 MB | `user_id` ✓ |
| Tekrar kuyruğu (hazırlık) | `exam_prep_review_items` | ~0 | 0,2 MB | `user_id` ✓, `exam_prep_id` |
| Tekrar destesi (genel) | `general_review_cards` | ~0 | <0,1 MB | `user_id` ✓ |
| DNA (öğrenme hafızası) | `student_learning_memory` | ~0 | 0,1 MB | `user_id` ✓ (satır başına öğrenci) |
| Seri | `user_streaks` | 4 | 0,1 MB | `user_id` ✓ |
| Yıldız | `star_events` | 574 | 0,3 MB | `user_id` ✓ |
| Ruh hali geçmişi | `study_session_moods` | 24 | 0,2 MB | `user_id` ✓ |
| Hazırlık, sınav tarihi | `exam_preps` | 22 | 0,3 MB | `user_id` ✓ |
| Konu sırası | `exam_prep_topics` | 123 | 0,3 MB | `exam_prep_id` (hazırlıktan) |
| Plan, tamamlanma, geciken gün | `exam_prep_nodes` | 659 | 2,3 MB | `exam_prep_id` (hazırlıktan) |
| Deneme sonuçları | `practice_exam_attempts` | 55 | 0,3 MB | `user_id` ✓ |
| Belgeler | `documents` | 32 | 0,1 MB | `user_id` ✓ |
| Belge sayfaları (belge haritası kaynağı) | `document_pages` | 208 | 1,6 MB | `document_id` |
| Sohbet geçmişi (yalnız `teacher.v2.chatscan`) | `conversations` / `messages` | 118 / 486 | 0,1 / 0,5 MB | `user_id` ✓ / `conversation_id` |

Satır sayıları istatistik tahminidir (`reltuples`; analiz edilmemiş tabloda 0 görünebilir). Bütün tablolar ya
`user_id` ile başlayan bir indeksle ya da indeksli bir üst kayıtla (`exam_prep_id`, `conversation_id`, `document_id`)
okunuyor. Öğrenci başına satır sayısı küçük (en büyüğü `exam_prep_nodes`, hazırlık başına onlarca düğüm). Dosya
sorguları `LIMIT`'li ve sıralama sütunu indeksle karşılanacak biçimde yazılacak; her yeni sorgunun `EXPLAIN` çıktısı
PR-2'de.

**Belge haritası (PR-3) için:** `documents` tablosunda bugün haritayı tutacak bir sütun yok. Bölüm başlıkları ve sayfa
aralıkları için bugün kullanılabilen kaynak `document_topic_nodes` (konu haritası) ve `document_pages`. Yeni sütun
gerekirse göç yazılır, uygulanmaz.

## 2. Hangi sorgu geçici dosya yazıyor

`pg_stat_statements` 15 Kasım 10:44:56 UTC'de sıfırlandı (Burhan: "İSTATİSTİĞİ SIFIRLA"). ~4 saat sonraki durum:

| Ölçü | Sıfırlamada | ~4 saat sonra | Fark |
|---|---|---|---|
| `pg_stat_database.temp_files` | 156.714 | 156.717 | **+3 dosya** |
| `pg_stat_database.temp_bytes` | 465.873.273.828 | 465.894.712.148 | **+21,4 MB** |
| `pg_stat_statements` geçici yazan sorgu | — | 2 sorgu, 3 çağrı, 2.859 blok (~22 MB) | farkın tamamı |

İki sorgunun ikisi de uygulamanın değil, `postgres` rolüyle panelden çalışan katalog sorguları:

1. Supabase SQL ekranının fonksiyon listesi (`pg_proc`, `pg_namespace`, `pg_type`, `pg_language`): 2 çağrı, 2.276 blok.
2. Bu denetimin kendi istatistik sorgusu (`pg_stat_statements` + `pg_stat_database`): 1 çağrı, 583 blok.

**Sonuç:** bu pencerede uygulama (PostgREST, `authenticator`/`service_role`) **hiç geçici dosya yazmadı**; ölçülen
geçici yazının %100'ü `pg_stat_statements`'ta görünüyor. Sabahki "görünmeyen %99" bulgusu birikmiş (sıfırlanmamış)
veritabanı sayacından geliyordu; günlük hız iddiası (~11 GB/gün) bu 4 saatte doğrulanmadı. `match_document_chunks` bu
pencerede geçici yazmadı (ya çağrılmadı ya da 2 MB'a sığdı); düzeltmesi #683'te hazır, uygulanması Burhan onayında.
24 saatlik yeniden ölçüm (16 Kasım ~10:45 UTC) yine yapılacak; oturum kapalıysa bu ölçüm yapılamaz.

**Teacher.v2 için kural:** Öğrenci Dosyası `match_document_chunks` çağırmaz (PROMPT-V2 §0); sıralamalar indeksli,
`LIMIT`'li; akış sırasında parça başına yazı yok.
