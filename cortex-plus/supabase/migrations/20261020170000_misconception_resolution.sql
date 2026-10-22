-- Yanılgı çözümü (20 Ekim 2026).
--
-- exam_prep_misconceptions satırı yazılıyor ama hiç kapanmıyordu: bir kez yanlış yapan öğrencinin
-- "açık yanlış" sayısı sonsuza kadar duruyor, hazırlık tahmini %85'te takılı kalıyor ve "Hazırsın"
-- hiç gelmiyordu. Aynı konu yanılgıdan sonra iki ayrı Türkiye gününde yardımsız doğru
-- cevaplanınca uygulama satıra resolved_at yazar (misconception-resolution.ts).
--
-- Yalnız ekleme: boş sütun ve kısmi dizin. Mevcut satırlar açık kalır (NULL). Okuma politikası
-- (select_own) yeni sütunu da kapsıyor; yazım service_role'de kalıyor. Kod sütun yokken de
-- çalışır: süzgeçli sorgu düşerse bütün satırlar açık sayılır.

ALTER TABLE public.exam_prep_misconceptions
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

CREATE INDEX IF NOT EXISTS exam_prep_misconceptions_open_idx
  ON public.exam_prep_misconceptions (user_id, exam_prep_id)
  WHERE resolved_at IS NULL;

COMMENT ON COLUMN public.exam_prep_misconceptions.resolved_at IS
  'Konu bu yanlıştan sonra iki ayrı Türkiye gününde yardımsız doğru cevaplanınca yazılır; NULL = açık yanılgı';
