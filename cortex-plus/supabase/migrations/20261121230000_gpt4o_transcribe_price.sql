-- UYGULANDI: 21 Kasım 2026, #726 birleştikten sonra, Burhan'ın onayıyla (Supabase SQL ekranı + kayıt satırı;
-- docs/operasyon/goc-kayitlari.md). Kayıt satırı:
--   insert into supabase_migrations.schema_migrations (version, name) values ('20261121230000', 'gpt4o_transcribe_price')
--     on conflict (version) do nothing;
--
-- Canlı sesli öğretmende öğrencinin sözünü yazıya döken model gpt-4o-mini-transcribe'dan gpt-4o-transcribe'a geçti
-- (Türkçe kısaltmalar son sesi düşerek yazılıyordu). Bu göç yalnız EKLER: yeni modelin fiyat satırı. Var olan hiçbir
-- satıra, tabloya ya da işleve dokunmaz; iki kez çalışınca aynı sonuç (ON CONFLICT DO NOTHING).
--
-- Göçten önce de kod çalışır: oturum açılır, kredi kuralı değişmez. Eksik olan yalnız gider görünümüdür: fiyat satırı
-- yokken /admin/maliyetler yazıya döküm satırını saymaz (dakikada ~0,006 $ eksik görünür).
--
-- Birim küçük modelin satırıyla aynı (kilobayt, dakikada ~180 KB; `src/lib/tutor/realtime/usage.ts`). Fiyat: OpenAI
-- gpt-4o-transcribe dakikada ~0,006 $ (küçük modelin iki katı) → 0,006 / 180 KB × 1000 = 0,033333.

INSERT INTO public.ai_model_prices (model, input_per_1k, output_per_1k)
VALUES ('gpt-4o-transcribe', 0.033333, 0.000000)
ON CONFLICT (model) DO NOTHING;

-- Doğrulama:
--   select model, input_per_1k, output_per_1k from public.ai_model_prices where model like 'gpt-4o%transcribe' order by 1;
