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

## 20261120100000 · flashcard_reviews_canli_sema (PR #708)

| | |
|---|---|
| Onaylayan | Burhan (sohbette, 20 Kasım 2026: "Ekleyici bir migration gerekiyorsa bunu kodun canlıya çıkmasından sonra uygula") |
| Uygulama | 20 Kasım 2026, TR ~03:20; #708 birleşme commit'i `1c0fd4fc` Vercel'de "success" ve üretim duman testi 7/7 geçtikten sonra. Supabase SQL ekranı, tek çalıştırma + kayıt satırı |
| Uygulayan | Claude, Burhan'ın onayıyla |
| Değişen | Canlıda hiçbir şey (no-op): depodaki eski `flashcard_reviews` tanımını canlı biçimle eşitleyen yalnız ekleme; bütün satırlar `IF NOT EXISTS` ya da adla korumalı |

**Doğrulama:** öncesi ve sonrası aynı: 15 sütun, 5 dizin, 7 kısıt, 0 satır. Kayıt satırı 1. #708 yayınından sonra ders,
düğüm sonucu (yeni Öğrendin / Gelişiyor / Zayıf / Ölçülmedi sayımı), deneme sonucu, inceleme ve sınav sabahı sayfaları 200.

**Geri alma:** gerekmez (canlıda değişiklik yok).

## 20261120120000 · faz6_bildirim_eposta (PR #710)

| | |
|---|---|
| Onaylayan | Burhan (Faz 6 istemi, 20 Kasım 2026: "ardından ekleyici göçü uygula"; tablolar için karar "Yeni tablolar, eskileri taşı") |
| Uygulama | 20 Kasım 2026, TR ~10:00; #710 birleşme commit'i `1fc3c48b` Vercel'de "success" ve üretim duman testi 7/7 geçtikten sonra. Supabase SQL ekranı, tek çalıştırma + kayıt satırı |
| Uygulayan | Claude, Burhan'ın onayıyla |
| Değişen | Üç yeni tablo: `user_notification_preferences`, `in_app_notifications`, `email_dispatch_log` (satır güvenliği açık, `anon` / `authenticated` izni yok, yalnız `service_role`). Eski satırlar yalnız eklenerek kopyalandı; eski tablolar (`notifications`, `profiles.study_reminder_email`, `email_events`) silinmedi, değişmedi |

**Doğrulama:** hatırlatmayı kapatan 8 öğrencinin 8'i tercih tablosunda (8 anahtarın 8'i 64 onaltılık karakter); 159 eski
bildirimin 159'u `in_app_notifications`ta (kimlik aynı, okundu bilgisi korunmuş); gönderilmiş 28 "bir kez" e-postanın
28'i `email_dispatch_log`ta. Üç tabloda `relrowsecurity` true, tarayıcı rollerine izin 0. Kayıt satırı 1. Canlıda
kurucu oturumuyla `/api/notifications` ve `/api/notification-preferences` 200 (abonelik anahtarı cevapta yok), çan
penceresi kopyalanan bildirimleri gösteriyor, `/ayarlar` ve `/bildirim-tercihleri` 200.

