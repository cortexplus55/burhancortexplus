-- Havuz içeriği (2 Kasım 2026, ürün sahibinin kararı): hazır ders, kart ve test 0 kredi.
-- Öğrencinin belgesinden ünite ek bölümü 15 kredi. Yalnız ekleme; var olan satır değişmez.
INSERT INTO public.credit_rules (action_code, credit_cost, model_tier, description, active) VALUES
  ('POOL_LESSON_VIEW', 0, 'standard', 'Hazır ünite anlatımı (havuz; model çağrısı yok)', true),
  ('POOL_CARDS', 0, 'standard', 'Hazır kart seti (havuz)', true),
  ('POOL_QUIZ', 0, 'standard', 'Hazır test (havuz soru bankası)', true),
  ('DOCUMENT_SUPPLEMENT_GENERATE', 15, 'standard', 'Öğrencinin belgesinden ünite ek bölümü', true)
ON CONFLICT (action_code) DO NOTHING;
