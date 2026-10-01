-- gpt-6-luna asıl model (2 Ekim 2026). Fiyat: OpenAI model sayfası,
-- 1M jeton başına girdi $0,10, çıktı $0,50 (akıl yürütme jetonları çıktı
-- sayılır). Satır yoksa kullanım kaydı maliyeti 0 yazar.
INSERT INTO public.ai_model_prices (model, input_per_1k, output_per_1k, updated_at)
VALUES ('gpt-6-luna', 0.000100, 0.000500, now())
ON CONFLICT (model) DO UPDATE
  SET input_per_1k = EXCLUDED.input_per_1k,
      output_per_1k = EXCLUDED.output_per_1k,
      updated_at = now();
