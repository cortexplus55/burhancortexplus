CREATE TABLE IF NOT EXISTS public.practice_exam_item_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.practice_exam_attempts(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.practice_exam_questions(id) ON DELETE CASCADE,
  user_answer text,
  is_correct boolean NOT NULL DEFAULT false,
  explanation text,
  liked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, question_id)
);

CREATE INDEX IF NOT EXISTS exam_item_reviews_attempt_idx
  ON public.practice_exam_item_reviews (attempt_id);

ALTER TABLE public.practice_exam_item_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exam_item_reviews_own ON public.practice_exam_item_reviews;
CREATE POLICY exam_item_reviews_own ON public.practice_exam_item_reviews
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.practice_exam_attempts a
      WHERE a.id = practice_exam_item_reviews.attempt_id
        AND a.user_id = auth.uid()
    )
    OR public.is_admin(auth.uid())
  );
