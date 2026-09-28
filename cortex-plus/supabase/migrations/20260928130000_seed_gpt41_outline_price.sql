-- gpt-4.1 fiyatı (one-shot outline strong model).
-- Liste fiyatı varsayımı: $2,00 / $8,00 per 1M jeton → 1.000 jeton başına.
-- Uygulanmazsa maliyet sayfası bu modeli sessizce atlar; uygulama çalışır.

INSERT INTO public.ai_model_prices (model, input_per_1k, output_per_1k) VALUES
  ('gpt-4.1', 0.002000, 0.008000)
ON CONFLICT (model) DO UPDATE
  SET input_per_1k  = EXCLUDED.input_per_1k,
      output_per_1k = EXCLUDED.output_per_1k,
      updated_at    = now();
