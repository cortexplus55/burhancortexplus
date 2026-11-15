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

## Kullanılan salt-okur sorgular
`pg_stat_database` (temp_files, temp_bytes, blks_read/hit), `pg_stat_user_tables` (seq_scan, n_tup_*),
`extensions.pg_stat_statements` (yalnız sayaçlar; normalleştirilmiş metin, kullanıcı içeriği yok), `pg_stat_activity` (yalnız
kullanıcı, uygulama, durum, süre; sorgu metni okunmadı), `pg_settings`. Kullanıcı mesajları ve kişisel veri okunmadı.