**Geri alma:** gerekmez ve önerilmez. Kod tablolar yokken eski tablolara düşer; tablolar kalırsa zarar yok. Silmek yıkıcı
işlemdir (yalnız Burhan'ın kararıyla): göçten sonra yazılan bildirim, tercih ve gönderim kaydı kaybolur, gönderim kilidi
tekilliği unutur.

## 20261120140000 · faz7_sinif_klonlama ve 20261120141000 · faz7_basari_karnesi (PR #712)

| | |
|---|---|
| Onaylayan | Burhan (Faz 7 istemi, 20 Kasım 2026: "ekleyici göçleri uygulayıp goc-kayitlari.md dosyasına işle"; klonlama ve +50 kredi kararları aynı gün sohbette) |
| Uygulama | 20 Kasım 2026, TR ~14:30; #712 birleşme commit'i `630b647a` Vercel'de "success" ve üretim duman testi 7/7 geçtikten sonra. Supabase SQL ekranı, ikisi tek çalıştırmada + iki kayıt satırı |
| Uygulayan | Claude, Burhan'ın onayıyla |
| Değişen | `exam_preps`'e 4 sütun (`share_code` UNIQUE, `is_public_cloneable` varsayılan false, `cloned_from_prep_id` ON DELETE SET NULL, `share_ip_hash`) ve `exam_preps_clone_once` kısmi tekil dizini (yalnız ekleme; var olan satırların değeri boş/false). Yeni tablolar `referral_credit_rewards` ve `exam_feedback_testimonials` (satır güvenliği açık, `anon` / `authenticated` izni yok). Yeni işlev `claim_clone_referral_reward(uuid)` (SECURITY DEFINER, yalnız `service_role`) |

**Doğrulama:** 4 sütun var; iki tabloda `relrowsecurity` true, tarayıcı rollerine izin 0; işlevin `anon`/`authenticated`/`PUBLIC` yetkisi 0;
dayandığı canlı nesneler var (`credit_ledger.user_id`/`idempotency_key`, `credit_gift(uuid, integer, text, jsonb)`,
`account_verified`, `normalize_email`); boş kimlikle salt okuma denemesi `{"status": "not_clone"}`. Kayıt satırları 2. Canlıda
kurucu oturumuyla hazırlık sayfasında "📲 Sınıfla Paylaş" ve "🎧 Sınav Radyosu (2 hazır bölüm · 0 kredi)" görünüyor; radyo
önbellekteki sesi çaldı (`mediaSession` başlığı ayarlı). `/davet/ORNEK` 200 (örnek bağlantı kartı).

**Geri alma:** gerekmez ve önerilmez. Kod sütunlar/tablolar yokken eski davranışa düşer (imzalı sınıf daveti, ödül atlanır, karne
notu `learning_preferences`'e). Silmek yıkıcı işlemdir (yalnız Burhan'ın kararıyla): paylaşım kodları, klon bağı, ödül kayıtları
ve sınav sonrası yorumlar kaybolur.

## 20261120160000 · faz8_davet_ip_gunluk (PR #714)

| | |
|---|---|
| Onaylayan | Burhan (Faz 8 istemi, 20 Kasım 2026: klon ödülünde katı aynı IP engeli yerine "aynı IP'den günde en fazla 3 davet ödülü"; ekleyici göçler yayından sonra uygulanır) |
| Uygulama | 20 Kasım 2026, TR akşam; #714 birleşme commit'i `5e4ebd18` Vercel'de "success" ve üretim duman testi 7/7 geçtikten sonra. Supabase SQL ekranı, tek çalıştırma + kayıt satırı |
| Uygulayan | Claude, Burhan'ın onayıyla |
| Değişen | `referral_credit_rewards`'a `referred_ip_hash text` sütunu ve `referral_credit_rewards_ip_created` kısmi dizini (yalnız ekleme; var olan satırlarda boş). `claim_clone_referral_reward(uuid)` aynı imzayla yeniden tanımlandı: `same_ip` engeli kalktı, aynı IP'den İstanbul gününde en çok 3 ödül (`ip_daily_cap`, IP'nin kendi danışma kilidi altında). Kendini davet, aynı posta kutusu, doğrulanmamış hesap, çift başına tek ödül ve aylık 5 tavanı aynen |

**Doğrulama:** sütun 1, dizin 1; işlev gövdesinde `ip_daily_cap` var, `same_ip` yok; `anon` / `authenticated` çalıştırma izni yok,
`service_role` var; kayıt satırı 1; boş kimlikle salt okuma denemesi `{"status": "not_clone"}`.

**Geri alma:** gerekmez. Kod iki işlev sürümüyle de çalışır (`same_ip` ve `ip_daily_cap` ikisi de tanınır). Eski davranışa dönmek
işlevi 20261120140000'daki gövdesiyle yeniden tanımlamaktır (yalnız Burhan'ın kararıyla); sütun ve dizin zararsız kalır.

## 20261121120000 · faz10_unite_alt_baslik (PR #720)

| | |
|---|---|
| Onaylayan | Burhan (Faz 10 istemi, 20 Kasım 2026: "göç varsa yayından sonra uygulayıp `docs/operasyon/goc-kayitlari.md` dosyasına işle"; ana ünite modeli kararı aynı gün) |
| Uygulama | 21 Kasım 2026; #720 birleşme commit'i `28549a20` Vercel'de "success" ve üretim duman testi 7/7 geçtikten sonra. Supabase SQL ekranı, tek çalıştırma + kayıt satırı |
| Uygulayan | Claude, Burhan'ın onayıyla |
| Değişen | `exam_prep_topics`'e `subtopics jsonb NOT NULL DEFAULT '[]'` sütunu (yalnız ekleme; var olan satırlar boş dizi, yani eski model). `apply_exam_prep_setup(uuid, uuid, jsonb, jsonb)` aynı imzayla yeniden tanımlandı; önceki tanımdan (`20261119100500`) tek farkı `subtopics` alanını da yazması |

**Doğrulama:** sütun 1; işlev tanımında `subtopics` var; kayıt satırı 1; alt başlığı dolu satır 0 (göç hiçbir satırı değiştirmedi).

**Geri alma:** gerekmez. Kod sütun olmadan da çalışır (alt başlıklar düğümün `session_meta.lessonSubtopics` alanında). Eski işleve
dönmek 20261119100500'deki gövdeyle yeniden tanımlamaktır (yalnız Burhan'ın kararıyla); sütun zararsız kalır.

