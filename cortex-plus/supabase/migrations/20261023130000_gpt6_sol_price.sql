-- gpt-6-sol: iki sesli podcast'in senarist yazarı (23 Ekim 2026, 28. kör ölçüm). Fiyat: OpenAI GPT-6 standart
-- kademe, 272K girdiye kadar: 1M jeton başına girdi $2, çıktı $10. Hızlı kademe kullanılmıyor; satır yine de
-- iki katıyla yazılı ki bir gün açılırsa kullanım raporu sıfır göstermesin.
INSERT INTO public.ai_model_prices (model, input_per_1k, output_per_1k, updated_at)
VALUES
  ('gpt-6-sol', 0.002000, 0.010000, now()),
  ('gpt-6-sol-fast', 0.004000, 0.020000, now())
ON CONFLICT (model) DO UPDATE
  SET input_per_1k = EXCLUDED.input_per_1k,
      output_per_1k = EXCLUDED.output_per_1k,
      updated_at = now();
