-- Dersin yapısını sakla.
--
-- Model zaten yapılandırılmış JSON üretiyordu (bölümler, örnek, yaygın hata),
-- ama formatStructuredLesson() bunu markdown'a düzleştirip yalnızca content_md
-- yazıyordu. Yapı depolama anında kaybolduğu için ders, adım adım gösterilemiyor
-- ve bölüm başına kontrol konulamıyordu.
--
-- Eklemeli ve nullable: content_md tek doğruluk kaynağı olmayı sürdürür, eski
-- dersler olduğu gibi açılır, JSON yalnızca varsa adım adım gösterim açılır.

ALTER TABLE public.exam_prep_lessons
  ADD COLUMN IF NOT EXISTS content_json jsonb;

COMMENT ON COLUMN public.exam_prep_lessons.content_json IS
  'Üretilen dersin yapılandırılmış hâli (lessonV2Schema). Yoksa content_md markdown olarak gösterilir.';
