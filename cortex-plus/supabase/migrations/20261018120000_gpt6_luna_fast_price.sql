-- gpt-6-luna hızlı işlem (Fast mode), yalnız Plus dersleri (18 Ekim 2026, ürün sahibinin kararı).
-- Fiyat: OpenAI fiyat sayfası, Fast tablosu, kısa bağlam: 1M jeton başına girdi $0,20, çıktı
-- $1,00 (normalin iki katı). Kullanım kaydı model adını "gpt-6-luna-fast" yazar; OpenAI isteği
-- normal işleme düşürürse kayıt yine "gpt-6-luna" olur.
INSERT INTO public.ai_model_prices (model, input_per_1k, output_per_1k, updated_at)
VALUES ('gpt-6-luna-fast', 0.000200, 0.001000, now())
ON CONFLICT (model) DO UPDATE
  SET input_per_1k = EXCLUDED.input_per_1k,
      output_per_1k = EXCLUDED.output_per_1k,
      updated_at = now();
