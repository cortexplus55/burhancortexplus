-- 24 Ekim 2026 lansman testi: canlı anahtarın projesi `gpt-image-1`'i görmüyor ("400 The model 'gpt-image-1' does not
-- exist"); video ders resim modeli merdiveniyle `gpt-image-1.5`'e geçti ve kod varsayılanı da o oldu (env.ts).
-- Fiyat satırı olmadan /admin/maliyetler video giderini saymıyordu. Birim = 1 resim (video-run.ts tokens_in = 1);
-- "1k başına" fiyat 1.000 resmin fiyatı: OpenAI GPT Image 1.5, düşük kalite, 1024x1536 = $0,013 / resim → 13.
-- Kaynak: https://developers.openai.com/api/docs/models/gpt-image-1.5
--
-- Eklemeli: satır varsa dokunulmaz. Kayıt satırı aynı çalıştırmada:
--   insert into supabase_migrations.schema_migrations (version, name) values ('20261024140000', 'image_model_15_price')
--     on conflict (version) do nothing;
INSERT INTO public.ai_model_prices (model, input_per_1k, output_per_1k)
VALUES ('gpt-image-1.5', 13.0, 0)
ON CONFLICT (model) DO NOTHING;
