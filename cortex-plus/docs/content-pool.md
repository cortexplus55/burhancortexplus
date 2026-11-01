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
