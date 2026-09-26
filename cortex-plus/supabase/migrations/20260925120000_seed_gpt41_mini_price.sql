-- Ders taslagi modeli. Dogrulama ve parca onarimi gpt-4o-mini'de kalir.
--
-- BIRIM: metin modelleri 1.000 jeton basina USD.
-- gpt-4.1-mini liste fiyati $0,40 / $1,60 per 1M jeton.
-- BU SATIR TAHMIN. Gercek fatura goruldugunde duzeltilecek yer burasi.

INSERT INTO public.ai_model_prices (model, input_per_1k, output_per_1k) VALUES
  ('gpt-4.1-mini', 0.000400, 0.001600)
ON CONFLICT (model) DO UPDATE
  SET input_per_1k  = EXCLUDED.input_per_1k,
      output_per_1k = EXCLUDED.output_per_1k,
      updated_at    = now();
