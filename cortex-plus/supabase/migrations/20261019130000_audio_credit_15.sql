-- 19 Ekim 2026 (ürün sahibinin kararı, maliyet modeli `docs/delivery/MALIYET-MODELI.md`):
-- seslendirme 900 karakter için 2 → 15 kredi.
--
-- Canlı ölçüm (ai_usage_events × ai_model_prices, 17-19 Ekim): gpt-4o-mini-tts 1.000 karakter
-- $0,0167 (OpenAI'nin kendi tahmini de dakika başına ~$0,015; 900 karakter ≈ 1,2 dk). Eski ücret
-- 2 kredi = $0,002 / 900 karakter, yani maliyetin ~7,5'te biri. 5 dakikalık podcast sesi (~3.500
-- karakter) artık ~60 kredi (~$0,06). Önbellekten gelen cümle yine ücretsiz (yalnız yeni karakter sayılır).
--
-- Yalnız fiyat satırı değişir; tablo ya da veri silinmez.
UPDATE public.credit_rules
   SET credit_cost = 15,
       description = 'Seslendirme — her 900 karakter için 15 kredi',
       updated_at = now()
 WHERE action_code = 'AUDIO_SYNTHESIZE';
