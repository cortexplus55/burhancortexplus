-- Hızlı işlem fiyat satırları (31 Ekim 2026). Taranmış PDF'te 25 sayfa `gpt-4.1-fast` ile okundu (taranmış belgenin
-- 40. sayfasından sonrası doğrudan gpt-4.1'e gidiyordu; o sınır aynı gün kalktı) ve bu adın fiyat satırı yoktu:
-- /admin/maliyetler o çağrıları saymıyordu (son 60 günde 67 çağrı). Fiyat: OpenAI hızlı işlem, normalin iki katı.
-- gpt-4.1: 1M jeton başına girdi $2, çıktı $8 → hızlı $4 / $16. gpt-4.1-mini (konu haritası yedeği): $0,40 / $1,60 →
-- hızlı $0,80 / $3,20. Kod da "-fast" satırı yoksa normalin iki katını sayar (`model-price.ts`).
INSERT INTO public.ai_model_prices (model, input_per_1k, output_per_1k, updated_at)
VALUES
  ('gpt-4.1-fast', 0.004000, 0.016000, now()),
  ('gpt-4.1-mini-fast', 0.000800, 0.003200, now())
ON CONFLICT (model) DO UPDATE
  SET input_per_1k = EXCLUDED.input_per_1k,
      output_per_1k = EXCLUDED.output_per_1k,
      updated_at = now();
