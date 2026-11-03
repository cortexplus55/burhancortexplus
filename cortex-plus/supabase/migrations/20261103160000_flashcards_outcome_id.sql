-- Paket 4: kartlara resmî kazanım kimliği (yalnız ekleme; boş bırakılabilir, eski kartlar etkilenmez).
ALTER TABLE public.flashcards ADD COLUMN IF NOT EXISTS outcome_id text REFERENCES public.curriculum_outcomes (id);
ALTER TABLE public.flashcard_reviews ADD COLUMN IF NOT EXISTS outcome_id text REFERENCES public.curriculum_outcomes (id);
CREATE INDEX IF NOT EXISTS flashcards_outcome_idx ON public.flashcards (outcome_id) WHERE outcome_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS flashcard_reviews_user_outcome_idx ON public.flashcard_reviews (user_id, outcome_id) WHERE outcome_id IS NOT NULL;
