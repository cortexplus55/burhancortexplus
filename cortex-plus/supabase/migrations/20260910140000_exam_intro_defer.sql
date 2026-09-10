-- Tanışma testini erteleyebilmek.
--
-- needsExamIntro() yalnızca intro_completed_at'e bakıyordu: test bitmeden
-- hiçbir düğüm açılmıyordu, yani ürünün kapısında 8 soruluk bir sınav vardı.
-- Ölçüm planı gerçekten iyileştiriyor, o yüzden kaldırılmıyor — ertelenebilir
-- hâle getiriliyor. Erteleyen öğrenci içeriğe girer, hazırlık sayfasında
-- hatırlatma kartı durur.

ALTER TABLE public.exam_preps
  ADD COLUMN IF NOT EXISTS intro_deferred_at timestamptz;

COMMENT ON COLUMN public.exam_preps.intro_deferred_at IS
  'Öğrenci tanışma testini "sonra yaparım" ile erteledi. intro_completed_at dolduğunda anlamsızlaşır.';
