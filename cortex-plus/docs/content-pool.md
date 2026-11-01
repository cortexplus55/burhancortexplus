# Ortak içerik havuzu (Plan PR 2)

- `topic_content`: ünite düzeyinde ders anlatımı + özet + kartlar; ünitenin tüm resmî kazanımlarını kapsar. `origin = 'cortex_original'`; resmî kaynaklar yalnız `source_links` (dış bağlantı).
- `item_bank`: her soru `unit_id` **ve** `outcome_id` ile etiketli; kazanım × {easy, medium, hard}.
- Read-through: `GET /api/content/unit?unit=<curriculum_units.id>` (kanonik `program#sort_order`, 1 tabanlı; `yks-2026-tarih#1` = Tarih ve Zaman — API, betik, havuz ve veritabanı aynı kimliği kullanır) doğrulanmış içeriği 0 model çağrısıyla döner; yoksa ilk öğrenci için üretir → bağımsız modelle kör çözüm + kapsam denetimi → havuza yazar. Aynı anda gelen ikinci öğrenci 202 `pending` alır (taslak satırı kilit olarak kullanılır, 10 dk).
- Kayıttaki kazanım metni değişirse (`unit_sha256`) eski satır `stale` olur, silinmez.
- Doğrulama: önce sıfır maliyetli kapı (`gate.ts`: şık sayısı, cevap aralığı, yinelenen şık, yapışık/bozuk metin, kök/açıklama uzunluğu, sınırlamadaki açık dışlamalar, unit_id+outcome_id, kazanım × zorluk dağılımı); sonra `gpt-6-luna` (reasoning_effort low) yalnız cevap anahtarını (kör çözüm) ve bilimsel/kazanım uyumunu kısa JSON ile onaylar. Anlatım modelle yeniden okunmaz; kapsaması ve metin bütünlüğü kodda denetlenir.
- Maliyet: `ai_usage_events` → `SHARED_CONTENT_LESSON|ITEMS|VERIFY`; `model` istenen (fiyatlı) ad, `cost_usd_estimate` yazılırken `ai_model_prices` ile hesaplanır.
- Geçmiş soru benzerlik denetimi henüz yok (`qa.similarity_check = "not_run"`); planda hukuki inceleme sonrasına bırakıldı.
- Ön üretim: `npx tsx --conditions=react-server scripts/content-pool-seed.ts --program yks-2026-tarih [--dry-run]` (`CONTENT_POOL_USER_ID` gerekli). Kapsama: `topic_content_coverage` görünümü.
- Göç: `supabase/migrations/20261101180000_shared_content_pool.sql` (yalnız ekleme).

## Seviye kontrolü (Plan PR 3)

- **⚡ Akıllı Hızlı Tarama** kurulumda konu seçiminden sonra varsayılan adımdır (atlanabilir): 10–12 soru, 3–5 dk.
  Sorular yalnız `item_bank` (status = verified) satırlarından gelir; tarama sırasında **üretim yok**, öğesi olmayan
  ünite atlanır, havuz boşsa “Bu ders için hazır soru henüz yok”.
- **Ağırlık vekili:** resmî ünite ağırlığı verisi yok; ağırlık = ünitenin kazanım sayısı (`poolUnit(id).outcomes.length`).
  Ağırdan hafife, ünite başına bir soru dönüşümlü, farklı kazanım önce.
- **Zorluk karışımı** (`SCAN_MIX`, `UNIT_CHECK_MIX` in `select.ts`): tarama 12 soruda 8 orta + 2 kolay + 2 zor;
  Ünite Seviye Kontrolü orta, kolay, zor (+ 4. soru orta). İstenen zorluk havuzda yoksa orta → kolay → zor sırasıyla
  olandan alınır; soru uydurulmaz. Böylece 0.7 / 1.3 ağırlıkları gerçekten devreye girer.
- **Başlıklar:** her seviye kontrolü başlığı (API yükü, tarama sonucu, ünite kartı, misafir ön izleme)
  `levelUnitTitle` → ortak `displayUnitTitles` ile sıra numarasız gelir.
- **Puanlama sunucuda:** `/api/level-check/start` cevapsız soru + HMAC jeton (45 dk) verir; `/api/level-check/answer`
  cevabı yalnız yanıttan sonra döner.
- **Misafir ön izleme:** `/hizli-tarama` ilk 3 soru, hiçbir şey kaydedilmez, sonunda ücretsiz hesap çağrısı. Oturum açık kullanıcı ön izleme görmez; kurulumdaki tam taramaya (10–12 soru, sonuç ekranı) yönlendirilir.
- **Ustalık** (`src/lib/level-check/mastery.ts`): Beta-Binomial, öncel α=β=1, ağırlık kolay 0.7 / orta 1.0 / zor 1.3,
  ustalık = α/(α+β). n = 0 “Henüz yeterli veri yok”, n < 3 “tahmini”.
- **Yol sırası eşikleri:** ustalık < 0.40 → Zayıf (öne), ≥ 0.75 → Biliyorum (sona, kısa), arası Orta. Yalnız öğrencinin
  işaretlemediği ünitelere uygulanır (`ratingSource: "scan"`); açık işaret her zaman kazanır.
- **Ünite Seviye Kontrolü:** yolda etkin ünite havuzda ≥ 3 doğrulanmış soruya sahipse 3–4 soru önerilir; atlanabilir,
  kazanım başına dürüst sonuç satırı. Bu hazırlıkta yapıldıysa tekrar önerilmez.
- **Tablolar:** `item_responses`, `outcome_mastery` (göç `20261101200000_item_responses_mastery.sql`). Göç
  uygulanmadan: tarama puanlanır ama kaydedilmez (`persisted:false`), Ünite Seviye Kontrolü hiç gösterilmez.

## Toplu doldurucu (1 Kasım 2026)

- `GET/POST /api/cron/content-pool-fill`: yönetici `?action=start` (ya da POST) ile başlatır, `?action=stop` ile durdurur.
  Hobby planında sık cron olmadığından adım kendini `CRON_SECRET` ile zincirler (her adım ~90 sn yeni ünite başlatır, eşzamanlılık 2).
- Sıra: TYT (9–10. sınıf; matematik, tde, fizik, kimya, biyoloji, coğrafya, felsefe, dkab) → `lgs-2027-*` → AYT (11–12. sınıf + tarih, inkılap, mantık, psikoloji, sosyoloji).
- Bütçe: her ünite öncesi `ai_usage_events` içindeki `SHARED_CONTENT%` toplamı okunur; toplam + tahmin > tavan ise durur.
- Ayar/kill switch: `feature_flags` satırı `content_pool_fill` (enabled; metadata.cap_usd varsayılan 5.33, unit_estimate_usd, concurrency ≤ 3). Migration yok.
- Başarısız ünite en fazla 2 kez denenir (reddedilen `topic_content` satırları sayılır; terk edilmiş kilit sayılmaz), sonra atlanır.
- İlerleme: `GET /api/content/fill-status` (yalnız yönetici).
