# Supabase Disk IO bütçesi · teşhis (15 Kasım 2026)

Panel uyarısı: "Your project is about to deplete its Disk IO Budget". Bütçe biterse disk hızı taban değere (5 MB/s) düşer ve
sayfalar yavaşlar. Bu belge **salt okunur** teşhistir. Hiçbir ayar, veri ya da makine değişmedi.

## Kök neden (kanıtıyla)

### 1. Makine takasta (swap) çalışıyor — birincil
Kaynak: Supabase → Observability → Database, son 60 dakika (TR 02:59–03:59).

| Ölçü | Değer |
|---|---|
| Toplam RAM | ~0,5 GB (ücretsiz planın en küçük makinesi) |
| Kullanılan bellek | ~380 MB |
| **Swap** | **~750 MB, saat boyunca sürekli dolu** |
| Memory commitment | **1,79 GB · SEVERE** (taahhüt RAM'in ~3,5 katı) |
| CPU | ~%8 |

Aynı makinede Postgres'in yanında PostgREST, Auth, Storage, Realtime ve havuzlayıcı da çalışıyor. Taahhüt RAM'i aştığı için
çekirdek belleği diske taşıyor. Takasa her yazma ve takastan her okuma disk IO'dur ve bütçeden düşer. Panelin disk
grafikleri ("Disk IOPS", "Disk throughput") bu sırada yüklenemedi; takas çizgisi tek başına yeterli kanıt.

### 2. Geçici dosya (temp) yazıları — ikincil ama büyük
`pg_stat_database` (sayaç 18 Ağustos'tan beri):

| | |
|---|---|
| Geçici dosya | 155.591 |
| Geçici yazı | **430 GB** (ortalama günde ~4,8 GB) |
| Okuma önbellek isabeti | **%100** (diskten blok okuma: 2.177) |
| `work_mem` | 2.184 kB (~2 MB; küçük makine) |

Okumalar diske gitmiyor; disk yazıları geçici dosya ve takas. Canlı ölçüm (TR ~03:56, iki hafif anlık görüntü):
**77 saniyede +4 geçici dosya, +14 MB** (günde ~15 GB hızında). Bu yazılar `pg_stat_statements`'ta hiçbir uygulama
sorgusuna düşmüyor.

`pg_stat_statements`'ta görünen geçici yazının (toplam 4,1 GB) dağılımı:

| Kaynak | Çağrı | Geçici yazı | Not |
|---|---|---|---|
| PostgREST şema önbelleği yenileme (`pg_proc` sorgusu) | 424 | ~3,7 GB | Her yenileme ~9,3 MB. Ölçüm sırasında iki kez arttı (422 → 424) |
| `match_document_chunks` (belge arama RPC'si) | 2.740 | ~340 MB | Çağrı başına ~125 kB |
| `pg_stat_statements` sorguları (panel ve teşhis) | — | çağrı başına ~4,6 MB | Görünüm 4.901 / 5.000 kayıtla dolu; her sorgu sıralamada diske taşıyor |

**Güçlü hipotez (kanıtı dolaylı):** sayılmayan geçici yazıların büyük kısmı Supabase'in kendi izleme/metrik sorgularından
geliyor. Bu sorgular kendi takibini kapatıyor, `pg_stat_statements` üzerinde çalışıyor ve her biri ~4,6 MB'ı diske taşırıyor.
Desteği:
- uzun süren aktif sorgu yok, bütün bağlantılar boşta;
- uygulamanın hiçbir sorgusu bu hızda geçici yazmıyor;
- `pg_stat_statements` sorguları dolu tabloda tam bu boyutta taşıyor.

## Elenen şüpheliler

| Şüpheli | Sonuç |
|---|---|
| Akışlı yazım (#667) her parçada veritabanına yazıyor mu | **Hayır.** Sohbet akışı yalnız HTTP yanıtına yazar (`chat-live.ts`); kayıt cevap bitince bir kez (`complete_chat_operation`). Ders akışı kavram başına bir güncelleme (tur başına birkaç satır) |
| `lesson_timings` | Sohbet ya da ders açılışı başına bir satır; son 6 saatte 9 satır |
| E2E testleri | CI'daki uçtan uca testler veritabanısız fikstürlerle çalışıyor (`E2E_FIXTURE=1`). Hesaplı canlı duman işi sır olmadığı için atlanıyor |
| Canlı izleme döngüleri | `smoke-prod.mjs` yalnız herkese açık 7 sayfayı okuyor; zamanlanmış 24 saat kontrolü Vercel günlüklerini okuyor, veritabanına dokunmuyor |
| Uygulamanın sık sorguları | `profiles`, `mfa_amr_claims` gibi küçük tablolarda yüz binlerce sıralı tarama var ama tamamı önbellekten (disk okuması yok) |
| Benim teşhis sorgularım | Her `pg_stat_statements` sorgusu ~4,6 MB geçici yazdı (toplam ~30 MB); ölçüme etkisi notlandı, kalıcı değil |

## Öneriler

| # | Öneri | Etki | Kimin kararı |
|---|---|---|---|
| 1 | **Compute yükseltme** (Pro plan + Micro/Small; 1–2 GB RAM). Takas ortadan kalkar, `work_mem` büyür, geçici yazılar azalır | Kök neden; en büyük etki | **Burhan** (ücretli) |
| 2 | `pg_stat_statements` sıfırlama (`pg_stat_statements_reset()`). 4.901 kayıt boşalır; izleme sorgularının her taraması küçülür, diske taşma azalır | Geçici yazıda hızlı ama geçici rahatlama; sorgu istatistik geçmişi kaybolur | **Burhan** (istatistik işlemi, veri değil; yine de onaysız yapılmadı) |
| 3 | Kod: belge aramasında (`match_document_chunks`) sıralamayı sınırla. İlk N adayı vektör dizininden al, sonra sırala; büyük satırları (`content`) sıralamadan sonra birleştir | Küçük-orta | Kod (PR) |
| 4 | Kod: şema değiştiren işlemleri (göçler) toplu yap; her DDL bir PostgREST yenilemesi (~9,3 MB) tetikliyor | Küçük | Süreç |
| 5 | İzleme: `/admin/sistem`'e takas ve `temp_bytes` göstergesi | Görünürlük | Kod (PR) |

Öncelik: **1** kalıcı çözüm. Bütçe kritikse 1 gelene kadar **2** hızlı nefes aldırır. 3 ve 5 kod tarafında ayrı PR olarak
hazırlanabilir.

## İlk 20 sorgu ve geçici dosya özeti (15 Kasım 2026, TR 11:59)

Burhan'ın kararı (6a): `pg_stat_statements`'tan en çok geçici yazan, en uzun süren ve en sık çalışan ilk 20 sorgu ve
geçici dosya özeti. Tek salt okunur sorgu, SQL ekranında. Sorgu metinleri normalleştirilmiş (`$1`), kullanıcı içeriği yok.
Tür: **api** = PostgREST üzerinden uygulamanın çağrısı, **sql** = doğrudan (Supabase'in kendi servisleri, panel, zamanlanmış iş
ya da teşhis sorgusu).

### Geçici dosya özeti

| | Değer |
|---|---|
| `pg_stat_database` sayaç başı | 18 Ağustos 2026 18:12 UTC (~88,6 gün) |
| Geçici dosya / yazı | **156.514 dosya · 433 GB** (465.047.854.919 bayt) |
| Ortalama | günde ~4,9 GB |
| Son 8 saat (TR 03:56 → 11:59) | **+923 dosya, ~+3 GB** → günde ~8–11 GB hızında, dosya başına ~3,3 MB |
| `pg_stat_statements` sayaç başı | 25 Ağustos 2026 20:38 UTC; kayıt 4.914 / 5.000, 4 kez taşıp silme (`dealloc`) |
| `pg_stat_statements`'ta görünen geçici yazı | 538.875 blok × 8 kB = **4,4 GB** (toplamın **~%1**'i) |
| Ayarlar | `work_mem` 2.184 kB, `shared_buffers` 280 MB, `effective_cache_size` 480 MB, `maintenance_work_mem` 32 MB, `log_temp_files` kapalı (−1), `temp_file_limit` sınırsız, `pg_stat_statements.track` top |

**Sonuç:** geçici yazının yaklaşık %99'u hiçbir izlenen sorguya düşmüyor. Üç neden birden: iki sayacın başlangıcı farklı
(18 ve 25 Ağustos), dolu görünüm 4 kez eski kayıtları attı, `track = top` fonksiyon içindeki sorguları ayrıca saymıyor.
Hangi sürecin yazdığını kesinleştirmenin yolu `log_temp_files` (örn. 10 MB üstü dosyaları günlüğe yazmak) ya da sıfırlamadan
sonraki temiz pencere (6b). İkisi de Burhan'ın kararı; ayar değiştirilmedi.

### En çok geçici yazan (yalnız 13 sorgu hiç yazmış)

| # | Tür | Sorgu | Çağrı | Toplam sn | Ort. ms | Geçici blok | Kaynak |
|---|---|---|---|---|---|---|---|
| 1 | sql | `with f as ( -- CTE with sane arg_modes …` | 427 | 140,2 | 328,2 | **485.926** (~3,7 GB) | PostgREST şema önbelleği (fonksiyonlar); her yenilemede ~9,3 MB |
| 2 | api | `match_document_chunks` | 2.740 | 393,9 | 143,8 | **43.372** (~355 MB) | Bizim belge arama fonksiyonu; çağrı başına ~130 kB |
| 3–10 | sql | `pg_stat_statements` / `pg_stat_database` teşhis sorguları | 1–2 | — | — | 581–2.716 | Benim bu iki günkü teşhis sorgularım (her biri ~4,6–22 MB) |
| 11 | sql | `ai_usage_totals` | 1 | 6,1 | 6.127,9 | 526 (~4 MB) | Kokpit / günlük özet gider toplamı |
| 12–13 | sql | teşhis sorguları | 1–2 | — | — | 418–472 | Benim |

### En uzun toplam süre

| # | Tür | Sorgu | Çağrı | Toplam sn | Ort. ms | Geçici blok | Kaynak |
|---|---|---|---|---|---|---|---|
| 1 | sql | `quarantine_pool_items()` | 292 | **456,5** | **1.563,3** | 0 | Saatlik soru havuzu karantinası (bizim) |
| 2 | api | `match_document_chunks` | 2.740 | 393,9 | 143,8 | 43.372 | Belge arama (bizim) |
| 3 | api | `touch_device_session` | 4.670 | 247,6 | 53,0 | 0 | 2 cihaz sınırı (bizim, ara katmanda 5 dk'da bir) |
| 4 | sql | `SELECT name FROM pg_timezone_names` | 269 | 186,1 | 691,8 | 0 | Supabase iç / panel |
| 5 | api | `current_account_active` | 103.413 | 158,2 | 1,5 | 0 | Hesap aktif denetimi (bizim, her istek) |
| 6 | api | `email_audience_count` | 3.183 | 146,2 | 45,9 | 0 | Yönetim e-posta hedef kitle sayımı (bizim) |
| 7 | sql | PostgREST şema önbelleği (fonksiyonlar) | 427 | 140,2 | 328,2 | 485.926 | Supabase iç |
| 8 | sql | `SELECT e.name, n.nspname AS schema, e.default_version …` | 304 | 121,2 | 398,6 | 0 | Supabase paneli (eklenti listesi) |
| 9 | api | `is_admin` | 81.118 | 107,7 | 1,3 | 0 | Yönetici denetimi (bizim) |
| 10 | sql | `select set_config('search_path' …)` | 873.553 | 105,1 | 0,1 | 0 | PostgREST istek başlangıcı |
| 11 | api | `my_stars` | 2.183 | 102,4 | 46,9 | 0 | Yıldızlar (bizim) |
| 12 | api | `item_bank` okuma | 180 | 97,3 | 540,6 | 0 | Soru havuzu (bizim; çağrı başına yarım saniye) |
| 13 | api | `subscriptions` okuma | 46.221 | 95,9 | 2,1 | 0 | Abonelik okuması (bizim) |
| 14 | api | `apply_payment_refund` (boş argümanla) | 5.815 | 83,8 | 14,4 | 0 | Şema denetiminin varlık sorusu (`probeSchema`); hiçbir satıra dokunmuyor. Kök düzen (`layout.tsx` → `logSchemaGaps`) bunu **her sunucu örneğinin ilk açılışında** bütün şema denetimiyle çalıştırıyor; 5.815 çağrı ≈ soğuk başlangıç sayısı |
| 15 | sql | `select set_config('search_path' …)` (ikinci biçim) | 553.735 | 79,8 | 0,1 | 0 | PostgREST |
| 16 | api | `ai_usage_events` yazma | 11.684 | 79,7 | 6,8 | 0 | Kullanım kaydı (bizim) |
| 17 | api | `ai_usage_events` okuma (`cost_usd_estimate`) | 4.911 | 78,0 | 15,9 | 0 | Maliyet okuması (bizim) |
| 18 | api | `credit_reserve_metered` | 1.258 | 77,2 | 61,4 | 0 | Kredi ayırma (bizim) |
| 19 | api | `profiles` okuma | 83.321 | 75,9 | 0,9 | 0 | Profil (bizim) |
| 20 | sql | `SELECT tbl.schemaname, tbl.tablename …` | 427 | 65,7 | 153,9 | 0 | PostgREST şema önbelleği (tablolar) |

### En sık çalışan

| # | Tür | Sorgu | Çağrı | Toplam sn | Kaynak |
|---|---|---|---|---|---|
| 1 | sql | `select set_config('search_path' …)` | 873.553 | 105,1 | PostgREST |
| 2 | sql | `select set_config('search_path' …)` (ikinci biçim) | 553.735 | 79,8 | PostgREST |
| 3 | sql | `SELECT sessions.aal, sessions.created_at …` | 271.566 | 33,5 | Supabase Auth oturum denetimi |
| 4 | sql | `SELECT mfa_amr_claims …` | 271.345 | 7,9 | Supabase Auth |
| 5 | sql | `SELECT mfa_factors …` | 270.905 | 17,4 | Supabase Auth |
| 6 | sql | `SELECT identities …` | 270.905 | 20,3 | Supabase Auth |
| 7 | sql | `SELECT users.aud, users.banned_until …` | 270.455 | 57,1 | Supabase Auth |
| 8 | api | `current_account_active` | 103.413 | 158,2 | Bizim |
| 9 | api | `profiles` | 83.321 | 75,9 | Bizim |
| 10 | api | `is_admin` | 81.118 | 107,7 | Bizim |
| 11 | sql | `SET client_encoding = 'UTF8'` | 66.368 | 1,7 | Bağlantı açılışı |
| 12 | sql | `SET client_min_messages TO WARNING` | 66.368 | 2,0 | Bağlantı açılışı |
| 13 | api | `profiles` (ikinci biçim) | 65.275 | 7,5 | Bizim |
| 14 | sql | `BEGIN … READ ONLY` | 62.902 | 1,5 | PostgREST |
| 15 | sql | `COMMIT` | 60.655 | 0,1 | PostgREST |
| 16 | api | `subscriptions` | 46.221 | 95,9 | Bizim |
| 17 | api | `plus_only_action` | 35.222 | 2,6 | Bizim |
| 18 | api | `credit_rules` | 29.029 | 20,2 | Bizim |
| 19 | api | `user_streaks` | 27.647 | 29,9 | Bizim |
| 20 | sql | `BEGIN … READ WRITE` | 26.453 | 1,2 | PostgREST |

### Bu tablolardan çıkan düzeltme adayları (6c, ayrı PR'lar)

| Aday | Neden | Yol |
|---|---|---|
| `match_document_chunks` | Uygulamanın tek geçici yazan sorgusu. `mine` CTE'si kullanıcının bütün parçalarını `content` metniyle birlikte belleğe alıp sıralıyor; 2 MB `work_mem` taşıyor | Sıralamayı yalnız kimlik + uzaklıkla yap, ilk N'yi seç, `content` ve sayfa numarasını sonra birleştir. Aynı imza, aynı sonuç; göç Burhan onayıyla |
| `quarantine_pool_items` | Toplam sürede birinci (saat başı ~1,6 sn) | Geçici yazmıyor; IO'dan çok CPU. Ayrı ölçüm, şimdilik dokunulmadı |
| PostgREST şema yenileme | Geçici yazının izlenen kısmının %88'i, her yenileme ~9,3 MB | Kod değil: göçleri toplu uygulamak (her DDL bir yenileme) |
| `logSchemaGaps` (soğuk başlangıçta tam şema denetimi) | Her yeni sunucu örneği onlarca küçük sorgu atıyor (geçici yazı yok, ama sürekli okuma/bağlantı) | Denetimi kök düzenden çıkarıp yalnız `/admin/sistem` ve sağlık ucunda bırakmak; ayrı PR, düşük öncelik |

Görünmeyen %99 için sıra: (b) sıfırlama → 24 saat sonra aynı sorguyla yeniden ölçüm → hâlâ izlenmeyen yazı büyükse `log_temp_files`.

## Yükseltmeden sonra (bekliyor)

Burhan compute'u yükseltince 48 saat sonra aynı salt okunur sorgu: geçici yazı / gün, geçici dosya / gün, IO bütçesi grafiği.
Sonuç bu bölüme eklenecek.

## Kullanılan salt-okur sorgular
`pg_stat_database` (temp_files, temp_bytes, blks_read/hit), `pg_stat_user_tables` (seq_scan, n_tup_*),
`extensions.pg_stat_statements` (yalnız sayaçlar; normalleştirilmiş metin, kullanıcı içeriği yok), `pg_stat_activity` (yalnız
kullanıcı, uygulama, durum, süre; sorgu metni okunmadı), `pg_settings`. Kullanıcı mesajları ve kişisel veri okunmadı.
