-- Persist lesson like (Astra ders sayfası beğeni)

ALTER TABLE public.exam_prep_lessons
  ADD COLUMN IF NOT EXISTS liked boolean NOT NULL DEFAULT false;
