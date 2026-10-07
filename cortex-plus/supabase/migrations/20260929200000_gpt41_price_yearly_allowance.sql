-- GPT-4.1'e gecis (29 Eylul 2026): abone ders taslagi ve gelismis isler.
--
-- BIRIM: metin modelleri 1.000 jeton basina USD.
-- gpt-4.1 liste fiyati $2 / $8 per 1M jeton (onbellekli girdi $0,50).
--
-- 20260925120000_seed_gpt41_mini_price.sql canliya hic uygulanmamisti:
-- ders maliyeti /admin/maliyetler'de sifir gorunuyordu. Bu dosya ile
-- birlikte elle uygulandi.

INSERT INTO public.ai_model_prices (model, input_per_1k, output_per_1k) VALUES
  ('gpt-4.1', 0.002000, 0.008000)
ON CONFLICT (model) DO UPDATE
  SET input_per_1k  = EXCLUDED.input_per_1k,
      output_per_1k = EXCLUDED.output_per_1k,
      updated_at    = now();

-- Yillik paketlerin aylik hakki. GPT-4.1 ile kredi basina ortalama maliyet
-- ~0,50 TL; 400/1.600 ile tam kullanan yillik abone zarar ediyordu
-- (Plus yillik -7 TL, Sigma yillik -1.612 TL). Aylik paketler ayni kaliyor.
-- Karar tarihinde aktif abonelik yoktu; kimsenin hakki geriye donuk degismedi.
UPDATE public.plans SET monthly_allowance = 250, updated_at = now()
 WHERE slug = 'plus-yillik';
UPDATE public.plans SET monthly_allowance = 900, updated_at = now()
 WHERE slug = 'sigma-yillik';