## 20261121150000 · tutor_memory_notes (PR #722)

| | |
|---|---|
| Onaylayan | Burhan (Faz 11 istemi, 21 Kasım 2026: "ekleyici göç varsa ardından uygulayıp `docs/operasyon/goc-kayitlari.md`'ye işle"; aynı gün sohbette: "iki yeni tablonun göçünü canlıya uygulayıp göç kayıt dosyasına işle") |
| Uygulama | 21 Kasım 2026; #722 birleşme commit'i `7a102279` Vercel'de "success" ve üretim duman testi 7/7 geçtikten sonra. Supabase SQL ekranı, tek çalıştırma (`begin … commit`) + kayıt satırı |
| Uygulayan | Claude, Burhan'ın onayıyla |
| Değişen | Yalnız ekleme: iki yeni tablo, `tutor_memory_notes` (öğretmen notları) ve `tutor_conversation_preps` (konuşmanın bağlandığı hazırlık), ikisinin dizinleri, satır güvenliği ve yetkileri. Var olan hiçbir tablo, sütun, kısıt ya da satır değişmedi (Yanlışlar Defteri kaynak kısıtı dahil) |

**Uygulamadan önce kontrol (salt okuma):** iki tablo yoktu; bağlandıkları `profiles`, `conversations`, `exam_preps` vardı; kayıt satırı
yoktu. `mistake_entries.source_ref` sütunu canlıda var ve kaynak kısıtı `lesson_check`'i kabul ediyor ("Bunu Yanlışlar Defterime ekle" bu
göçe bağlı değil).

**Doğrulama:** iki tabloda satır güvenliği açık; `authenticated` okuyamıyor, `anon` yazamıyor, `service_role` yazıyor; kayıt satırı 1.

**Geri alma:** gerekmez. Kod iki tablo olmadan da çalışır (not yazımı ve okuması atlanır, sohbet geçmişi düz listede kalır). Tabloları
kaldırmak yalnız Burhan'ın kararıyla olur; yeni tablolardır, başka hiçbir şey onlara bağlı değil.

## İstatistik işlemleri (göç değil)

| Zaman (UTC) | İşlem | Onay | Sonuç |
|---|---|---|---|
| 15 Kasım 2026 10:44:56 | `pg_stat_statements_reset()` | Burhan: "İSTATİSTİĞİ SIFIRLA" | 4.920 kayıt silindi. Önce anlık görüntü: `temp_files` 156.714, `temp_bytes` 465.873.273.828 (sıfırlanmadı) |
| 15 Kasım 2026 ~10:45 | `alter database postgres set log_temp_files = '10MB'` | Burhan kararı 6 | **Reddedildi:** "permission denied to set parameter log_temp_files". Hiçbir şey değişmedi; geri alınacak bir şey yok |
