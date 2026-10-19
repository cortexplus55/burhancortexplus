-- 19 Ekim 2026 (maliyet modeli, docs/delivery/MALIYET-MODELI.md): video sahne resimlerinin gideri ölçülsün.
--
-- video-run.ts her resmi `ai_usage_events`'e birim = 1 resim olarak yazıyor (tokens_in = 1), ama
-- `gpt-image-1` için fiyat satırı yoktu: /admin/maliyetler "16 işlemin modeli için fiyat tanımlı değil"
-- diyordu ve video gideri toplamdan düşüyordu. Birim resim olduğu için "1k başına" fiyat 1.000 resmin
-- fiyatı: OpenAI gpt-image-1, düşük kalite, 1024x1536 = $0,016 / resim → 16.
--
-- Eklemeli: satır varsa dokunulmaz.
INSERT INTO public.ai_model_prices (model, input_per_1k, output_per_1k)
VALUES ('gpt-image-1', 16.0, 0)
ON CONFLICT (model) DO NOTHING;
